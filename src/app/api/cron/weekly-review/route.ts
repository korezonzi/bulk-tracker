import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { calculateWeeklyVolume } from "@/lib/calc";
import type { DailySummary, WorkoutLog } from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    const profile = profileRes.data;
    const summaries: DailySummary[] = summaryRes.data ?? [];
    const bodyData = bodyRes.data ?? [];
    const workoutLogs: WorkoutLog[] = workoutRes.data ?? [];

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 400 });
    }

    // Build week data
    const recordingDays = summaries.filter((s) => s.meal_count > 0 || s.workout_count > 0).length;
    const totalCal = summaries.reduce((s, d) => s + d.total_calories, 0);
    const totalP = summaries.reduce((s, d) => s + d.total_protein, 0);
    const totalF = summaries.reduce((s, d) => s + d.total_fat, 0);
    const totalC = summaries.reduce((s, d) => s + d.total_carbs, 0);

    const avgCal = recordingDays > 0 ? Math.round(totalCal / recordingDays) : 0;
    const avgP = recordingDays > 0 ? Math.round(totalP / recordingDays) : 0;
    const avgF = recordingDays > 0 ? Math.round(totalF / recordingDays) : 0;
    const avgC = recordingDays > 0 ? Math.round(totalC / recordingDays) : 0;

    const sortedBody = bodyData.filter((b) => b.weight);
    const weightChange = sortedBody.length >= 2
      ? { start: sortedBody[0].weight, end: sortedBody[sortedBody.length - 1].weight, diff: sortedBody[sortedBody.length - 1].weight - sortedBody[0].weight }
      : null;

    const volumes = calculateWeeklyVolume(workoutLogs);
    const totalSessions = summaries.reduce((s, d) => s + d.workout_count, 0);
    const totalBurned = summaries.reduce((s, d) => s + d.workout_calories, 0);

    const weekData = {
      period: `${startDate} - ${endDate}`,
      profile: { weight: profile.weight, target_weight: profile.target_weight, target_calories: profile.target_calories, target_protein: profile.target_protein, target_fat: profile.target_fat, target_carbs: profile.target_carbs },
      weightChange,
      dailyAverage: { calories: avgCal, protein: avgP, fat: avgF, carbs: avgC },
      targetAchievement: {
        calories_pct: profile.target_calories > 0 ? Math.round((avgCal / profile.target_calories) * 100) : 0,
        protein_pct: profile.target_protein > 0 ? Math.round((avgP / profile.target_protein) * 100) : 0,
        fat_pct: profile.target_fat > 0 ? Math.round((avgF / profile.target_fat) * 100) : 0,
        carbs_pct: profile.target_carbs > 0 ? Math.round((avgC / profile.target_carbs) * 100) : 0,
      },
      training: { totalSessions, totalCaloriesBurned: Math.round(totalBurned), daysActive: summaries.filter((s) => s.workout_count > 0).length },
      muscleVolume: Object.fromEntries(volumes.map((v) => [v.muscleGroup, v.sets])),
      recordingDays,
    };

    // Generate AI review
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `以下が今週の記録データです。分析してフィードバックをお願いします。\n\n${JSON.stringify(weekData, null, 2)}` }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No AI response" }, { status: 500 });
    }

    const reviewText = textBlock.text.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

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
