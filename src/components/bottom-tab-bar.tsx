"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/nav-icons";
import { getActiveModule, isTabActive } from "@/lib/modules";

export function BottomTabBar() {
  const pathname = usePathname();

  // Hide on setup page
  if (pathname === "/setup") return null;

  const activeModule = getActiveModule(pathname);

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-card safe-bottom z-50">
      <div className="flex items-center justify-around h-14">
        {activeModule.tabs.map((tab) => {
          const Icon = NAV_ICONS[tab.icon];
          const isActive = isTabActive(tab, activeModule.basePath, pathname);

          if (tab.isCenter) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex items-center justify-center w-12 h-12 -mt-4 rounded-xl bg-accent text-white active:scale-90 transition-transform"
              >
                <Icon size={26} />
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
              <Icon size={22} />
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
