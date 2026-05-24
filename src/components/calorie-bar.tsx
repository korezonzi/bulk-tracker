"use client";

interface CalorieBarProps {
  current: number;
  target: number;
}

export function CalorieBar({ current, target }: CalorieBarProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const diff = current - target;
  const remaining = target - current;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-baseline">
        <span className="text-3xl md:text-4xl font-bold tracking-tight font-num">
          {Math.round(current).toLocaleString()}
        </span>
        <span className="text-sm text-muted font-num">/ {Math.round(target).toLocaleString()} kcal</span>
      </div>
      <div className="h-3 md:h-4 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-indigo-400 rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${percentage}%`,
            boxShadow: percentage > 0 ? "0 0 12px rgba(99, 102, 241, 0.3)" : "none",
          }}
        />
      </div>
      <p className="text-xs text-muted">
        {remaining > 0
          ? `あと ${Math.round(remaining).toLocaleString()} kcal`
          : `${Math.round(Math.abs(diff)).toLocaleString()} kcal オーバー`}
      </p>
    </div>
  );
}
