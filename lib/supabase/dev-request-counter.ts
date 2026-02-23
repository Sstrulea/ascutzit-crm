/**
 * Dev-only: numără requesturile fetch către Supabase.
 * Folosit pentru a măsura numărul de query-uri la încărcarea unei pagini (ex. Receptie).
 *
 * Activare: NEXT_PUBLIC_DEBUG_SUPABASE_REQUESTS=true
 * În layout: require('@/lib/supabase/dev-request-counter').initSupabaseRequestCounter()
 *
 * Reset manual în Console: window.__supabaseRequestCount = 0
 * Citire: window.__supabaseRequestCount
 */

const SUPABASE_MARKER = 'supabase'

let count = 0
let logInterval: ReturnType<typeof setInterval> | null = null

function isSupabaseRequest(url: string): boolean {
  try {
    return url.includes(SUPABASE_MARKER)
  } catch {
    return false
  }
}

export function initSupabaseRequestCounter(): void {
  if (typeof window === 'undefined') return

  // Expose count globally for manual read/reset
  ;(window as any).__supabaseRequestCount = 0

  const originalFetch = window.fetch
  window.fetch = function (...args: Parameters<typeof fetch>): Promise<Response> {
    const input = args[0]
    const url = typeof input === 'string' ? input : (input as Request)?.url ?? ''
    if (isSupabaseRequest(url)) {
      count++
      ;(window as any).__supabaseRequestCount = count
    }
    return originalFetch.apply(this, args)
  }

  // Log every 10s so user sees count after page load
  logInterval = setInterval(() => {
    if (count > 0) {
      console.log(`[Supabase requests] ${count}`)
    }
  }, 10_000)

  // Log on page unload (navigare / close)
  window.addEventListener('beforeunload', () => {
    if (count > 0) {
      console.log(`[Supabase requests] total before leave: ${count}`)
    }
  })

  console.log('[Supabase request counter] Active. Reset: window.__supabaseRequestCount = 0')
}

export function getSupabaseRequestCount(): number {
  return count
}

export function resetSupabaseRequestCount(): void {
  count = 0
  if (typeof window !== 'undefined') {
    ;(window as any).__supabaseRequestCount = 0
  }
}
