import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  anthropic,
  AI_MODELS,
  stripCodeFences,
  getResponseText,
  buildImageBlock,
} from "@/lib/ai";
import type { SkinAnalysis, SkinCheckin, SkinProduct } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_IMAGES = 3;
const RECENT_CHECKINS_FOR_CONTEXT = 3;

const PHOTO_LABELS: Record<string, string> = {
  front: "正面",
  left: "左側面",
  right: "右側面",
};

const SYSTEM_PROMPT = `あなたは皮膚科学とコスメ成分学に精通したスキンケアの専門アドバイザーです。
医師ではないため診断は行わず、「肌状態の整理」と「ケアの改善提案」を行います。
ユーザーの顔写真・自己申告・使用中コスメ/サプリの情報をもとに分析してください。

# 採点ルーブリック（個別スコア: 深刻度0-10、高いほど悪い）
- acne（ニキビ）: 0=皮疹なし / 1-3=コメド・小丘疹が数個 / 4-6=炎症性丘疹が複数 / 7-8=膿疱が多発 / 9-10=嚢腫・結節
- pores（毛穴）: 0=目立たない / 1-3=Tゾーンでやや目立つ / 4-6=頬・鼻で開大が明瞭 / 7-10=広範囲で顕著な開大・詰まり
- redness（赤み）: 0=なし / 1-3=部分的な軽い赤み / 4-6=明瞭な紅斑・炎症後紅斑が複数 / 7-10=広範囲のびまん性紅斑
- oiliness（皮脂）: 0=マット / 1-3=Tゾーンに軽いツヤ / 4-6=顔全体にテカリ / 7-10=強い皮脂膜
- texture（キメ）: 0=均一で滑らか / 1-3=部分的なざらつき / 4-6=キメの乱れが明瞭 / 7-10=広範囲の凹凸・ごわつき
- overall: 総合コンディション0-100（高いほど良い）。個別スコアと整合させること

# 評価ルール
- 「前回までのスコア」が与えられた場合、前回を基準に変化分で採点する（回ごとの絶対評価のブレを防ぐため）。大きな変化がなければスコアは前回±1以内に収める
- 照明・画質による不確実性があれば observations で言及する
- 使用中コスメは成分に基づいて評価する。使用開始から4週間未満のものは verdict を "insufficient_data" とする
- suggestions は具体的な成分名を挙げる（例: アゼライン酸、ナイアシンアミド、サリチル酸、アダパレン）。市販で入手可能かどうかも reason に含める
- ニキビが重度（膿疱多発・嚢腫レベル）の場合は suggestions に type "habit" で皮膚科受診を必ず含める
- 断定的な医学的診断表現は避ける

# 出力
以下のJSONのみを出力。説明文・マークダウン不要。
分量の上限（厳守）: assessment は1文（60字以内）。observations は最大4件。suggestions は最大4件で reason は1〜2文。長い説明より簡潔さを優先する。
{
  "skin_type": "肌タイプの判定（例: 脂性肌（オイリー肌）・ニキビ傾向）",
  "scores": { "acne": 0-10, "pores": 0-10, "redness": 0-10, "oiliness": 0-10, "texture": 0-10, "overall": 0-100 },
  "summary": "総評（2-3文、日本語）",
  "observations": ["具体的な所見（部位を明示）", "..."],
  "product_feedback": [
    { "product": "登録コスメ名", "assessment": "成分に基づく評価と根拠", "verdict": "continue" | "reconsider" | "insufficient_data" }
  ],
  "suggestions": [
    { "type": "ingredient" | "product" | "supplement" | "habit", "name": "提案名", "reason": "理由と使い方" }
  ],
  "compared_to_last": "前回との比較コメント（前回データがない場合は null）"
}`;

interface SkinImageInput {
  label: "front" | "left" | "right";
  base64: string;
  mimeType?: string;
}

function formatProducts(products: SkinProduct[]): string {
  if (products.length === 0) return "（登録なし）";
  return products
    .map((p) => {
      const parts = [
        `- ${p.name}（${p.category}${p.brand ? ` / ${p.brand}` : ""}）`,
      ];
      if (p.ingredients) parts.push(`  成分: ${p.ingredients}`);
      if (p.usage_timing) parts.push(`  タイミング: ${p.usage_timing}`);
      if (p.started_on) parts.push(`  使用開始: ${p.started_on}`);
      if (p.notes) parts.push(`  メモ: ${p.notes}`);
      return parts.join("\n");
    })
    .join("\n");
}

function formatRecentScores(checkins: SkinCheckin[]): string {
  if (checkins.length === 0) return "（初回チェックイン）";
  return checkins
    .map(
      (c) =>
        `- ${c.date}: ニキビ${c.score_acne ?? "-"} / 毛穴${c.score_pores ?? "-"} / 赤み${c.score_redness ?? "-"} / 皮脂${c.score_oiliness ?? "-"} / キメ${c.score_texture ?? "-"} / 総合${c.score_overall ?? "-"}`
    )
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const { images, selfNote } = (await request.json()) as {
      images: SkinImageInput[];
      selfNote?: string;
    };

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }
    if (images.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Too many images (max ${MAX_IMAGES})` },
        { status: 400 }
      );
    }

    // Fetch context: profile, active products, recent check-in scores
    const [profileRes, productsRes, checkinsRes] = await Promise.all([
      supabase.from("skin_profile").select("*").limit(1).maybeSingle(),
      supabase
        .from("skin_products")
        .select("*")
        .is("ended_on", null)
        .order("created_at"),
      supabase
        .from("skin_checkins")
        .select("*")
        .order("date", { ascending: false })
        .limit(RECENT_CHECKINS_FOR_CONTEXT),
    ]);

    const profile = profileRes.data;
    const products: SkinProduct[] = productsRes.data ?? [];
    const recentCheckins: SkinCheckin[] = checkinsRes.data ?? [];

    const contextText = `# ユーザー情報

## 自己申告の肌質・悩み
${profile?.self_description || "（未入力）"}

## 使用中のコスメ・サプリ
${formatProducts(products)}

## 前回までのスコア（新しい順）
${formatRecentScores(recentCheckins)}

## 今日のメモ
${selfNote || "（なし）"}

上記と写真をもとに、肌状態を分析してください。`;

    const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
    for (const image of images) {
      content.push({
        type: "text" as const,
        text: `【${PHOTO_LABELS[image.label] ?? image.label}の写真】`,
      });
      content.push(buildImageBlock(image.base64, image.mimeType));
    }
    content.push({ type: "text" as const, text: contextText });

    const response = await anthropic.messages.create({
      model: AI_MODELS.quality,
      // Output grows with registered product count (per-product feedback) — keep generous
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    // Truncated output cannot be valid JSON — fail with a clear message instead of a parse error
    if (response.stop_reason === "max_tokens") {
      console.error("Skin analysis truncated at max_tokens");
      return NextResponse.json(
        { error: "AI response was truncated. Please try again." },
        { status: 500 }
      );
    }

    const parsed: SkinAnalysis = JSON.parse(stripCodeFences(responseText));
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Skin analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze skin" },
      { status: 500 }
    );
  }
}
