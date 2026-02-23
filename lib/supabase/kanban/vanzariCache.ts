/**
 * Cache hibrid (memorie + sessionStorage) pentru payload-ul Kanban Vânzări.
 * Reduce timpul la navigare Vânzări → Receptie → Vânzări (încărcare instant, ca Receptie).
 * Aliniat cu receptieCache.ts (plan-cache-receptie.md, plan-optimizare-vanzari).
 */

const PREFIX = 'vanzari_kanban_'
const TTL_MEMORY_MS = 60 * 1000       // 1 min în memorie
const TTL_SESSION_MS = 2 * 60 * 1000  // 2 min în sessionStorage
const MAX_SESSION_SIZE = 4 * 1024 * 1024 // ~4 MB

export interface VanzariCachePayload {
  items: any[]
  timestamp: number
}

const memory = new Map<string, VanzariCachePayload>()

function storageKey(key: string): string {
  return PREFIX + key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function isExpired(entry: VanzariCachePayload, ttlMs: number): boolean {
  return Date.now() - entry.timestamp > ttlMs
}

/**
 * Cheie cache: pipelineId + showAvemComanda (Vânzări nu are filtre pe user ca Receptie).
 */
export function vanzariCacheKey(pipelineId: string, showAvemComanda?: boolean): string {
  const avem = showAvemComanda ? '1' : '0'
  return `${pipelineId}-${avem}`
}

export type VanzariCacheSource = 'memory' | 'session'

export interface VanzariCacheResult {
  payload: VanzariCachePayload
  source: VanzariCacheSource
}

/**
 * Citește din cache: mai întâi memorie (TTL 1 min), apoi sessionStorage (TTL 2 min).
 * La hit din memorie (navigare în app) → afișare instant, fără refetch.
 * La hit din session (după F5) → putem refetch în background.
 */
export function getVanzariCache(
  key: string,
  ttlMemoryMs = TTL_MEMORY_MS,
  ttlSessionMs = TTL_SESSION_MS
): VanzariCacheResult | null {
  const mem = memory.get(key)
  if (mem && !isExpired(mem, ttlMemoryMs)) {
    return { payload: mem, source: 'memory' }
  }
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(storageKey(key)) : null
    if (!raw) return null
    const parsed = JSON.parse(raw) as VanzariCachePayload
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
export function setVanzariCache(key: string, items: any[]): void {
  const payload: VanzariCachePayload = { items, timestamp: Date.now() }
  memory.set(key, payload)
  try {
    if (typeof sessionStorage === 'undefined') return
    const str = JSON.stringify(payload)
    if (str.length > MAX_SESSION_SIZE) return
    sessionStorage.setItem(storageKey(key), str)
  } catch {
    // quota exceeded – avem memorie
  }
}

/**
 * Invalidează cache: pentru o cheie specifică sau pentru toate cheile Vânzări.
 */
export function invalidateVanzariCache(keyOrAll?: string): void {
  if (keyOrAll === undefined || keyOrAll === 'vanzari' || keyOrAll === '') {
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
