"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/nav-icons";
import { APP_NAME } from "@/lib/app-config";
import { MODULES, getActiveModule, isTabActive } from "@/lib/modules";

export function DesktopSidebar() {
  const pathname = usePathname();

  // Hide on setup page
  if (pathname === "/setup") return null;

  const activeModule = getActiveModule(pathname);

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-56 md:border-r md:border-card-border/50 bg-background z-40">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 h-16 border-b border-card-border/50">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
          <span className="text-white text-xs font-bold">{APP_NAME.charAt(0)}</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
      </div>

      {/* Module switcher */}
      <div className="px-3 pt-4">
        <div className="flex gap-1 bg-card rounded-xl p-1">
          {MODULES.map((mod) => (
            <Link
              key={mod.id}
              href={mod.basePath}
              className={`flex-1 text-center py-1.5 rounded-lg text-sm transition-colors ${
                mod.id === activeModule.id
                  ? "bg-accent/12 text-accent"
                  : "text-muted hover:text-foreground"
              }`}
              title={mod.label}
            >
              {mod.emoji}
            </Link>
          ))}
        </div>
        <p className="px-2 pt-2 text-xs text-muted">{activeModule.label}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-1">
        {activeModule.sidebarItems.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const isActive = isTabActive(item, activeModule.basePath, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                isActive
                  ? "bg-accent/12 text-accent font-medium"
                  : "text-muted hover:text-foreground hover:bg-card-hover"
              }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
