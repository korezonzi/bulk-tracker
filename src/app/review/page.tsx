"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { calculateWeeklyVolume } from "@/lib/calc";
import type {
  UserProfile,
  DailySummary,
  BodyMeasurement,
  WorkoutLog,
  FitnessDiagnosis,
  FitnessDiagnosisRecord,
  IssueSeverity,
} from "@/lib/types";
import { daysAgo } from "@/lib/date";

const DIAGNOSIS_PERIODS = [
  { days: 7, label: "1週間" },
  { days: 30, label: "1ヶ月" },
  { days: 90, label: "3ヶ月" },
  { days: 365, label: "全体" },
] as const;

const SEVERITY_STYLES: Record<IssueSeverity, { label: string; className: string }> = {
  high: { label: "重要", className: "bg-error/12 text-error" },
  medium: { label: "改善余地", className: "bg-warning/12 text-warning" },
  low: { label: "微調整", className: "bg-card-hover text-muted" },
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-accent",
  B: "text-carbs",
  C: "text-warning",
  D: "text-error",
};

interface WeekData {
  period: string;
  profile: {
    weight: number;
    target_weight: number;
    target_calories: number;
    target_protein: number;
    target_fat: number;
    target_carbs: number;
  };
  weightChange: { start: number | null; end: number | null; diff: number | null };
  dailyAverage: { calories: number; protein: number; fat: number; carbs: number };
  targetAchievement: {
    calories_pct: number;
    protein_pct: number;
    fat_pct: number;
    carbs_pct: number;
  };
  training: { totalSessions: number; totalCaloriesBurned: number; daysActive: number };
  muscleVolume: Record<string, number>;
  recordingDays: number;
}

function formatDateJp(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function buildWeekData(
  profile: UserProfile,
  summaries: DailySummary[],
  bodyData: BodyMeasurement[],
  workoutLogs: WorkoutLog[]
): WeekData {
  const now = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(now.getDate() - 6);

  // Daily averages
  const recordingDays = summaries.length;
  const totalCalories = summaries.reduce((s, d) => s + d.total_calories, 0);
  const totalProtein = summaries.reduce((s, d) => s + d.total_protein, 0);
  const totalFat = summaries.reduce((s, d) => s + d.total_fat, 0);
  const totalCarbs = summaries.reduce((s, d) => s + d.total_carbs, 0);
  const divisor = Math.max(recordingDays, 1);

  const avgCalories = Math.round(totalCalories / divisor);
  const avgProtein = Math.round(totalProtein / divisor);
  const avgFat = Math.round(totalFat / divisor);
  const avgCarbs = Math.round(totalCarbs / divisor);

  // Weight change
  const sortedBody = [...bodyData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const startWeight = sortedBody.length > 0 ? sortedBody[0].weight : null;
  const endWeight = sortedBody.length > 0 ? sortedBody[sortedBody.length - 1].weight : null;
  const weightDiff =
    startWeight !== null && endWeight !== null
      ? Math.round((endWeight - startWeight) * 10) / 10
      : null;

  // Training stats
  const totalSessions = summaries.reduce((s, d) => s + d.workout_count, 0);
  const totalCaloriesBurned = summaries.reduce(
    (s, d) => s + (d.workout_calories ?? 0),
    0
  );
  const daysActive = summaries.filter((d) => d.workout_count > 0).length;

  // Muscle volume from workout logs
  const volumes = calculateWeeklyVolume(workoutLogs);
  const muscleVolume: Record<string, number> = {};
  for (const v of volumes) {
    muscleVolume[v.muscleGroup] = v.sets;
  }

  // Target achievement percentages
  const caloriesPct = profile.target_calories > 0
    ? Math.round((avgCalories / profile.target_calories) * 100)
    : 0;
  const proteinPct = profile.target_protein > 0
    ? Math.round((avgProtein / profile.target_protein) * 100)
    : 0;
  const fatPct = profile.target_fat > 0
    ? Math.round((avgFat / profile.target_fat) * 100)
    : 0;
  const carbsPct = profile.target_carbs > 0
    ? Math.round((avgCarbs / profile.target_carbs) * 100)
    : 0;

  return {
    period: `${formatDateJp(weekAgo)} - ${formatDateJp(now)}`,
    profile: {
      weight: profile.weight,
      target_weight: profile.target_weight,
      target_calories: profile.target_calories,
      target_protein: profile.target_protein,
      target_fat: profile.target_fat,
      target_carbs: profile.target_carbs,
    },
    weightChange: { start: startWeight, end: endWeight, diff: weightDiff },
    dailyAverage: {
      calories: avgCalories,
      protein: avgProtein,
      fat: avgFat,
      carbs: avgCarbs,
    },
    targetAchievement: {
      calories_pct: caloriesPct,
      protein_pct: proteinPct,
      fat_pct: fatPct,
      carbs_pct: carbsPct,
    },
    training: { totalSessions, totalCaloriesBurned, daysActive },
    muscleVolume,
    recordingDays,
  };
}

function SkeletonBlock() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-card-hover rounded-lg w-2/3" />
      <div className="h-4 bg-card-hover rounded-lg w-full" />
      <div className="h-4 bg-card-hover rounded-lg w-5/6" />
      <div className="h-4 bg-card-hover rounded-lg w-full" />
      <div className="h-6 bg-card-hover rounded-lg w-1/2 mt-6" />
      <div className="h-4 bg-card-hover rounded-lg w-full" />
      <div className="h-4 bg-card-hover rounded-lg w-4/5" />
      <div className="h-6 bg-card-hover rounded-lg w-1/2 mt-6" />
      <div className="h-4 bg-card-hover rounded-lg w-full" />
      <div className="h-4 bg-card-hover rounded-lg w-3/4" />
    </div>
  );
}

