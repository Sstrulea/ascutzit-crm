/**
 * Utilitare pentru reziliență la rețea: retry la eșecuri temporare și detectare erori de rețea.
 * Folosit pentru a evita pierderea datelor când conexiunea e instabilă.
 */

/** Verifică dacă eroarea pare a fi cauzată de rețea (Failed to fetch, timeout, CORS, etc.). */
export function isNetworkError(error: unknown): boolean {
  if (error == null) return false
  const msg = typeof (error as any)?.message === 'string' ? (error as any).message : String(error)
  const s = msg.toLowerCase()
  return (
    s.includes('failed to fetch') ||
    s.includes('network request failed') ||
    s.includes('networkerror') ||
    s.includes('load failed') ||
    s.includes('connection refused') ||
    s.includes('timeout') ||
    s.includes('econnreset') ||
    s.includes('econnrefused') ||
    s.includes('err_connection') ||
    s.includes('err_network')
  )
}

export type FetchWithRetryOptions = {
  /** Număr maxim de încercări (inclusiv prima). */
  maxAttempts?: number
  /** Întârziere între încercări (ms). */
  delayMs?: number
  /** Backoff: înmulțește delay-ul după fiecare eșec (ex. 2 = 500ms, 1000ms, 2000ms). */
  backoffMultiplier?: number
  /** Retry doar la erori de rețea (nu la 4xx/5xx). */
  retryOnlyOnNetworkError?: boolean
}

const DEFAULT_OPTIONS: Required<FetchWithRetryOptions> = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  retryOnlyOnNetworkError: true,
}

/**
 * fetch() cu retry automat la eșecuri de rețea.
 * La 4xx/5xx nu face retry (dacă retryOnlyOnNetworkError e true).
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: unknown
  let delay = opts.delayMs

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const res = await fetch(input, init)
      if (res.ok) return res
      if (opts.retryOnlyOnNetworkError && attempt < opts.maxAttempts) {
        const text = await res.text().catch(() => '')
        if (!isNetworkError(new Error(`HTTP ${res.status}: ${text}`))) {
          return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers })
        }
      } else {
        return res
      }
      lastError = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastError = e
      if (!isNetworkError(e) || attempt >= opts.maxAttempts) throw e
    }
    if (attempt < opts.maxAttempts) {
      await new Promise((r) => setTimeout(r, delay))
      delay *= opts.backoffMultiplier
    }
  }
  throw lastError
}

export type WithRetryOptions = {
  maxAttempts?: number
  delayMs?: number
  backoffMultiplier?: number
  /** Retry doar când predicate(error) e true. Implicit: isNetworkError. */
  shouldRetry?: (error: unknown) => boolean
}

/**
 * Execută o funcție async cu retry la erori de rețea.
 * Util pentru getKanbanItems, getPipelines, etc.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: WithRetryOptions
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3
  const delayMs = options?.delayMs ?? 1000
  const backoffMultiplier = options?.backoffMultiplier ?? 2
  const shouldRetry = options?.shouldRetry ?? isNetworkError

  let lastError: unknown
  let delay = delayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      if (!shouldRetry(e) || attempt >= maxAttempts) throw e
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delay))
      delay *= backoffMultiplier
    }
  }
  throw lastError
}
