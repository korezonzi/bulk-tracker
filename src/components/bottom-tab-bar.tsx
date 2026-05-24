"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "🏠 ホーム", icon: HomeIcon, isCenter: false },
  { href: "/meals", label: "🍽️ 食事", icon: MealsIcon, isCenter: false },
  { href: "/meals/add", label: "", icon: PlusIcon, isCenter: true },
  { href: "/progress", label: "📈 推移", icon: ChartIcon, isCenter: false },
  { href: "/workouts", label: "💪 筋トレ", icon: DumbbellIcon, isCenter: false },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  // Hide on setup page
  if (pathname === "/setup") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden card-glass safe-bottom z-50">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const isActive = tab.href === "/"
            ? pathname === "/"
            : pathname.startsWith(tab.href);

          if (tab.isCenter) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex items-center justify-center w-12 h-12 -mt-4 rounded-2xl bg-accent text-white shadow-lg shadow-accent/30 active:scale-90 transition-transform"
              >
                <tab.icon />
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-col items-center gap-0.5 text-xs transition-colors ${
                isActive ? "text-accent" : "text-muted"
              }`}
            >
              <tab.icon />
              <span>{tab.label}</span>
              {/* Active indicator dot */}
              {isActive && (
                <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function MealsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function DumbbellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5h11" />
      <path d="M6.5 17.5h11" />
      <path d="M6.5 6.5v11" />
      <path d="M17.5 6.5v11" />
      <path d="M4 8v8" />
      <path d="M20 8v8" />
      <path d="M2 10v4" />
      <path d="M22 10v4" />
    </svg>
  );
}
