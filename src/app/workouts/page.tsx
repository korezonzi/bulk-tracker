"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  estimateWorkoutCalories,
  estimateDurationFromSets,
  detectMuscleGroups,
  compareOverload,
} from "@/lib/calc";
import type { WorkoutPreset, WorkoutLog, WorkoutSet, WorkoutCategory } from "@/lib/types";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_EMOJI } from "@/lib/types";
import Link from "next/link";

const CATEGORY_LABELS: Record<string, string> = {
  youtube: "YouTube",
  chocozap: "chocoZAP",
  home: "自宅",
};

const CATEGORY_COLORS: Record<string, string> = {
  youtube: "bg-red-500/20 text-red-400",
  chocozap: "bg-purple-500/20 text-purple-400",
  home: "bg-green-500/20 text-green-400",
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const DEFAULT_REPS = 10;
const DEFAULT_WEIGHT_KG = 20;

function formatDateStr(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const todayStr = formatDateStr(new Date());
  if (dateStr === todayStr) return `今日 (${m}/${d})`;
  return `${m}/${d} (${WEEKDAY_LABELS[date.getDay()]})`;
}

export default function WorkoutsPage() {
  const todayStr = formatDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showCalendar, setShowCalendar] = useState(false);
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set());

  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [dayLogs, setDayLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // User weight for calorie estimation
  const [userWeight, setUserWeight] = useState<number>(70);

  // Set input UI state: keyed by preset_id
  const [openSetInputId, setOpenSetInputId] = useState<string | null>(null);
  const [setInputs, setSetInputs] = useState<Record<string, WorkoutSet[]>>({});

  // Cache of last sets per preset_id
  const [lastSetsCache, setLastSetsCache] = useState<Record<string, WorkoutSet[]>>({});

  // Overload comparison results per log_id
  const [overloadResults, setOverloadResults] = useState<
    Record<string, { status: "up" | "same" | "down"; detail: string }>
  >({});

  useEffect(() => {
    load(selectedDate);
  }, [selectedDate]);

  async function load(date: string) {
    setLoading(true);
    const [presetsRes, logsRes, datesRes, profileRes] = await Promise.all([
      supabase.from("workout_presets").select("*").order("sort_order", { ascending: true }),
      supabase.from("workout_logs").select("*").eq("date", date),
      supabase.from("workout_logs").select("date").order("date", { ascending: false }).limit(200),
      supabase.from("user_profile").select("weight").limit(1).single(),
    ]);

    setPresets(presetsRes.data ?? []);
    setDayLogs(logsRes.data ?? []);
    if (datesRes.data) {
      setWorkoutDates(new Set(datesRes.data.map((w: { date: string }) => w.date)));
    }
    if (profileRes.data?.weight) {
      setUserWeight(profileRes.data.weight);
    }
    setLoading(false);
  }

  // Fetch last recorded sets for a given preset
  const fetchLastSets = useCallback(async (presetId: string): Promise<WorkoutSet[]> => {
    if (lastSetsCache[presetId]) return lastSetsCache[presetId];

    const { data } = await supabase
      .from("workout_logs")
      .select("sets")
      .eq("preset_id", presetId)
      .not("sets", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const sets = (data?.sets as WorkoutSet[] | null) ?? [];
    if (sets.length > 0) {
      setLastSetsCache((prev) => ({ ...prev, [presetId]: sets }));
    }
    return sets;
  }, [lastSetsCache]);

  // Toggle set input UI for chocoZAP / home presets
  async function toggleSetInput(preset: WorkoutPreset) {
    if (openSetInputId === preset.id) {
      setOpenSetInputId(null);
      return;
    }

    // Initialize with last recorded sets or defaults
    if (!setInputs[preset.id]) {
      const lastSets = await fetchLastSets(preset.id);
      const isHome = preset.category === "home";

      if (lastSets.length > 0) {
        const initialized = lastSets.map((s) => ({
          reps: s.reps,
          ...(isHome ? {} : { weight_kg: s.weight_kg ?? DEFAULT_WEIGHT_KG }),
        }));
        setSetInputs((prev) => ({ ...prev, [preset.id]: initialized }));
      } else {
        const defaultSet: WorkoutSet = isHome
          ? { reps: DEFAULT_REPS }
          : { weight_kg: DEFAULT_WEIGHT_KG, reps: DEFAULT_REPS };
        setSetInputs((prev) => ({ ...prev, [preset.id]: [defaultSet] }));
      }
    }

    setOpenSetInputId(preset.id);
  }

  // Add a new set row
  function addSetRow(presetId: string, isHome: boolean) {
    setSetInputs((prev) => {
      const current = prev[presetId] ?? [];
      const lastSet = current[current.length - 1];
      const newSet: WorkoutSet = isHome
        ? { reps: lastSet?.reps ?? DEFAULT_REPS }
        : { weight_kg: lastSet?.weight_kg ?? DEFAULT_WEIGHT_KG, reps: lastSet?.reps ?? DEFAULT_REPS };
      return { ...prev, [presetId]: [...current, newSet] };
    });
  }

  // Update a set field
  function updateSetField(presetId: string, index: number, field: "weight_kg" | "reps", value: number) {
    setSetInputs((prev) => {
      const current = [...(prev[presetId] ?? [])];
      current[index] = { ...current[index], [field]: value };
      return { ...prev, [presetId]: current };
    });
  }

  // Remove a set row
  function removeSetRow(presetId: string, index: number) {
    setSetInputs((prev) => {
      const current = [...(prev[presetId] ?? [])];
      if (current.length <= 1) return prev;
      current.splice(index, 1);
      return { ...prev, [presetId]: current };
    });
  }

  // YouTube preset: one-tap log with calorie estimation
  async function handleLog(preset: WorkoutPreset) {
    setLogging(preset.id);

    const durationMin = preset.duration_min ?? 30;
    const calories = estimateWorkoutCalories(preset.category, durationMin, userWeight);

    const { data, error } = await supabase
      .from("workout_logs")
      .insert({
        date: selectedDate,
        preset_id: preset.id,
        estimated_calories: calories,
        duration_min: durationMin,
      })
      .select()
      .single();

    if (!error && data) {
      setDayLogs((prev) => [...prev, data]);
      setWorkoutDates((prev) => new Set([...prev, selectedDate]));
    }
    setLogging(null);
  }

  // chocoZAP / home preset: log with sets
  async function handleLogWithSets(preset: WorkoutPreset) {
    const sets = setInputs[preset.id];
    if (!sets || sets.length === 0) return;

    setLogging(preset.id);

    const durationMin = estimateDurationFromSets(sets);
    const calories = estimateWorkoutCalories(preset.category, durationMin, userWeight);

    const { data, error } = await supabase
      .from("workout_logs")
      .insert({
        date: selectedDate,
        preset_id: preset.id,
        sets,
        estimated_calories: calories,
        duration_min: durationMin,
      })
      .select()
      .single();

    if (!error && data) {
      setDayLogs((prev) => [...prev, data]);
      setWorkoutDates((prev) => new Set([...prev, selectedDate]));

      // Compare with previous sets for progressive overload display
      const previousSets = lastSetsCache[preset.id] ?? [];
      if (previousSets.length > 0) {
        const result = compareOverload(sets, previousSets);
        setOverloadResults((prev) => ({ ...prev, [data.id]: result }));
      }

      // Update last sets cache
      setLastSetsCache((prev) => ({ ...prev, [preset.id]: sets }));
    }

    setOpenSetInputId(null);
    setLogging(null);
  }

  async function handleRemoveLog(logId: string) {
    await supabase.from("workout_logs").delete().eq("id", logId);
    setDayLogs((prev) => prev.filter((l) => l.id !== logId));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const loggedPresetIds = new Set(dayLogs.map((l) => l.preset_id));
  const isToday = selectedDate === todayStr;

  // Total calories burned today
  const totalCalories = dayLogs.reduce((sum, l) => sum + (l.estimated_calories ?? 0), 0);

  return (
    <div className="py-6 md:py-10 space-y-5 md:space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">💪 筋トレ</h1>
          <button
            onClick={() => setShowCalendar((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-accent mt-1"
          >
            📅 <span>{formatDisplayDate(selectedDate)}</span>
            <span className={`text-xs transition-transform ${showCalendar ? "rotate-180" : ""}`}>▾</span>
          </button>
        </div>
        <Link
          href="/workouts/presets"
          className="px-4 py-2 text-xs card-gradient card-interactive rounded-xl text-muted"
        >
          メニュー編集
        </Link>
      </div>

      {/* Calendar */}
      {showCalendar && (
        <div className="card-gradient rounded-2xl p-4">
          <CalendarPicker
            selectedDate={selectedDate}
            onSelectDate={(d) => { setSelectedDate(d); setShowCalendar(false); }}
            markedDates={workoutDates}
          />
        </div>
      )}

      {/* Day log count + calories */}
      <div className="card-gradient rounded-2xl p-4 md:p-5 text-center">
        <p className="text-xs text-muted mb-1">{isToday ? "今日" : formatDisplayDate(selectedDate)}</p>
        <p className="text-3xl md:text-4xl font-bold font-num">
          {dayLogs.length} <span className="text-base font-normal text-muted">回</span>
        </p>
        {totalCalories > 0 && (
          <p className="text-sm text-orange-400 mt-1">~{totalCalories}kcal消費</p>
        )}
      </div>

      {/* Presets - grouped by category */}
      {presets.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p className="text-4xl mb-3">💪</p>
          <p className="font-medium">メニューがまだないよ</p>
          <Link href="/workouts/presets" className="text-accent text-sm mt-2 block">
            最初のメニューを追加しよう
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {(
            [
              { key: "youtube" as WorkoutCategory, label: "YouTube", emoji: "🎬" },
              { key: "chocozap" as WorkoutCategory, label: "chocoZAP", emoji: "🏋️" },
              { key: "home" as WorkoutCategory, label: "自宅", emoji: "🏠" },
            ] as const
          ).map((cat) => {
            const catPresets = presets.filter((p) => p.category === cat.key);
            if (catPresets.length === 0) return null;
            return (
              <div key={cat.key}>
                <p className="text-sm font-medium text-muted mb-2">
                  {cat.emoji} {cat.label}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {catPresets.map((preset) => {
                    const isLogged = loggedPresetIds.has(preset.id);
                    const thisLogs = dayLogs.filter((l) => l.preset_id === preset.id);
                    const isSetBased = preset.category === "chocozap" || preset.category === "home";
                    const isHome = preset.category === "home";
                    const isSetInputOpen = openSetInputId === preset.id;

                    return (
                      <div
                        key={preset.id}
                        className="card-gradient rounded-2xl overflow-hidden"
                      >
                        <div className="flex items-center gap-3 p-4">
                          {/* Thumbnail for YouTube */}
                          {preset.thumbnail_url && (
                            <button
                              onClick={() => setExpandedId(expandedId === preset.id ? null : preset.id)}
                              className="shrink-0"
                            >
                              <img
                                src={preset.thumbnail_url}
                                alt=""
                                className="w-16 h-10 object-cover rounded-lg"
                              />
                            </button>
                          )}

                          <button
                            onClick={() => setExpandedId(expandedId === preset.id ? null : preset.id)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className="text-sm font-medium truncate">{preset.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-md ${CATEGORY_COLORS[preset.category]}`}
                              >
                                {CATEGORY_LABELS[preset.category]}
                              </span>
                              {preset.duration_min && (
                                <span className="text-[10px] text-muted">
                                  {preset.duration_min}分
                                </span>
                              )}
                              {preset.exercises && preset.exercises.length > 0 && (
                                <span className="text-[10px] text-muted">
                                  {preset.exercises.length}種目
                                </span>
                              )}
                              {/* Muscle group badges */}
                              {detectMuscleGroups(preset.exercises ?? null, preset.name).map((mg) => (
                                <span
                                  key={mg}
                                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent"
                                >
                                  {MUSCLE_GROUP_EMOJI[mg]}{MUSCLE_GROUP_LABELS[mg]}
                                </span>
                              ))}
                            </div>
                          </button>

                          {/* Check button */}
                          <button
                            onClick={() => {
                              if (isSetBased) {
                                toggleSetInput(preset);
                              } else {
                                handleLog(preset);
                              }
                            }}
                            disabled={logging === preset.id}
                            className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                              isLogged
                                ? "bg-green-500/15 text-green-400"
                                : isSetInputOpen
                                  ? "bg-yellow-500/15 text-yellow-400"
                                  : "bg-accent/15 text-accent hover:bg-accent/25"
                            }`}
                          >
                            {logging === preset.id ? (
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        </div>

                        {/* Set input UI for chocoZAP / home */}
                        {isSetInputOpen && isSetBased && (
                          <div className="border-t border-card-border px-4 py-3 space-y-2">
                            {(setInputs[preset.id] ?? []).map((set, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-xs text-muted w-12 shrink-0">セット{i + 1}</span>
                                {!isHome && (
                                  <>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      value={set.weight_kg ?? ""}
                                      onChange={(e) => updateSetField(preset.id, i, "weight_kg", Number(e.target.value))}
                                      className="w-16 px-2 py-1.5 text-sm bg-card-hover rounded-lg text-center border border-card-border focus:border-accent outline-none"
                                      placeholder="kg"
                                    />
                                    <span className="text-xs text-muted">kg</span>
                                    <span className="text-xs text-muted">×</span>
                                  </>
                                )}
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={set.reps || ""}
                                  onChange={(e) => updateSetField(preset.id, i, "reps", Number(e.target.value))}
                                  className="w-16 px-2 py-1.5 text-sm bg-card-hover rounded-lg text-center border border-card-border focus:border-accent outline-none"
                                  placeholder="回"
                                />
                                <span className="text-xs text-muted">回</span>
                                {(setInputs[preset.id] ?? []).length > 1 && (
                                  <button
                                    onClick={() => removeSetRow(preset.id, i)}
                                    className="text-xs text-red-400 hover:text-red-300 ml-auto"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => addSetRow(preset.id, isHome)}
                                className="text-xs text-accent hover:text-accent/80 transition-colors"
                              >
                                + セット追加
                              </button>
                            </div>
                            <button
                              onClick={() => handleLogWithSets(preset)}
                              disabled={logging === preset.id}
                              className="w-full py-2 text-sm font-medium bg-accent/20 text-accent hover:bg-accent/30 rounded-xl transition-colors mt-1"
                            >
                              {logging === preset.id ? "記録中..." : "記録する"}
                            </button>
                          </div>
                        )}

                        {/* Exercise details (expandable) */}
                        {expandedId === preset.id && preset.exercises && preset.exercises.length > 0 && (
                          <div className="border-t border-card-border px-4 py-3 space-y-1.5">
                            {preset.exercises.map((ex, i) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted w-4 text-right">{i + 1}</span>
                                  <span>{ex.name}</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted">
                                  <span>{ex.target}</span>
                                  <span className="text-[10px]">{ex.duration}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Show log entries for this preset */}
                        {thisLogs.length > 0 && (
                          <div className="border-t border-card-border px-4 py-2.5">
                            {thisLogs.map((log, logIdx) => (
                              <div key={log.id} className="flex items-center justify-between py-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted">
                                    {thisLogs.length > 1 ? `${logIdx + 1}回目` : "1回 実施"}
                                  </span>
                                  {log.estimated_calories > 0 && (
                                    <span className="text-[10px] text-orange-400">
                                      ~{log.estimated_calories}kcal
                                    </span>
                                  )}
                                  {log.sets && (log.sets as WorkoutSet[]).length > 0 && (
                                    <span className="text-[10px] text-muted">
                                      {(log.sets as WorkoutSet[]).length}セット
                                    </span>
                                  )}
                                  {/* Progressive overload indicator */}
                                  {overloadResults[log.id] && (
                                    <span
                                      className={`text-[10px] ${
                                        overloadResults[log.id].status === "up"
                                          ? "text-green-400"
                                          : overloadResults[log.id].status === "down"
                                            ? "text-yellow-400"
                                            : "text-muted"
                                      }`}
                                    >
                                      {overloadResults[log.id].status === "up" && "⬆️ "}
                                      {overloadResults[log.id].status === "same" && "→ "}
                                      {overloadResults[log.id].status === "down" && "⬇️ "}
                                      {overloadResults[log.id].detail}
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleRemoveLog(log.id)}
                                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                  取消
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Calendar Component ───────────────────────────────────────────
function CalendarPicker({
  selectedDate,
  onSelectDate,
  markedDates,
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  markedDates: Set<string>;
}) {
  const today = new Date();
  const todayStr = formatDateStr(today);
  const [y, m] = selectedDate.split("-").map(Number);
  const [viewYear, setViewYear] = useState(y);
  const [viewMonth, setViewMonth] = useState(m - 1);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function goToPrevMonth() {
    if (viewMonth === 0) { setViewYear((v) => v - 1); setViewMonth(11); }
    else { setViewMonth((v) => v - 1); }
  }
  function goToNextMonth() {
    if (viewMonth === 11) { setViewYear((v) => v + 1); setViewMonth(0); }
    else { setViewMonth((v) => v + 1); }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <button onClick={goToPrevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-foreground">‹</button>
        <span className="text-sm font-medium">{viewYear}年{viewMonth + 1}月</span>
        <button onClick={goToNextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-foreground">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((l) => (
          <div key={l} className="text-center text-[10px] text-muted py-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }, (_, i) => <div key={`b-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const isFuture = dateStr > todayStr;
          const hasWorkout = markedDates.has(dateStr);

          return (
            <button
              key={day}
              onClick={() => !isFuture && onSelectDate(dateStr)}
              disabled={isFuture}
              className={`relative w-full aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-colors ${
                isSelected ? "bg-accent text-white font-bold"
                  : isToday ? "bg-accent/20 text-accent font-medium"
                  : isFuture ? "text-muted/30 cursor-not-allowed"
                  : "text-foreground hover:bg-card-hover"
              }`}
            >
              {day}
              {hasWorkout && !isSelected && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
