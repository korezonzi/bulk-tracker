"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import { getSignedUrls, uploadPrivatePhoto } from "@/lib/photos";
import { MedicalDisclaimer } from "@/components/medical-disclaimer";
import type { SkinSpotAdvice, SkinSpotConsult } from "@/lib/types";

const MAX_PHOTOS = 3;
const HISTORY_LIMIT = 10;

const URGENCY_LABELS: Record<string, string> = {
  routine: "急ぎではない",
  soon: "近いうちに",
  urgent: "早急に",
};

export default function SkinSpotPage() {
  const [history, setHistory] = useState<SkinSpotConsult[]>([]);
  const [loading, setLoading] = useState(true);

  // Consult form
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [userNote, setUserNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [advice, setAdvice] = useState<SkinSpotAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("skin_spot_consults")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (!active) return;
      setHistory(data ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  function handleAddPhoto(file: File) {
    if (files.length >= MAX_PHOTOS) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFiles((prev) => [...prev, { file, preview: reader.result as string }]);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (files.length === 0) return;
    setSubmitting(true);
    setError(null);
    setAdvice(null);

    try {
      // 1. Upload zoomed photos to the private bucket
      setProgress("写真をアップロード中...");
      const today = getToday();
      const uploaded = [];
      for (const [i, item] of files.entries()) {
        const path = `skin-spot/${today}_${Date.now()}_${i}.jpg`;
        uploaded.push(await uploadPrivatePhoto(path, item.file));
      }

      // 2. AI advice
      setProgress("AIが分析中...（10秒ほどかかります）");
      const response = await fetch("/api/skin-spot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userNote: userNote.trim() || undefined,
          images: uploaded.map((u) => ({
            base64: u.base64,
            mimeType: u.mimeType,
          })),
        }),
      });
      if (!response.ok) throw new Error("Analysis failed");
      const result: SkinSpotAdvice = await response.json();

      // 3. Save the consult
      setProgress("保存中...");
      const { data: saved } = await supabase
        .from("skin_spot_consults")
        .insert({
          date: today,
          user_note: userNote.trim() || null,
          photo_paths: uploaded.map((u) => u.path),
          ai_advice: result,
        })
        .select()
        .single();

      setAdvice(result);
      setFiles([]);
      setUserNote("");
      if (saved) {
        setHistory((prev) => [saved, ...prev].slice(0, HISTORY_LIMIT));
      }
    } catch (e) {
      console.error("Spot consult failed:", e);
      setError("分析に失敗しました。もう一度お試しください");
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="py-6 md:py-10 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          🔍 スポット相談
        </h1>
        <p className="text-xs text-muted mt-1">
          気になるニキビや肌の異変をズームで撮って、今すぐの処置を相談。定期チェックインのスコアには影響しません
        </p>
      </div>

      {/* Consult form */}
      <div className="bg-card rounded-xl p-4 space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleAddPhoto(file);
            e.target.value = "";
          }}
          className="hidden"
        />
        <div className="grid grid-cols-3 gap-2">
          {files.map((item, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.preview}
                alt={`写真${i + 1}`}
                className="w-full h-28 object-cover rounded-xl"
              />
              <button
                onClick={() =>
                  setFiles((prev) => prev.filter((_, idx) => idx !== i))
                }
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs"
              >
                ✕
              </button>
            </div>
          ))}
          {files.length < MAX_PHOTOS && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-28 bg-background border-2 border-dashed border-card-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="text-[10px]">ズームで撮影</span>
            </button>
          )}
        </div>

        <textarea
          value={userNote}
          onChange={(e) => setUserNote(e.target.value)}
          placeholder="例: あごに大きめのニキビ。昨日から痛みあり。潰していい？"
          rows={2}
          className="w-full px-3 py-2 bg-background rounded-lg text-sm resize-none"
        />

        {error && <p className="text-sm text-error text-center">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={files.length === 0 || submitting}
          className="w-full bg-accent text-white px-4 py-3 rounded-lg font-semibold text-base disabled:opacity-50 active:scale-[0.97]"
        >
          {submitting ? progress || "処理中..." : "🤖 今すぐの処置を相談する"}
        </button>
      </div>

      {/* Advice result */}
      {advice && <SpotAdviceCard advice={advice} />}

      {/* History */}
      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">🗓 過去の相談</h2>
          {history.map((consult) => (
            <SpotHistoryCard key={consult.id} consult={consult} />
          ))}
        </section>
      )}
    </div>
  );
}

