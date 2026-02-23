'use client'

import { useCallback } from 'react'
import { getPipelinesWithStages } from '@/lib/supabase/leadOperations'
import { invalidateVanzariCache } from '@/lib/supabase/vanzariApeluri'

const CACHE_DURATION = 5 * 60 * 1000 // 5 minute

interface CachedData {
  data: any[]
  timestamp: number
}

let globalCache: CachedData | null = null
let globalFetchPromise: Promise<any> | null = null

export function usePipelinesCache() {
  const getPipelines = useCallback(async (forceRefresh = false): Promise<any[]> => {
    const now = Date.now()

    // Verifică cache-ul
    if (!forceRefresh && globalCache && (now - globalCache.timestamp) < CACHE_DURATION) {
      return globalCache.data
    }

    // Dacă există deja un fetch în progres, așteaptă-l
    if (globalFetchPromise) {
      return globalFetchPromise
    }

    // Fetch nou
    globalFetchPromise = getPipelinesWithStages().then(({ data, error }) => {

      if (error) throw error
      if (data) {
        globalCache = { data, timestamp: now }
      }
      return data || []
    }).finally(() => {
      globalFetchPromise = null
    })

    return globalFetchPromise
  }, [])

  const invalidateCache = useCallback(() => {
    globalCache = null
    globalFetchPromise = null
    invalidateVanzariCache()
  }, [])

  return { getPipelines, invalidateCache, cachedData: globalCache?.data }
}

