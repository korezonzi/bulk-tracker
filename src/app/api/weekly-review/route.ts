import { NextRequest, NextResponse } from "next/server";
import { anthropic, AI_MODELS, stripCodeFences, getResponseText } from "@/lib/ai";

const SYSTEM_PROMPT = `あなたはリーンバルク（脂肪を増やさず筋肉を増やす増量）の専門家です。
スポーツ栄養士とパーソナルトレーナーの知識を持っています。

ユーザーの週間データを分析し、以下の形式でフィードバックしてください：

1. 📊 総合評価（A/B/C/Dの4段階 + 一言コメント）
2. ✅ 良かった点（2-3個、具体的な数値を引用）
3. ⚠️ 改善点（2-3個、具体的なアクションプランつき）
4. 🎯 来週の目標（1-2個、達成可能で具体的なもの）
5. 💪 モチベーションメッセージ（1文、率直で人間味のある言葉）

トーンは「優しいけど率直なトレーナー」。
曖昧な一般論は避け、データに基づいた具体的なアドバイスを。
日本語で回答。`;

export async function POST(request: NextRequest) {
  try {
    const { weekData } = await request.json();

    if (!weekData) {
      return NextResponse.json(
        { error: "No weekData provided" },
        { status: 400 }
      );
    }

    const response = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `以下が今週の記録データです。分析してフィードバックをお願いします。\n\n${JSON.stringify(weekData, null, 2)}`,
        },
      ],
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    const review = stripCodeFences(responseText);
    return NextResponse.json({ review });
  } catch (error) {
    console.error("Weekly review error:", error);
    return NextResponse.json(
      { error: "Failed to generate weekly review" },
      { status: 500 }
    );
  }
}
