"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getToday } from "@/lib/date";
import { uploadPrivatePhoto } from "@/lib/photos";
import type { ConsultAiResponse } from "@/lib/types";

const MAX_PHOTOS = 3;

const BODY_AREA_SUGGESTIONS = [
  "足の裏",
  "足の指",
  "手",
  "顔",
  "頭皮",
  "背中",
  "胸",
  "腕",
  "脚",
  "デリケートゾーン",
  "その他",
];

export default function ConsultNewPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [bodyArea, setBodyArea] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [userNote, setUserNote] = useState("");
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleAddPhoto(file: File) {
    if (files.length >= MAX_PHOTOS) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFiles((prev) => [...prev, { file, preview: reader.result as string }]);
    };
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!title.trim() || !bodyArea.trim() || !userNote.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1. Create the case
      setProgress("ケースを作成中...");
      const { data: newCase, error: caseError } = await supabase
        .from("consult_cases")
        .insert({
          title: title.trim(),
          body_area: bodyArea.trim(),
          started_on: startedOn || null,
        })
        .select()
        .single();
      if (caseError || !newCase) throw new Error("Case creation failed");

      // 2. Upload photos to the private bucket
      setProgress("写真をアップロード中...");
      const today = getToday();
      const uploaded = [];
      for (const [i, item] of files.entries()) {
        const path = `consult/${newCase.id}/${today}_${Date.now()}_${i}.jpg`;
        uploaded.push(await uploadPrivatePhoto(path, item.file));
      }

      // 3. AI analysis
      setProgress("AIが分析中...（10秒ほどかかります）");
      let aiResponse: ConsultAiResponse | null = null;
      try {
        const response = await fetch("/api/consult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            bodyArea: bodyArea.trim(),
            startedOn: startedOn || undefined,
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

      // 4. Save the entry (photos/note preserved even if AI failed)
      setProgress("保存中...");
      await supabase.from("consult_entries").insert({
        case_id: newCase.id,
        date: today,
        user_note: userNote.trim(),
        photo_paths: uploaded.length > 0 ? uploaded.map((u) => u.path) : null,
        ai_response: aiResponse,
      });

      if (aiResponse?.case_summary) {
        await supabase
          .from("consult_cases")
          .update({
            summary: aiResponse.case_summary,
            updated_at: new Date().toISOString(),
          })
          .eq("id", newCase.id);
      }

      router.push(`/consult/${newCase.id}`);
    } catch (e) {
      console.error("Consult submission failed:", e);
      setError("相談の作成に失敗しました。もう一度お試しください");
      setSubmitting(false);
      setProgress("");
    }
  }

  const canSubmit =
    title.trim() && bodyArea.trim() && userNote.trim() && !submitting;

  return (
    <div className="py-6 md:py-10 space-y-5 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
        🩺 新しい相談
      </h1>

      <div className="bg-card rounded-xl p-4 space-y-3">
        <div>
          <label className="block text-xs text-muted mb-1">
            タイトル *（何が気になる？）
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 足裏の点状の皮むけ"
            className="w-full px-3 py-2 bg-background rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">部位 *</label>
          <input
            type="text"
            value={bodyArea}
            onChange={(e) => setBodyArea(e.target.value)}
            placeholder="例: 足の裏"
            className="w-full px-3 py-2 bg-background rounded-lg text-sm"
            list="body-area-suggestions"
          />
          <datalist id="body-area-suggestions">
            {BODY_AREA_SUGGESTIONS.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">
            いつ頃から？（だいたいでOK）
          </label>
          <input
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
            className="w-full px-3 py-2 bg-background rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1">
            症状の説明 *（かゆみ・痛みの有無、広がり方、試したことなど）
          </label>
          <textarea
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="例: 数年前から足裏に点々と皮がめくれている。かゆみや痛みはない。範囲は大きく変わっていない気がする"
            rows={4}
            className="w-full px-3 py-2 bg-background rounded-lg text-sm resize-none"
          />
        </div>

        {/* Photos */}
        <div>
          <label className="block text-xs text-muted mb-1">
            写真（最大{MAX_PHOTOS}枚・非公開ストレージに保存されます）
          </label>
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
                  onClick={() => handleRemovePhoto(i)}
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
                <span className="text-[10px]">追加</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-error text-center">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full bg-accent text-white px-4 py-3 rounded-lg font-semibold text-base disabled:opacity-50 active:scale-[0.97]"
      >
        {submitting ? progress || "処理中..." : "🤖 AIに相談する"}
      </button>

      <p className="text-[10px] text-muted leading-relaxed">
        ※ AIの回答は診断ではなく、可能性の整理と一般的な情報提供です。
      </p>
    </div>
  );
}
