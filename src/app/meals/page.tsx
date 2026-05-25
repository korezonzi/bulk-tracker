"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CalorieBar } from "@/components/calorie-bar";
import { PfcRing } from "@/components/pfc-ring";
import type { Meal, UserProfile, DailySummary } from "@/lib/types";
import { getToday, daysAgo } from "@/lib/date";
import { adjustedDailyTarget } from "@/lib/calc";
import Link from "next/link";

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
  protein: "プロテイン",
};

const MEAL_TYPE_ICONS: Record<string, string> = {
  breakfast: "🌅",
  lunch: "☀️",
  dinner: "🌙",
  snack: "🍪",
  protein: "🥤",
};

export default function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [daySummary, setDaySummary] = useState<DailySummary | null>(null);
  const [recentDays, setRecentDays] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getToday());

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [mealsRes, profileRes, summaryRes, recentRes] = await Promise.all([
        supabase.from("meals").select("*").eq("date", selectedDate).order("created_at", { ascending: true }),
        supabase.from("user_profile").select("*").limit(1).single(),
        supabase.from("daily_summary").select("*").eq("date", selectedDate).single(),
        supabase.from("daily_summary").select("*").gte("date", daysAgo(6)).order("date", { ascending: true }),
      ]);
      setMeals(mealsRes.data ?? []);
      setProfile(profileRes.data);
      setDaySummary(summaryRes.data);
      setRecentDays(recentRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [selectedDate]);

  async function handleDelete(id: string) {
    await supabase.from("meals").delete().eq("id", id);
    setMeals((prev) => prev.filter((m) => m.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);
  const totalProtein = meals.reduce((sum, m) => sum + m.protein, 0);
  const totalFat = meals.reduce((sum, m) => sum + m.fat, 0);
  const totalCarbs = meals.reduce((sum, m) => sum + m.carbs, 0);

  const workoutCal = daySummary?.workout_calories ?? 0;
  const targetCal = profile ? adjustedDailyTarget(profile.target_calories, workoutCal) : 0;

  return (
    <div className="py-6 md:py-10 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            🍽️ {selectedDate === getToday() ? "今日の食事" : "食事記録"}
          </h1>
          <input
            type="date"
            value={selectedDate}
            max={getToday()}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-card rounded-xl px-2 py-1 text-xs text-muted"
          />
        </div>
        <Link
          href={`/meals/add?date=${selectedDate}`}
          className="px-4 py-2 bg-accent text-white rounded-xl text-sm font-medium active:scale-95 transition-transform"
        >
          + 追加
        </Link>
      </div>

      {/* Calorie bar (same as home) */}
      {profile && (
        <div className="bg-card rounded-xl p-4">
          <CalorieBar current={totalCalories} target={targetCal} />
        </div>
      )}

      {/* PFC rings (same as home) */}
      {profile && (
        <div className="bg-card rounded-xl p-4">
          <div className="flex justify-around">
            <PfcRing current={totalProtein} target={profile.target_protein} label="タンパク質" color="var(--protein)" />
            <PfcRing current={totalFat} target={profile.target_fat} label="脂質" color="var(--fat)" />
            <PfcRing current={totalCarbs} target={profile.target_carbs} label="炭水化物" color="var(--carbs)" />
          </div>
        </div>
      )}

      {/* Meal list */}
      {meals.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-4xl mb-2">📷</p>
          <p>まだ記録がありません 🍳</p>
          <p className="text-xs mt-1">＋ボタンで食事を追加しよう</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meals.map((meal) => (
            <div key={meal.id} className="bg-card rounded-xl p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{MEAL_TYPE_ICONS[meal.meal_type]}</span>
                    <span className="text-xs text-muted">{MEAL_TYPE_LABELS[meal.meal_type]}</span>
                    {meal.is_ai_estimated && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded">AI</span>
                    )}
                  </div>
                  <p className="text-sm">{meal.description}</p>
                  <div className="flex gap-3 mt-2 text-xs text-muted">
                    <span>{Math.round(meal.calories)} kcal</span>
                    <span className="text-protein">P {Math.round(meal.protein)}g</span>
                    <span className="text-fat">F {Math.round(meal.fat)}g</span>
                    <span className="text-carbs">C {Math.round(meal.carbs)}g</span>
                  </div>
                </div>
                <button onClick={() => handleDelete(meal.id)} className="text-muted hover:text-red-400 p-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent 7 days history */}
      {profile && recentDays.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">📊 直近7日の振り返り</p>
          <div className="space-y-1.5">
            {recentDays.map((day) => {
              const dayTarget = adjustedDailyTarget(profile.target_calories, day.workout_calories);
              const calPct = dayTarget > 0 ? Math.round((day.total_calories / dayTarget) * 100) : 0;
              const pPct = profile.target_protein > 0 ? Math.round((day.total_protein / profile.target_protein) * 100) : 0;
              const isToday = day.date === getToday();
              const dateLabel = day.date.slice(5).replace("-", "/");

              return (
                <button
                  key={day.date}
                  onClick={() => setSelectedDate(day.date)}
                  className={`w-full bg-card rounded-xl p-3 text-left card-hover ${
                    day.date === selectedDate ? "ring-1 ring-accent/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${isToday ? "text-accent" : ""}`}>
                      {isToday ? "今日" : dateLabel}
                    </span>
                    <div className="flex gap-2 text-[10px] text-muted font-num">
                      <span>{Math.round(day.total_calories)}kcal</span>
                      <span className="text-protein">P{Math.round(day.total_protein)}g</span>
                    </div>
                  </div>
                  <div className="flex gap-1 items-center">
                    <div className="flex-1 h-1.5 bg-card-border/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${calPct >= 90 ? "bg-accent" : calPct >= 70 ? "bg-yellow-500" : "bg-red-500/60"}`}
                        style={{ width: `${Math.min(calPct, 100)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-num w-10 text-right ${
                      calPct >= 90 ? "text-accent" : calPct >= 70 ? "text-yellow-500" : "text-red-400"
                    }`}>{calPct}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
