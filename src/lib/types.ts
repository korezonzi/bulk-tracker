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
  default_sets: WorkoutSet[] | null;
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
// YouTube=1セッション1セット換算、chocoZAP/自宅=実セット数
// 週3-5回トレ + chocoZAP週1-2回（各3セット）を想定
export const WEEKLY_VOLUME_TARGET: Record<MuscleGroup, { min: number; optimal: number; max: number }> = {
  chest: { min: 3, optimal: 5, max: 10 },
  back: { min: 3, optimal: 5, max: 10 },
  legs: { min: 3, optimal: 5, max: 10 },
  shoulders: { min: 2, optimal: 4, max: 8 },
  arms: { min: 2, optimal: 3, max: 6 },
  core: { min: 3, optimal: 5, max: 10 },
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

// ═══════════════════════════════════════════
// Fitness diagnosis
// ═══════════════════════════════════════════

export type IssueSeverity = "high" | "medium" | "low";

export interface FitnessIssue {
  title: string;
  severity: IssueSeverity;
  evidence: string;
  recommendation: string;
}

export interface FitnessDiagnosis {
  data_quality_note: string;
  overall: { grade: "A" | "B" | "C" | "D"; comment: string };
  issues: FitnessIssue[];
  wins: string[];
  next_actions: string[];
}

export interface FitnessDiagnosisRecord {
  id: string;
  period_start: string;
  period_end: string;
  period_days: number;
  reliable_day_count: number | null;
  excluded_day_count: number | null;
  threshold_calories: number | null;
  ai_diagnosis: FitnessDiagnosis | null;
  created_at: string;
}

// ═══════════════════════════════════════════
// Skincare module
// ═══════════════════════════════════════════

export type SkinProductCategory =
  | "cleanser"
  | "toner"
  | "serum"
  | "moisturizer"
  | "sunscreen"
  | "treatment"
  | "supplement"
  | "other";

export const SKIN_PRODUCT_CATEGORY_LABELS: Record<SkinProductCategory, string> = {
  cleanser: "洗顔料",
  toner: "化粧水",
  serum: "美容液",
  moisturizer: "乳液・クリーム",
  sunscreen: "日焼け止め",
  treatment: "治療薬",
  supplement: "サプリ",
  other: "その他",
};

export interface SkinProfile {
  id: string;
  self_description: string | null;
  ai_skin_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkinProduct {
  id: string;
  name: string;
  category: SkinProductCategory;
  brand: string | null;
  ingredients: string | null;
  usage_timing: string | null;
  started_on: string | null;
  ended_on: string | null;
  notes: string | null;
  created_at: string;
}

// Individual scores: severity 0-10 (higher = worse). Overall: 0-100 (higher = better).
export interface SkinScores {
  acne: number;
  pores: number;
  redness: number;
  oiliness: number;
  texture: number;
  overall: number;
}

export const SKIN_SCORE_LABELS: Record<keyof Omit<SkinScores, "overall">, string> = {
  acne: "ニキビ",
  pores: "毛穴",
  redness: "赤み",
  oiliness: "皮脂",
  texture: "キメ",
};

export type ProductVerdict = "continue" | "reconsider" | "insufficient_data";

export interface SkinProductFeedback {
  product: string;
  assessment: string;
  verdict: ProductVerdict;
}

export interface SkinSuggestion {
  type: "ingredient" | "product" | "supplement" | "habit";
  name: string;
  reason: string;
}

export interface SkinAnalysis {
  skin_type: string;
  scores: SkinScores;
  summary: string;
  observations: string[];
  product_feedback: SkinProductFeedback[];
  suggestions: SkinSuggestion[];
  compared_to_last: string | null;
}

export interface SkinCheckin {
  id: string;
  date: string;
  front_photo_path: string | null;
  left_photo_path: string | null;
  right_photo_path: string | null;
  self_note: string | null;
  score_acne: number | null;
  score_pores: number | null;
  score_redness: number | null;
  score_oiliness: number | null;
  score_texture: number | null;
  score_overall: number | null;
  ai_analysis: SkinAnalysis | null;
  created_at: string;
}

// Spot consult: ad-hoc zoomed photos → immediate care advice
// (separate from check-ins so tracking scores stay consistent)
export interface SkinSpotProductAdvice {
  product: string;
  advice: string;
}

export interface SkinSpotRecommendation {
  name: string;
  reason: string;
}

export interface SkinSpotAdvice {
  assessment: string;
  immediate_care: string[];
  product_advice: SkinSpotProductAdvice[];
  recommended: SkinSpotRecommendation[];
  avoid: string[];
  see_doctor: ConsultSeeDoctor;
}

export interface SkinSpotConsult {
  id: string;
  date: string;
  user_note: string | null;
  photo_paths: string[] | null;
  ai_advice: SkinSpotAdvice | null;
  created_at: string;
}

// ═══════════════════════════════════════════
// Consult module
// ═══════════════════════════════════════════

export type ConsultCaseStatus = "active" | "monitoring" | "resolved";

export const CONSULT_STATUS_LABELS: Record<ConsultCaseStatus, string> = {
  active: "相談中",
  monitoring: "経過観察",
  resolved: "解決",
};

export interface ConsultCase {
  id: string;
  title: string;
  body_area: string;
  status: ConsultCaseStatus;
  started_on: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export type ConsultLikelihood = "高" | "中" | "低";
export type ConsultUrgency = "routine" | "soon" | "urgent";

export interface ConsultPossibility {
  name: string;
  likelihood: ConsultLikelihood;
  rationale: string;
}

export interface ConsultSeeDoctor {
  recommended: boolean;
  urgency: ConsultUrgency;
  department: string;
  reason: string;
}

export interface ConsultAiResponse {
  possibilities: ConsultPossibility[];
  self_care: string[];
  red_flags: string[];
  see_doctor: ConsultSeeDoctor;
  progress_note: string | null;
  case_summary: string;
}

export interface ConsultEntry {
  id: string;
  case_id: string;
  date: string;
  user_note: string | null;
  photo_paths: string[] | null;
  ai_response: ConsultAiResponse | null;
  created_at: string;
}
