import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { anthropic, AI_MODELS, stripCodeFences, getResponseText } from "@/lib/ai";
import { buildDiagnosisData } from "@/lib/fitness-analysis";
import { daysAgo, getToday } from "@/lib/date";
import type {
  BodyMeasurement,
  DailySummary,
  FitnessDiagnosis,
  UserProfile,
  WorkoutLog,
} from "@/lib/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLOWED_PERIODS = [7, 14, 30, 90, 365];

const SYSTEM_PROMPT = `あなたはリーンバルク（脂肪を増やさず筋肉を増やす増量）の専門コーチです。
スポーツ栄養士とパーソナルトレーナーの知識を持ち、データに基づいて「何が課題か」を特定します。

# データの読み方（重要）
- dataQuality に「正しく記録された日」の判定基準と採用/除外日数が明記されている
- dailyAverage / targetAchievement は採用された信頼できる日のみから計算済み
- 除外日・未記録日が多い場合、それ自体を課題（記録習慣）として扱う
- 3食すべて食べているとは限らない前提で解釈する
- muscleVolume の weeklyAvg と weeklyTarget を比較し、不足部位を特定する

# 課題の特定ルール
- issues は重要度順に2-4個。感想ではなく、数値を根拠（evidence）に挙げる
- 各課題に、明日から実行できる具体的な recommendation を付ける
- severity: high=目標達成を明確に妨げている / medium=改善の余地が大きい / low=微調整レベル
- 良い点（wins）も必ず1-2個挙げてモチベーションを保つ
- next_actions は来週すぐ実行できる行動を2-3個、具体的な数値つきで

# 行動提案のルール
- diet_plan は target との差分と実データの数値を必ず引用する（例:「タンパク質が目標比 -35g/日」）。「バランスよく食べましょう」のような曖昧な一般論は禁止
- meal_suggestions は2-4件。timing ごとに、何をどれだけ足す/減らすかを具体的な食材・量で示す
- habits は1-3件。除外日・未記録日が多い場合は、記録習慣の改善（例: 食後すぐ記録する）も必ず含める
- training_plan は「記録されているワークアウトログが活動の全て」という前提で作る。推測で未記録のトレーニングを仮定しない
- muscleVolume の weeklyAvg と weeklyTarget の比較から、部位バランス・頻度・ボリュームの偏りを根拠に recommendations を2-4件導く

# 出力
以下のJSONのみを出力。説明文・マークダウン不要。日本語で書く。
{
  "data_quality_note": "データの信頼性についての1-2文（採用日数と基準に言及）",
  "overall": { "grade": "A" | "B" | "C" | "D", "comment": "総評1-2文" },
  "issues": [
    { "title": "課題名", "severity": "high" | "medium" | "low", "evidence": "数値による根拠", "recommendation": "具体的な改善アクション" }
  ],
  "wins": ["良かった点", "..."],
  "next_actions": ["来週の具体的アクション", "..."],
  "diet_plan": {
    "focus": "食事方針を一言で",
    "meal_suggestions": [
      { "timing": "朝食" | "昼食" | "夕食" | "間食", "suggestion": "数値つきの具体的な提案", "example_foods": ["食材例", "..."] }
    ],
    "habits": ["続けるべき/直すべき食習慣", "..."]
  },
  "training_plan": {
    "focus": "筋トレ方針を一言で",
    "recommendations": [
      { "title": "提案名", "detail": "部位・頻度・ボリュームの数値を含む具体的な内容" }
    ]
  }
}`;

export async function POST(request: NextRequest) {
  try {
    const { periodDays } = (await request.json()) as { periodDays: number };

    if (!ALLOWED_PERIODS.includes(periodDays)) {
      return NextResponse.json(
        { error: `periodDays must be one of ${ALLOWED_PERIODS.join(", ")}` },
        { status: 400 }
      );
    }

    const startDate = daysAgo(periodDays - 1);
    const endDate = getToday();

    const [profileRes, summaryRes, bodyRes, workoutRes] = await Promise.all([
      supabase.from("user_profile").select("*").limit(1).single(),
      supabase
        .from("daily_summary")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date"),
      supabase
        .from("body_measurements")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date"),
      supabase
        .from("workout_logs")
        .select("*, preset:workout_presets(*)")
        .gte("date", startDate)
        .lte("date", endDate),
    ]);

    const profile = profileRes.data as UserProfile | null;
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 400 });
    }

    const { data, reliability } = buildDiagnosisData(
      profile,
      (summaryRes.data ?? []) as DailySummary[],
      (bodyRes.data ?? []) as BodyMeasurement[],
      (workoutRes.data ?? []) as WorkoutLog[],
      startDate,
      endDate,
      periodDays
    );

    if (reliability.reliableDays.length === 0) {
      return NextResponse.json(
        { error: "分析できる記録日がありません。まず食事を記録してください" },
        { status: 400 }
      );
    }

    const response = await anthropic.messages.create({
      model: AI_MODELS.quality,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `以下の期間データから課題を診断してください。\n\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    });

    const responseText = getResponseText(response);
    if (!responseText) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    const diagnosis: FitnessDiagnosis = JSON.parse(stripCodeFences(responseText));

    // Persist for history
    await supabase.from("fitness_diagnoses").insert({
      period_start: startDate,
      period_end: endDate,
      period_days: periodDays,
      reliable_day_count: reliability.reliableDays.length,
      excluded_day_count: reliability.excludedDays.length,
      threshold_calories: reliability.thresholdCalories,
      ai_diagnosis: diagnosis,
    });

    return NextResponse.json({
      diagnosis,
      dataQuality: data.dataQuality,
      period: data.period,
    });
  } catch (error) {
    console.error("Fitness diagnosis error:", error);
    return NextResponse.json(
      { error: "Failed to generate diagnosis" },
      { status: 500 }
    );
  }
}
