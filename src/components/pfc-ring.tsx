"use client";

interface PfcRingProps {
  current: number;
  target: number;
  label: string;
  color: string;
  unit?: string;
}

export function PfcRing({ current, target, label, color, unit = "g" }: PfcRingProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const diff = current - target;
  const isOver = diff > 0;

  return (
    <div className="flex flex-col items-center gap-1.5">
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
            style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base md:text-lg font-bold font-num">{Math.round(current)}</span>
          <span className="text-[10px] text-muted">{unit}</span>
        </div>
      </div>
      <span className="text-xs font-medium">{label}</span>
      <span className={`text-[10px] ${isOver ? "text-yellow-400" : "text-muted"}`}>
        {isOver ? "+" : ""}{Math.round(diff)}{unit}
      </span>
    </div>
  );
}
