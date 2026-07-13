import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { anthropic, AI_MODELS, stripCodeFences, getResponseText } from "@/lib/ai";
import { buildDiagnosisData } from "@/lib/fitness-analysis";
import type { BodyMeasurement, DailySummary, UserProfile, WorkoutLog } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const REVIEW_PERIOD_DAYS = 7;

const SYSTEM_PROMPT = `あなたはリーンバルク（脂肪を増やさず筋肉を増やす増量）の専門家です。
スポーツ栄養士とパーソナルトレーナーの知識を持っています。

# データの読み方（重要）
- dataQuality に「正しく記録された日」の判定基準と採用/除外日数が明記されている
- dailyAverage / targetAchievement は採用された信頼できる日のみから計算済み
- 3食すべて食べているとは限らない前提で解釈する
- 除外日・未記録日が多い場合は記録習慣そのものを改善点に挙げる

ユーザーの週間データを分析し、以下の形式でフィードバックしてください：

1. 📊 総合評価（A/B/C/Dの4段階 + 一言コメント。冒頭に採用した記録日数を一言添える）
2. ✅ 良かった点（2-3個、具体的な数値を引用）
3. ⚠️ 改善点（2-3個、具体的なアクションプランつき）
4. 🎯 来週の目標（1-2個、達成可能で具体的なもの）
5. 💪 モチベーションメッセージ（1文、率直で人間味のある言葉）

トーンは「優しいけど率直なトレーナー」。
曖昧な一般論は避け、データに基づいた具体的なアドバイスを。
日本語で回答。`;

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const startDate = daysAgoStr(7);
    const endDate = daysAgoStr(1);

    // Fetch week data
    const [profileRes, summaryRes, bodyRes, workoutRes] = await Promise.all([
      supabase.from("user_profile").select("*").limit(1).single(),
      supabase.from("daily_summary").select("*").gte("date", startDate).lte("date", endDate).order("date"),
      supabase.from("body_measurements").select("*").gte("date", startDate).lte("date", endDate).order("date"),
      supabase.from("workout_logs").select("*, preset:workout_presets(*)").gte("date", startDate).lte("date", endDate),
    ]);

    const profile = profileRes.data as UserProfile | null;
    const summaries: DailySummary[] = summaryRes.data ?? [];
    const bodyData: BodyMeasurement[] = bodyRes.data ?? [];
    const workoutLogs: WorkoutLog[] = workoutRes.data ?? [];

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 400 });
    }

    // Aggregate with reliability filtering (averages use reliable days only)
    const { data: weekData } = buildDiagnosisData(
      profile,
      summaries,
      bodyData,
      workoutLogs,
      startDate,
      endDate,
      REVIEW_PERIOD_DAYS
    );

    // Generate AI review
    const response = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `以下が今週の記録データです。分析してフィードバックをお願いします。\n\n${JSON.stringify(weekData, null, 2)}` }],
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json({ error: "No AI response" }, { status: 500 });
    }

    const reviewText = stripCodeFences(responseText);

    // Save to weekly_reviews
    await supabase.from("weekly_reviews").insert({
      week_start: startDate,
      week_end: endDate,
      review_text: reviewText,
    });

    return NextResponse.json({ success: true, period: `${startDate} - ${endDate}` });
  } catch (error) {
    console.error("Cron weekly review error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
