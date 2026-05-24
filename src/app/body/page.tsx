"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calculatePfcTargets, calculateLeanMass } from "@/lib/calc";

type InputMode = "screenshot" | "manual";

export default function BodyPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<InputMode>("screenshot");
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [weight, setWeight] = useState(0);
  const [bodyFatPct, setBodyFatPct] = useState(0);
  const [muscleMass, setMuscleMass] = useState<number | null>(null);
  const [leanMass, setLeanMass] = useState<number | null>(null);
  const [bmr, setBmr] = useState<number | null>(null);

  async function handleScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setAnalyzing(true);
    try {
      const { default: imageCompression } = await import("browser-image-compression");
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1200,
        initialQuality: 0.8,
        useWebWorker: true,
      });

      const base64Reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        base64Reader.onload = () => {
          const dataUrl = base64Reader.result as string;
          resolve(dataUrl.split(",")[1]);
        };
      });
      base64Reader.readAsDataURL(compressed);
      const imageBase64 = await base64Promise;

      const response = await fetch("/api/analyze-body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType: compressed.type || "image/jpeg",
        }),
      });

      if (!response.ok) throw new Error("Analysis failed");

      const data = await response.json();
      setWeight(data.weight);
      setBodyFatPct(data.body_fat_pct);
      setMuscleMass(data.muscle_mass);
      setLeanMass(data.lean_mass);
      setBmr(data.bmr);
    } catch (error) {
      console.error("Screenshot analysis error:", error);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (weight <= 0) return;
    setSaving(true);

    const today = new Date().toISOString().split("T")[0];
    const computedLeanMass = leanMass ?? calculateLeanMass(weight, bodyFatPct);

    // Upsert body measurement
    const { error: bodyError } = await supabase.from("body_measurements").upsert(
      {
        date: today,
        weight,
        body_fat_pct: bodyFatPct || null,
        muscle_mass: muscleMass,
        lean_mass: computedLeanMass,
        bmr,
        source: mode === "screenshot" ? "fitdays_ocr" : "manual",
      },
      { onConflict: "date" }
    );

    if (bodyError) {
      console.error("Save body error:", bodyError);
      setSaving(false);
      return;
    }

    // Update user profile weight and recalculate PFC targets
    const { data: profile } = await supabase
      .from("user_profile")
      .select("activity_level, target_weight")
      .limit(1)
      .single();

    if (profile) {
      const targets = calculatePfcTargets(
        weight,
        bodyFatPct,
        profile.activity_level
      );

      await supabase
        .from("user_profile")
        .update({
          weight,
          body_fat_pct: bodyFatPct,
          lean_mass: computedLeanMass,
          target_calories: targets.targetCalories,
          target_protein: targets.targetProtein,
          target_fat: targets.targetFat,
          target_carbs: targets.targetCarbs,
          updated_at: new Date().toISOString(),
        })
        .not("id", "is", null); // Update the single row
    }

    router.push("/");
  }

  return (
    <div className="py-6 md:py-10 space-y-5 md:space-y-8">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">📊 体組成</h1>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("screenshot")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            mode === "screenshot"
              ? "bg-accent text-white"
              : "card-gradient text-muted"
          }`}
        >
          Fitdaysスクショ
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            mode === "manual"
              ? "bg-accent text-white"
              : "card-gradient text-muted"
          }`}
        >
          手入力
        </button>
      </div>

      {/* Screenshot upload */}
      {mode === "screenshot" && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleScreenshot}
            className="hidden"
          />
          {!preview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-40 bg-card border-2 border-dashed border-card-border rounded-2xl flex flex-col items-center justify-center gap-2 text-muted"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span className="text-sm">Fitdaysのスクショをアップロード</span>
            </button>
          ) : (
            <div className="relative">
              <img
                src={preview}
                alt="Fitdays screenshot"
                className="w-full h-40 object-contain bg-card rounded-2xl"
              />
              {analyzing && (
                <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-white text-sm">読み取り中...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Input fields */}
      {(mode === "manual" || (mode === "screenshot" && weight > 0)) && (
        <div className="space-y-3">
          <BodyInput label="体重" value={weight} onChange={setWeight} unit="kg" />
          <BodyInput label="体脂肪率" value={bodyFatPct} onChange={setBodyFatPct} unit="%" />
          <BodyInput
            label="筋肉量"
            value={muscleMass ?? 0}
            onChange={(v) => setMuscleMass(v || null)}
            unit="kg"
          />
          <BodyInput
            label="除脂肪体重"
            value={leanMass ?? 0}
            onChange={(v) => setLeanMass(v || null)}
            unit="kg"
          />
          <BodyInput
            label="基礎代謝"
            value={bmr ?? 0}
            onChange={(v) => setBmr(v || null)}
            unit="kcal"
          />

          <button
            onClick={handleSave}
            disabled={saving || weight <= 0}
            className="w-full py-3 bg-accent text-white rounded-xl font-medium disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存して目標を更新"}
          </button>
        </div>
      )}
    </div>
  );
}

function BodyInput({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  return (
    <div className="flex items-center justify-between card-gradient rounded-lg px-3 py-2">
      <label className="text-sm">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 text-right bg-transparent text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          step="0.1"
        />
        <span className="text-xs text-muted w-8">{unit}</span>
      </div>
    </div>
  );
}
