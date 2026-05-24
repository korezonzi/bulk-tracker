export interface UserProfile {
  id: string;
  weight: number;
  body_fat_pct: number;
  lean_mass: number;
  target_weight: number;
  activity_level: number;
  target_calories: number;
  target_protein: number;
  target_fat: number;
  target_carbs: number;
  created_at: string;
  updated_at: string;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "protein";

export interface Meal {
  id: string;
  date: string;
  meal_type: MealType;
  description: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  photo_url: string | null;
  is_ai_estimated: boolean;
  created_at: string;
}

export interface BodyMeasurement {
  id: string;
  date: string;
  weight: number;
  body_fat_pct: number | null;
  muscle_mass: number | null;
  lean_mass: number | null;
  bmr: number | null;
  source: "fitdays_ocr" | "manual";
  created_at: string;
}

export type WorkoutCategory = "youtube" | "chocozap" | "home";

export interface Exercise {
  name: string;
  target: string;
  duration: string;
}

export interface WorkoutPreset {
  id: string;
  name: string;
  category: WorkoutCategory;
  youtube_url: string | null;
  youtube_title: string | null;
  thumbnail_url: string | null;
  duration_min: number | null;
  exercises: Exercise[] | null;
  sort_order: number;
  created_at: string;
}

export interface WorkoutSet {
  weight_kg?: number;
  reps: number;
}

export interface WorkoutLog {
  id: string;
  date: string;
  preset_id: string;
  notes: string | null;
  sets: WorkoutSet[] | null;
  estimated_calories: number;
  duration_min: number | null;
  created_at: string;
  preset?: WorkoutPreset;
}

export interface DailySummary {
  date: string;
  total_calories: number;
  total_protein: number;
  total_fat: number;
  total_carbs: number;
  meal_count: number;
  workout_count: number;
  workout_calories: number;
}

// Muscle group tracking for hypertrophy
export type MuscleGroup = "chest" | "back" | "legs" | "shoulders" | "arms" | "core" | "full_body";

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "胸",
  back: "背中",
  legs: "脚",
  shoulders: "肩",
  arms: "腕",
  core: "腹筋",
  full_body: "全身",
};

export const MUSCLE_GROUP_EMOJI: Record<MuscleGroup, string> = {
  chest: "🫁",
  back: "🔙",
  legs: "🦵",
  shoulders: "💪",
  arms: "💪",
  core: "🎯",
  full_body: "🏋️",
};

// Weekly volume targets (sets per muscle group per week)
export const WEEKLY_VOLUME_TARGET: Record<MuscleGroup, { min: number; optimal: number; max: number }> = {
  chest: { min: 10, optimal: 15, max: 20 },
  back: { min: 10, optimal: 15, max: 20 },
  legs: { min: 10, optimal: 15, max: 20 },
  shoulders: { min: 8, optimal: 12, max: 18 },
  arms: { min: 6, optimal: 10, max: 16 },
  core: { min: 6, optimal: 10, max: 16 },
  full_body: { min: 0, optimal: 0, max: 0 },
};

export interface WeeklyMuscleVolume {
  muscleGroup: MuscleGroup;
  sets: number;
  target: { min: number; optimal: number; max: number };
}

export interface PfcTargets {
  bmr: number;
  tdee: number;
  targetCalories: number;
  targetProtein: number;
  targetFat: number;
  targetCarbs: number;
}
