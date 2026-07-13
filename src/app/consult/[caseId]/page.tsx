"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import { getSignedUrls, uploadPrivatePhoto } from "@/lib/photos";
import { ConsultResponseCard } from "@/components/consult-response-card";
import {
  CONSULT_STATUS_LABELS,
  type ConsultAiResponse,
  type ConsultCase,
  type ConsultCaseStatus,
  type ConsultEntry,
} from "@/lib/types";

const MAX_PHOTOS = 3;

// Fetch case, entries, and signed photo URLs (stateless helper shared by
// the initial effect and post-follow-up reloads)
async function fetchCaseData(caseId: string) {
  const [caseRes, entriesRes] = await Promise.all([
    supabase.from("consult_cases").select("*").eq("id", caseId).maybeSingle(),
    supabase
      .from("consult_entries")
      .select("*")
      .eq("case_id", caseId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const entries: ConsultEntry[] = entriesRes.data ?? [];
  const allPaths = entries.flatMap((e) => e.photo_paths ?? []);
  const urls = allPaths.length > 0 ? await getSignedUrls(allPaths) : {};
  return { caseData: caseRes.data as ConsultCase | null, entries, urls };
}

export default function ConsultCaseDetailPage() {
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;

  const [consultCase, setConsultCase] = useState<ConsultCase | null>(null);
  const [entries, setEntries] = useState<ConsultEntry[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Follow-up form
  const [showForm, setShowForm] = useState(false);
  const [userNote, setUserNote] = useState("");
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { caseData, entries: loaded, urls } = await fetchCaseData(caseId);
      if (!active) return;
      setConsultCase(caseData);
      setEntries(loaded);
      setPhotoUrls(urls);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [caseId]);

  async function handleStatusChange(status: ConsultCaseStatus) {
    if (!consultCase) return;
    await supabase
      .from("consult_cases")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", consultCase.id);
    setConsultCase({ ...consultCase, status });
  }

  function handleAddPhoto(file: File) {
    if (files.length >= MAX_PHOTOS) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFiles((prev) => [...prev, { file, preview: reader.result as string }]);
    };
    reader.readAsDataURL(file);
  }

  async function handleFollowUp() {
    if (!consultCase || (!userNote.trim() && files.length === 0)) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1. Upload new photos
      setProgress("写真をアップロード中...");
      const today = getToday();
      const uploaded = [];
      for (const [i, item] of files.entries()) {
        const path = `consult/${consultCase.id}/${today}_${Date.now()}_${i}.jpg`;
        uploaded.push(await uploadPrivatePhoto(path, item.file));
      }

      // 2. AI analysis with case history + previous photo comparison
      setProgress("AIが経過を分析中...（10秒ほどかかります）");
      let aiResponse: ConsultAiResponse | null = null;
      try {
        const response = await fetch("/api/consult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: consultCase.id,
            userNote: userNote.trim(),
            images: uploaded.map((u) => ({
              base64: u.base64,
              mimeType: u.mimeType,
            })),
          }),
        });
        if (response.ok) {
          aiResponse = await response.json();
        }
      } catch (e) {
        console.error("Consult AI failed:", e);
      }

      // 3. Save entry
      setProgress("保存中...");
      await supabase.from("consult_entries").insert({
        case_id: consultCase.id,
        date: today,
        user_note: userNote.trim() || null,
        photo_paths: uploaded.length > 0 ? uploaded.map((u) => u.path) : null,
        ai_response: aiResponse,
      });

      await supabase
        .from("consult_cases")
        .update({
          summary: aiResponse?.case_summary ?? consultCase.summary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", consultCase.id);

      // Reset form and reload timeline
      setUserNote("");
      setFiles([]);
      setShowForm(false);
      setSubmitting(false);
      setProgress("");
      const { caseData, entries: reloaded, urls } = await fetchCaseData(caseId);
      setConsultCase(caseData);
      setEntries(reloaded);
      setPhotoUrls(urls);
    } catch (e) {
      console.error("Follow-up failed:", e);
      setError("追記に失敗しました。もう一度お試しください");
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

  if (!consultCase) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted">ケースが見つかりません</p>
        <Link href="/consult" className="text-accent text-sm mt-2 inline-block">
          ← 相談一覧へ
        </Link>
      </div>
    );
  }

  // Before/After: oldest and newest entries that have photos
  const entriesWithPhotos = entries
    .filter((e) => e.photo_paths && e.photo_paths.length > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const oldestPhotoEntry = entriesWithPhotos[0] ?? null;
  const newestPhotoEntry =
    entriesWithPhotos.length > 1
      ? entriesWithPhotos[entriesWithPhotos.length - 1]
      : null;

  return (
    <div className="py-6 md:py-10 space-y-5 max-w-2xl">
      <div>
        <Link href="/consult" className="text-xs text-muted hover:text-foreground">
          ← 相談一覧
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
          {consultCase.title}
        </h1>
        <p className="text-xs text-muted mt-1">
          {consultCase.body_area}
          {consultCase.started_on && ` ・ ${consultCase.started_on} 頃から`}
        </p>
      </div>

      {/* Status segment */}
      <div className="flex gap-1 bg-card rounded-xl p-1">
        {(Object.keys(CONSULT_STATUS_LABELS) as ConsultCaseStatus[]).map(
          (status) => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              className={`flex-1 py-1.5 rounded-lg text-xs transition-colors ${
                consultCase.status === status
                  ? "bg-accent/12 text-accent font-medium"
                  : "text-muted"
              }`}
            >
              {CONSULT_STATUS_LABELS[status]}
            </button>
          )
        )}
      </div>

      {/* Before / After */}
      {oldestPhotoEntry && newestPhotoEntry && (
        <div className="bg-card rounded-xl p-4">
          <h2 className="text-base font-medium mb-3">📷 経過比較</h2>
          <div className="grid grid-cols-2 gap-3">
            {[oldestPhotoEntry, newestPhotoEntry].map((entry, i) => {
              const path = entry.photo_paths![entry.photo_paths!.length - 1];
              return (
                <div key={entry.id + i}>
                  {photoUrls[path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls[path]}
                      alt={i === 0 ? "初回" : "最新"}
                      className="w-full h-40 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-40 bg-card-hover rounded-lg" />
                  )}
                  <p className="text-[10px] text-muted mt-1 text-center">
                    {i === 0 ? "初回" : "最新"} {entry.date}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Follow-up form */}
      {showForm ? (
        <div className="bg-card rounded-xl p-4 space-y-3">
          <h2 className="text-base font-medium">経過を追記</h2>
          <textarea
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="例: 市販の抗真菌薬を2週間使ってみた。少し良くなった気がする"
            rows={3}
            className="w-full px-3 py-2 bg-background rounded-lg text-sm resize-none"
          />
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
                  className="w-full h-24 object-cover rounded-xl"
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
                className="w-full h-24 bg-background border-2 border-dashed border-card-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted"
              >
                <span className="text-xs">📷 追加</span>
              </button>
            )}
          </div>
          {error && <p className="text-sm text-error text-center">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleFollowUp}
              disabled={submitting || (!userNote.trim() && files.length === 0)}
              className="flex-1 bg-accent text-white px-4 py-3 rounded-lg font-semibold text-sm disabled:opacity-50 active:scale-[0.97]"
            >
              {submitting ? progress || "処理中..." : "🤖 AIに経過を見てもらう"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              disabled={submitting}
              className="px-4 py-3 text-muted text-sm"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-accent text-white px-4 py-3 rounded-lg font-semibold text-base active:scale-[0.97]"
        >
          + 経過を追記する
        </button>
      )}

      {/* Timeline */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">🗓 経過タイムライン</h2>
        {entries.map((entry) => (
          <div key={entry.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-num font-medium">{entry.date}</span>
              <div className="flex-1 h-px bg-card-border" />
            </div>

            {entry.photo_paths && entry.photo_paths.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {entry.photo_paths.map((path) =>
                  photoUrls[path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={path}
                      src={photoUrls[path]}
                      alt="経過写真"
                      className="w-full h-28 object-cover rounded-lg"
                    />
                  ) : (
                    <div key={path} className="w-full h-28 bg-card-hover rounded-lg" />
                  )
                )}
              </div>
            )}

            {entry.user_note && (
              <div className="bg-card rounded-xl p-4">
                <p className="text-xs text-muted mb-1">本人メモ</p>
                <p className="text-sm">{entry.user_note}</p>
              </div>
            )}

            {entry.ai_response && (
              <ConsultResponseCard response={entry.ai_response} />
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
