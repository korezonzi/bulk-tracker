"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Meal } from "@/lib/types";
import { getToday } from "@/lib/date";
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
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getToday());

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("meals")
        .select("*")
        .eq("date", selectedDate)
        .order("created_at", { ascending: true });

      setMeals(data ?? []);
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

  return (
    <div className="py-6 md:py-10 space-y-5 md:space-y-8">
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

      {/* Summary */}
      <div className="bg-card rounded-xl p-3">
        <div className="grid grid-cols-4 text-center text-xs">
          <div>
            <p className="text-muted">カロリー</p>
            <p className="font-bold font-num">{Math.round(totalCalories)}</p>
          </div>
          <div>
            <p className="text-muted">P</p>
            <p className="font-bold text-protein font-num">{Math.round(totalProtein)}g</p>
          </div>
          <div>
            <p className="text-muted">F</p>
            <p className="font-bold text-fat font-num">{Math.round(totalFat)}g</p>
          </div>
          <div>
            <p className="text-muted">C</p>
            <p className="font-bold text-carbs font-num">{Math.round(totalCarbs)}g</p>
          </div>
        </div>
      </div>

      {/* Meal list */}
      {meals.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <p className="text-4xl mb-2">📷</p>
          <p>まだ記録がありません 🍳</p>
          <p className="text-xs mt-1 leading-relaxed">＋ボタンで食事を追加しよう</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meals.map((meal) => (
            <div
              key={meal.id}
              className="bg-card rounded-xl p-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{MEAL_TYPE_ICONS[meal.meal_type]}</span>
                    <span className="text-xs text-muted">
                      {MEAL_TYPE_LABELS[meal.meal_type]}
                    </span>
                    {meal.is_ai_estimated && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded">
                        AI
                      </span>
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
                <button
                  onClick={() => handleDelete(meal.id)}
                  className="text-muted hover:text-red-400 p-1"
                >
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
    </div>
  );
}
