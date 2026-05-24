"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CalorieBar } from "@/components/calorie-bar";
import { PfcRing } from "@/components/pfc-ring";
import type { UserProfile, DailySummary, WorkoutLog, WeeklyMuscleVolume } from "@/lib/types";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_EMOJI } from "@/lib/types";
import { adjustedDailyTarget, calculateWeeklyVolume } from "@/lib/calc";
import { useRouter } from "next/navigation";
import Link from "next/link";

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "おつかれさま 🌙";
  if (hour < 11) return "おはよう！今日も頑張ろう 💪";
  if (hour < 17) return "こんにちは 👋";
  return "おつかれさま 🌙";
}

export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<{ date: string; count: number }[]>([]);
  const [muscleVolume, setMuscleVolume] = useState<WeeklyMuscleVolume[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: profileData } = await supabase
        .from("user_profile")
        .select("*")
        .limit(1)
        .single();

      if (!profileData) {
        router.push("/setup");
        return;
      }

      setProfile(profileData);

      const today = formatDate(new Date());
      const { data: summaryData } = await supabase
        .from("daily_summary")
        .select("*")
        .eq("date", today)
        .single();

      setSummary(summaryData ?? {
        date: today,
        total_calories: 0,
        total_protein: 0,
        total_fat: 0,
        total_carbs: 0,
        meal_count: 0,
        workout_count: 0,
        workout_calories: 0,
      });

      // Fetch recent 7 days of workout activity
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const startDate = formatDate(sevenDaysAgo);

      const { data: workoutData } = await supabase
        .from("workout_logs")
        .select("date")
        .gte("date", startDate)
        .order("date", { ascending: true });

      if (workoutData) {
        const countByDate = new Map<string, number>();
        for (const w of workoutData) {
          countByDate.set(w.date, (countByDate.get(w.date) ?? 0) + 1);
        }
        // Build 7-day array
        const days: { date: string; count: number }[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - 6 + i);
          const ds = formatDate(d);
          days.push({ date: ds, count: countByDate.get(ds) ?? 0 });
        }
        setRecentWorkouts(days);
      }

      // Fetch weekly workout logs with preset info for muscle volume
      const { data: weeklyLogs } = await supabase
        .from("workout_logs")
        .select("*, preset:workout_presets(*)")
        .gte("date", startDate);

      if (weeklyLogs) {
        setMuscleVolume(calculateWeeklyVolume(weeklyLogs));
      }

      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || !summary) return null;

  const weightDiff = profile.target_weight - profile.weight;
  const adjustedTarget = adjustedDailyTarget(profile.target_calories, summary.workout_calories);

  return (
    <div className="py-6 md:py-10 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base text-muted mb-0.5">{getGreeting()}</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {new Date().toLocaleDateString("ja-JP", {
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </h1>
        </div>
        <button
          onClick={() => router.push("/body")}
          className="text-right card-gradient card-interactive rounded-2xl px-4 py-3"
        >
          <p className="text-2xl md:text-3xl font-bold font-num">📊 {profile.weight}kg</p>
          <p className="text-xs text-accent">
            目標 {profile.target_weight}kg ({weightDiff > 0 ? "+" : ""}{weightDiff.toFixed(1)}kg)
          </p>
        </button>
      </div>

      {/* Desktop: 2-column grid / Mobile: single column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Left column */}
        <div className="space-y-4 md:space-y-6">
          {/* Calorie Progress */}
          <div className="card-gradient rounded-3xl p-5 md:p-6">
            <CalorieBar current={summary.total_calories} target={adjustedTarget} />
            {summary.workout_calories > 0 && (
              <p className="text-xs text-muted mt-2">
                💪 筋トレで {Math.round(summary.workout_calories)}kcal 消費 → 目標 {Math.round(adjustedTarget)}kcal
              </p>
            )}
          </div>

          {/* PFC Rings */}
          <div className="card-gradient rounded-3xl p-5 md:p-6">
            <div className="flex justify-around">
              <PfcRing
                current={summary.total_protein}
                target={profile.target_protein}
                label="タンパク質"
                color="var(--protein)"
              />
              <PfcRing
                current={summary.total_fat}
                target={profile.target_fat}
                label="脂質"
                color="var(--fat)"
              />
              <PfcRing
                current={summary.total_carbs}
                target={profile.target_carbs}
                label="炭水化物"
                color="var(--carbs)"
              />
            </div>
          </div>

          {/* PFC deficit advice */}
          <PfcAdvice
            proteinDeficit={profile.target_protein - summary.total_protein}
            fatDeficit={profile.target_fat - summary.total_fat}
            carbsDeficit={profile.target_carbs - summary.total_carbs}
            calorieDeficit={adjustedTarget - summary.total_calories}
          />
        </div>

        {/* Right column */}
        <div className="space-y-4 md:space-y-6">
          {/* Today's Stats */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="card-gradient card-interactive rounded-2xl p-4 md:p-5">
              <p className="text-xs text-muted mb-1">🍽️ 食事</p>
              <p className="text-2xl md:text-3xl font-bold font-num">{summary.meal_count}</p>
            </div>
            <div className="card-gradient card-interactive rounded-2xl p-4 md:p-5">
              <p className="text-xs text-muted mb-1">💪 筋トレ</p>
              <p className="text-2xl md:text-3xl font-bold font-num">{summary.workout_count}</p>
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/meals/add"
              className="py-3 card-gradient card-interactive rounded-2xl flex items-center justify-center gap-1.5 text-sm font-medium"
            >
              🥤 プロテイン
            </Link>
            <Link
              href="/guide"
              className="py-3 card-gradient card-interactive rounded-2xl flex items-center justify-center gap-1.5 text-sm font-medium"
            >
              📖 食事ガイド
            </Link>
          </div>

          {/* Recent workout activity (7 days) */}
          <div className="card-gradient rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted">💪 直近7日の筋トレ</p>
              <Link href="/progress" className="text-[10px] text-accent">詳細 →</Link>
            </div>
            <div className="flex gap-1.5 justify-between">
              {recentWorkouts.map((day) => {
                const dayLabel = new Date(day.date + "T00:00:00").toLocaleDateString("ja-JP", { weekday: "narrow" });
                const isToday = day.date === formatDate(new Date());
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
                        day.count > 0
                          ? "bg-accent/20 text-accent"
                          : "bg-card-border/30 text-muted/40"
                      } ${isToday ? "ring-1 ring-accent/50" : ""}`}
                    >
                      {day.count > 0 ? day.count : ""}
                    </div>
                    <span className={`text-[10px] ${isToday ? "text-accent font-medium" : "text-muted"}`}>
                      {dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly muscle volume balance */}
          {muscleVolume.length > 0 && (
            <div className="card-gradient rounded-2xl p-4">
              <p className="text-xs text-muted mb-3">📊 今週の筋トレバランス</p>
              <div className="space-y-2">
                {muscleVolume.map((mv) => {
                  const pct = mv.target.optimal > 0
                    ? Math.min(100, (mv.sets / mv.target.optimal) * 100)
                    : 0;
                  const barColor =
                    mv.sets < mv.target.min
                      ? "bg-red-500/70"
                      : mv.sets < mv.target.optimal
                        ? "bg-yellow-500/70"
                        : "bg-emerald-500/70";
                  return (
                    <div key={mv.muscleGroup} className="flex items-center gap-2">
                      <span className="text-xs w-12 shrink-0">
                        {MUSCLE_GROUP_EMOJI[mv.muscleGroup]} {MUSCLE_GROUP_LABELS[mv.muscleGroup]}
                      </span>
                      <div className="flex-1 h-2 bg-card-border/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted w-16 text-right shrink-0 font-num">
                        {mv.sets} / {mv.target.optimal}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Overall assessment */}
              <div className="mt-3 text-xs">
                {muscleVolume.every((mv) => mv.sets >= mv.target.min) ? (
                  <span className="text-emerald-400">✅ バランス良好</span>
                ) : (
                  <span className="text-yellow-400">
                    ⚠️ {muscleVolume
                      .filter((mv) => mv.sets < mv.target.min)
                      .map((mv) => MUSCLE_GROUP_LABELS[mv.muscleGroup])
                      .join("・")}が不足
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PFC Deficit Advice Component ────────────────────────────────
interface PfcAdviceProps {
  proteinDeficit: number;
  fatDeficit: number;
  carbsDeficit: number;
  calorieDeficit: number;
}

function PfcAdvice({ proteinDeficit, fatDeficit, carbsDeficit, calorieDeficit }: PfcAdviceProps) {
  // Build suggestion lists per nutrient
  type Suggestion = { text: string; amount: string };
  const suggestions: { label: string; deficit: number; unit: string; items: Suggestion[] }[] = [];

  if (proteinDeficit > 0) {
    const items: Suggestion[] = [];
    if (proteinDeficit > 20) {
      items.push({ text: "プロテイン1杯", amount: "+24g" });
      items.push({ text: "サラダチキン1個", amount: "+25g" });
    }
    if (proteinDeficit <= 20 || items.length < 3) {
      items.push({ text: "卵1個", amount: "+7g" });
      items.push({ text: "納豆1パック", amount: "+8g" });
    }
    suggestions.push({ label: "タンパク質", deficit: Math.round(proteinDeficit), unit: "g", items });
  }

  if (fatDeficit > 0) {
    suggestions.push({
      label: "脂質",
      deficit: Math.round(fatDeficit),
      unit: "g",
      items: [
        { text: "ナッツ30g", amount: "+16g" },
        { text: "アボカド半分", amount: "+10g" },
      ],
    });
  }

  if (carbsDeficit > 0) {
    const items: Suggestion[] = [];
    if (carbsDeficit > 30) items.push({ text: "おにぎり1個", amount: "+40g" });
    if (carbsDeficit > 20) items.push({ text: "バナナ1本", amount: "+25g" });
    items.push({ text: "食パン1枚", amount: "+25g" });
    suggestions.push({ label: "炭水化物", deficit: Math.round(carbsDeficit), unit: "g", items });
  }

  if (calorieDeficit > 150) {
    suggestions.push({
      label: "カロリー",
      deficit: Math.round(calorieDeficit),
      unit: "kcal",
      items: [
        { text: "おにぎり1個", amount: "+180kcal" },
        { text: "プロテインバー", amount: "+200kcal" },
      ],
    });
  }

  // All targets met
  if (suggestions.length === 0) {
    return (
      <div className="card-gradient rounded-2xl p-4 text-center">
        <p className="text-sm font-medium">🎉 今日のPFCは達成済み！</p>
      </div>
    );
  }

  return (
    <div className="card-gradient rounded-2xl p-4 space-y-3">
      <p className="text-sm font-medium">💡 あと少し！</p>
      {suggestions.map((s) => (
        <div key={s.label} className="space-y-1">
          <p className="text-xs text-muted">
            {s.label}があと<span className="text-foreground font-medium">{s.deficit}{s.unit}</span>足りないよ
          </p>
          <div className="flex flex-wrap gap-1.5">
            {s.items.map((item) => (
              <span
                key={item.text}
                className="text-[11px] px-2 py-0.5 rounded-lg bg-accent/10 text-accent"
              >
                {item.text}({item.amount})
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