function SpotAdviceCard({ advice }: { advice: SkinSpotAdvice }) {
  return (
    <div className="space-y-3">
      <div className="bg-card rounded-xl p-4">
        <h3 className="text-base font-medium mb-1">👀 状態の整理</h3>
        <p className="text-sm text-foreground/90 leading-relaxed">
          {advice.assessment}
        </p>
      </div>

      {advice.immediate_care.length > 0 && (
        <div className="bg-accent/12 border border-accent/30 rounded-xl p-4">
          <h3 className="text-base font-medium mb-2 text-accent">
            ⚡ 今すぐの処置
          </h3>
          <ol className="space-y-1.5">
            {advice.immediate_care.map((item, i) => (
              <li key={i} className="text-sm text-foreground/90 flex gap-2">
                <span className="text-accent font-num shrink-0">{i + 1}.</span>
                {item}
              </li>
            ))}
          </ol>
        </div>
      )}

      {advice.product_advice.length > 0 && (
        <div className="bg-card rounded-xl p-4">
          <h3 className="text-base font-medium mb-2">🧴 使用中アイテムの調整</h3>
          <div className="space-y-2">
            {advice.product_advice.map((pa, i) => (
              <div key={i}>
                <p className="text-sm font-medium">{pa.product}</p>
                <p className="text-xs text-muted">{pa.advice}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {advice.recommended.length > 0 && (
        <div className="bg-card rounded-xl p-4">
          <h3 className="text-base font-medium mb-2">💡 おすすめの成分・製品</h3>
          <div className="space-y-2">
            {advice.recommended.map((rec, i) => (
              <div key={i}>
                <p className="text-sm font-medium">{rec.name}</p>
                <p className="text-xs text-muted">{rec.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {advice.avoid.length > 0 && (
        <div className="bg-card rounded-xl p-4 border border-warning/30">
          <h3 className="text-base font-medium mb-2 text-warning">🚫 避けるべきこと</h3>
          <ul className="space-y-1.5">
            {advice.avoid.map((item, i) => (
              <li key={i} className="text-sm text-foreground/90 flex gap-2">
                <span className="text-warning shrink-0">・</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className={`rounded-xl p-4 ${
          advice.see_doctor.recommended
            ? "bg-accent/12 border border-accent/30"
            : "bg-card"
        }`}
      >
        <h3 className="text-base font-medium mb-1">
          🏥 受診の目安:{" "}
          {advice.see_doctor.recommended
            ? `${advice.see_doctor.department}へ（${URGENCY_LABELS[advice.see_doctor.urgency] ?? advice.see_doctor.urgency}）`
            : "今すぐの受診は不要"}
        </h3>
        <p className="text-sm text-foreground/90">{advice.see_doctor.reason}</p>
      </div>

      <MedicalDisclaimer />
    </div>
  );
}

function SpotHistoryCard({ consult }: { consult: SkinSpotConsult }) {
  const [expanded, setExpanded] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const photoPaths = consult.photo_paths ?? [];

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && photoPaths.length > 0 && Object.keys(photoUrls).length === 0) {
      setLoadingPhotos(true);
      setPhotoUrls(await getSignedUrls(photoPaths));
      setLoadingPhotos(false);
    }
  }

  return (
    <div className="bg-card rounded-xl overflow-hidden">
      <button
        onClick={handleExpand}
        className="w-full flex items-center justify-between p-4 card-hover text-left"
      >
        <div className="min-w-0">
          <span className="text-sm font-num">{consult.date}</span>
          <p className="text-xs text-muted truncate mt-0.5">
            {consult.user_note ?? consult.ai_advice?.assessment ?? ""}
          </p>
        </div>
        <span className="text-muted text-xs shrink-0 ml-2">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {photoPaths.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {loadingPhotos ? (
                <div className="col-span-3 h-24 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                photoPaths.map((path) =>
                  photoUrls[path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={path}
                      src={photoUrls[path]}
                      alt="相談写真"
                      className="w-full h-24 object-cover rounded-lg"
                    />
                  ) : null
                )
              )}
            </div>
          )}
          {consult.ai_advice && <SpotAdviceCard advice={consult.ai_advice} />}
        </div>
      )}
    </div>
  );
}
