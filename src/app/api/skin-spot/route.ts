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
import type { SkinCheckin, SkinProduct, SkinSpotAdvice } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MAX_IMAGES = 3;

const SYSTEM_PROMPT = `あなたは皮膚科学とコスメ成分学に精通したスキンケアの専門アドバイザーです。
医師ではないため診断は行いません。
ユーザーが「今気になっている肌トラブル」のズーム写真を送ってきます。
定期チェックインとは別の、「目の前の状態にどう対処すべきか」の相談です。
今すぐ〜数日で実行できる具体的な処置に焦点を当てて回答してください。

# ルール
- immediate_care は今日から実行できる具体的なステップを優先度順に（例: 触らない・潰さない、洗顔方法、スポット的な外用）
- 使用中コスメの情報が与えられた場合、product_advice で「今の状態でどう使うべきか」を製品ごとに指示する（例: ピーリングは炎症が引くまで休止）
- recommended は市販で入手できる成分・製品タイプを具体名で（例: アダパレン（要処方）、イオウ系スポット剤、ノンコメドジェニック保湿）
- avoid は悪化させる行動を具体的に
- see_doctor は必須。膿疱の多発・嚢腫・強い炎症が見える場合は受診を推奨する
- 断定的な医学的診断表現は避ける

# 出力
以下のJSONのみを出力。説明文・マークダウン不要。日本語で書く。
{
  "assessment": "写真から見える状態の整理（2-3文）",
  "immediate_care": ["今すぐの処置（優先度順）", "..."],
  "product_advice": [
    { "product": "使用中の製品名", "advice": "今の状態での使い方の調整" }
  ],
  "recommended": [
    { "name": "推奨する成分・製品タイプ", "reason": "理由と使い方" }
  ],
  "avoid": ["避けるべきこと", "..."],
  "see_doctor": {
    "recommended": true | false,
    "urgency": "routine" | "soon" | "urgent",
    "department": "皮膚科",
    "reason": "受診を勧める（勧めない）理由"
  }
}`;

interface SpotImageInput {
  base64: string;
  mimeType?: string;
}

function formatProducts(products: SkinProduct[]): string {
  if (products.length === 0) return "（登録なし）";
  return products
    .map((p) => {
      const parts = [`- ${p.name}（${p.category}）`];
      if (p.ingredients) parts.push(`  成分: ${p.ingredients}`);
      if (p.usage_timing) parts.push(`  タイミング: ${p.usage_timing}`);
      return parts.join("\n");
    })
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const { images, userNote } = (await request.json()) as {
      images: SpotImageInput[];
      userNote?: string;
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

    // Context: profile, active products, latest check-in state
    const [profileRes, productsRes, checkinRes] = await Promise.all([
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
        .limit(1)
        .maybeSingle(),
    ]);

    const profile = profileRes.data;
    const products: SkinProduct[] = productsRes.data ?? [];
    const latestCheckin: SkinCheckin | null = checkinRes.data;

    const contextText = `# ユーザー情報

## 肌質
${profile?.ai_skin_type ? `AI判定: ${profile.ai_skin_type}` : ""}
${profile?.self_description ? `自己申告: ${profile.self_description}` : "（未入力）"}

## 使用中のコスメ・サプリ
${formatProducts(products)}

## 直近の定期チェックイン
${
  latestCheckin
    ? `${latestCheckin.date}: 総合${latestCheckin.score_overall ?? "-"}/100（ニキビ${latestCheckin.score_acne ?? "-"} 毛穴${latestCheckin.score_pores ?? "-"} 赤み${latestCheckin.score_redness ?? "-"}）`
    : "（なし）"
}

## 今回の相談内容
${userNote || "（写真のみ）"}

上記とズーム写真をもとに、今すぐの処置アドバイスをください。`;

    const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
    images.forEach((image, i) => {
      content.push({
        type: "text" as const,
        text: `【気になる部分の写真 ${i + 1}/${images.length}】`,
      });
      content.push(buildImageBlock(image.base64, image.mimeType));
    });
    content.push({ type: "text" as const, text: contextText });

    const response = await anthropic.messages.create({
      model: AI_MODELS.quality,
      // Japanese JSON output is token-heavy; 2048 risks mid-JSON truncation
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
      console.error("Skin spot consult truncated at max_tokens");
      return NextResponse.json(
        { error: "AI response was truncated. Please try again." },
        { status: 500 }
      );
    }

    const parsed: SkinSpotAdvice = JSON.parse(stripCodeFences(responseText));
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Skin spot consult error:", error);
    return NextResponse.json(
      { error: "Failed to process spot consult" },
      { status: 500 }
    );
  }
}
