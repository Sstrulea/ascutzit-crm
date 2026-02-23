/**
 * Cache hibrid (memorie + sessionStorage) pentru payload-ul Kanban Receptie.
 * Reduce call-urile la refresh F5 și la navigare Receptie → alt pipeline → Receptie.
 * Plan: docs/plan-cache-receptie.md
 */

const PREFIX = 'receptie_kanban_'
const TTL_MEMORY_MS = 60 * 1000       // 1 min în memorie
const TTL_SESSION_MS = 2 * 60 * 1000 // 2 min în sessionStorage
const MAX_SESSION_SIZE = 4 * 1024 * 1024 // ~4 MB fallback: nu scriem dacă payload prea mare

export interface ReceptieCachePayload {
  items: any[]
  timestamp: number
}

const memory = new Map<string, ReceptieCachePayload>()

function storageKey(key: string): string {
  return PREFIX + key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function isExpired(entry: ReceptieCachePayload, ttlMs: number): boolean {
  return Date.now() - entry.timestamp > ttlMs
}

/**
 * Cheie cache: pipelineId + userIdForFilter + showAvemComanda
 */
export function receptieCacheKey(
  pipelineId: string,
  userIdForFilter?: string | null,
  showAvemComanda?: boolean
): string {
  const user = userIdForFilter ?? 'all'
  const avem = showAvemComanda ? '1' : '0'
  return `${pipelineId}-${user}-${avem}`
}

export type ReceptieCacheSource = 'memory' | 'session'

export interface ReceptieCacheResult {
  payload: ReceptieCachePayload
  source: ReceptieCacheSource
}

/**
 * Citește din cache: mai întâi memorie (TTL 1 min), apoi sessionStorage (TTL 2 min).
 * Returnează { payload, source } sau null dacă miss / expirat.
 * source = 'memory' → navigare în app (Receptie → alt pipeline → Receptie); nu facem refetch în background.
 * source = 'session' → F5; putem face refetch în background pentru date mai proaspete.
 */
export function getReceptieCache(
  key: string,
  ttlMemoryMs = TTL_MEMORY_MS,
  ttlSessionMs = TTL_SESSION_MS
): ReceptieCacheResult | null {
  const mem = memory.get(key)
  if (mem && !isExpired(mem, ttlMemoryMs)) {
    return { payload: mem, source: 'memory' }
  }
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(storageKey(key)) : null
    if (!raw) return null
    const parsed = JSON.parse(raw) as ReceptieCachePayload
    if (!parsed || !Array.isArray(parsed.items) || !Number.isFinite(parsed.timestamp)) return null
    if (isExpired(parsed, ttlSessionMs)) {
      sessionStorage.removeItem(storageKey(key))
      return null
    }
    return { payload: parsed, source: 'session' }
  } catch {
    return null
  }
}

/**
 * Scrie în ambele straturi: memorie + sessionStorage.
 */
export function setReceptieCache(key: string, items: any[]): void {
  const payload: ReceptieCachePayload = { items, timestamp: Date.now() }
  memory.set(key, payload)
  try {
    if (typeof sessionStorage === 'undefined') return
    const str = JSON.stringify(payload)
    if (str.length > MAX_SESSION_SIZE) return
    sessionStorage.setItem(storageKey(key), str)
  } catch {
    // quota exceeded sau alte erori – ignorăm, avem memorie
  }
}

/**
 * Invalidează cache: pentru o cheie specifică sau pentru toate cheile Receptie.
 */
export function invalidateReceptieCache(keyOrAll?: string): void {
  if (keyOrAll === undefined || keyOrAll === 'receptie' || keyOrAll === '') {
    memory.clear()
    try {
      if (typeof sessionStorage !== 'undefined') {
        const keys: string[] = []
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i)
          if (k && k.startsWith(PREFIX)) keys.push(k)
        }
        keys.forEach(k => sessionStorage.removeItem(k))
      }
    } catch {
      // ignore
    }
    return
  }
  memory.delete(keyOrAll)
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(storageKey(keyOrAll))
    }
  } catch {
    // ignore
  }
}
