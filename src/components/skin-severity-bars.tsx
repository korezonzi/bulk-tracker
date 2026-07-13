"use client";

import { SKIN_SCORE_LABELS, type SkinScores } from "@/lib/types";

const SEVERITY_MAX = 10;

// Severity 0-10 (higher = worse) → green / yellow / red
function severityColor(value: number): string {
  if (value <= 3) return "var(--carbs)"; // calm green
  if (value <= 6) return "var(--warning)";
  return "var(--error)";
}

// Horizontal severity bars for the 5 individual skin scores.
export function SkinSeverityBars({
  scores,
}: {
  scores: Pick<SkinScores, "acne" | "pores" | "redness" | "oiliness" | "texture">;
}) {
  const items = (
    Object.keys(SKIN_SCORE_LABELS) as (keyof typeof SKIN_SCORE_LABELS)[]
  ).map((key) => ({
    key,
    label: SKIN_SCORE_LABELS[key],
    value: scores[key],
  }));

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <span className="text-xs text-muted w-10 shrink-0">{item.label}</span>
          <div className="flex-1 h-2 bg-card-hover rounded-full">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(Math.max(0, Math.min(item.value, SEVERITY_MAX)) / SEVERITY_MAX) * 100}%`,
                backgroundColor: severityColor(item.value),
              }}
            />
          </div>
          <span className="text-xs font-num w-6 text-right shrink-0">
            {Math.round(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
