"use client";

// Circular score ring (0-100, higher = better).
// Generalized from pfc-ring.tsx without the over-target logic.
interface ScoreRingProps {
  score: number; // 0-100
  label: string;
  color?: string;
}

export function ScoreRing({ score, label, color = "var(--accent)" }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(score, 100));
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-28 h-28 md:w-32 md:h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
          {/* Background track */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="5"
          />
          {/* Progress arc */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-num">{Math.round(clamped)}</span>
          <span className="text-[10px] text-muted">/100</span>
        </div>
      </div>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
