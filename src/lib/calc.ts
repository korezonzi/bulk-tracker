import {
  PfcTargets,
  WorkoutCategory,
  WorkoutSet,
  MuscleGroup,
  Exercise,
  WEEKLY_VOLUME_TARGET,
  WeeklyMuscleVolume,
} from "./types";

const LEAN_BULK_SURPLUS = 250;
const PROTEIN_PER_KG = 2.0;
const FAT_CALORIE_RATIO = 0.25;
const CALORIES_PER_GRAM_PROTEIN = 4;
const CALORIES_PER_GRAM_FAT = 9;
const CALORIES_PER_GRAM_CARBS = 4;

export function calculateLeanMass(weight: number, bodyFatPct: number): number {
  return weight * (1 - bodyFatPct / 100);
}

export function calculateBmr(leanMass: number): number {
  // Katch-McArdle formula
  return Math.round(370 + 21.6 * leanMass);
}

export function calculatePfcTargets(
  weight: number,
  bodyFatPct: number,
  activityLevel: number = 1.55
): PfcTargets {
  const leanMass = calculateLeanMass(weight, bodyFatPct);
  const bmr = calculateBmr(leanMass);
  const tdee = Math.round(bmr * activityLevel);
  const targetCalories = tdee + LEAN_BULK_SURPLUS;

  const targetProtein = Math.round(weight * PROTEIN_PER_KG);
  const targetFat = Math.round((targetCalories * FAT_CALORIE_RATIO) / CALORIES_PER_GRAM_FAT);
  const targetCarbs = Math.round(
    (targetCalories - targetProtein * CALORIES_PER_GRAM_PROTEIN - targetFat * CALORIES_PER_GRAM_FAT) /
      CALORIES_PER_GRAM_CARBS
  );

  return { bmr, tdee, targetCalories, targetProtein, targetFat, targetCarbs };
}

// MET values by workout category
const MET_VALUES: Record<WorkoutCategory, number> = {
  youtube: 6.0,   // vigorous calisthenics / HIIT
  chocozap: 5.0,  // moderate weight training
  home: 5.5,      // bodyweight exercises
};

export function estimateWorkoutCalories(
  category: WorkoutCategory,
  durationMin: number,
  bodyWeightKg: number
): number {
  const met = MET_VALUES[category];
  // MET × weight(kg) × time(hours)
  return Math.round(met * bodyWeightKg * (durationMin / 60));
}

export function estimateDurationFromSets(sets: WorkoutSet[]): number {
  // ~45s per set (execution) + ~60s rest between sets
  const totalSeconds = sets.length * (45 + 60);
  return Math.max(1, Math.round(totalSeconds / 60));
}

export function calculateTotalVolume(sets: WorkoutSet[], bodyWeightKg?: number): number {
  return sets.reduce((total, set) => {
    const weight = set.weight_kg ?? bodyWeightKg ?? 0;
    return total + weight * set.reps;
  }, 0);
}

export function adjustedDailyTarget(baseTargetCalories: number, workoutCalories: number): number {
  return baseTargetCalories + workoutCalories;
}

// ─── Muscle Group Detection ──────────────────────────────────────

// Map Japanese target text to standardized muscle groups
const TARGET_TO_MUSCLE_GROUP: Record<string, MuscleGroup> = {
  // Chest
  "胸": "chest", "大胸筋": "chest", "胸筋": "chest",
  // Back
  "背中": "back", "広背筋": "back", "僧帽筋": "back", "背筋": "back",
  // Legs
  "脚": "legs", "太もも": "legs", "太もも裏": "legs", "ハムストリング": "legs",
  "お尻": "legs", "臀筋": "legs", "大腿四頭筋": "legs", "ふくらはぎ": "legs",
  // Shoulders
  "肩": "shoulders", "三角筋": "shoulders",
  // Arms
  "腕": "arms", "二頭筋": "arms", "三頭筋": "arms", "上腕": "arms",
  // Core
  "腹筋": "core", "腹直筋": "core", "腹斜筋": "core", "外腹斜筋": "core",
  "下腹": "core", "お腹": "core", "体幹": "core",
  // Full body
  "全身": "full_body",
};

