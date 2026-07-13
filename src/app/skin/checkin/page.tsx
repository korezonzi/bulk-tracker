"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import { uploadPrivatePhoto, type UploadedPhoto } from "@/lib/photos";
import { MedicalDisclaimer } from "@/components/medical-disclaimer";
import { ScoreRing } from "@/components/score-ring";
import { SkinSeverityBars } from "@/components/skin-severity-bars";
import {
  type SkinAnalysis,
  type ProductVerdict,
} from "@/lib/types";

type PhotoLabel = "front" | "left" | "right";

const PHOTO_SLOTS: { label: PhotoLabel; title: string }[] = [
  { label: "front", title: "正面" },
  { label: "left", title: "左側面" },
  { label: "right", title: "右側面" },
];

const VERDICT_STYLES: Record<ProductVerdict, { label: string; className: string }> = {
  continue: { label: "継続◎", className: "bg-accent/12 text-accent" },
  reconsider: { label: "見直し", className: "bg-warning/12 text-warning" },
  insufficient_data: { label: "判断保留", className: "bg-card-hover text-muted" },
};

const SUGGESTION_TYPE_LABELS: Record<string, string> = {
  ingredient: "成分",
  product: "コスメ",
  supplement: "サプリ",
  habit: "習慣",
};

export default function SkinCheckinPage() {
  const router = useRouter();
  const today = getToday();

  const [photos, setPhotos] = useState<Partial<Record<PhotoLabel, UploadedPhoto>>>({});
  const [uploading, setUploading] = useState<PhotoLabel | null>(null);
  const [selfNote, setSelfNote] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SkinAnalysis | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRefs = {
    front: useRef<HTMLInputElement>(null),
    left: useRef<HTMLInputElement>(null),
    right: useRef<HTMLInputElement>(null),
  };

  async function handlePhoto(file: File, label: PhotoLabel) {
    setUploading(label);
    setError(null);
    try {
      const uploaded = await uploadPrivatePhoto(
        `skin/${today}_${label}.jpg`,
        file
      );
      setPhotos((prev) => ({ ...prev, [label]: uploaded }));
    } catch (e) {
      console.error("Photo upload failed:", e);
      setError("写真のアップロードに失敗しました");
    } finally {
      setUploading(null);
    }
  }

  async function handleAnalyze() {
    const images = PHOTO_SLOTS.filter((slot) => photos[slot.label]).map(
      (slot) => ({
        label: slot.label,
        base64: photos[slot.label]!.base64,
        mimeType: photos[slot.label]!.mimeType,
      })
    );
    if (images.length === 0) return;

    setAnalyzing(true);
    setError(null);
    try {
      const response = await fetch("/api/analyze-skin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, selfNote: selfNote || undefined }),
      });
      if (!response.ok) throw new Error("Analysis failed");
      const data: SkinAnalysis = await response.json();
      setAnalysis(data);
    } catch (e) {
      console.error("Skin analysis failed:", e);
      setError("AI解析に失敗しました。もう一度お試しください");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!analysis) return;
    setSaving(true);
    setError(null);

    const { error: upsertError } = await supabase.from("skin_checkins").upsert(
      {
        date: today,
        front_photo_path: photos.front?.path ?? null,
        left_photo_path: photos.left?.path ?? null,
        right_photo_path: photos.right?.path ?? null,
        self_note: selfNote || null,
        score_acne: analysis.scores.acne,
        score_pores: analysis.scores.pores,
        score_redness: analysis.scores.redness,
        score_oiliness: analysis.scores.oiliness,
        score_texture: analysis.scores.texture,
        score_overall: analysis.scores.overall,
        ai_analysis: analysis,
      },
      { onConflict: "date" }
    );

    if (upsertError) {
      console.error("Checkin save failed:", upsertError);
      setError("保存に失敗しました");
      setSaving(false);
      return;
    }

    // Reflect AI-determined skin type into the profile
    const { data: profile } = await supabase
      .from("skin_profile")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (profile) {
      await supabase
        .from("skin_profile")
        .update({ ai_skin_type: analysis.skin_type, updated_at: new Date().toISOString() })
        .eq("id", profile.id);
    } else {
      await supabase
        .from("skin_profile")
        .insert({ ai_skin_type: analysis.skin_type });
    }

    setSaved(true);
    setSaving(false);
    setTimeout(() => router.push("/skin"), 1200);
  }

  const hasPhoto = Object.keys(photos).length > 0;

  return (
    <div className="py-6 md:py-10 space-y-5 md:space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          🧖 肌チェックイン
        </h1>
        <p className="text-xs text-muted mt-1">{today}</p>
      </div>

      {/* Shooting condition guide (score stability) */}
      <div className="bg-card rounded-xl p-3 text-xs text-muted">
        💡 毎回同じ条件で撮ると経過比較の精度が上がります: 洗顔後・同じ場所・自然光かつ正面からの照明
      </div>

      {/* Photo slots */}
      <div className="grid grid-cols-3 gap-2">
        {PHOTO_SLOTS.map((slot) => {
          const uploaded = photos[slot.label];
          const isUploading = uploading === slot.label;
          return (
            <div key={slot.label}>
              <input
                ref={inputRefs[slot.label]}
                type="file"
                accept="image/*"
                capture="user"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhoto(file, slot.label);
                }}
                className="hidden"
              />
              {uploaded ? (
                <button
                  onClick={() => inputRefs[slot.label].current?.click()}
                  className="w-full relative rounded-xl overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={uploaded.dataUrl}
                    alt={slot.title}
                    className="w-full h-36 object-cover"
                  />
                  <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                    {slot.title}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => inputRefs[slot.label].current?.click()}
                  disabled={isUploading}
                  className="w-full h-36 bg-card border-2 border-dashed border-card-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted disabled:opacity-50"
                >
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span className="text-[10px]">{slot.title}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Self note */}
      <div>
        <label className="block text-xs text-muted mb-1">
          今日のメモ（睡眠・食生活・体調など、任意）
        </label>
        <textarea
          value={selfNote}
          onChange={(e) => setSelfNote(e.target.value)}
          placeholder="例: 最近寝不足気味。昨日は揚げ物多め"
          rows={2}
          className="w-full px-3 py-2 bg-card rounded-lg text-sm resize-none"
        />
      </div>

      {/* Analyze button */}
      {!analysis && (
        <button
          onClick={handleAnalyze}
          disabled={!hasPhoto || analyzing || uploading !== null}
          className="w-full bg-accent text-white px-4 py-3 rounded-lg font-semibold text-base disabled:opacity-50 active:scale-[0.97]"
        >
          {analyzing ? "解析中...（10秒ほどかかります）" : "🤖 AIで肌を解析する"}
        </button>
      )}

      {error && (
        <p className="text-sm text-error text-center">{error}</p>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="space-y-4">
          {/* Scores */}
          <div className="bg-card rounded-xl p-4">
            <div className="flex items-center gap-4">
              <ScoreRing score={analysis.scores.overall} label="総合コンディション" />
              <div className="flex-1">
                <SkinSeverityBars scores={analysis.scores} />
              </div>
            </div>
            <p className="text-sm mt-3 leading-relaxed">{analysis.summary}</p>
            <p className="text-xs text-muted mt-2">
              肌タイプ判定: <span className="text-foreground">{analysis.skin_type}</span>
            </p>
            {analysis.compared_to_last && (
              <p className="text-xs text-accent mt-1">
                {analysis.compared_to_last}
              </p>
            )}
          </div>

          {/* Observations */}
          {analysis.observations.length > 0 && (
            <div className="bg-card rounded-xl p-4">
              <h3 className="text-base font-medium mb-2">👀 所見</h3>
              <ul className="space-y-1.5">
                {analysis.observations.map((obs, i) => (
                  <li key={i} className="text-sm text-foreground/90 flex gap-2">
                    <span className="text-muted shrink-0">・</span>
                    {obs}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Product feedback */}
          {analysis.product_feedback.length > 0 && (
            <div className="bg-card rounded-xl p-4">
              <h3 className="text-base font-medium mb-2">🧴 使用中アイテムの評価</h3>
              <div className="space-y-3">
                {analysis.product_feedback.map((fb, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${VERDICT_STYLES[fb.verdict]?.className ?? VERDICT_STYLES.insufficient_data.className}`}
                      >
                        {VERDICT_STYLES[fb.verdict]?.label ?? "判断保留"}
                      </span>
                      <span className="text-sm font-medium">{fb.product}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">{fb.assessment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {analysis.suggestions.length > 0 && (
            <div className="bg-card rounded-xl p-4">
              <h3 className="text-base font-medium mb-2">💡 提案</h3>
              <div className="space-y-3">
                {analysis.suggestions.map((sug, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/12 text-accent shrink-0">
                        {SUGGESTION_TYPE_LABELS[sug.type] ?? sug.type}
                      </span>
                      <span className="text-sm font-medium">{sug.name}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">{sug.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <MedicalDisclaimer />

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="w-full bg-accent text-white px-4 py-3 rounded-lg font-semibold text-base disabled:opacity-50 active:scale-[0.97]"
          >
            {saved ? "✓ 保存しました" : saving ? "保存中..." : "この結果を保存する"}
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="w-full text-muted text-sm py-2 hover:text-foreground"
          >
            {analyzing ? "再解析中..." : "もう一度解析する"}
          </button>
        </div>
      )}
    </div>
  );
}
