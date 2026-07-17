// Types for the AI cosmetics/supplement advice feature.
// Shared by /api/skin-advice and the /skin dashboard.
// Kept in a dedicated file (not types.ts) to avoid conflicts with parallel work.

export type SkinAdviceVerdict =
  | "continue"
  | "reconsider"
  | "stop"
  | "insufficient_data";

export type SkinAdvicePriority = "高" | "中" | "低";

export interface SkinAdviceProductReview {
  name: string;
  verdict: SkinAdviceVerdict;
  reason: string;
}

export interface SkinAdviceSkincareIngredient {
  ingredient: string;
  purpose: string;
  how_to_use: string;
  priority: SkinAdvicePriority;
}

export interface SkinAdviceSupplementIngredient {
  ingredient: string;
  purpose: string;
  dosage_hint: string;
  caution: string | null;
  priority: SkinAdvicePriority;
}

export interface SkinAdviceProductExample {
  for_ingredient: string;
  examples: string[];
}

export interface SkinAdvice {
  overview: string;
  product_reviews: SkinAdviceProductReview[];
  skincare_ingredients: SkinAdviceSkincareIngredient[];
  supplement_ingredients: SkinAdviceSupplementIngredient[];
  product_examples: SkinAdviceProductExample[];
  cautions: string[];
}

// Row shape of the skin_advice table
export interface SkinAdviceRecord {
  id: string;
  ai_advice: SkinAdvice | null;
  product_count: number | null;
  created_at: string;
}