export function detectMuscleGroups(exercises: Exercise[] | null, presetName: string): MuscleGroup[] {
  const groups = new Set<MuscleGroup>();

  // From exercises target field
  if (exercises) {
    for (const ex of exercises) {
      const target = ex.target;
      for (const [key, group] of Object.entries(TARGET_TO_MUSCLE_GROUP)) {
        if (target.includes(key)) {
          groups.add(group);
        }
      }
    }
  }

  // Fallback: detect from preset name
  if (groups.size === 0) {
    const name = presetName.toLowerCase();
    if (name.includes("胸") || name.includes("チェスト")) groups.add("chest");
    if (name.includes("背") || name.includes("ラット")) groups.add("back");
    if (name.includes("脚") || name.includes("レッグ") || name.includes("スクワット")) groups.add("legs");
    if (name.includes("肩") || name.includes("ショルダー")) groups.add("shoulders");
    if (name.includes("腕") || name.includes("アーム") || name.includes("カール")) groups.add("arms");
    if (name.includes("腹") || name.includes("アブ") || name.includes("プランク")) groups.add("core");
    if (name.includes("HIIT") || name.includes("hiit") || name.includes("全身")) groups.add("full_body");
  }

  return groups.size > 0 ? Array.from(groups) : ["full_body"];
}

// ─── Weekly Volume Calculation ───────────────────────────────────

interface WorkoutLogWithPreset {
  sets: WorkoutSet[] | null;
  preset?: { exercises: Exercise[] | null; name: string; category: WorkoutCategory } | null;
}

export function calculateWeeklyVolume(
  logs: WorkoutLogWithPreset[]
): WeeklyMuscleVolume[] {
  const volumeMap = new Map<MuscleGroup, number>();

  for (const log of logs) {
    const preset = log.preset;
    if (!preset) continue;

    const muscleGroups = detectMuscleGroups(preset.exercises, preset.name);
    const setCount = log.sets?.length ?? (preset.exercises?.length ?? 1);

    // Distribute sets across muscle groups
    const setsPerGroup = Math.ceil(setCount / muscleGroups.length);
    for (const group of muscleGroups) {
      volumeMap.set(group, (volumeMap.get(group) ?? 0) + setsPerGroup);
    }
  }

  const allGroups: MuscleGroup[] = ["chest", "back", "legs", "shoulders", "arms", "core"];
  return allGroups.map((group) => ({
    muscleGroup: group,
    sets: volumeMap.get(group) ?? 0,
    target: WEEKLY_VOLUME_TARGET[group],
  }));
}

// ─── Progressive Overload ────────────────────────────────────────

export function estimate1RM(weightKg: number, reps: number): number {
  // Epley formula
  if (reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30));
}

export function compareOverload(
  currentSets: WorkoutSet[],
  previousSets: WorkoutSet[]
): { status: "up" | "same" | "down"; detail: string } {
  if (currentSets.length === 0 || previousSets.length === 0) {
    return { status: "same", detail: "" };
  }

  const currentVolume = currentSets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * s.reps, 0);
  const previousVolume = previousSets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * s.reps, 0);

  const currentMaxWeight = Math.max(...currentSets.map((s) => s.weight_kg ?? 0));
  const previousMaxWeight = Math.max(...previousSets.map((s) => s.weight_kg ?? 0));

  if (currentMaxWeight > previousMaxWeight) {
    return { status: "up", detail: `重量UP (${previousMaxWeight}→${currentMaxWeight}kg)` };
  }
  if (currentVolume > previousVolume) {
    return { status: "up", detail: `ボリュームUP` };
  }
  if (currentVolume < previousVolume * 0.9) {
    return { status: "down", detail: "ボリューム減少" };
  }
  return { status: "same", detail: "維持" };
}

// ─── Formatting ──────────────────────────────────────────────────

export function formatCalories(value: number): string {
  return `${Math.round(value).toLocaleString()} kcal`;
}

export function formatGrams(value: number): string {
  return `${Math.round(value)}g`;
}
