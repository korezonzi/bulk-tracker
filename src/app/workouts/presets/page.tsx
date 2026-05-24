"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Exercise, WorkoutCategory, WorkoutPreset } from "@/lib/types";

const EMPTY_EXERCISE: Exercise = { name: "", target: "", duration: "" };

export default function PresetsPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [loading, setLoading] = useState(true);

  // New preset form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<WorkoutCategory>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [machineName, setMachineName] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [youtubeMeta, setYoutubeMeta] = useState<{
    title: string;
    thumbnailUrl: string;
  } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("workout_presets")
      .select("*")
      .order("sort_order", { ascending: true });

    setPresets(data ?? []);
    setLoading(false);
  }

  async function handleFetchYoutubeMeta() {
    if (!youtubeUrl) return;
    setFetchingMeta(true);

    try {
      const response = await fetch(
        `/api/youtube-meta?url=${encodeURIComponent(youtubeUrl)}`
      );
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setYoutubeMeta(data);
      if (!name) setName(data.title);
    } catch {
      console.error("YouTube meta fetch failed");
    } finally {
      setFetchingMeta(false);
    }
  }

  async function handleSave() {
    if (!name) return;
    setSaving(true);

    const maxOrder = presets.reduce((max, p) => Math.max(max, p.sort_order), 0);

    // Build exercises list: include machine name for chocozap as first exercise
    const allExercises: Exercise[] = [];
    if (category === "chocozap" && machineName.trim()) {
      allExercises.push({ name: machineName.trim(), target: "", duration: "" });
    }
    // Append manually added exercises (filter out empty rows)
    const validExercises = exercises.filter((e) => e.name.trim());
    allExercises.push(...validExercises);

    const { error } = await supabase.from("workout_presets").insert({
      name,
      category,
      youtube_url: category === "youtube" ? youtubeUrl || null : null,
      youtube_title: youtubeMeta?.title || null,
      thumbnail_url: youtubeMeta?.thumbnailUrl || null,
      duration_min: durationMin,
      exercises: allExercises.length > 0 ? allExercises : null,
      sort_order: maxOrder + 1,
    });

    if (!error) {
      setShowForm(false);
      setName("");
      setYoutubeUrl("");
      setYoutubeMeta(null);
      setDurationMin(null);
      setMachineName("");
      setExercises([]);
      await load();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("workout_presets").delete().eq("id", id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="py-6 md:py-10 space-y-5 md:space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">💪 筋トレメニュー</h1>
        <button onClick={() => router.back()} className="text-muted text-sm">
          完了
        </button>
      </div>

      {/* Existing presets */}
      <div className="space-y-2">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className="card-gradient rounded-2xl p-3 flex items-center gap-3"
          >
            {preset.thumbnail_url && (
              <img
                src={preset.thumbnail_url}
                alt=""
                className="w-14 h-9 object-cover rounded"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{preset.name}</p>
              <p className="text-[10px] text-muted">
                {preset.category}
                {preset.duration_min ? ` / ${preset.duration_min}min` : ""}
              </p>
            </div>
            <button
              onClick={() => handleDelete(preset.id)}
              className="text-muted hover:text-red-400 p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-3 border-2 border-dashed border-card-border rounded-xl text-muted text-sm"
        >
          + メニュー追加
        </button>
      ) : (
        <div className="card-gradient rounded-2xl p-4 space-y-3">
          {/* Category */}
          <div className="flex gap-2">
            {(["youtube", "chocozap", "home"] as WorkoutCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setCategory(cat);
                  setYoutubeMeta(null);
                  setYoutubeUrl("");
                  setMachineName("");
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                  category === cat
                    ? "bg-accent text-white"
                    : "card-gradient text-muted"
                }`}
              >
                {cat === "youtube" ? "YouTube" : cat === "chocozap" ? "chocoZAP" : "自宅"}
              </button>
            ))}
          </div>

          {/* YouTube URL */}
          {category === "youtube" && (
            <div>
              <label className="block text-xs text-muted mb-1">YouTube URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="flex-1 px-3 py-2 card-gradient rounded-lg text-sm"
                />
                <button
                  onClick={handleFetchYoutubeMeta}
                  disabled={!youtubeUrl || fetchingMeta}
                  className="px-3 py-2 bg-accent text-white rounded-lg text-xs disabled:opacity-50"
                >
                  {fetchingMeta ? "..." : "取得"}
                </button>
              </div>
              {youtubeMeta && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-background rounded-lg">
                  <img
                    src={youtubeMeta.thumbnailUrl}
                    alt=""
                    className="w-16 h-10 object-cover rounded"
                  />
                  <p className="text-xs truncate">{youtubeMeta.title}</p>
                </div>
              )}
            </div>
          )}

          {/* chocoZAP machine name */}
          {category === "chocozap" && (
            <div>
              <label className="block text-xs text-muted mb-1">マシン名</label>
              <input
                type="text"
                value={machineName}
                onChange={(e) => setMachineName(e.target.value)}
                placeholder="例: チェストプレス、ラットプルダウン"
                className="w-full px-3 py-2 card-gradient rounded-lg text-sm"
              />
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs text-muted mb-1">メニュー名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                category === "home"
                  ? "例: 腕立て30回"
                  : category === "chocozap"
                    ? "例: 上半身マシン"
                    : "例: 胸トレ5分"
              }
              className="w-full px-3 py-2 card-gradient rounded-lg text-sm"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-muted mb-1">
              時間（分）- 任意
            </label>
            <input
              type="number"
              value={durationMin ?? ""}
              onChange={(e) =>
                setDurationMin(e.target.value ? Number(e.target.value) : null)
              }
              placeholder="30"
              className="w-full px-3 py-2 card-gradient rounded-lg text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Exercises - dynamic add/remove */}
          <div>
            <label className="block text-xs text-muted mb-1">種目一覧（任意）</label>
            {exercises.map((ex, idx) => (
              <div key={idx} className="flex gap-1.5 mb-1.5">
                <input
                  type="text"
                  value={ex.name}
                  onChange={(e) => {
                    const next = [...exercises];
                    next[idx] = { ...ex, name: e.target.value };
                    setExercises(next);
                  }}
                  placeholder="種目名"
                  className="flex-[2] px-2 py-1.5 card-gradient rounded-lg text-xs"
                />
                <input
                  type="text"
                  value={ex.target}
                  onChange={(e) => {
                    const next = [...exercises];
                    next[idx] = { ...ex, target: e.target.value };
                    setExercises(next);
                  }}
                  placeholder="部位"
                  className="flex-1 px-2 py-1.5 card-gradient rounded-lg text-xs"
                />
                <input
                  type="text"
                  value={ex.duration}
                  onChange={(e) => {
                    const next = [...exercises];
                    next[idx] = { ...ex, duration: e.target.value };
                    setExercises(next);
                  }}
                  placeholder="時間"
                  className="flex-1 px-2 py-1.5 card-gradient rounded-lg text-xs"
                />
                <button
                  onClick={() => setExercises(exercises.filter((_, i) => i !== idx))}
                  className="text-muted hover:text-red-400 px-1"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => setExercises([...exercises, { ...EMPTY_EXERCISE }])}
              className="text-xs text-accent mt-1"
            >
              + 種目を追加
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowForm(false);
                setName("");
                setYoutubeUrl("");
                setYoutubeMeta(null);
                setMachineName("");
                setExercises([]);
              }}
              className="flex-1 py-2 border border-card-border rounded-lg text-sm"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={!name || saving}
              className="flex-1 py-2 bg-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? "保存中..." : "追加"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
