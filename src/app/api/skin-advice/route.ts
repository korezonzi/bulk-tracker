import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { anthropic, AI_MODELS, stripCodeFences, getResponseText } from "@/lib/ai";
import type { SkinAdvice, SkinAdviceRecord } from "@/lib/skin-advice";
import {
  SKIN_PRODUCT_CATEGORY_LABELS,
  type SkinCheckin,
  type SkinProduct,
} from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RECENT_CHECKINS_FOR_CONTEXT = 3;
// Japanese JSON output is token-heavy; 2500/4000 both caused mid-JSON truncation
// in production with 8 registered products. Generous cap + brevity rules in the
// prompt keep generation under the mobile Safari fetch timeout (~60s).
const MAX_TOKENS = 8192;

// Text-only context: product registry + profile + recent scores (no photos)
type ProductContext = Pick<
  SkinProduct,
  "name" | "brand" | "category" | "ingredients" | "usage_timing"
>;

type CheckinContext = Pick<
  SkinCheckin,
  | "date"
  | "score_acne"
  | "score_pores"
  | "score_redness"
  | "score_oiliness"
  | "score_texture"
  | "score_overall"
  | "ai_analysis"
>;

const SYSTEM_PROMPT = `あなたは皮膚科学と化粧品成分学に精通したスキンケア・インナーケアのアドバイザーです。
医師・薬剤師ではないため診断や処方は行わず、成分知識に基づいた「使用中製品の継続判断の整理」と「追加すべき成分の提案」を行います。断定的な医学的表現は避けてください。

# 評価ルール
- 使用中の登録製品は成分に基づいて1つずつ評価し、product_reviews に登録製品ごとに必ず1件含める
- verdict の基準: continue=継続推奨 / reconsider=見直し推奨（より適した選択肢がある等） / stop=中止を検討（肌質に合わない・悪化要因になりうる） / insufficient_data=判断材料不足（成分情報が未登録等）
- 追加提案はユーザーの肌質（脂性肌・ニキビ肌、毛穴の目立ちが悩み）に合う成分を最優先する
- 登録済み製品の成分との重複・併用競合を必ずチェックする
  - すでに登録製品でカバーされている成分は skincare_ingredients / supplement_ingredients に含めない
  - supplement_ingredients は登録済みサプリに含まれる成分と重複させない
  - 併用競合（例: レチノール×高濃度ビタミンC、AHA/BHA×レチノールの同時使用、過度な角質ケアの重複）があれば cautions に必ず記載する
- priority は肌悩みへの効果の期待度と優先度で判定する（高=まず取り入れるべき / 中=余裕があれば / 低=補助的）
- product_examples は任意項目。挙げる場合も市販で入手しやすいものを簡潔に（主役はあくまで成分提案）
- 登録製品が0件の場合は、肌プロフィールとスコアに基づくスターターの成分構成として提案する（product_reviews は空配列）

# 出力
以下のJSONのみを出力。説明文・マークダウン不要。日本語で書く。
分量の上限（厳守）: overview は2文以内。reason は1文（60字以内）。purpose / how_to_use / dosage_hint / caution は各1文。skincare_ingredients は最大3件、supplement_ingredients は最大3件、product_examples は最大2成分、cautions は最大3件。長い説明より簡潔さを優先する。
{
  "overview": "現在のラインナップ全体の総評（2-3文）",
  "product_reviews": [
    { "name": "登録製品名", "verdict": "continue" | "reconsider" | "stop" | "insufficient_data", "reason": "成分に基づく理由" }
  ],
  "skincare_ingredients": [
    { "ingredient": "成分名", "purpose": "期待できる効果", "how_to_use": "使い方・取り入れ方", "priority": "高" | "中" | "低" }
  ],
  "supplement_ingredients": [
    { "ingredient": "成分名", "purpose": "期待できる効果", "dosage_hint": "摂取量の目安", "caution": "注意点（なければ null）", "priority": "高" | "中" | "低" }
  ],
  "product_examples": [
    { "for_ingredient": "成分名", "examples": ["市販製品の例", "..."] }
  ],
  "cautions": ["成分の併用競合や使い方の注意", "..."]
}`;

