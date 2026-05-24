"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DailySummary, BodyMeasurement, UserProfile, WorkoutLog, MuscleGroup } from "@/lib/types";
import { MUSCLE_GROUP_LABELS } from "@/lib/types";
import { calculateWeeklyVolume, detectMuscleGroups } from "@/lib/calc";
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

function getDateRange(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

export default function ProgressPage() {
  const [period, setPeriod] = useState<Period>("2w");
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [bodyData, setBodyData] = useState<BodyMeasurement[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const startDate = getDateRange(PERIOD_DAYS[period]);

      const [summaryRes, bodyRes, profileRes, workoutRes] = await Promise.all([
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
        supabase.from("user_profile").select("*").limit(1).single(),
        supabase
          .from("workout_logs")
          .select("*, preset:workout_presets(*)")
          .gte("date", startDate)
          .order("date", { ascending: true }),
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

  // Workout calories from daily summaries
  const workoutCalorieData = summaries
    .filter((s) => (s.workout_calories ?? 0) > 0)
    .map((s) => ({
      date: s.date.slice(5),
      workoutCalories: Math.round(s.workout_calories ?? 0),
    }));

  const weightData = bodyData.map((b) => ({
    date: b.date.slice(5),
    weight: b.weight,
    bodyFat: b.body_fat_pct,
  }));

  // Lean mass from body measurements
  const leanMassData = bodyData
    .filter((b) => b.lean_mass != null)
    .map((b) => ({
      date: b.date.slice(5),
      leanMass: b.lean_mass,
    }));

  // Weekly muscle volume stacked bar chart data
  const MUSCLE_COLORS: Record<MuscleGroup, string> = {
    chest: "#ef4444",
    back: "#3b82f6",
    legs: "#22c55e",
    shoulders: "#a855f7",
    arms: "#f97316",
    core: "#eab308",
    full_body: "#71717a",
  };

  const weeklyVolumeData = (() => {
    if (workoutLogs.length === 0) return [];

    // Group logs by ISO week (Monday start)
    const weekMap = new Map<string, typeof workoutLogs>();
    for (const log of workoutLogs) {
      const d = new Date(log.date + "T00:00:00");
      // Get Monday of the week
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
      for (const v of volumes) {
        entry[v.muscleGroup] = v.sets;
      }
      return entry;
    });
  })();

  const tooltipStyle = {
    backgroundColor: "rgba(20, 20, 25, 0.95)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    fontSize: 12,
    backdropFilter: "blur(8px)",
  };

  return (
    <div className="py-6 md:py-10 space-y-6 md:space-y-8">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">📈 推移グラフ</h1>

      {/* Period selector */}
      <div className="flex gap-2">
        {(["1w", "2w", "1m", "3m"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
              period === p
                ? "bg-accent text-white shadow-md shadow-accent/20"
                : "card-gradient text-muted hover:text-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Charts grid: 2 columns on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Weight Chart */}
        {weightData.length > 0 && (
          <div className="card-gradient rounded-3xl p-5 md:p-6">
            <h2 className="text-sm font-medium mb-4">体重</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                <YAxis
                  domain={["dataMin - 1", "dataMax + 1"]}
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  width={35}
                />
                <Tooltip contentStyle={tooltipStyle} />
                {profile && (
                  <ReferenceLine
                    y={profile.target_weight}
                    stroke="#6366f1"
                    strokeDasharray="5 5"
                    label={{ value: "目標", fontSize: 10, fill: "#3b82f6" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#f0f0f5"
                  strokeWidth={2}
                  dot={{ fill: "#f0f0f5", r: 3 }}
                  name="体重 (kg)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Calorie Chart */}
        {calorieData.length > 0 && (
          <div className="card-gradient rounded-3xl p-5 md:p-6">
            <h2 className="text-sm font-medium mb-4">カロリー</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={calorieData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                <YAxis tick={{ fontSize: 10, fill: "#71717a" }} width={40} />
                <Tooltip contentStyle={tooltipStyle} />
                {profile && (
                  <ReferenceLine
                    y={profile.target_calories}
                    stroke="#6366f1"
                    strokeDasharray="5 5"
                  />
                )}
                <Bar dataKey="calories" fill="#6366f1" radius={[6, 6, 0, 0]} name="カロリー (kcal)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Workout Calories Chart */}
        {workoutCalorieData.length > 0 && (
          <div className="card-gradient rounded-3xl p-5 md:p-6">
            <h2 className="text-sm font-medium mb-4">🔥 筋トレ消費カロリー</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workoutCalorieData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                <YAxis tick={{ fontSize: 10, fill: "#71717a" }} width={40} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="workoutCalories" fill="#a855f7" radius={[6, 6, 0, 0]} name="消費カロリー (kcal)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Lean Mass Chart */}
        {leanMassData.length > 0 && (
          <div className="card-gradient rounded-3xl p-5 md:p-6">
            <h2 className="text-sm font-medium mb-4">💪 除脂肪体重</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={leanMassData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                <YAxis
                  domain={["dataMin - 0.5", "dataMax + 0.5"]}
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  width={35}
                />
                <Tooltip contentStyle={tooltipStyle} />
                {profile && (
                  <ReferenceLine
                    y={profile.target_weight}
                    stroke="#6366f1"
                    strokeDasharray="5 5"
                    label={{ value: "目標", fontSize: 10, fill: "#6366f1" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="leanMass"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ fill: "#6366f1", r: 3 }}
                  name="除脂肪体重 (kg)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* PFC Chart */}
        {pfcData.length > 0 && (
          <div className="card-gradient rounded-3xl p-5 md:p-6 md:col-span-2">
            <h2 className="text-sm font-medium mb-4">PFCバランス</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pfcData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
                <YAxis tick={{ fontSize: 10, fill: "#71717a" }} width={35} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="protein" fill="#f97316" stackId="pfc" name="タンパク質 (g)" />
                <Bar dataKey="fat" fill="#facc15" stackId="pfc" name="脂質 (g)" />
                <Bar dataKey="carbs" fill="#34d399" stackId="pfc" radius={[6, 6, 0, 0]} name="炭水化物 (g)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Weekly muscle volume stacked bar chart */}
      {weeklyVolumeData.length > 0 && (
        <div className="card-gradient rounded-3xl p-5 md:p-6">
          <h2 className="text-sm font-medium mb-4">📊 週間トレーニングボリューム</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weeklyVolumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#71717a" }} />
              <YAxis tick={{ fontSize: 10, fill: "#71717a" }} width={35} label={{ value: "セット数", angle: -90, position: "insideLeft", fontSize: 10, fill: "#71717a" }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {(["chest", "back", "legs", "shoulders", "arms", "core"] as MuscleGroup[]).map((group, i, arr) => (
                <Bar
                  key={group}
                  dataKey={group}
                  name={MUSCLE_GROUP_LABELS[group]}
                  fill={MUSCLE_COLORS[group]}
                  stackId="volume"
                  radius={i === arr.length - 1 ? [6, 6, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty state */}
      {calorieData.length === 0 && weightData.length === 0 && (
        <div className="text-center py-16 text-muted">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-medium">データがまだないよ</p>
          <p className="text-xs mt-1 leading-relaxed">食事や体組成を記録すると表示されます 🍽️</p>
        </div>
      )}
    </div>
  );
}
