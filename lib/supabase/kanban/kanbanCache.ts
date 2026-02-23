/**
 * Cache Kanban unificat: un singur modul pentru Receptie, Vânzări și Departamente.
 * Cheie: pipelineId + userId. Toate stage-urile sunt mereu afișate.
 * Plan: docs/plan-implementare-optimizare-vanzari.md (Faze 7–8 unificate).
 */

const PREFIX = 'kanban_'
const TTL_MEMORY_MS = 5 * 60 * 1000       // 5 min în memorie
const TTL_SESSION_MS = 15 * 60 * 1000     // 15 min în sessionStorage
const MAX_SESSION_SIZE = 4 * 1024 * 1024 // ~4 MB

export interface KanbanCachePayload {
  items: any[]
  timestamp: number
}

const memory = new Map<string, KanbanCachePayload>()

/** sessionStorage este disponibil doar în browser; în Next.js SSR e undefined. */
function hasSessionStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
  } catch {
    return false
  }
}

function storageKey(key: string): string {
  return PREFIX + key.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function isExpired(entry: KanbanCachePayload, ttlMs: number): boolean {
  return Date.now() - entry.timestamp > ttlMs
}

/** Serializare sigură: evită erori la referințe circulare sau valori non-JSON. */
function safeStringify(payload: KanbanCachePayload): string | null {
  try {
    return JSON.stringify(payload)
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[kanbanCache] JSON.stringify failed (circular ref?):', e)
    }
    return null
  }
}

/**
 * Cheie unică pentru orice pipeline Kanban (Receptie, Vânzări, Departamente).
 * Receptie: pipelineId + userIdForFilter
 * Vânzări: pipelineId + 'all'
 * Departamente: pipelineId + userIdForFilter
 */
export function kanbanCacheKey(
  pipelineId: string,
  userIdForFilter?: string | null
): string {
  const user = userIdForFilter ?? 'all'
  return `${pipelineId}-${user}`
}

export type KanbanCacheSource = 'memory' | 'session'

export interface KanbanCacheResult {
  payload: KanbanCachePayload
  source: KanbanCacheSource
}

/**
 * Citește din cache: memorie (TTL 1 min), apoi sessionStorage (TTL 2 min).
 * La hit din memorie → afișare instant, fără refetch.
 * La hit din session (după F5) → putem refetch în background.
 */
export function getKanbanCache(
  key: string,
  ttlMemoryMs = TTL_MEMORY_MS,
  ttlSessionMs = TTL_SESSION_MS
): KanbanCacheResult | null {
  const mem = memory.get(key)
  if (mem && !isExpired(mem, ttlMemoryMs)) {
    return { payload: mem, source: 'memory' }
  }
  try {
    if (!hasSessionStorage()) return null
    const raw = window.sessionStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as KanbanCachePayload
    if (!parsed || !Array.isArray(parsed.items) || !Number.isFinite(parsed.timestamp)) return null
    if (isExpired(parsed, ttlSessionMs)) {
      window.sessionStorage.removeItem(storageKey(key))
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
export function setKanbanCache(key: string, items: any[]): void {
  const payload: KanbanCachePayload = { items, timestamp: Date.now() }
  memory.set(key, payload)
  if (!hasSessionStorage()) return
  try {
    const str = safeStringify(payload)
    if (!str || str.length > MAX_SESSION_SIZE) return
    window.sessionStorage.setItem(storageKey(key), str)
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[kanbanCache] sessionStorage.setItem failed (quota?):', e)
    }
  }
}

/**
 * Invalidează toate intrările pentru un pipeline (la refresh sau realtime).
 * Cheile sunt de forma pipelineId-user-avem, deci ștergem toate cheile care încep cu pipelineId-.
 */
export function invalidateKanbanCacheForPipeline(pipelineId: string): void {
  const prefix = pipelineId + '-'
  for (const k of Array.from(memory.keys())) {
    if (k.startsWith(prefix)) memory.delete(k)
  }
  try {
    if (hasSessionStorage()) {
      const storagePrefix = storageKey(prefix)
      const keys: string[] = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i)
        if (k && k.startsWith(storagePrefix)) keys.push(k)
      }
      keys.forEach(k => window.sessionStorage.removeItem(k))
    }
  } catch {
    // ignore
  }
}

/**
 * Invalidează tot cache-ul Kanban (toate pipeline-urile).
 */
export function invalidateKanbanCache(): void {
  memory.clear()
  try {
    if (hasSessionStorage()) {
      const keys: string[] = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i)
        if (k && k.startsWith(PREFIX)) keys.push(k)
      }
      keys.forEach(k => window.sessionStorage.removeItem(k))
    }
  } catch {
    // ignore
  }
}
