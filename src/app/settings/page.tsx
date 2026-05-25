"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calculatePfcTargets } from "@/lib/calc";
import type { UserProfile } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [targetWeight, setTargetWeight] = useState(63);
  const [activityLevel, setActivityLevel] = useState(1.55);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("user_profile")
        .select("*")
        .limit(1)
        .single();

      if (data) {
        setProfile(data);
        setTargetWeight(data.target_weight);
        setActivityLevel(data.activity_level);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);

    const targets = calculatePfcTargets(
      profile.weight,
      profile.body_fat_pct,
      activityLevel
    );

    await supabase
      .from("user_profile")
      .update({
        target_weight: targetWeight,
        activity_level: activityLevel,
        target_calories: targets.targetCalories,
        target_protein: targets.targetProtein,
        target_fat: targets.targetFat,
        target_carbs: targets.targetCarbs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const previewTargets = calculatePfcTargets(
    profile.weight,
    profile.body_fat_pct,
    activityLevel
  );

  return (
    <div className="py-6 md:py-10 space-y-6 md:space-y-8">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">⚙️ 設定</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">目標体重</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTargetWeight((v) => Math.max(40, +(v - 0.5).toFixed(1)))}
              className="w-10 h-10 rounded-lg bg-card flex items-center justify-center"
            >
              -
            </button>
            <span className="text-2xl font-bold font-num flex-1 text-center">{targetWeight} kg</span>
            <button
              onClick={() => setTargetWeight((v) => Math.min(120, +(v + 0.5).toFixed(1)))}
              className="w-10 h-10 rounded-lg bg-card flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">活動レベル</label>
          <select
            value={activityLevel}
            onChange={(e) => setActivityLevel(Number(e.target.value))}
            className="w-full px-3 py-2 bg-card rounded-lg"
          >
            <option value={1.2}>デスクワーク中心 (1.2)</option>
            <option value={1.375}>軽い運動 (1.375)</option>
            <option value={1.55}>適度な運動 (1.55)</option>
            <option value={1.725}>ハードな運動 (1.725)</option>
          </select>
        </div>

        {/* Preview */}
        <div className="bg-card rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium">更新後の目標値</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">カロリー</span>
              <span>{previewTargets.targetCalories} kcal</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">タンパク質</span>
              <span className="text-protein">{previewTargets.targetProtein}g</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">脂質</span>
              <span className="text-fat">{previewTargets.targetFat}g</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">炭水化物</span>
              <span className="text-carbs">{previewTargets.targetCarbs}g</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-accent text-white rounded-xl font-medium disabled:opacity-50"
        >
          {saving ? "保存中..." : "設定を保存"}
        </button>
      </div>
    </div>
  );
}
