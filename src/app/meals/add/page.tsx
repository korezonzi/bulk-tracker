"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getToday, parseDate } from "@/lib/date";
import type { MealType } from "@/lib/types";

const MEAL_TYPES: { value: MealType; label: string; emoji: string }[] = [
  { value: "breakfast", label: "朝食", emoji: "🌅" },
  { value: "lunch", label: "昼食", emoji: "☀️" },
  { value: "dinner", label: "夕食", emoji: "🌙" },
  { value: "snack", label: "間食", emoji: "🍪" },
  { value: "protein", label: "プロテイン", emoji: "🥤" },
];

const PROTEIN_OPTIONS = [
  { id: "plain", label: "プロテインのみ", calories: 113, protein: 21, fat: 2.2, carbs: 4 },
  { id: "creatine", label: "クレアチン入り", calories: 120, protein: 22.4, fat: 2.2, carbs: 4.2 },
] as const;

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

interface AnalysisResult {
  description: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  confidence: string;
}

export default function AddMealPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AddMealContent />
    </Suspense>
  );
}

// ─── Calendar Component ───────────────────────────────────────────
function CalendarPicker({
  selectedDate,
  onSelectDate,
  mealDates,
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  mealDates: Set<string>;
}) {
  const todayStr = getToday();
  const selected = parseDate(selectedDate);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function goToPrevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else { setViewMonth((m) => m - 1); }
  }
  function goToNextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else { setViewMonth((m) => m + 1); }
  }

  function handleDayClick(day: number) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (dateStr > todayStr) return;
    onSelectDate(dateStr);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <button onClick={goToPrevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-foreground">
          ‹
        </button>
        <span className="text-sm font-medium">{viewYear}年{viewMonth + 1}月</span>
        <button onClick={goToNextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-foreground">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[10px] text-muted py-1">{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((i) => <div key={`b-${i}`} />)}
        {days.map((day) => {
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const isFuture = dateStr > todayStr;
          const hasMeal = mealDates.has(dateStr);
          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              disabled={isFuture}
              className={`relative w-full aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-colors ${
                isSelected ? "bg-accent text-white font-bold"
                  : isToday ? "bg-accent/20 text-accent font-medium"
                  : isFuture ? "text-muted/30 cursor-not-allowed"
                  : "text-foreground hover:bg-card-hover"
              }`}
            >
              {day}
              {hasMeal && !isSelected && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Content ─────────────────────────────────────────────────
function AddMealContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const todayStr = getToday();
  const [selectedDate, setSelectedDate] = useState(searchParams.get("date") || todayStr);
  const [showCalendar, setShowCalendar] = useState(false);
  const [mealDates, setMealDates] = useState<Set<string>>(new Set());

  const [mealType, setMealType] = useState<MealType>("lunch");
  const [preview, setPreview] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [saving, setSaving] = useState(false);

  const [description, setDescription] = useState("");
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [fat, setFat] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [isAiEstimated, setIsAiEstimated] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  // Protein-specific state
  const [proteinOption, setProteinOption] = useState<"plain" | "creatine">("plain");
  const [proteinSaved, setProteinSaved] = useState(false);

  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string } | null>(null);

  useEffect(() => {
    async function loadMealDates() {
      const { data } = await supabase.from("meals").select("date").order("date", { ascending: false }).limit(200);
      if (data) setMealDates(new Set(data.map((m: { date: string }) => m.date)));
    }
    loadMealDates();
  }, []);

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
    setShowCalendar(false);
  }, []);

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    try {
      const { default: imageCompression } = await import("browser-image-compression");
      const compressed = await imageCompression(file, { maxWidthOrHeight: 800, initialQuality: 0.7, useWebWorker: true });
      const base64Reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        base64Reader.onload = () => resolve((base64Reader.result as string).split(",")[1]);
      });
      base64Reader.readAsDataURL(compressed);
      setPendingImage({ base64: await base64Promise, mimeType: compressed.type || "image/jpeg" });
    } catch (error) {
      console.error("Image compression error:", error);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const body = pendingImage
        ? { imageBase64: pendingImage.base64, mimeType: pendingImage.mimeType }
        : { text: textInput.trim() };
      const response = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Analysis failed");
      const data: AnalysisResult = await response.json();
      setResult(data);
      setDescription(data.description);
      setCalories(data.calories);
      setProtein(data.protein);
      setFat(data.fat);
      setCarbs(data.carbs);
      setIsAiEstimated(true);
    } catch (error) {
      console.error("Analysis error:", error);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from("meals").insert({
      date: selectedDate,
      meal_type: mealType,
      description,
      calories,
      protein,
      fat,
      carbs,
      is_ai_estimated: isAiEstimated,
    });
    if (error) { console.error("Save error:", error); setSaving(false); return; }
    router.push("/meals");
  }

  async function handleProteinSave() {
    setSaving(true);
    const opt = PROTEIN_OPTIONS.find((o) => o.id === proteinOption)!;
    const { error } = await supabase.from("meals").insert({
      date: selectedDate,
      meal_type: "protein" as MealType,
      description: opt.label,
      calories: opt.calories,
      protein: opt.protein,
      fat: opt.fat,
      carbs: opt.carbs,
      is_ai_estimated: false,
    });
    setSaving(false);
    if (!error) {
      setProteinSaved(true);
      setTimeout(() => { setProteinSaved(false); router.push("/meals"); }, 1200);
    }
  }

  const isProteinMode = mealType === "protein";
  const canAnalyze = !analyzing && (!!pendingImage || !!textInput.trim());
  const canSave = !saving && (!!description || calories > 0);

  return (
    <div className="py-6 md:py-10 space-y-5">
      {/* Header with date picker */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">🍽️ 食事を追加</h1>
          <button
            onClick={() => setShowCalendar((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-accent"
          >
            📅 <span>{formatDisplayDate(selectedDate)}</span>
            <span className={`text-xs transition-transform ${showCalendar ? "rotate-180" : ""}`}>▾</span>
          </button>
        </div>
        <button onClick={() => router.back()} className="text-muted text-sm">キャンセル</button>
      </div>

      {/* Calendar */}
      {showCalendar && (
        <div className="bg-card rounded-xl p-4">
          <CalendarPicker selectedDate={selectedDate} onSelectDate={handleDateSelect} mealDates={mealDates} />
        </div>
      )}

      {/* Meal type selector (including protein) */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {MEAL_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => { setMealType(type.value); setResult(null); setProteinSaved(false); }}
            className={`shrink-0 flex-1 min-w-0 py-2 px-1 rounded-xl text-xs font-medium transition-all ${
              mealType === type.value
                ? "bg-accent/15 text-accent border border-accent/30"
                : "bg-card border border-card-border text-muted"
            }`}
          >
            <span className="block text-base mb-0.5">{type.emoji}</span>
            {type.label}
          </button>
        ))}
      </div>

      {/* ─── Protein mode ─────────────────────────────────────── */}
      {isProteinMode && (
        <div className="space-y-4">
          <div className="flex gap-3">
            {PROTEIN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setProteinOption(opt.id as "plain" | "creatine")}
                className={`flex-1 rounded-xl p-4 text-left transition-all ${
                  proteinOption === opt.id
                    ? "bg-accent/15 border border-accent/30"
                    : "bg-card"
                }`}
              >
                <p className="font-medium text-sm mb-2">{opt.id === "plain" ? "🥤" : "💪"} {opt.label}</p>
                <div className="flex gap-2 text-[10px] text-muted">
                  <span>{opt.calories}kcal</span>
                  <span className="text-protein">P{opt.protein}g</span>
                  <span className="text-fat">F{opt.fat}g</span>
                  <span className="text-carbs">C{opt.carbs}g</span>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={handleProteinSave}
            disabled={saving || proteinSaved}
            className={`w-full py-4 rounded-xl text-base font-bold transition-all active:scale-[0.98] ${
              proteinSaved
                ? "bg-green-500/15 text-green-400 border border-green-500/30"
                : "bg-accent text-white hover:bg-accent/90"
            }`}
          >
            {proteinSaved ? "✅ 記録しました！" : saving ? "保存中..." : "🥤 記録する"}
          </button>
        </div>
      )}

      {/* ─── Normal meal mode ─────────────────────────────────── */}
      {!isProteinMode && (
        <div className="space-y-4">
          {/* Photo capture */}
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
          {!preview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-36 bg-card border-2 border-dashed border-card-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted hover:border-accent/40 transition-colors"
            >
              <span className="text-3xl">📷</span>
              <span className="text-sm">タップして写真を撮影</span>
            </button>
          ) : (
            <div className="relative">
              <img src={preview} alt="" className="w-full h-36 object-cover rounded-xl" />
              <button
                onClick={() => { setPreview(null); setPendingImage(null); setResult(null); }}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white text-xs"
              >×</button>
            </div>
          )}

          {/* Text input */}
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="📝 メニューを入力（例: 牛丼大盛り、味噌汁）"
            rows={2}
            className="w-full px-4 py-3 bg-card rounded-xl text-sm resize-none placeholder:text-muted/50"
          />

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className="w-full py-3 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-all hover:bg-accent/90 active:scale-[0.98]"
          >
            {analyzing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                解析中...
              </span>
            ) : "🤖 AIで栄養価を推定"}
          </button>

          {/* Skeleton loading */}
          {analyzing && (
            <div className="bg-card rounded-xl p-5 space-y-3">
              <div className="h-4 bg-card-border/50 rounded-lg animate-pulse w-2/3" />
              <div className="grid grid-cols-4 gap-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 bg-card-border/50 rounded-xl animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* Result card */}
          {result && !analyzing && (
            <div className="bg-card rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  result.confidence === "high" ? "bg-green-500/20 text-green-400"
                    : result.confidence === "medium" ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                }`}>
                  AI信頼度: {result.confidence === "high" ? "高" : result.confidence === "medium" ? "中" : "低"}
                </span>
                <span className="text-[10px] text-muted">タップで値を修正</span>
              </div>
              <p className="text-sm font-medium">{description}</p>
              <div className="grid grid-cols-4 gap-2">
                <NutrientCard label="カロリー" value={calories} unit="kcal" color="text-foreground"
                  editing={editingField === "cal"} onTap={() => setEditingField(editingField === "cal" ? null : "cal")} onChange={setCalories} />
                <NutrientCard label="P" value={protein} unit="g" color="text-protein"
                  editing={editingField === "p"} onTap={() => setEditingField(editingField === "p" ? null : "p")} onChange={setProtein} />
                <NutrientCard label="F" value={fat} unit="g" color="text-fat"
                  editing={editingField === "f"} onTap={() => setEditingField(editingField === "f" ? null : "f")} onChange={setFat} />
                <NutrientCard label="C" value={carbs} unit="g" color="text-carbs"
                  editing={editingField === "c"} onTap={() => setEditingField(editingField === "c" ? null : "c")} onChange={setCarbs} />
              </div>
            </div>
          )}

          {/* Save */}
          {result && !analyzing && (
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="w-full py-4 bg-accent text-white rounded-xl text-base font-bold disabled:opacity-40 transition-all hover:bg-accent/90 active:scale-[0.98]"
            >
              {saving ? "保存中..." : "💾 保存する"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NutrientCard({ label, value, unit, color, editing, onTap, onChange }: {
  label: string; value: number; unit: string; color: string; editing: boolean; onTap: () => void; onChange: (v: number) => void;
}) {
  return (
    <div onClick={onTap} className={`rounded-xl p-2.5 text-center cursor-pointer transition-all ${
      editing ? "bg-accent/10 border border-accent/30" : "bg-card border border-transparent hover:border-card-border"
    }`}>
      <p className="text-[10px] text-muted mb-0.5">{label}</p>
      {editing ? (
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} onClick={(e) => e.stopPropagation()} autoFocus
          className={`w-full text-center text-lg font-bold bg-transparent ${color} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none outline-none`} />
      ) : (
        <p className={`text-lg font-bold ${color}`}>{value}</p>
      )}
      <p className="text-[10px] text-muted">{unit}</p>
    </div>
  );
}

function formatDisplayDate(dateStr: string): string {
  const date = parseDate(dateStr);
  const todayStr = getToday();
  if (dateStr === todayStr) return `今日 (${date.getMonth() + 1}/${date.getDate()})`;
  return `${date.getMonth() + 1}/${date.getDate()} (${WEEKDAY_LABELS[date.getDay()]})`;
}
