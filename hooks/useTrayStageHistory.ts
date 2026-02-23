'use client'

/**
 * Hook React pentru obținerea și gestionarea istoricului de stage-uri al unei tăvițe.
 * 
 * Acest hook oferă o interfață simplă pentru a obține și gestiona istoricul complet
 * al mutărilor unei tăvițe între stage-uri, cu suport pentru paginare, auto-refresh
 * și gestionare corectă a lifecycle-ului.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getTrayStageHistory,
  getTrayCurrentStage,
  getTrayStageHistoryStats,
} from '@/lib/supabase/trayStageOperations'
import type {
  TrayStageHistoryWithDetails,
  UseTrayStageHistoryOptions,
  UseTrayStageHistoryResult,
  GetTrayCurrentStageResult,
  TrayStageHistoryStats,
} from '@/lib/types/database'

/**
 * Hook React pentru obținerea și gestionarea istoricului de stage-uri al unei tăvițe.
 * 
 * @param options - Opțiuni pentru hook (trayId, pipelineId, autoRefresh, refreshInterval, limit)
 * @returns Obiect cu istoricul, stage-ul curent, statistici și funcții de control
 * 
 * @example
 * ```typescript
 * const { history, currentStage, stats, loading, refresh, loadMore, hasMore } = useTrayStageHistory({
 *   trayId: 'tray-123',
 *   pipelineId: 'pipeline-456',
 *   autoRefresh: true,
 *   refreshInterval: 30000,
 *   limit: 20
 * })
 * ```
 */
export function useTrayStageHistory(
  options: UseTrayStageHistoryOptions
): UseTrayStageHistoryResult {
  const {
    trayId,
    pipelineId,
    autoRefresh = false,
    refreshInterval = 30000, // 30 secunde default
    limit = 20,
  } = options

  const [history, setHistory] = useState<TrayStageHistoryWithDetails[]>([])
  const [currentStage, setCurrentStage] = useState<GetTrayCurrentStageResult['data']>(null)
  const [stats, setStats] = useState<TrayStageHistoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Ref pentru a preveni infinite loop în useEffect
  const refreshRef = useRef<() => Promise<void>>()
  const cancelledRef = useRef(false)

  // Funcție pentru încărcarea istoricului (cu cleanup pentru request-uri)
  const loadHistory = useCallback(async (reset = false) => {
    if (!trayId) {
      setHistory([])
      setError(null)
      setHasMore(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    cancelledRef.current = false

    try {
      const currentOffset = reset ? 0 : offset
      const result = await getTrayStageHistory({
        trayId,
        pipelineId: pipelineId || undefined,
        limit,
        offset: currentOffset,
      })

      // Verifică dacă request-ul a fost anulat (componenta s-a unmount)
      if (cancelledRef.current) return

      if (result.error) {
        setError(result.error)
        setHistory([])
        setHasMore(false)
      } else {
        if (reset) {
          setHistory(result.data)
          setOffset(result.data.length)
        } else {
          setHistory(prev => [...prev, ...result.data])
          setOffset(prev => prev + result.data.length)
        }
        
        // Corectare: hasMore = count > offset + data.length (nu doar data.length === limit)
        const totalCount = result.count || 0
        const newOffset = reset ? result.data.length : offset + result.data.length
        setHasMore(newOffset < totalCount)
      }
    } catch (err) {
      if (cancelledRef.current) return
      setError(err)
      setHistory([])
      setHasMore(false)
    } finally {
      if (!cancelledRef.current) {
        setLoading(false)
      }
    }
  }, [trayId, pipelineId, offset, limit])

  // Funcție pentru refresh complet
  const refresh = useCallback(async () => {
    if (!trayId) {
      setHistory([])
      setCurrentStage(null)
      setStats(null)
      setError(null)
      setLoading(false)
      setOffset(0)
      setHasMore(false)
      return
    }

    setLoading(true)
    setError(null)
    cancelledRef.current = false

    try {
      // Reîncarcă istoricul
      setOffset(0)
      const historyResult = await getTrayStageHistory({
        trayId,
        pipelineId: pipelineId || undefined,
        limit,
        offset: 0,
      })

      // Verifică dacă request-ul a fost anulat
      if (cancelledRef.current) return

      if (historyResult.error) {
        setError(historyResult.error)
        setHistory([])
        setHasMore(false)
      } else {
        setHistory(historyResult.data)
        setOffset(historyResult.data.length)
        
        const totalCount = historyResult.count || 0
        setHasMore(historyResult.data.length < totalCount)
      }

      // Reîncarcă și currentStage și stats
      const [currentStageResult, statsResult] = await Promise.all([
        getTrayCurrentStage(trayId),
        getTrayStageHistoryStats(trayId),
      ])

      // Verifică din nou dacă request-ul a fost anulat
      if (cancelledRef.current) return

      if (!currentStageResult.error) {
        setCurrentStage(currentStageResult.data)
      }
      if (!statsResult.error) {
        setStats(statsResult.data)
      }
    } catch (err) {
      if (cancelledRef.current) return
      setError(err)
      setHistory([])
      setCurrentStage(null)
      setStats(null)
      setHasMore(false)
    } finally {
      if (!cancelledRef.current) {
        setLoading(false)
      }
    }
  }, [trayId, pipelineId, limit])

  // Actualizează refreshRef când refresh se schimbă
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  // Încărcare inițială când trayId sau pipelineId se schimbă
  useEffect(() => {
    if (!trayId) {
      setHistory([])
      setCurrentStage(null)
      setStats(null)
      setError(null)
      setLoading(false)
      setOffset(0)
      setHasMore(false)
      return
    }

    // Folosește refreshRef pentru a evita infinite loop
    refreshRef.current()
  }, [trayId, pipelineId]) // ← Nu include refresh în dependențe

  // Auto-refresh (dacă este activat)
  useEffect(() => {
    if (!autoRefresh || !trayId) return

    const interval = setInterval(() => {
      refreshRef.current() // ← Folosește refreshRef
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, trayId]) // ← Nu include refresh în dependențe

  // Cleanup la unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true
    }
  }, [])

  // Funcție pentru loadMore
  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !trayId) return
    await loadHistory(false)
  }, [loading, hasMore, trayId, loadHistory])

  return {
    history,
    currentStage,
    stats,
    loading,
    error,
    refresh,
    loadMore,
    hasMore,
  }
}
