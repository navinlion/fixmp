// Shared daily budget for deep AI scans (Stage 3).
// Testing: per-browser localStorage, keyed by date.
// Launch: enforce server-side per-IP/session (spec §27) — this becomes UX only.

const KEY = "fixmp_deep_scan_budget";
export const DAILY_LIMIT = 5;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getBudget(): { used: number; remaining: number; limit: number } {
  try {
    const raw = localStorage.getItem(KEY);
    const b = raw ? (JSON.parse(raw) as { date: string; used: number }) : null;
    const used = b && b.date === today() ? b.used : 0;
    return { used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT };
  } catch {
    return { used: 0, remaining: DAILY_LIMIT, limit: DAILY_LIMIT };
  }
}

/** Records one successful deep scan. Returns false if none remain. */
export function consume(): boolean {
  const b = getBudget();
  if (b.remaining <= 0) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: today(), used: b.used + 1 }));
  } catch {
    /* storage unavailable — testing build, allow */
  }
  return true;
}