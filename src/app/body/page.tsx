"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calculatePfcTargets, calculateLeanMass } from "@/lib/calc";
import { getToday } from "@/lib/date";
import type { BodyMeasurement } from "@/lib/types";

type InputMode = "screenshot" | "manual";
type PhotoLabel = "front" | "side";

const PHOTO_LABELS: Record<PhotoLabel, string> = {
  front: "前面",
  side: "側面",
};

const BUCKET_NAME = "body-screenshots";
const PHOTO_PREFIX = "body-photos";

interface StoredPhoto {
  date: string;
  label: PhotoLabel;
  url: string;
}

interface PhysiqueAnalysis {
  overall_assessment: string;
  strengths: string[];
  improvement_areas: string[];
  muscle_development: {
    chest: string;
    back: string;
    shoulders: string;
    arms: string;
    core: string;
    legs: string;
  };
  v_taper_score: number;
  body_fat_visual: string;
  priority_training: string[];
  physique_progress: number;
}

interface SaveFeedback {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

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

  // Body photo state
  const frontPhotoRef = useRef<HTMLInputElement>(null);
  const sidePhotoRef = useRef<HTMLInputElement>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [sidePreview, setSidePreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<PhotoLabel | null>(null);
  const [pastPhotos, setPastPhotos] = useState<StoredPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  // Physique analysis state
  const [physiqueAnalysis, setPhysiqueAnalysis] = useState<PhysiqueAnalysis | null>(null);
  const [analyzingPhysique, setAnalyzingPhysique] = useState(false);

  // Save feedback state
  const [saveSuccess, setSaveSuccess] = useState<SaveFeedback | null>(null);

  // Body progress state
  const [bodyProgress, setBodyProgress] = useState<{ start: BodyMeasurement; latest: BodyMeasurement } | null>(null);

  // Load past body photos
  const loadPastPhotos = useCallback(async () => {
    setLoadingPhotos(true);
    const { data: files } = await supabase.storage
      .from(BUCKET_NAME)
      .list(PHOTO_PREFIX, { sortBy: { column: "name", order: "desc" } });

    if (files) {
      const photos: StoredPhoto[] = files
        .filter((f) => f.name.endsWith(".jpg"))
        .map((f) => {
          // filename format: {date}_front.jpg or {date}_side.jpg
          const nameParts = f.name.replace(".jpg", "").split("_");
          const label = nameParts.pop() as PhotoLabel;
          const date = nameParts.join("_"); // handles YYYY-MM-DD format
          const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(`${PHOTO_PREFIX}/${f.name}`);
          return { date, label, url: publicUrl };
        })
        .filter((p) => p.label === "front" || p.label === "side");
      setPastPhotos(photos);

      // Set today's previews if they exist
      const today = getToday();
      const todayFront = photos.find((p) => p.date === today && p.label === "front");
      const todaySide = photos.find((p) => p.date === today && p.label === "side");
      if (todayFront) setFrontPreview(todayFront.url);
      if (todaySide) setSidePreview(todaySide.url);
    }
    setLoadingPhotos(false);
  }, []);

  useEffect(() => {
    loadPastPhotos();
  }, [loadPastPhotos]);

  // Load first and latest body measurements for progress display
  useEffect(() => {
    async function loadBodyProgress() {
      const [firstRes, latestRes] = await Promise.all([
        supabase
          .from("body_measurements")
          .select("*")
          .order("date", { ascending: true })
          .limit(1)
          .single(),
        supabase
          .from("body_measurements")
          .select("*")
          .order("date", { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (firstRes.data && latestRes.data && firstRes.data.date !== latestRes.data.date) {
        setBodyProgress({ start: firstRes.data, latest: latestRes.data });
      }
    }
    loadBodyProgress();
  }, []);

  async function handlePhotoUpload(file: File, label: PhotoLabel) {
    setUploadingPhoto(label);
    try {
      const { default: imageCompression } = await import("browser-image-compression");
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1200,
        initialQuality: 0.8,
        useWebWorker: true,
      });

      const today = getToday();
      const path = `${PHOTO_PREFIX}/${today}_${label}.jpg`;

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, compressed, { contentType: "image/jpeg", upsert: true });

      if (error) {
        console.error("Photo upload error:", error);
        return;
      }

      // Generate preview and trigger physique analysis
      const reader = new FileReader();
      const dataUrlPromise = new Promise<string>((resolve) => {
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (label === "front") setFrontPreview(dataUrl);
          else setSidePreview(dataUrl);
          resolve(dataUrl);
        };
      });
      reader.readAsDataURL(compressed);
      const dataUrl = await dataUrlPromise;

      // Reload past photos to include the new one
      await loadPastPhotos();

      // Trigger physique analysis with the uploaded photo
      analyzePhysique(dataUrl, compressed.type || "image/jpeg");
    } catch (error) {
      console.error("Photo compression/upload error:", error);
    } finally {
      setUploadingPhoto(null);
    }
  }

  async function analyzePhysique(dataUrl: string, mimeType: string) {
    setAnalyzingPhysique(true);
    try {
      const imageBase64 = dataUrl.split(",")[1];
      const response = await fetch("/api/analyze-physique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      if (!response.ok) throw new Error("Physique analysis failed");

      const data: PhysiqueAnalysis = await response.json();
      setPhysiqueAnalysis(data);
    } catch (error) {
      console.error("Physique analysis error:", error);
    } finally {
      setAnalyzingPhysique(false);
    }
  }

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

    const today = getToday();
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

      // Show save feedback before navigating
      setSaving(false);
      setSaveSuccess({
        calories: targets.targetCalories,
        protein: targets.targetProtein,
        fat: targets.targetFat,
        carbs: targets.targetCarbs,
      });
      setTimeout(() => router.push("/"), 2000);
      return;
    }

    router.push("/");
  }

