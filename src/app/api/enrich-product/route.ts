import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  anthropic,
  AI_MODELS,
  stripCodeFences,
  getResponseText,
  buildImageBlock,
} from "@/lib/ai";

const SYSTEM_PROMPT = `あなたはサプリメント・コスメ製品の識別アシスタントです。
製品ラベルの写真、または製品名のテキストから、登録用の製品情報を抽出・補完してください。

Return ONLY a JSON object with this exact structure, no other text:
{
  "name": "製品名（日本語。容量表記は除く）",
  "brand": "ブランド・メーカー名 or null",
  "category": "cleanser" | "toner" | "serum" | "moisturizer" | "sunscreen" | "treatment" | "supplement" | "other",
  "ingredients": "主要な有効成分をカンマ区切りで（例: 亜鉛 15mg, ビタミンC 500mg）or null",
  "usage_timing": "一般的な使用タイミング。朝/昼/夜/就寝前/運動後 を「・」区切りで（例: 朝・夜）or null",
  "confidence": "high" | "medium" | "low"
}

Guidelines:
- サプリは supplement、薬用・医薬部外品のニキビケア等は treatment
- 成分は含有量が分かる場合は含める。ラベルから読めない場合は製品知識から代表的な成分を推定し confidence を下げる
- 製品を特定できない場合も、読み取れた情報だけで best guess を返し confidence: "low" とする`;

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType, text } = await request.json();

    if (!imageBase64 && !text) {
      return NextResponse.json(
        { error: "No image or text provided" },
        { status: 400 }
      );
    }

    const content: Anthropic.MessageCreateParams["messages"][0]["content"] =
      text
        ? [
            {
              type: "text" as const,
              text: `以下の製品の登録情報を補完してください:\n${text}`,
            },
          ]
        : [
            buildImageBlock(imageBase64, mimeType),
            {
              type: "text" as const,
              text: "この製品ラベルから登録情報を抽出してください。",
            },
          ];

    const response = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    const parsed = JSON.parse(stripCodeFences(responseText));
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Product enrichment error:", error);
    return NextResponse.json(
      { error: "Failed to enrich product" },
      { status: 500 }
    );
  }
}
