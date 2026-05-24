"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calculatePfcTargets, calculateLeanMass } from "@/lib/calc";
import type { PfcTargets } from "@/lib/types";

type Step = "body" | "activity" | "preview";

const ACTIVITY_LEVELS = [
  { value: 1.2, label: "デスクワーク中心", desc: "運動ほぼなし" },
  { value: 1.375, label: "軽い運動", desc: "週1-3回の軽い運動" },
  { value: 1.55, label: "適度な運動", desc: "週3-5回の運動" },
  { value: 1.725, label: "ハードな運動", desc: "週6-7回のハードな運動" },
] as const;

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("body");
  const [weight, setWeight] = useState(55.6);
  const [bodyFat, setBodyFat] = useState(9.5);
  const [targetWeight, setTargetWeight] = useState(63);
  const [activityLevel, setActivityLevel] = useState(1.55);
  const [saving, setSaving] = useState(false);

  const targets = calculatePfcTargets(weight, bodyFat, activityLevel);

  async function handleSave() {
    setSaving(true);
    const leanMass = calculateLeanMass(weight, bodyFat);

    const { error } = await supabase.from("user_profile").insert({
      weight,
      body_fat_pct: bodyFat,
      lean_mass: leanMass,
      target_weight: targetWeight,
      activity_level: activityLevel,
      target_calories: targets.targetCalories,
      target_protein: targets.targetProtein,
      target_fat: targets.targetFat,
      target_carbs: targets.targetCarbs,
    });

    if (error) {
      console.error("Failed to save profile:", error);
      setSaving(false);
      return;
    }

    router.push("/");
  }

  return (
    <div className="p-4 min-h-screen flex flex-col">
      <h1 className="text-2xl md:text-3xl font-bold mb-1">🎯 初期設定</h1>
      <p className="text-sm text-muted mb-6 leading-relaxed">体組成と目標を設定しよう</p>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {(["body", "activity", "preview"] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              s === step ? "bg-accent" : "bg-card-border"
            }`}
          />
        ))}
      </div>

      {step === "body" && (
        <div className="space-y-6 flex-1">
          <NumberInput
            label="現在の体重"
            value={weight}
            onChange={setWeight}
            unit="kg"
            step={0.1}
            min={30}
            max={150}
          />
          <NumberInput
            label="体脂肪率"
            value={bodyFat}
            onChange={setBodyFat}
            unit="%"
            step={0.5}
            min={3}
            max={50}
          />
          <NumberInput
            label="目標体重"
            value={targetWeight}
            onChange={setTargetWeight}
            unit="kg"
            step={0.5}
            min={30}
            max={150}
          />
          <button
            onClick={() => setStep("activity")}
            className="w-full mt-auto py-3 bg-accent text-white rounded-xl font-medium"
          >
            次へ
          </button>
        </div>
      )}

      {step === "activity" && (
        <div className="space-y-3 flex-1">
          <p className="text-sm font-medium mb-2">活動レベル</p>
          {ACTIVITY_LEVELS.map((level) => (
            <button
              key={level.value}
              onClick={() => setActivityLevel(level.value)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                activityLevel === level.value
                  ? "border-accent bg-accent/10"
                  : "border-card-border bg-card"
              }`}
            >
              <p className="font-medium">{level.label}</p>
              <p className="text-xs text-muted">{level.desc}</p>
            </button>
          ))}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setStep("body")}
              className="flex-1 py-3 border border-card-border rounded-xl"
            >
              戻る
            </button>
            <button
              onClick={() => setStep("preview")}
              className="flex-1 py-3 bg-accent text-white rounded-xl font-medium"
            >
              次へ
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-6 flex-1">
          <PreviewCard targets={targets} weight={weight} targetWeight={targetWeight} />
          <div className="flex gap-3">
            <button
              onClick={() => setStep("activity")}
              className="flex-1 py-3 border border-card-border rounded-xl"
            >
              戻る
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 bg-accent text-white rounded-xl font-medium disabled:opacity-50"
            >
              {saving ? "保存中..." : "記録を始める"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  unit,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}
          className="w-10 h-10 rounded-lg card-gradient flex items-center justify-center text-lg"
        >
          -
        </button>
        <div className="flex-1 text-center">
          <span className="text-3xl font-bold font-num">{value}</span>
          <span className="text-sm text-muted ml-1">{unit}</span>
        </div>
        <button
          onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}
          className="w-10 h-10 rounded-lg card-gradient flex items-center justify-center text-lg"
        >
          +
        </button>
      </div>
    </div>
  );
}

function PreviewCard({
  targets,
  weight,
  targetWeight,
}: {
  targets: PfcTargets;
  weight: number;
  targetWeight: number;
}) {
  const gainNeeded = targetWeight - weight;

  return (
    <div className="card-gradient rounded-2xl p-5 space-y-4">
      <h2 className="font-bold text-lg">🎯 1日の目標値</h2>

      <div className="text-center py-4">
        <p className="text-4xl font-bold text-accent font-num">
          {targets.targetCalories.toLocaleString()}
        </p>
        <p className="text-sm text-muted">kcal / 日</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-background rounded-lg p-3">
          <p className="text-lg font-bold text-protein font-num">{targets.targetProtein}g</p>
          <p className="text-xs text-muted">タンパク質</p>
        </div>
        <div className="bg-background rounded-lg p-3">
          <p className="text-lg font-bold text-fat font-num">{targets.targetFat}g</p>
          <p className="text-xs text-muted">脂質</p>
        </div>
        <div className="bg-background rounded-lg p-3">
          <p className="text-lg font-bold text-carbs font-num">{targets.targetCarbs}g</p>
          <p className="text-xs text-muted">炭水化物</p>
        </div>
      </div>

      <div className="border-t border-card-border pt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">基礎代謝</span>
          <span>{targets.bmr} kcal</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">消費カロリー</span>
          <span>{targets.tdee} kcal</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">増量分</span>
          <span className="text-accent">+250 kcal</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">目標</span>
          <span>
            {weight}kg → {targetWeight}kg (+{gainNeeded.toFixed(1)}kg)
          </span>
        </div>
      </div>
    </div>
  );
}
