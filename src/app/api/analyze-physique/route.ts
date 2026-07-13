import { NextRequest, NextResponse } from "next/server";
import {
  anthropic,
  AI_MODELS,
  stripCodeFences,
  getResponseText,
  buildImageBlock,
} from "@/lib/ai";

const SYSTEM_PROMPT = `あなたはフィジーク競技の審査員であり、ボディメイクの専門家です。
ユーザーの体型写真を分析し、以下の観点で詳細なフィードバックを提供してください。

ユーザーの目標:
- 体重55.6kg→63kgへのリーンバルク（体脂肪を増やさず筋肉で増量）
- フィジーク選手のような逆三角形シルエット
- 腹筋・腹斜筋のカットを維持
- 広背筋・胸筋の筋肥大

以下の形式でJSON出力してください：
{
  "overall_assessment": "全体的な体型の評価（2-3文）",
  "strengths": ["現在の強みとなる部位（2-3個）"],
  "improvement_areas": ["改善すべき部位と具体的なアドバイス（2-3個）"],
  "muscle_development": {
    "chest": "胸筋の発達度合いと改善点",
    "back": "広背筋の発達度合いと改善点",
    "shoulders": "三角筋の発達度合いと改善点",
    "arms": "腕の発達度合いと改善点",
    "core": "腹筋・腹斜筋のカット具合",
    "legs": "脚の発達度合い（見える場合）"
  },
  "v_taper_score": 6,
  "body_fat_visual": "見た目からの体脂肪率推定",
  "priority_training": ["優先すべきトレーニング部位と種目（2-3個）"],
  "physique_progress": 35
}

JSONのみ出力してください。説明文やマークダウンは不要です。`;

export interface PhysiqueAnalysis {
  overall_assessment: string;
  strengths: string[];
  improvement_areas: string[];
  muscle_development: {
    chest: string;
    back: string;
    shoulders: string;
    arms: string;
    core: string;
    legs: string;
  };
  v_taper_score: number;
  body_fat_visual: string;
  priority_training: string[];
  physique_progress: number;
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            buildImageBlock(imageBase64, mimeType),
            {
              type: "text",
              text: "この体型写真を分析し、フィジーク選手の観点から評価してください。",
            },
          ],
        },
      ],
      system: SYSTEM_PROMPT,
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    const parsed: PhysiqueAnalysis = JSON.parse(stripCodeFences(responseText));
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Physique analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze physique" },
      { status: 500 }
    );
  }
}
