/**
 * The anonymous usage totals on the home page (worker/usage.ts). The page only ever sends what kind of read
 * happened and how many: "+3 PDF", "+2 screenshots", "+1 Gmail sync". Nothing about the files or the person.
 */
export type UsageKind = 'pdf' | 'shot' | 'gmail'
export type UsageCounts = Record<UsageKind, number>

/** Fire and forget: a failed count never gets in the way. */
export function reportUsage(kind: UsageKind, n: number): void {
  if (!(n >= 1)) return
  try {
    void fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, n: Math.min(50, Math.round(n)) }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // ignore
  }
}

export async function fetchUsage(): Promise<UsageCounts | null> {
  try {
    const response = await fetch('/api/usage')
    return response.ok ? ((await response.json()) as UsageCounts) : null
  } catch {
    return null
  }
}

/** The totals are shown once they add up to this many, so the line never reads "used 3 times". */
export const SHOW_USAGE_FROM = 100
