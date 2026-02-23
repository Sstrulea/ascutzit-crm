/**
 * Cache stage IDs pentru dashboard tehnicieni.
 * Modul separat fără dependențe client – poate fi importat din API routes.
 * Pe client: persistă în sessionStorage (TTL 5 min) – supraviețuiește la refresh.
 */

export type StageIdsCacheState = {
  finalizareIds: string[] | null
  inLucruIds: string[] | null
  inAsteptareIds: string[] | null
  receptieFinalizateIds: string[] | null
  cached: boolean
}

export type StageIdsResult = {
  finalizareIds: string[]
  inLucruIds: string[]
  inAsteptareIds: string[]
  receptieFinalizateIds: string[]
}

const STAGE_IDS_STORAGE_KEY = 'crm:stageIdsCache:v1'
const STAGE_IDS_TTL_MS = 5 * 60 * 1000 // 5 min

let stageIdsCache: StageIdsCacheState = {
  finalizareIds: null,
  inLucruIds: null,
  inAsteptareIds: null,
  receptieFinalizateIds: null,
  cached: false,
}

let stageIdsPromise: Promise<StageIdsResult> | null = null

function loadFromSessionStorage(): StageIdsCacheState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STAGE_IDS_STORAGE_KEY)
    if (!raw) return null
    const { ts, state } = JSON.parse(raw) as { ts: number; state: StageIdsCacheState }
    if (Date.now() - ts > STAGE_IDS_TTL_MS) return null
    if (!state?.cached) return null
    return state
  } catch {
    return null
  }
}

function saveToSessionStorage(state: StageIdsCacheState) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STAGE_IDS_STORAGE_KEY, JSON.stringify({ ts: Date.now(), state }))
  } catch {
    // quota exceeded etc.
  }
}

export function getStageIdsCache(): StageIdsCacheState {
  const fromStorage = loadFromSessionStorage()
  if (fromStorage) {
    stageIdsCache = fromStorage
    return stageIdsCache
  }
  return stageIdsCache
}

export function setStageIdsCache(state: StageIdsCacheState) {
  stageIdsCache = state
  saveToSessionStorage(state)
}

export function getStageIdsPromise(): Promise<StageIdsResult> | null {
  return stageIdsPromise
}

export function setStageIdsPromise(p: Promise<StageIdsResult> | null) {
  stageIdsPromise = p
}

/** Invalidare cache stage IDs – apelează când admin modifică pipeline-uri sau stage-uri */
export function invalidateStageIdsCache() {
  stageIdsCache = {
    finalizareIds: null,
    inLucruIds: null,
    inAsteptareIds: null,
    receptieFinalizateIds: null,
    cached: false,
  }
  stageIdsPromise = null
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(STAGE_IDS_STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}
