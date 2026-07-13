import type { IconKey } from "@/components/nav-icons";

// App module registry: single source of truth for navigation.
// Existing fitness routes keep their URLs; new modules add namespaces.

export type ModuleId = "fitness" | "skin" | "consult";

export interface NavTab {
  href: string;
  label: string;
  icon: IconKey;
  isCenter?: boolean; // floating "+" button in the bottom tab bar
}

export interface AppModule {
  id: ModuleId;
  label: string;
  emoji: string; // module switcher segment
  basePath: string;
  tabs: NavTab[]; // mobile bottom bar (max 5)
  sidebarItems: NavTab[]; // desktop sidebar
}

export const MODULES: AppModule[] = [
  {
    id: "fitness",
    label: "フィットネス",
    emoji: "💪",
    basePath: "/",
    tabs: [
      { href: "/", label: "🏠 ホーム", icon: "home" },
      { href: "/meals", label: "🍽️ 食事", icon: "meals" },
      { href: "/meals/add", label: "", icon: "plus", isCenter: true },
      { href: "/progress", label: "📈 推移", icon: "chart" },
      { href: "/workouts", label: "💪 筋トレ", icon: "dumbbell" },
    ],
    sidebarItems: [
      { href: "/", label: "🏠 ホーム", icon: "home" },
      { href: "/meals", label: "🍽️ 食事", icon: "meals" },
      { href: "/meals/add", label: "➕ 食事を追加", icon: "plus" },
      { href: "/progress", label: "📈 推移", icon: "chart" },
      { href: "/workouts", label: "💪 筋トレ", icon: "dumbbell" },
      { href: "/review", label: "📋 レビュー", icon: "clipboard" },
    ],
  },
  {
    id: "skin",
    label: "スキンケア",
    emoji: "🧴",
    basePath: "/skin",
    tabs: [
      { href: "/skin", label: "🧖 肌ホーム", icon: "face" },
      { href: "/skin/spot", label: "🔍 スポット", icon: "zoom" },
      { href: "/skin/checkin", label: "", icon: "plus", isCenter: true },
      { href: "/skin/products", label: "🧴 コスメ", icon: "bottle" },
    ],
    sidebarItems: [
      { href: "/skin", label: "🧖 肌ダッシュボード", icon: "face" },
      { href: "/skin/checkin", label: "➕ チェックイン", icon: "plus" },
      { href: "/skin/spot", label: "🔍 スポット相談", icon: "zoom" },
      { href: "/skin/products", label: "🧴 コスメ・サプリ", icon: "bottle" },
    ],
  },
  {
    id: "consult",
    label: "からだ相談",
    emoji: "🩺",
    basePath: "/consult",
    tabs: [
      { href: "/consult", label: "🩺 ケース", icon: "stethoscope" },
      { href: "/consult/new", label: "", icon: "plus", isCenter: true },
    ],
    sidebarItems: [
      { href: "/consult", label: "🩺 相談ケース", icon: "stethoscope" },
      { href: "/consult/new", label: "➕ 新しい相談", icon: "plus" },
    ],
  },
];

/** Resolve the active module from the current pathname. */
export function getActiveModule(pathname: string): AppModule {
  const found = MODULES.find(
    (m) => m.basePath !== "/" && pathname.startsWith(m.basePath)
  );
  return found ?? MODULES[0]; // everything else (/, /body, /review, ...) is fitness
}

/** Active check: exact match for the module home tab, prefix match otherwise. */
export function isTabActive(
  tab: NavTab,
  moduleBasePath: string,
  pathname: string
): boolean {
  return tab.href === moduleBasePath
    ? pathname === tab.href
    : pathname.startsWith(tab.href);
}