function formatProducts(products: ProductContext[]): string {
  if (products.length === 0) return "（登録なし）";
  return products
    .map((p) => {
      const categoryLabel = SKIN_PRODUCT_CATEGORY_LABELS[p.category] ?? p.category;
      const parts = [
        `- ${p.name}（${categoryLabel}${p.brand ? ` / ${p.brand}` : ""}）`,
      ];
      if (p.ingredients) parts.push(`  成分: ${p.ingredients}`);
      if (p.usage_timing) parts.push(`  タイミング: ${p.usage_timing}`);
      return parts.join("\n");
    })
    .join("\n");
}

// Scores + AI summary text only — photos are never sent to this endpoint
function formatCheckins(checkins: CheckinContext[]): string {
  if (checkins.length === 0) return "（チェックインなし）";
  return checkins
    .map((c) => {
      const lines = [
        `- ${c.date}: ニキビ${c.score_acne ?? "-"} / 毛穴${c.score_pores ?? "-"} / 赤み${c.score_redness ?? "-"} / 皮脂${c.score_oiliness ?? "-"} / キメ${c.score_texture ?? "-"} / 総合${c.score_overall ?? "-"}`,
      ];
      if (c.ai_analysis?.summary) lines.push(`  所見: ${c.ai_analysis.summary}`);
      return lines.join("\n");
    })
    .join("\n");
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("skin_advice")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ advice: (data as SkinAdviceRecord | null) ?? null });
  } catch (error) {
    console.error("Skin advice fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch skin advice" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Gather context: profile, active products, recent check-in scores
    const [profileRes, productsRes, checkinsRes] = await Promise.all([
      supabase.from("skin_profile").select("*").limit(1).maybeSingle(),
      supabase
        .from("skin_products")
        .select("name, brand, category, ingredients, usage_timing")
        .is("ended_on", null)
        .order("created_at"),
      supabase
        .from("skin_checkins")
        .select(
          "date, score_acne, score_pores, score_redness, score_oiliness, score_texture, score_overall, ai_analysis"
        )
        .order("date", { ascending: false })
        .limit(RECENT_CHECKINS_FOR_CONTEXT),
    ]);

    const profile = profileRes.data;
    const products: ProductContext[] = productsRes.data ?? [];
    const checkins: CheckinContext[] = checkinsRes.data ?? [];

    const contextText = `# ユーザー情報

## 肌プロフィール
自己申告: ${profile?.self_description || "（未入力）"}
AI判定の肌タイプ: ${profile?.ai_skin_type || "（未判定）"}

## 使用中のコスメ・サプリ（${products.length}件）
${formatProducts(products)}

## 直近のチェックイン（新しい順）
${formatCheckins(checkins)}

上記をもとに、使用中製品の継続判断と、追加すべきスキンケア成分・サプリ成分を提案してください。`;

    const response = await anthropic.messages.create({
      model: AI_MODELS.quality,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: contextText }],
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Truncated output cannot be valid JSON — fail with a clear message instead of a parse error
    if (response.stop_reason === "max_tokens") {
      console.error("Skin advice truncated at max_tokens", { maxTokens: MAX_TOKENS });
      return NextResponse.json(
        { error: "AI response was truncated. Please try again." },
        { status: 500 }
      );
    }

    const advice: SkinAdvice = JSON.parse(stripCodeFences(responseText));

    // Persist so the dashboard can show the latest advice on load
    const { data: inserted, error: insertError } = await supabase
      .from("skin_advice")
      .insert({ ai_advice: advice, product_count: products.length })
      .select()
      .single();

    if (insertError) {
      console.error("Skin advice insert error:", insertError);
    }

    // Fall back to a locally built record so the generated advice is not lost
    const record: SkinAdviceRecord = (inserted as SkinAdviceRecord | null) ?? {
      id: "",
      ai_advice: advice,
      product_count: products.length,
      created_at: new Date().toISOString(),
    };

    return NextResponse.json({ advice: record });
  } catch (error) {
    console.error("Skin advice error:", error);
    return NextResponse.json(
      { error: "Failed to generate skin advice" },
      { status: 500 }
    );
  }
}