  return (
    <div className="py-6 md:py-10 space-y-5 md:space-y-8">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">📊 体組成</h1>

      {/* Save success feedback */}
      {saveSuccess && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-4 space-y-1 animate-in fade-in">
          <p className="text-sm font-medium text-green-400">✅ 体組成データを保存しました</p>
          <p className="text-xs text-muted">
            PFC目標が再計算されました: {saveSuccess.calories}kcal / P {saveSuccess.protein}g / F {saveSuccess.fat}g / C {saveSuccess.carbs}g
          </p>
        </div>
      )}

      {/* Body progress summary */}
      {bodyProgress && (
        <div className="bg-card rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium">📊 体組成の推移</p>
          <div className="space-y-1 text-xs">
            <ProgressRow
              label="体重"
              start={bodyProgress.start.weight}
              latest={bodyProgress.latest.weight}
              unit="kg"
            />
            {bodyProgress.start.lean_mass != null && bodyProgress.latest.lean_mass != null && (
              <ProgressRow
                label="除脂肪"
                start={bodyProgress.start.lean_mass}
                latest={bodyProgress.latest.lean_mass}
                unit="kg"
                positive
              />
            )}
            {bodyProgress.start.body_fat_pct != null && bodyProgress.latest.body_fat_pct != null && (
              <ProgressRow
                label="体脂肪"
                start={bodyProgress.start.body_fat_pct}
                latest={bodyProgress.latest.body_fat_pct}
                unit="%"
                lowerIsBetter
              />
            )}
          </div>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("screenshot")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            mode === "screenshot"
              ? "bg-accent text-white"
              : "bg-card text-muted"
          }`}
        >
          Fitdaysスクショ
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            mode === "manual"
              ? "bg-accent text-white"
              : "bg-card text-muted"
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
              className="w-full h-40 bg-card border-2 border-dashed border-card-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted"
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
                className="w-full h-40 object-contain bg-card rounded-xl"
              />
              {analyzing && (
                <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
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

      {/* Body photo section */}
      <BodyPhotoSection
        frontPreview={frontPreview}
        sidePreview={sidePreview}
        uploadingPhoto={uploadingPhoto}
        frontPhotoRef={frontPhotoRef}
        sidePhotoRef={sidePhotoRef}
        onPhotoUpload={handlePhotoUpload}
        pastPhotos={pastPhotos}
        loadingPhotos={loadingPhotos}
        physiqueAnalysis={physiqueAnalysis}
        analyzingPhysique={analyzingPhysique}
      />
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
    <div className="flex items-center justify-between bg-card rounded-lg px-3 py-2">
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

// ─── Body Photo Section ─────────────────────────────────────────

interface BodyPhotoSectionProps {
  frontPreview: string | null;
  sidePreview: string | null;
  uploadingPhoto: PhotoLabel | null;
  frontPhotoRef: React.RefObject<HTMLInputElement | null>;
  sidePhotoRef: React.RefObject<HTMLInputElement | null>;
  onPhotoUpload: (file: File, label: PhotoLabel) => void;
  pastPhotos: StoredPhoto[];
  loadingPhotos: boolean;
  physiqueAnalysis: PhysiqueAnalysis | null;
  analyzingPhysique: boolean;
}

function BodyPhotoSection({
  frontPreview,
  sidePreview,
  uploadingPhoto,
  frontPhotoRef,
  sidePhotoRef,
  onPhotoUpload,
  pastPhotos,
  loadingPhotos,
  physiqueAnalysis,
  analyzingPhysique,
}: BodyPhotoSectionProps) {
  // Group past photos by month
  const photosByMonth = pastPhotos.reduce<Record<string, StoredPhoto[]>>((acc, photo) => {
    const month = photo.date.slice(0, 7); // YYYY-MM
    if (!acc[month]) acc[month] = [];
    acc[month].push(photo);
    return acc;
  }, {});

  const sortedMonths = Object.keys(photosByMonth).sort().reverse();

  // Before/After comparison: find oldest and newest front photos
  const frontPhotos = pastPhotos
    .filter((p) => p.label === "front")
    .sort((a, b) => a.date.localeCompare(b.date));
  const oldestFront = frontPhotos[0] ?? null;
  const newestFront = frontPhotos.length > 1 ? frontPhotos[frontPhotos.length - 1] : null;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold tracking-tight">📷 体型写真</h2>

      {/* Upload buttons */}
      <div className="grid grid-cols-2 gap-3">
        {/* Front photo */}
        <div>
          <input
            ref={frontPhotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPhotoUpload(file, "front");
            }}
            className="hidden"
          />
          {frontPreview ? (
            <button
              onClick={() => frontPhotoRef.current?.click()}
              className="w-full relative rounded-xl overflow-hidden"
            >
              <img src={frontPreview} alt="前面" className="w-full h-40 object-cover" />
              {uploadingPhoto === "front" && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                前面
              </span>
            </button>
          ) : (
            <button
              onClick={() => frontPhotoRef.current?.click()}
              disabled={uploadingPhoto === "front"}
              className="w-full h-40 bg-card border-2 border-dashed border-card-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted disabled:opacity-50"
            >
              {uploadingPhoto === "front" ? (
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span className="text-xs">前面を撮影</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Side photo */}
        <div>
          <input
            ref={sidePhotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPhotoUpload(file, "side");
            }}
            className="hidden"
          />
          {sidePreview ? (
            <button
              onClick={() => sidePhotoRef.current?.click()}
              className="w-full relative rounded-xl overflow-hidden"
            >
              <img src={sidePreview} alt="側面" className="w-full h-40 object-cover" />
              {uploadingPhoto === "side" && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                側面
              </span>
            </button>
          ) : (
            <button
              onClick={() => sidePhotoRef.current?.click()}
              disabled={uploadingPhoto === "side"}
              className="w-full h-40 bg-card border-2 border-dashed border-card-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted disabled:opacity-50"
            >
              {uploadingPhoto === "side" ? (
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span className="text-xs">側面を撮影</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Physique analysis */}
      {analyzingPhysique && (
        <div className="bg-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted">体型を分析中...</span>
        </div>
      )}

      {physiqueAnalysis && !analyzingPhysique && (
        <PhysiqueAnalysisCard analysis={physiqueAnalysis} />
      )}

      {/* Before/After comparison */}
      {oldestFront && newestFront && oldestFront.date !== newestFront.date && (
        <div className="bg-card rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium">Before / After</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <img src={oldestFront.url} alt="Before" className="w-full h-48 object-cover rounded-xl" />
              <p className="text-[10px] text-muted text-center">{oldestFront.date}</p>
            </div>
            <div className="space-y-1">
              <img src={newestFront.url} alt="After" className="w-full h-48 object-cover rounded-xl" />
              <p className="text-[10px] text-muted text-center">{newestFront.date}</p>
            </div>
          </div>
        </div>
      )}

      {/* Past photos by month */}
      {loadingPhotos ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedMonths.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm font-medium">過去の体型写真</p>
          {sortedMonths.map((month) => {
            const monthPhotos = photosByMonth[month];
            // Group by date within month
            const dateMap = monthPhotos.reduce<Record<string, StoredPhoto[]>>((acc, p) => {
              if (!acc[p.date]) acc[p.date] = [];
              acc[p.date].push(p);
              return acc;
            }, {});
            const sortedDates = Object.keys(dateMap).sort().reverse();

            return (
              <div key={month} className="space-y-2">
                <p className="text-xs text-muted">
                  {new Date(month + "-01").toLocaleDateString("ja-JP", { year: "numeric", month: "long" })}
                </p>
                <div className="space-y-2">
                  {sortedDates.map((date) => (
                    <div key={date} className="bg-card rounded-xl p-3">
                      <p className="text-[10px] text-muted mb-2">
                        {new Date(date + "T00:00:00").toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })}
                      </p>
                      <div className="flex gap-2">
                        {dateMap[date]
                          .sort((a, b) => a.label.localeCompare(b.label))
                          .map((photo) => (
                            <div key={`${photo.date}-${photo.label}`} className="flex-1 relative">
                              <img
                                src={photo.url}
                                alt={PHOTO_LABELS[photo.label]}
                                className="w-full h-28 object-cover rounded-lg"
                              />
                              <span className="absolute bottom-1 left-1 text-[9px] bg-black/60 text-white px-1 py-0.5 rounded">
                                {PHOTO_LABELS[photo.label]}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─── Physique Analysis Card ─────────────────────────────────────

function PhysiqueAnalysisCard({ analysis }: { analysis: PhysiqueAnalysis }) {
  return (
    <div className="bg-card rounded-xl p-4 space-y-4">
      <p className="text-sm font-medium">📋 体型分析</p>

      {/* Overall assessment */}
      <p className="text-xs text-muted leading-relaxed">{analysis.overall_assessment}</p>

      {/* Strengths */}
      <div className="space-y-1">
        <p className="text-xs font-medium">💪 強み</p>
        <ul className="space-y-0.5">
          {analysis.strengths.map((s, i) => (
            <li key={i} className="text-xs text-muted pl-2">• {s}</li>
          ))}
        </ul>
      </div>

      {/* Improvement areas */}
      <div className="space-y-1">
        <p className="text-xs font-medium">📈 改善ポイント</p>
        <ul className="space-y-0.5">
          {analysis.improvement_areas.map((s, i) => (
            <li key={i} className="text-xs text-muted pl-2">• {s}</li>
          ))}
        </ul>
      </div>

      {/* Priority training */}
      <div className="space-y-1">
        <p className="text-xs font-medium">🎯 優先トレーニング</p>
        <ol className="space-y-0.5">
          {analysis.priority_training.map((s, i) => (
            <li key={i} className="text-xs text-muted pl-2">{i + 1}. {s}</li>
          ))}
        </ol>
      </div>

      {/* Scores */}
      <div className="flex items-center gap-4 pt-1">
        <div className="text-xs">
          <span className="text-muted">V字スコア: </span>
          <span className="font-medium">{analysis.v_taper_score}/10</span>
        </div>
        <div className="text-xs">
          <span className="text-muted">体脂肪(推定): </span>
          <span className="font-medium">{analysis.body_fat_visual}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">フィジーク進捗</span>
          <span className="font-medium">{analysis.physique_progress}%</span>
        </div>
        <div className="w-full h-2 bg-black/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all"
            style={{ width: `${Math.min(100, analysis.physique_progress)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Progress Row ───────────────────────────────────────────────

function ProgressRow({
  label,
  start,
  latest,
  unit,
  positive,
  lowerIsBetter,
}: {
  label: string;
  start: number;
  latest: number;
  unit: string;
  positive?: boolean;
  lowerIsBetter?: boolean;
}) {
  const diff = latest - start;
  const sign = diff >= 0 ? "+" : "";
  const isGood = lowerIsBetter ? diff <= 0 : diff >= 0;
  const statusText = lowerIsBetter
    ? (Math.abs(diff) < 0.3 ? "維持 ✅" : isGood ? "減少 ✅" : "増加")
    : positive
      ? (diff > 0 ? "← 筋肉で増えてる！" : "")
      : "";

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted w-12">{label}:</span>
      <span>
        {start.toFixed(1)}{unit} → {latest.toFixed(1)}{unit}
        <span className={`ml-1 ${isGood ? "text-green-400" : "text-red-400"}`}>
          ({sign}{diff.toFixed(1)}{unit})
        </span>
        {statusText && <span className="ml-1 text-green-400">{statusText}</span>}
      </span>
    </div>
  );
}
