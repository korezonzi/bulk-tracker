// JST date utilities with 27-hour system (day boundary at 3:00 AM JST)
// Before 3:00 AM JST, the date is considered "yesterday"

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_BOUNDARY_HOURS = 3; // 27時制: 3時に日付が変わる

/**
 * Get the current "logical date" in JST with 27-hour system.
 * Before 3:00 AM JST → returns yesterday's date.
 */
export function getToday(): string {
  const now = new Date();
  // Convert to JST
  const jstMs = now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + JST_OFFSET_MS;
  const jst = new Date(jstMs);

  // If before 3 AM JST, subtract a day
  if (jst.getHours() < DAY_BOUNDARY_HOURS) {
    jst.setDate(jst.getDate() - 1);
  }

  return formatJstDate(jst);
}

/**
 * Format a Date object to YYYY-MM-DD string in JST.
 */
export function toDateString(date: Date): string {
  const jstMs = date.getTime() + (date.getTimezoneOffset() * 60 * 1000) + JST_OFFSET_MS;
  const jst = new Date(jstMs);
  return formatJstDate(jst);
}

/**
 * Get a date N days ago from today (logical date).
 */
export function daysAgo(n: number): string {
  const today = parseDate(getToday());
  today.setDate(today.getDate() - n);
  return formatJstDate(today);
}

/**
 * Parse a YYYY-MM-DD string to a Date object (local).
 */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatJstDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
