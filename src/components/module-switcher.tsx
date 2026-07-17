"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULES, getActiveModule } from "@/lib/modules";

// Mobile-only module switcher (fitness / skin / consult).
// Rendered at the top of <main>; desktop uses the sidebar segment instead.
export function ModuleSwitcher() {
  const pathname = usePathname();

  // Hide on setup page
  if (pathname === "/setup") return null;

  const activeModule = getActiveModule(pathname);

  return (
    // safe-area-inset-top + extra clearance keeps the pills out of the iOS
    // status-bar / browser-chrome dead zone where taps are swallowed
    <div className="md:hidden px-4 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="flex gap-1 bg-card rounded-xl p-1">
        {MODULES.map((mod) => (
          <Link
            key={mod.id}
            href={mod.basePath}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg text-xs transition-colors ${
              mod.id === activeModule.id
                ? "bg-accent/12 text-accent font-medium"
                : "text-muted"
            }`}
          >
            <span>{mod.emoji}</span>
            <span>{mod.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
