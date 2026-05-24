"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { calculateWeeklyVolume } from "@/lib/calc";
import type { UserProfile, DailySummary, BodyMeasurement, WorkoutLog } from "@/lib/types";

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

function formatDateIso(date: Date): string {
  return date.toISOString().split("T")[0];
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

  useEffect(() => {
    async function load() {
      const now = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 6);
      const startDate = formatDateIso(weekAgo);

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
      setLoading(false);
    }
    load();
  }, []);

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
      <div className="card-gradient rounded-2xl p-4 space-y-3">
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
        className="w-full py-3 rounded-2xl font-medium text-sm transition-all bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generating
          ? "生成中..."
          : review
            ? "🔄 再生成する"
            : "✨ AIレビューを生成"}
      </button>

      {/* Error */}
      {error && (
        <div className="card-gradient rounded-2xl p-4 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {generating && (
        <div className="card-gradient rounded-2xl p-5 md:p-6">
          <SkeletonBlock />
        </div>
      )}

      {/* Review result */}
      {review && !generating && (
        <div className="card-gradient rounded-2xl p-5 md:p-6">
          <div
            className="text-base md:text-lg leading-relaxed"
            style={{ whiteSpace: "pre-wrap" }}
          >
            {review}
          </div>
        </div>
      )}
    </div>
  );
}