export default function ReviewPage() {
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fitness diagnosis (on-demand issue analysis)
  const [diagPeriod, setDiagPeriod] = useState<number>(7);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [latestDiag, setLatestDiag] = useState<FitnessDiagnosisRecord | null>(null);

  useEffect(() => {
    async function load() {
      const startDate = daysAgo(6);

      const [profileRes, summaryRes, bodyRes, workoutRes] = await Promise.all([
        supabase.from("user_profile").select("*").limit(1).single(),
        supabase
          .from("daily_summary")
          .select("*")
          .gte("date", startDate)
          .order("date", { ascending: true }),
        supabase
          .from("body_measurements")
          .select("*")
          .gte("date", startDate)
          .order("date", { ascending: true }),
        supabase
          .from("workout_logs")
          .select("*, preset:workout_presets(*)")
          .gte("date", startDate)
          .order("date", { ascending: true }),
      ]);

      if (!profileRes.data) {
        setLoading(false);
        return;
      }

      const data = buildWeekData(
        profileRes.data as UserProfile,
        (summaryRes.data ?? []) as DailySummary[],
        (bodyRes.data ?? []) as BodyMeasurement[],
        (workoutRes.data ?? []) as WorkoutLog[]
      );
      setWeekData(data);

      // Load latest saved review if exists
      const { data: savedReview } = await supabase
        .from("weekly_reviews")
        .select("review_text")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (savedReview?.review_text) {
        setReview(savedReview.review_text);
      }

      // Load latest saved diagnosis if exists
      const { data: savedDiag } = await supabase
        .from("fitness_diagnoses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (savedDiag) {
        setLatestDiag(savedDiag);
        setDiagPeriod(savedDiag.period_days);
      }

      setLoading(false);
    }
    load();
  }, []);

  async function runDiagnosis() {
    setDiagnosing(true);
    setDiagError(null);

    try {
      const res = await fetch("/api/fitness-diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodDays: diagPeriod }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "診断に失敗しました");
      }

      const data = (await res.json()) as {
        diagnosis: FitnessDiagnosis;
        dataQuality: { reliableDayCount: number; excludedDayCount: number };
        period: { start: string; end: string; days: number };
      };
      setLatestDiag({
        id: "latest",
        period_start: data.period.start,
        period_end: data.period.end,
        period_days: data.period.days,
        reliable_day_count: data.dataQuality.reliableDayCount,
        excluded_day_count: data.dataQuality.excludedDayCount,
        threshold_calories: null,
        ai_diagnosis: data.diagnosis,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setDiagnosing(false);
    }
  }

  async function generateReview() {
    if (!weekData) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/weekly-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekData }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to generate review");
      }

      const data = await res.json();
      setReview(data.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!weekData) {
    return (
      <div className="py-6 text-center text-muted">
        <p className="text-4xl mb-3">📋</p>
        <p className="font-medium">プロフィールを先に設定してください</p>
      </div>
    );
  }

  return (
    <div className="py-6 md:py-10 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          📋 週次レビュー
        </h1>
        <p className="text-sm text-muted mt-1">{weekData.period}</p>
      </div>

      {/* Summary stats */}
      <div className="bg-card rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-medium text-muted">今週のサマリー</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted">記録日数</span>
            <p className="font-semibold">{weekData.recordingDays} / 7日</p>
          </div>
          <div>
            <span className="text-muted">平均カロリー</span>
            <p className="font-semibold">{weekData.dailyAverage.calories} kcal</p>
          </div>
          <div>
            <span className="text-muted">筋トレ回数</span>
            <p className="font-semibold">{weekData.training.totalSessions}回</p>
          </div>
          <div>
            <span className="text-muted">体重変化</span>
            <p className="font-semibold">
              {weekData.weightChange.diff !== null
                ? `${weekData.weightChange.diff > 0 ? "+" : ""}${weekData.weightChange.diff} kg`
                : "データなし"}
            </p>
          </div>
        </div>
      </div>

      {/* Generate / Regenerate button */}
      <button
        onClick={generateReview}
        disabled={generating}
        className="w-full py-3 rounded-xl font-medium text-sm transition-all bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating
          ? "生成中..."
          : review
            ? "🔄 再生成する"
            : "✨ AIレビューを生成"}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-card rounded-xl p-4 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {generating && (
        <div className="bg-card rounded-xl p-5 md:p-6">
          <SkeletonBlock />
        </div>
      )}

      {/* Review result */}
      {review && !generating && (
        <div className="bg-card rounded-xl p-5 md:p-6">
          <div
            className="text-base md:text-lg leading-relaxed"
            style={{ whiteSpace: "pre-wrap" }}
          >
            {review}
          </div>
        </div>
      )}

      {/* ═══ Fitness diagnosis ═══ */}
      <section className="space-y-4 pt-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">🔍 課題診断</h2>
          <p className="text-xs text-muted mt-1">
            正しく記録された日だけを使って、期間全体の課題をAIが特定します
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-2">
          {DIAGNOSIS_PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDiagPeriod(p.days)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                diagPeriod === p.days ? "bg-accent text-white" : "bg-card text-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          onClick={runDiagnosis}
          disabled={diagnosing}
          className="w-full py-3 rounded-xl font-medium text-sm transition-all bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {diagnosing ? "診断中...（10秒ほどかかります）" : "🤖 課題を診断する"}
        </button>

        {diagError && (
          <div className="bg-card rounded-xl p-4 border border-error/30">
            <p className="text-sm text-error">{diagError}</p>
          </div>
        )}

        {diagnosing && (
          <div className="bg-card rounded-xl p-5 md:p-6">
            <SkeletonBlock />
          </div>
        )}

        {latestDiag?.ai_diagnosis && !diagnosing && (
          <DiagnosisResult record={latestDiag} />
        )}
      </section>
    </div>
  );
}

function DiagnosisResult({ record }: { record: FitnessDiagnosisRecord }) {
  const diagnosis = record.ai_diagnosis!;

  return (
    <div className="space-y-3">
      {/* Data quality */}
      <div className="bg-card rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-xs text-muted">
            {record.period_start} 〜 {record.period_end}（{record.period_days}日間）
          </span>
          <span className="text-xs text-muted">
            採用 <span className="text-foreground font-num">{record.reliable_day_count ?? "-"}</span>日
            {record.excluded_day_count != null && record.excluded_day_count > 0 && (
              <> / 除外 <span className="font-num">{record.excluded_day_count}</span>日</>
            )}
          </span>
        </div>
        <p className="text-xs text-muted mt-2">{diagnosis.data_quality_note}</p>
      </div>

      {/* Overall grade */}
      <div className="bg-card rounded-xl p-4 flex items-center gap-4">
        <span
          className={`text-4xl font-bold font-num ${GRADE_COLORS[diagnosis.overall.grade] ?? "text-foreground"}`}
        >
          {diagnosis.overall.grade}
        </span>
        <p className="text-sm text-foreground/90 leading-relaxed">
          {diagnosis.overall.comment}
        </p>
      </div>

      {/* Issues */}
      {diagnosis.issues.length > 0 && (
        <div className="bg-card rounded-xl p-4">
          <h3 className="text-base font-medium mb-3">⚠️ 課題</h3>
          <div className="space-y-4">
            {diagnosis.issues.map((issue, i) => (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${SEVERITY_STYLES[issue.severity]?.className ?? SEVERITY_STYLES.low.className}`}
                  >
                    {SEVERITY_STYLES[issue.severity]?.label ?? issue.severity}
                  </span>
                  <span className="text-sm font-medium">{issue.title}</span>
                </div>
                <p className="text-xs text-muted mt-1">根拠: {issue.evidence}</p>
                <p className="text-xs text-foreground/90 mt-1">→ {issue.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wins */}
      {diagnosis.wins.length > 0 && (
        <div className="bg-card rounded-xl p-4">
          <h3 className="text-base font-medium mb-2">✅ 良かった点</h3>
          <ul className="space-y-1.5">
            {diagnosis.wins.map((win, i) => (
              <li key={i} className="text-sm text-foreground/90 flex gap-2">
                <span className="text-accent shrink-0">・</span>
                {win}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Diet plan (optional: absent on older saved records) */}
      {diagnosis.diet_plan && (
        <div className="bg-card rounded-xl p-4">
          <h3 className="text-base font-medium mb-1">🍽 食事の提案</h3>
          {diagnosis.diet_plan.focus && (
            <p className="text-xs text-muted mb-3">{diagnosis.diet_plan.focus}</p>
          )}
          <div className="space-y-3">
            {diagnosis.diet_plan.meal_suggestions?.map((meal, i) => (
              <div key={i}>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-accent/12 text-accent mt-0.5">
                    {meal.timing}
                  </span>
                  <span className="text-sm text-foreground/90">{meal.suggestion}</span>
                </div>
                {(meal.example_foods?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted mt-1">
                    例: {meal.example_foods?.join("、")}
                  </p>
                )}
              </div>
            ))}
          </div>
          {(diagnosis.diet_plan.habits?.length ?? 0) > 0 && (
            <ul className="space-y-1.5 mt-3 pt-3 border-t border-card-hover">
              {diagnosis.diet_plan.habits?.map((habit, i) => (
                <li key={i} className="text-xs text-foreground/90 flex gap-2">
                  <span className="text-accent shrink-0">・</span>
                  {habit}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Training plan (optional: absent on older saved records) */}
      {diagnosis.training_plan && (
        <div className="bg-card rounded-xl p-4">
          <h3 className="text-base font-medium mb-1">🏋️ 筋トレの提案</h3>
          {diagnosis.training_plan.focus && (
            <p className="text-xs text-muted mb-3">{diagnosis.training_plan.focus}</p>
          )}
          <div className="space-y-3">
            {diagnosis.training_plan.recommendations?.map((rec, i) => (
              <div key={i}>
                <p className="text-sm font-medium">{rec.title}</p>
                <p className="text-xs text-foreground/90 mt-1">→ {rec.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next actions */}
      {diagnosis.next_actions.length > 0 && (
        <div className="bg-accent/12 border border-accent/30 rounded-xl p-4">
          <h3 className="text-base font-medium mb-2 text-accent">🎯 次のアクション</h3>
          <ol className="space-y-1.5">
            {diagnosis.next_actions.map((action, i) => (
              <li key={i} className="text-sm text-foreground/90 flex gap-2">
                <span className="text-accent font-num shrink-0">{i + 1}.</span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
