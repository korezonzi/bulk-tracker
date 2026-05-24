"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";
import Link from "next/link";

interface MealPlan {
  time: string;
  emoji: string;
  name: string;
  items: string[];
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

function buildMealPlan(target: { calories: number; protein: number; fat: number; carbs: number }): MealPlan[] {
  // Fixed meals from user's routine
  const fixedMeals: MealPlan[] = [
    {
      time: "朝",
      emoji: "🌅",
      name: "朝ごはん",
      items: [
        "卵かけご飯（卵1個+ご飯200g）",
        "ヨーグルト100g + グラノーラ40g",
        "バナナ1本 🍌",
      ],
      calories: 620,
      protein: 22,
      fat: 14,
      carbs: 100,
    },
    {
      time: "午前",
      emoji: "🥤",
      name: "プロテイン（1回目）",
      items: ["プロテイン1杯（クレアチン入り）"],
      calories: 125,
      protein: 24,
      fat: 1,
      carbs: 5,
    },
    {
      time: "午後",
      emoji: "🥤",
      name: "プロテイン（2回目）",
      items: ["プロテイン1杯"],
      calories: 120,
      protein: 24,
      fat: 1,
      carbs: 3,
    },
  ];

  const fixedTotal = fixedMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      fat: acc.fat + m.fat,
      carbs: acc.carbs + m.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  // Remaining to fill with lunch + dinner
  const remaining = {
    calories: target.calories - fixedTotal.calories,
    protein: target.protein - fixedTotal.protein,
    fat: target.fat - fixedTotal.fat,
    carbs: target.carbs - fixedTotal.carbs,
  };

  // Split ~45% lunch, ~55% dinner
  const lunch: MealPlan = {
    time: "昼",
    emoji: "☀️",
    name: "昼ごはん",
    items: [
      `目安: ${Math.round(remaining.calories * 0.45)}kcal`,
      "例: 鶏胸肉150g + ご飯250g + サラダ",
      "例: 牛丼並盛 + サラダ",
    ],
    calories: Math.round(remaining.calories * 0.45),
    protein: Math.round(remaining.protein * 0.45),
    fat: Math.round(remaining.fat * 0.45),
    carbs: Math.round(remaining.carbs * 0.45),
  };

  const dinner: MealPlan = {
    time: "夜",
    emoji: "🌙",
    name: "夜ごはん",
    items: [
      `目安: ${Math.round(remaining.calories * 0.55)}kcal`,
      "例: 焼き魚 + ご飯200g + 味噌汁 + 副菜",
      "例: パスタ + サラダチキン",
    ],
    calories: Math.round(remaining.calories * 0.55),
    protein: Math.round(remaining.protein * 0.55),
    fat: Math.round(remaining.fat * 0.55),
    carbs: Math.round(remaining.carbs * 0.55),
  };

  return [...fixedMeals.slice(0, 1), fixedMeals[1], lunch, fixedMeals[2], dinner];
}

export default function GuidePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("user_profile")
        .select("*")
        .limit(1)
        .single();
      setProfile(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const target = {
    calories: profile.target_calories,
    protein: profile.target_protein,
    fat: profile.target_fat,
    carbs: profile.target_carbs,
  };

  const plan = buildMealPlan(target);
  const planTotal = plan.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      fat: acc.fat + m.fat,
      carbs: acc.carbs + m.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  return (
    <div className="py-6 md:py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">📖 食事ガイド</h1>
        <Link href="/" className="text-muted text-sm">戻る</Link>
      </div>

      {/* Target summary */}
      <div className="card-gradient rounded-2xl p-4">
        <p className="text-xs text-muted mb-2">🎯 1日の目標</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold font-num">{Math.round(target.calories)}</p>
            <p className="text-[10px] text-muted">kcal</p>
          </div>
          <div>
            <p className="text-lg font-bold font-num text-protein">{Math.round(target.protein)}g</p>
            <p className="text-[10px] text-muted">タンパク質</p>
          </div>
          <div>
            <p className="text-lg font-bold font-num text-fat">{Math.round(target.fat)}g</p>
            <p className="text-[10px] text-muted">脂質</p>
          </div>
          <div>
            <p className="text-lg font-bold font-num text-carbs">{Math.round(target.carbs)}g</p>
            <p className="text-[10px] text-muted">炭水化物</p>
          </div>
        </div>
      </div>

      {/* Meal plan */}
      <div className="space-y-3">
        <p className="text-sm font-medium">📋 1日のモデルプラン</p>
        {plan.map((meal, i) => (
          <div key={i} className="card-gradient rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{meal.emoji}</span>
                <div>
                  <p className="text-sm font-medium">{meal.name}</p>
                  <p className="text-[10px] text-muted">{meal.time}</p>
                </div>
              </div>
              <span className="text-xs font-num text-muted">{meal.calories}kcal</span>
            </div>
            <ul className="space-y-1 mb-2">
              {meal.items.map((item, j) => (
                <li key={j} className="text-xs text-muted flex items-start gap-1.5">
                  <span className="text-muted/50 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3 text-[10px]">
              <span className="text-protein">P {meal.protein}g</span>
              <span className="text-fat">F {meal.fat}g</span>
              <span className="text-carbs">C {meal.carbs}g</span>
            </div>
          </div>
        ))}
      </div>

      {/* Total check */}
      <div className="card-gradient rounded-2xl p-4">
        <p className="text-xs text-muted mb-2">📊 プラン合計 vs 目標</p>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div>
            <p className="font-bold font-num">{planTotal.calories}</p>
            <p className="text-muted">/ {Math.round(target.calories)} kcal</p>
          </div>
          <div>
            <p className="font-bold font-num text-protein">{planTotal.protein}g</p>
            <p className="text-muted">/ {Math.round(target.protein)}g P</p>
          </div>
          <div>
            <p className="font-bold font-num text-fat">{planTotal.fat}g</p>
            <p className="text-muted">/ {Math.round(target.fat)}g F</p>
          </div>
          <div>
            <p className="font-bold font-num text-carbs">{planTotal.carbs}g</p>
            <p className="text-muted">/ {Math.round(target.carbs)}g C</p>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="card-gradient rounded-2xl p-4 space-y-2">
        <p className="text-sm font-medium">💡 リーンバルクのコツ</p>
        <ul className="space-y-1.5 text-xs text-muted">
          <li>• プロテインは筋トレ後30分以内 + 就寝前が効果的</li>
          <li>• 朝にバナナを追加するとカロリー・炭水化物を手軽に補える</li>
          <li>• 卵かけご飯を卵2個にするとタンパク質+7g</li>
          <li>• 間食にナッツ30g（約180kcal / P5g / F16g）で脂質を調整</li>
          <li>• 体重が週0.25-0.5kg増なら順調。増えすぎたら炭水化物を少し減らす</li>
        </ul>
      </div>
    </div>
  );
}
