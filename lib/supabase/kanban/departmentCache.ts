/**
 * Cache hibrid (memorie + sessionStorage) pentru payload-ul Kanban pipeline-uri departament
 * (Saloane, Horeca, Frizerii, Reparatii).
 * Încărcare instant la revenire (Departament → alt pipeline → Departament), ca Receptie/Vânzări.
 */

const PREFIX = 'dept_kanban_'
const TTL_MEMORY_MS = 60 * 1000       // 1 min în memorie
const TTL_SESSION_MS = 2 * 60 * 1000  // 2 min în sessionStorage
const MAX_SESSION_SIZE = 4 * 1024 * 1024 // ~4 MB

export interface DepartmentCachePayload {
  items: any[]
  timestamp: number
}

const memory = new Map<string, DepartmentCachePayload>()

function storageKey(key: string): string {
  return PREFIX + key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function isExpired(entry: DepartmentCachePayload, ttlMs: number): boolean {
  return Date.now() - entry.timestamp > ttlMs
}

/** Slug-uri pipeline-uri departament (pentru invalidare la refresh/realtime). */
export const DEPARTMENT_SLUGS = ['saloane', 'horeca', 'frizerii', 'reparatii'] as const

export function isDepartmentPipelineSlug(slug: string | undefined): boolean {
  if (!slug) return false
  const s = slug.toLowerCase().trim()
  return DEPARTMENT_SLUGS.some((d) => d === s)
}

/**
 * Cheie cache: pipelineId + userIdForFilter (departamentele filtrează pe user, admin vede tot).
 */
export function departmentCacheKey(
  pipelineId: string,
  userIdForFilter?: string | null
): string {
  const user = userIdForFilter ?? 'all'
  return `${pipelineId}-${user}`
}

export type DepartmentCacheSource = 'memory' | 'session'

export interface DepartmentCacheResult {
  payload: DepartmentCachePayload
  source: DepartmentCacheSource
}

/**
 * Citește din cache: memorie (TTL 1 min), apoi sessionStorage (TTL 2 min).
 * La hit din memorie → afișare instant, fără refetch.
 * La hit din session (după F5) → putem refetch în background.
 */
export function getDepartmentCache(
  key: string,
  ttlMemoryMs = TTL_MEMORY_MS,
  ttlSessionMs = TTL_SESSION_MS
): DepartmentCacheResult | null {
  const mem = memory.get(key)
  if (mem && !isExpired(mem, ttlMemoryMs)) {
    return { payload: mem, source: 'memory' }
  }
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(storageKey(key)) : null
    if (!raw) return null
    const parsed = JSON.parse(raw) as DepartmentCachePayload
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
export function setDepartmentCache(key: string, items: any[]): void {
  const payload: DepartmentCachePayload = { items, timestamp: Date.now() }
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
 * Invalidează cache: pentru o cheie specifică sau pentru toate cheile departamente.
 */
export function invalidateDepartmentCache(keyOrAll?: string): void {
  if (keyOrAll === undefined || keyOrAll === '') {
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
