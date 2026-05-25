"use client";

interface PfcRingProps {
  current: number;
  target: number;
  label: string;
  color: string;
  unit?: string;
}

export function PfcRing({ current, target, label, color, unit = "g" }: PfcRingProps) {
  const rawPercentage = target > 0 ? (current / target) * 100 : 0;
  const ringPercentage = Math.min(rawPercentage, 100); // Ring capped at 100%
  const displayPercentage = Math.round(rawPercentage); // Display shows actual %
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (ringPercentage / 100) * circumference;
  const diff = current - target;
  const isOver = diff > 0;

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Ring: responsive sizing */}
      <div className="relative w-24 h-24 md:w-28 md:h-28">
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
            style={{}}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm md:text-base font-bold font-num ${isOver ? "text-yellow-400" : ""}`}>{displayPercentage}%</span>
        </div>
      </div>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-[11px] font-num">
        <span className={isOver ? "text-yellow-400" : ""}>{Math.round(current)}</span>
        <span className="text-muted">/{Math.round(target)}{unit}</span>
      </span>
      <span className={`text-[10px] ${isOver ? "text-yellow-400" : "text-muted"}`}>
        {diff > 0 ? `+${Math.round(diff)}` : Math.round(diff)}{unit}
      </span>
    </div>
  );
}
