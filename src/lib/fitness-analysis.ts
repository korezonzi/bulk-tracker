import { calculateWeeklyVolume } from "@/lib/calc";
import {
  WEEKLY_VOLUME_TARGET,
  type BodyMeasurement,
  type DailySummary,
  type UserProfile,
  type WorkoutLog,
} from "@/lib/types";

// Reliability filtering for fitness analysis.
// daily_summary rows only exist for days with records, and even recorded days
// may be incomplete (e.g. only breakfast logged). We derive a robust threshold
// from the user's own median intake instead of assuming 3 meals/day.

// Below this many recorded days the median is meaningless — use all recorded days
const MIN_DAYS_FOR_FILTERING = 4;
// A day counts as reliably tracked if intake >= this ratio of the median
const RELIABLE_RATIO = 0.6;

export interface ReliabilityResult {
  reliableDays: DailySummary[];
  excludedDays: DailySummary[];
  noRecordDayCount: number;
  medianCalories: number | null;
  thresholdCalories: number | null;
  criterion: string; // human-readable, shown in UI and passed to AI
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function filterReliableDays(
  summaries: DailySummary[],
  periodDays: number
): ReliabilityResult {
  const recorded = summaries.filter(
    (d) => d.meal_count > 0 && d.total_calories > 0
  );
  const noRecordDayCount = periodDays - recorded.length;

  if (recorded.length === 0) {
    return {
      reliableDays: [],
      excludedDays: [],
      noRecordDayCount,
      medianCalories: null,
      thresholdCalories: null,
      criterion: "食事記録のある日がありません",
    };
  }

  if (recorded.length < MIN_DAYS_FOR_FILTERING) {
    return {
      reliableDays: recorded,
      excludedDays: [],
      noRecordDayCount,
      medianCalories: null,
      thresholdCalories: null,
      criterion: `記録日が${recorded.length}日と少ないため、全記録日を分析対象にしています`,
    };
  }

  const med = median(recorded.map((d) => d.total_calories));
  const threshold = Math.round(med * RELIABLE_RATIO);
  const reliableDays = recorded.filter((d) => d.total_calories >= threshold);
  const excludedDays = recorded.filter((d) => d.total_calories < threshold);

  return {
    reliableDays,
    excludedDays,
    noRecordDayCount,
    medianCalories: Math.round(med),
    thresholdCalories: threshold,
    criterion: `記録日の摂取カロリー中央値（${Math.round(med)}kcal）の${Math.round(RELIABLE_RATIO * 100)}%（${threshold}kcal）以上の日を「正しく記録された日」として採用`,
  };
}

export interface FitnessDiagnosisData {
  period: { start: string; end: string; days: number };
  dataQuality: {
    reliableDayCount: number;
    excludedDayCount: number;
    noRecordDayCount: number;
    criterion: string;
    excludedDates: string[];
  };
  profile: {
    weight: number;
    target_weight: number;
    target_calories: number;
    target_protein: number;
    target_fat: number;
    target_carbs: number;
  };
  // Averages computed over RELIABLE days only
  dailyAverage: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  targetAchievement: {
    calories_pct: number;
    protein_pct: number;
    fat_pct: number;
    carbs_pct: number;
  };
  weightChange: {
    start: number | null;
    end: number | null;
    diff: number | null;
    measurementCount: number;
  };
  training: {
    totalSessions: number;
    daysActive: number;
    avgWeeklySessions: number;
  };
  // Total sets per muscle group over the period + weekly average + weekly target
  muscleVolume: Record<
    string,
    { totalSets: number; weeklyAvg: number; weeklyTarget: { min: number; optimal: number; max: number } }
  >;
}

export function buildDiagnosisData(
  profile: UserProfile,
  summaries: DailySummary[],
  bodyData: BodyMeasurement[],
  workoutLogs: WorkoutLog[],
  startDate: string,
  endDate: string,
  periodDays: number
): { data: FitnessDiagnosisData; reliability: ReliabilityResult } {
  const reliability = filterReliableDays(summaries, periodDays);
  const { reliableDays } = reliability;
  const divisor = Math.max(reliableDays.length, 1);

  const avg = (selector: (d: DailySummary) => number) =>
    Math.round(reliableDays.reduce((s, d) => s + selector(d), 0) / divisor);

  const avgCalories = avg((d) => d.total_calories);
  const avgProtein = avg((d) => d.total_protein);
  const avgFat = avg((d) => d.total_fat);
  const avgCarbs = avg((d) => d.total_carbs);

  const pct = (value: number, target: number) =>
    target > 0 ? Math.round((value / target) * 100) : 0;

  // Weight: use all measurements in period (independent of meal reliability)
  const sortedBody = [...bodyData]
    .filter((b) => b.weight)
    .sort((a, b) => a.date.localeCompare(b.date));
  const startWeight = sortedBody[0]?.weight ?? null;
  const endWeight = sortedBody[sortedBody.length - 1]?.weight ?? null;

  // Training: use all recorded days (workout logging doesn't depend on meals)
  const totalSessions = summaries.reduce((s, d) => s + d.workout_count, 0);
  const daysActive = summaries.filter((d) => d.workout_count > 0).length;
  const weeks = Math.max(periodDays / 7, 1);

  const volumes = calculateWeeklyVolume(workoutLogs);
  const muscleVolume: FitnessDiagnosisData["muscleVolume"] = {};
  // Zero-fill all muscle groups so untrained ones surface as issues
  for (const [group, target] of Object.entries(WEEKLY_VOLUME_TARGET)) {
    if (group === "full_body") continue;
    muscleVolume[group] = { totalSets: 0, weeklyAvg: 0, weeklyTarget: target };
  }
  for (const v of volumes) {
    muscleVolume[v.muscleGroup] = {
      totalSets: v.sets,
      weeklyAvg: Math.round((v.sets / weeks) * 10) / 10,
      weeklyTarget: WEEKLY_VOLUME_TARGET[v.muscleGroup],
    };
  }

  const data: FitnessDiagnosisData = {
    period: { start: startDate, end: endDate, days: periodDays },
    dataQuality: {
      reliableDayCount: reliableDays.length,
      excludedDayCount: reliability.excludedDays.length,
      noRecordDayCount: reliability.noRecordDayCount,
      criterion: reliability.criterion,
      excludedDates: reliability.excludedDays.map((d) => d.date),
    },
    profile: {
      weight: profile.weight,
      target_weight: profile.target_weight,
      target_calories: profile.target_calories,
      target_protein: profile.target_protein,
      target_fat: profile.target_fat,
      target_carbs: profile.target_carbs,
    },
    dailyAverage: {
      calories: avgCalories,
      protein: avgProtein,
      fat: avgFat,
      carbs: avgCarbs,
    },
    targetAchievement: {
      calories_pct: pct(avgCalories, profile.target_calories),
      protein_pct: pct(avgProtein, profile.target_protein),
      fat_pct: pct(avgFat, profile.target_fat),
      carbs_pct: pct(avgCarbs, profile.target_carbs),
    },
    weightChange: {
      start: startWeight,
      end: endWeight,
      diff:
        startWeight !== null && endWeight !== null
          ? Math.round((endWeight - startWeight) * 10) / 10
          : null,
      measurementCount: sortedBody.length,
    },
    training: {
      totalSessions,
      daysActive,
      avgWeeklySessions: Math.round((totalSessions / weeks) * 10) / 10,
    },
    muscleVolume,
  };

  return { data, reliability };
}
