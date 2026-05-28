"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DailySummary, BodyMeasurement, UserProfile, WorkoutLog, MuscleGroup } from "@/lib/types";
import { MUSCLE_GROUP_LABELS } from "@/lib/types";
import { calculateWeeklyVolume } from "@/lib/calc";
import { daysAgo } from "@/lib/date";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from "recharts";

type Period = "1w" | "2w" | "1m" | "3m";

const PERIOD_DAYS: Record<Period, number> = {
  "1w": 7,
  "2w": 14,
  "1m": 30,
  "3m": 90,
};

const TOOLTIP_STYLE = {
  backgroundColor: "#1C1C20",
  border: "1px solid rgba(255, 255, 255, 0.06)",
  borderRadius: 12,
  fontSize: 12,
};

const MUSCLE_COLORS: Record<MuscleGroup, string> = {
  chest: "#ef4444",
  back: "#3B8FBF",
  legs: "#22c55e",
  shoulders: "#a855f7",
  arms: "#f97316",
  core: "#eab308",
  full_body: "#71717a",
};

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("2w");
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [bodyData, setBodyData] = useState<BodyMeasurement[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const startDate = daysAgo(PERIOD_DAYS[period]);
      const [summaryRes, bodyRes, profileRes, workoutRes] = await Promise.all([
        supabase.from("daily_summary").select("*").gte("date", startDate).order("date", { ascending: true }),
        supabase.from("body_measurements").select("*").gte("date", startDate).order("date", { ascending: true }),
        supabase.from("user_profile").select("*").limit(1).single(),
        supabase.from("workout_logs").select("*, preset:workout_presets(*)").gte("date", startDate).order("date", { ascending: true }),
      ]);
      setSummaries(summaryRes.data ?? []);
      setBodyData(bodyRes.data ?? []);
      setProfile(profileRes.data);
      setWorkoutLogs(workoutRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Data preparation ────────────────────────────────────────

  // Body composition data (from Fitdays)
  const weightData = bodyData.map((b) => ({
    date: b.date.slice(5),
    weight: b.weight,
  }));

  const bodyFatData = bodyData
    .filter((b) => b.body_fat_pct != null)
    .map((b) => ({
      date: b.date.slice(5),
      bodyFat: b.body_fat_pct,
    }));

  const leanMassData = bodyData
    .filter((b) => b.lean_mass != null)
    .map((b) => ({
      date: b.date.slice(5),
      leanMass: b.lean_mass,
    }));

  const muscleMassData = bodyData
    .filter((b) => b.muscle_mass != null)
    .map((b) => ({
      date: b.date.slice(5),
      muscleMass: b.muscle_mass,
    }));

  // Nutrition data (from meals)
  const calorieData = summaries.map((s) => ({
    date: s.date.slice(5),
    calories: Math.round(s.total_calories),
    target: profile?.target_calories ?? 0,
  }));

  const pfcData = summaries.map((s) => ({
    date: s.date.slice(5),
    protein: Math.round(s.total_protein),
    fat: Math.round(s.total_fat),
    carbs: Math.round(s.total_carbs),
  }));

  // Workout data
  const workoutFreqData = summaries
    .filter((s) => s.workout_count > 0 || s.workout_calories > 0)
    .map((s) => ({
      date: s.date.slice(5),
      count: s.workout_count,
      calories: Math.round(s.workout_calories ?? 0),
    }));

  const weeklyVolumeData = (() => {
    if (workoutLogs.length === 0) return [];
    const weekMap = new Map<string, typeof workoutLogs>();
    for (const log of workoutLogs) {
      const d = new Date(log.date + "T00:00:00");
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const weekKey = `${monday.getMonth() + 1}/${monday.getDate()}`;
      const existing = weekMap.get(weekKey) ?? [];
      existing.push(log);
      weekMap.set(weekKey, existing);
    }
    return Array.from(weekMap.entries()).map(([weekLabel, logs]) => {
      const volumes = calculateWeeklyVolume(logs);
      const entry: Record<string, string | number> = { week: `${weekLabel}週` };
      for (const v of volumes) entry[v.muscleGroup] = v.sets;
      return entry;
    });
  })();

  const hasBodyData = weightData.length > 0 || bodyFatData.length > 0 || leanMassData.length > 0;
  const hasNutritionData = calorieData.length > 0;
  const hasWorkoutData = workoutFreqData.length > 0 || weeklyVolumeData.length > 0;
  const hasAnyData = hasBodyData || hasNutritionData || hasWorkoutData;

  return (
    <div className="py-6 md:py-10 space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">📈 推移グラフ</h1>

      {/* Period selector */}
      <div className="flex gap-2">
        {(["1w", "2w", "1m", "3m"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
              period === p ? "bg-accent text-white" : "bg-card text-muted"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {!hasAnyData && (
        <div className="text-center py-16 text-muted">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium">データがまだないよ</p>
          <p className="text-xs mt-1">食事や体組成を記録すると表示されます 🍽️</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          📊 体組成（Fitdays）
          ═══════════════════════════════════════════════════════════ */}
      {hasBodyData && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            📊 体組成
            <span className="text-xs text-muted font-normal">Fitdays</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Weight */}
            {weightData.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-xs text-muted mb-3">体重 (kg)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={weightData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10, fill: "#71717a" }} width={35} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    {profile && <ReferenceLine y={profile.target_weight} stroke="#14B8A6" strokeDasharray="5 5" label={{ value: "目標", fontSize: 10, fill: "#14B8A6" }} />}
                    <Line type="monotone" dataKey="weight" stroke="#F5F5F5" strokeWidth={2} dot={{ fill: "#F5F5F5", r: 3 }} name="体重 (kg)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Body Fat % */}
            {bodyFatData.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-xs text-muted mb-3">体脂肪率 (%)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={bodyFatData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 10, fill: "#71717a" }} width={35} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="bodyFat" stroke="#FACC15" strokeWidth={2} dot={{ fill: "#FACC15", r: 3 }} name="体脂肪率 (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Lean Mass */}
            {leanMassData.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-xs text-muted mb-3">除脂肪体重 (kg)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={leanMassData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} tick={{ fontSize: 10, fill: "#71717a" }} width={35} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="leanMass" stroke="#14B8A6" strokeWidth={2} dot={{ fill: "#14B8A6", r: 3 }} name="除脂肪体重 (kg)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Muscle Mass */}
            {muscleMassData.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-xs text-muted mb-3">筋肉量 (kg)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={muscleMassData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis domain={["dataMin - 0.5", "dataMax + 0.5"]} tick={{ fontSize: 10, fill: "#71717a" }} width={35} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="muscleMass" stroke="#E8853A" strokeWidth={2} dot={{ fill: "#E8853A", r: 3 }} name="筋肉量 (kg)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
          🍽️ 食事・栄養
          ═══════════════════════════════════════════════════════════ */}
      {hasNutritionData && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            🍽️ 食事・栄養
            <span className="text-xs text-muted font-normal">食事記録</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Calories */}
            <div className="bg-card rounded-xl p-4">
              <h3 className="text-xs text-muted mb-3">摂取カロリー (kcal)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={calorieData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} width={40} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  {profile && <ReferenceLine y={profile.target_calories} stroke="#14B8A6" strokeDasharray="5 5" />}
                  <Bar dataKey="calories" fill="#14B8A6" radius={[4, 4, 0, 0]} name="カロリー (kcal)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* PFC Balance */}
            <div className="bg-card rounded-xl p-4">
              <h3 className="text-xs text-muted mb-3">PFCバランス (g)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={pfcData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#71717a" }} width={35} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="protein" fill="#E8853A" stackId="pfc" name="タンパク質 (g)" />
                  <Bar dataKey="fat" fill="#D4A843" stackId="pfc" name="脂質 (g)" />
                  <Bar dataKey="carbs" fill="#3BBF8F" stackId="pfc" radius={[4, 4, 0, 0]} name="炭水化物 (g)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
          💪 筋トレ
          ═══════════════════════════════════════════════════════════ */}
      {hasWorkoutData && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            💪 筋トレ
            <span className="text-xs text-muted font-normal">ワークアウト記録</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Workout frequency + calories */}
            {workoutFreqData.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-xs text-muted mb-3">頻度・消費カロリー</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={workoutFreqData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis yAxisId="count" tick={{ fontSize: 10, fill: "#71717a" }} width={25} allowDecimals={false} />
                    <YAxis yAxisId="cal" orientation="right" tick={{ fontSize: 10, fill: "#71717a" }} width={35} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar yAxisId="count" dataKey="count" fill="#a855f7" radius={[4, 4, 0, 0]} name="回数" />
                    <Line yAxisId="cal" type="monotone" dataKey="calories" stroke="#f97316" strokeWidth={2} dot={false} name="消費kcal" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weekly volume */}
            {weeklyVolumeData.length > 0 && (
              <div className="bg-card rounded-xl p-4">
                <h3 className="text-xs text-muted mb-3">週間ボリューム (セット数)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weeklyVolumeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#71717a" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#71717a" }} width={25} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {(["chest", "back", "legs", "shoulders", "arms", "core"] as MuscleGroup[]).map((group, i, arr) => (
                      <Bar key={group} dataKey={group} name={MUSCLE_GROUP_LABELS[group]} fill={MUSCLE_COLORS[group]} stackId="vol" radius={i === arr.length - 1 ? [4, 4, 0, 0] : undefined} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
