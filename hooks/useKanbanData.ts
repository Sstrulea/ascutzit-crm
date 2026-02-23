'use client'

import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getKanbanItems, getSingleKanbanItem, moveItemToStage, addTrayToPipeline, getPipelineItemForItem, getPipelineIdForItem, tryMoveLeadsToArhivatIfAllFacturateBatch } from '@/lib/supabase/pipelineOperations'
import type { PipelineItemType } from '@/lib/supabase/pipelineOperations'
import { usePipelinesCache } from './usePipelinesCache'
import { getKanbanCache, setKanbanCache, invalidateKanbanCacheForPipeline, kanbanCacheKey } from '@/lib/supabase/kanban/kanbanCache'
import { isDepartmentPipelineSlug } from '@/lib/supabase/kanban/departmentCache'
import type { KanbanLead } from '../lib/types/database'
import type { Tag } from '@/lib/supabase/tagOperations'
import { useRole, useAuth } from '@/lib/contexts/AuthContext'
import { logItemEvent, getTrayDetails, getTechnicianDetails, getUserDetails, getPipelineStageDetails, updateLead } from '@/lib/supabase/leadOperations'
import { isApelMove, recordVanzariApel } from '@/lib/supabase/vanzariApeluri'
import { withRetry, fetchWithRetry } from '@/lib/utils/networkRetry'
import { toast } from 'sonner'

const supabase = supabaseBrowser()
const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, '-')

// Helper pentru a determina tipul item-ului pe baza proprietăților lead-ului
function getItemType(lead: KanbanLead): PipelineItemType {
  const leadAny = lead as any
  if (leadAny.type) return leadAny.type as PipelineItemType
  if (leadAny.isFisa || leadAny.fisaId) return 'service_file'
  if (leadAny.isQuote || leadAny.quoteId) return 'tray'
  return 'lead'
}

// Helper pentru a obține item_id-ul corect
function getItemId(lead: KanbanLead): string {
  const leadAny = lead as any
  // Pentru service_file sau tray, item_id este id-ul propriu-zis (lead.id)
  // Pentru lead, item_id este leadId (sau id dacă leadId nu există)
  if (leadAny.type === 'service_file' || leadAny.type === 'tray') {
    return lead.id // Pentru service_file/tray, folosim id-ul cardului
  }
  if (leadAny.isFisa) return lead.id // service_file id
  if (leadAny.isQuote) return lead.id // tray id
  return lead.leadId || lead.id
}

export type UseKanbanDataOptions = {
  /**
   * Dacă e true, nu facem auto-refresh la revenirea pe tab (visibilitychange).
   * Folosit când există un item deschis în panel/sheet – utilizatorul vrea să rămână deschis.
   */
  skipAutoRefreshOnVisible?: boolean
}

export function useKanbanData(pipelineSlug?: string, options?: UseKanbanDataOptions) {
  const skipAutoRefreshOnVisibleRef = useRef<boolean>(!!options?.skipAutoRefreshOnVisible)
  useEffect(() => {
    skipAutoRefreshOnVisibleRef.current = !!options?.skipAutoRefreshOnVisible
  }, [options?.skipAutoRefreshOnVisible])
  const [leads, setLeads] = useState<KanbanLead[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [pipelines, setPipelines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isDepartmentPipelineState, setIsDepartmentPipelineState] = useState(false)

  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(null)
  const { getPipelines, invalidateCache } = usePipelinesCache()
  /** Cache pipelines cu stages – folosit la mutare fără call suplimentar (getPipelines). */
  const pipelinesRef = useRef<any[] | null>(null)
  const { role } = useRole()
  const { user, loading: authLoading } = useAuth()
  /** Auth + role sunt gata; load-ul Kanban pornește doar când authReady e true (evită 4–12 rulări la schimbări user/role). */
  const authReady = !authLoading

  // Obține ID-ul utilizatorului curent pentru filtrarea tăvițelor în pipeline-urile departament
  useEffect(() => {
    if (user?.id) {
      setCurrentUserId(user.id)
    } else {
      setCurrentUserId(null)
    }
  }, [user])
  
  // Throttle expire-callbacks (Vânzări): max 1× / 2 min – plan-optimizare-vanzari-calluri.md
  const lastExpireCallbacksRef = useRef<number>(0)
  const EXPIRE_CALLBACKS_THROTTLE_MS = 2 * 60 * 1000
  // Arhivare Vânzări: ref pentru a nu rula două arhivări în paralel
  const archiveInProgressRef = useRef(false)
  /** Cheia cache-ului Kanban pentru pipeline-ul curent – folosită la visibilitychange ca să nu facem refresh dacă avem date proaspete. */
  const currentCacheKeyRef = useRef<string | null>(null)

  // Debounce helper pentru refresh-uri - OPTIMIZAT
  // Reduce timeout-ul și adaugă protecție împotriva refresh-urilor simultane
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const isRefreshingRef = useRef(false)
  const debouncedRefresh = useCallback(() => {
    // Previne refresh-uri simultane - dacă un refresh este deja în curs, ignoră
    if (isRefreshingRef.current) {
      return
    }
    
    // Curăță timeout-ul anterior dacă există
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    
    // Setează noul timeout cu timp redus pentru răspuns mai rapid
    debounceRef.current = setTimeout(() => {
      isRefreshingRef.current = true
      loadDataRef.current().finally(() => {
        isRefreshingRef.current = false
      })
    }, 300) // Redus de la 1000ms la 300ms pentru răspuns mai rapid
  }, [])

  const patchLeadTags = useCallback((leadId: string, tags: Tag[]) => {
    setLeads(prev => prev.map(l => {
      const match = l.id === leadId || (l as any).leadId === leadId
      return match ? { ...l, tags: tags as any } : l
    }))
  }, [])

  /** Actualizare optimistă pentru Preia/Eliberează – fără refresh complet. */
  const patchLeadClaim = useCallback((leadId: string, claimedBy: string | null, claimedByName?: string | null) => {
    setLeads(prev => prev.map(l => {
      const match = l.id === leadId || (l as any).leadId === leadId
      return match ? { ...l, claimed_by: claimedBy, claimed_by_name: claimedByName ?? null } as any : l
    }))
  }, [])

  /** Actualizare optimistă la eliminare Curier Trimis / Office Direct – badge-urile dispar live. */
  const patchLeadDeliveryClear = useCallback((leadId: string) => {
    setLeads(prev => prev.map(l => {
      const match = l.id === leadId || (l as any).leadId === leadId
      return match
        ? { ...l, curier_trimis_at: null, curier_trimis_user_id: null, office_direct_at: null, office_direct_user_id: null } as any
        : l
    }))
  }, [])

  const handlePinToggle = useCallback((leadId: string, isPinned: boolean) => {
    // OPTIMISTIC UPDATE: Actualizează UI-ul imediat
    setLeads(prev => prev.map(l => {
      if (l.id !== leadId) return l
      
      // actualizeaza tag-urile: adauga sau elimina tag-ul PINNED
      const currentTags = Array.isArray(l?.tags) ? l.tags : []
      
      if (!Array.isArray(currentTags)) {
        console.error('❌ [useKanbanData] ERROR: currentTags is NOT an array!', currentTags)
        return l
      }
      
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let hasPinnedTag = false
      for (let i = 0; i < currentTags.length; i++) {
        const tag = currentTags[i]
        if (tag && tag.name === 'PINNED') {
          hasPinnedTag = true
          break
        }
      }
      
      if (isPinned && !hasPinnedTag) {
        // adauga tag-ul PINNED (va fi adaugat de server, dar actualizam local pentru UI instant)
        return { ...l, tags: [...currentTags, { id: 'temp-pinned', name: 'PINNED', color: 'blue' as any }] }
      } else if (!isPinned && hasPinnedTag) {
        // elimina tag-ul PINNED
        return { ...l, tags: currentTags.filter(tag => tag.name !== 'PINNED') }
      }
      
      return l
    }))
    
    // Real-time subscription pentru lead_tags va actualiza automat tag-urile
    // Nu mai e nevoie de refresh complet!
  }, [])

  const LOAD_TIMEOUT_MS = 30000

  const loadData = useCallback(async (forceRefresh = false) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    try {
      setLoading(true)
      setError(null)
      timeoutId = setTimeout(() => {
        setLoading(false)
        setError('Încărcarea a durat prea mult. Poți schimba pipeline-ul sau apăsa Reîncearcă.')
      }, LOAD_TIMEOUT_MS)

      // Folosește cache pentru pipelines; retry la erori de rețea
      const pipelinesData = await withRetry(
        () => getPipelines(),
        { maxAttempts: 3, delayMs: 1500, backoffMultiplier: 2 }
      )
      if (!pipelinesData) throw new Error('Failed to load pipelines')
      pipelinesRef.current = pipelinesData

      if (!Array.isArray(pipelinesData)) {
        console.error('❌ [useKanbanData] ERROR: pipelinesData is NOT an array!', pipelinesData)
        throw new Error('pipelinesData is not an array')
      }

      setPipelines(pipelinesData.map((p: any) => p?.name || ''))

      const currentPipeline = pipelineSlug
        ? pipelinesData.find((p: any) => toSlug(p.name) === pipelineSlug)
        : pipelinesData?.[0]
      
        if (currentPipeline) {
          setCurrentPipelineId(currentPipeline.id)
          
          // Protecție: verifică dacă stages este un array înainte de a apela .map()
          const stagesArray = Array.isArray(currentPipeline.stages) ? currentPipeline.stages : []
          const isVanzari = toSlug(currentPipeline.name) === 'vanzari'
          // Toate stage-urile sunt afișate mereu (inclusiv Avem Comanda, Curier trimis)
          setStages(stagesArray.map((s: any) => s?.name || ''))
          // IMPORTANT: păstrăm maparea completă stage_id -> stage name (inclusiv stage-uri ascunse),
          // ca să putem calcula corect quick filter counts și să mapăm Realtime updates.
          stageIdToNameRef.current = Object.fromEntries(stagesArray.map((s: any) => [s.id, s?.name || '']))
          
          const isReceptie = toSlug(currentPipeline.name) === 'receptie'
          const currentPipelineNameSlug = toSlug(currentPipeline.name)
          const isQualityPipeline = currentPipelineNameSlug.includes('quality')
          const departmentPipelines = ['Saloane', 'Horeca', 'Frizerii', 'Reparatii']
          isReceptieRef.current = isReceptie
          receptieDeptPipelineIdsRef.current = isReceptie && Array.isArray(pipelinesData)
            ? pipelinesData
                .filter((p: any) => p?.name && departmentPipelines.includes(p.name))
                .map((p: any) => p.id)
            : []

          if (!Array.isArray(departmentPipelines)) {
            console.error('❌ [useKanbanData] ERROR: departmentPipelines is NOT an array!', departmentPipelines)
            setIsDepartmentPipelineState(false)
            return
          }
          
          // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
          let isDepartmentPipeline = false
          for (let i = 0; i < departmentPipelines.length; i++) {
            const dept = departmentPipelines[i]
            if (currentPipelineNameSlug === toSlug(dept)) {
              isDepartmentPipeline = true
              break
            }
          }
          const isAdminOrOwner = role === 'admin' || role === 'owner'
          setIsDepartmentPipelineState(isDepartmentPipeline)
          let allLeads: KanbanLead[] = []
        
          // Toate pipeline-urile folosesc acum getKanbanItems care suportă leads, service_files și trays
          // Pipeline-uri departament (Saloane, Horeca, Frizerii, Reparatii) - afișează trays
          // Pipeline Receptie - afișează service_files
          // Pipeline Curier - afișează service_files
          // Alte pipeline-uri (Vanzari etc) - afișează leads
          // Pentru pipeline-urile departament, pasăm currentUserId pentru filtrarea tăvițelor
          // DAR NU pentru admin / owner care trebuie să vadă toate tăvițele
          // IMPORTANT: Folosim user?.id direct pentru a evita race condition cu useEffect
          const userIdForFilter = isDepartmentPipeline && !isAdminOrOwner 
            ? (user?.id || currentUserId || undefined)
            : undefined
          
          // IMPORTANT: Pentru pipeline-uri departament, așteptăm ca user să fie încărcat
          // Altfel vom primi eroare "currentUserId lipsește pentru utilizator non-admin"
          if (isDepartmentPipeline && !isAdminOrOwner && !userIdForFilter) {
            console.log('[useKanbanData] Așteptăm încărcarea user-ului pentru pipeline departament...')
            setLeads([])
            setLoading(true)
            return // Ieșim și așteptăm următorul apel când user va fi disponibil
          }
          
          // Cache Kanban unificat: Receptie, Vânzări, Departamente, Quality Check – același pattern
          const useCache = isReceptie || isVanzari || isDepartmentPipeline || isQualityPipeline
          const cacheKey = useCache ? kanbanCacheKey(currentPipeline.id, userIdForFilter) : ''
          currentCacheKeyRef.current = cacheKey || null
          if (useCache && !forceRefresh && cacheKey) {
            const cached = getKanbanCache(cacheKey)
            if (cached && Array.isArray(cached.payload.items)) {
              allLeads = cached.payload.items as any[]
              setLeads(allLeads)
              setLoading(false)
              setError(null)
              if (cached.source === 'session') {
                setTimeout(() => loadDataRef.current?.(true), 100)
              }
              return
            }
          }

          console.log('[useKanbanData] Apelare getKanbanItems:', {
            pipelineId: currentPipeline.id,
            pipelineName: currentPipeline.name,
            userIdForFilter,
            currentUserId,
            user_id: user?.id,
            isAdminOrOwner,
            isDepartmentPipeline
          })

          // On-access: expirare Call Back / Nu răspunde → fire-and-forget (nu blochează prima încărcare); timeout ca să nu rămână (pending)
          if (isVanzari) {
            const now = Date.now()
            if (now - lastExpireCallbacksRef.current >= EXPIRE_CALLBACKS_THROTTLE_MS) {
              lastExpireCallbacksRef.current = now
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 15000)
              fetchWithRetry('/api/leads/expire-callbacks', { method: 'POST', credentials: 'include', signal: controller.signal }, { maxAttempts: 2, delayMs: 2000 })
                .finally(() => clearTimeout(timeoutId))
                .catch((e) => {
                  if (process.env.NODE_ENV === 'development') {
                    console.warn('[useKanbanData] expire-callbacks background task failed:', e)
                  }
                })
            }
          }

          const userIdForContext = userIdForFilter ?? user?.id ?? currentUserId ?? undefined
          
          // Verificare: pipelineId trebuie să fie definit
          if (!currentPipeline.id) {
            throw new Error('Pipeline ID is undefined or null')
          }
          
          const { data: itemsData, error: itemsError } = await withRetry(
            () => getKanbanItems(currentPipeline.id, userIdForContext, isAdminOrOwner),
            { maxAttempts: 3, delayMs: 1500, backoffMultiplier: 2 }
          )
          
          if (itemsError) {
            // Logging detaliat pentru eroarea din getKanbanItems
            console.error('[useKanbanData] getKanbanItems error:', {
              pipelineId: currentPipeline.id,
              pipelineName: currentPipeline.name,
              userIdForContext,
              isAdminOrOwner,
              error: itemsError,
              errorMessage: itemsError?.message,
              errorCode: itemsError?.code,
              errorDetails: itemsError?.details,
              errorStatus: itemsError?.status,
              errorHint: itemsError?.hint,
            })
            throw itemsError
          }
          allLeads = (itemsData || []) as any[]
          if (useCache && cacheKey) {
            setKanbanCache(cacheKey, allLeads)
          }

          // First paint: afișăm lista imediat
          setLeads(allLeads)

          // În Vânzări: arhivare după first paint (plan-optimizare-vanzari-calluri.md) – în background, fără blocare
          if (isVanzari) {
            const pipelineIdForArchive = currentPipeline.id
            const runArhivare = async () => {
              if (archiveInProgressRef.current) return
              archiveInProgressRef.current = true
              try {
                const leadIdsToCheck: string[] = []
                for (const item of allLeads as any[]) {
                  const isLead = !item?.isFisa && !item?.isQuote && (item?.type === 'lead' || (!item?.type && item?.leadId))
                  if (!isLead) continue
                  const stageName = (item?.stage || '').toLowerCase()
                  if (stageName.includes('arhivat') || stageName.includes('arhiva')) continue
                  const leadId = item?.leadId || item?.id
                  if (leadId) leadIdsToCheck.push(leadId)
                }
                if (leadIdsToCheck.length > 0) {
                  const { movedCount } = await tryMoveLeadsToArhivatIfAllFacturateBatch(leadIdsToCheck)
                  if (movedCount > 0) {
                    const { data: refreshed } = await getKanbanItems(pipelineIdForArchive, userIdForFilter ?? user?.id ?? currentUserId ?? undefined, isAdminOrOwner)
                    const refreshedLeads = (refreshed || []) as any[]
                    setLeads(refreshedLeads)
                  }
                }
              } catch (_) {}
              finally {
                archiveInProgressRef.current = false
              }
            }
            runArhivare()
          }
      } else {
        currentCacheKeyRef.current = null
        setCurrentPipelineId(null)
        setStages([])
        setLeads([])
      }

      setError(null)
    } catch (err: any) {
      // Extract error message from various possible structures
      const msg = err?.message ?? err?.error?.message ?? (typeof err === 'string' ? err : 'Failed to load data')
      const code = err?.code ?? err?.error?.code
      const details = err?.details ?? err?.error?.details
      const errStr = typeof err?.toString === 'function' ? err.toString() : String(err)
      const stack = err?.stack ?? err?.error?.stack
      
      console.error('[useKanbanData] loadData failed:', msg, {
        message: msg,
        code,
        details,
        hint: (err as any)?.hint,
        string: errStr,
        ...(stack && { stack: stack.slice(0, 500) }),
      })
      
      // Improved error object logging for development
      if (process.env.NODE_ENV === 'development' && err && typeof err === 'object') {
        try {
          const keys = Object.getOwnPropertyNames(err).filter(k => !/^_|^stack$/.test(k))
          if (keys.length) {
            // Build error object manually to handle non-enumerable properties
            const errObj: Record<string, any> = {}
            keys.forEach(k => {
              try {
                errObj[k] = (err as any)[k]
              } catch (_) {
                errObj[k] = '[unable to access]'
              }
            })
            console.error('[useKanbanData] err keys:', keys, errObj)
          }
        } catch (logErr) {
          console.error('[useKanbanData] error logging failed:', logErr instanceof Error ? logErr.message : String(logErr))
        }
      }
      setError(msg)
    } finally {
      if (timeoutId != null) clearTimeout(timeoutId)
      setLoading(false)
    }
  }, [pipelineSlug, getPipelines, currentUserId, role, user])

  // keep ref to latest load function for use inside effects/callbacks
  const loadDataRef = useRef(loadData)
  useEffect(() => { loadDataRef.current = loadData }, [loadData])

  // Mutare pe acest tab: sărim getSingleKanbanItem la realtime UPDATE (avem deja update optimist) → ~3–5 requesturi mai puțin per mutare
  const lastMovedItemIdRef = useRef<string | null>(null)
  const lastMovedAtRef = useRef<number>(0)
  const MOVE_DEBOUNCE_MS = 2000
  // Map stage_id -> stage name pentru actualizare Realtime fără getSingleKanbanItem (0 call-uri)
  const stageIdToNameRef = useRef<Record<string, string>>({})
  // Receptie: când suntem pe Receptie, subscriem la pipeline_items din departamente ca mutările tăvițelor să actualizeze board-ul în timp real
  const isReceptieRef = useRef(false)
  const receptieDeptPipelineIdsRef = useRef<string[]>([])

  // Pornire load o singură dată per (authReady, pipelineSlug, user/role pentru dept) – reduce 4–12 rulări la 1–2
  const prevLoadKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!authReady) return
    const deptSlugs = ['saloane', 'horeca', 'frizerii', 'reparatii']
    const isDept = pipelineSlug && deptSlugs.includes(toSlug(pipelineSlug))
    const deptAuth = isDept ? (user?.id ?? role ?? '') : ''
    const loadKey = `${pipelineSlug ?? ''}-${deptAuth}`
    if (prevLoadKeyRef.current === loadKey) return
    prevLoadKeyRef.current = loadKey
    loadDataRef.current()
  }, [authReady, pipelineSlug, user?.id, role])

  // La revenirea conexiunii (online): reîncarcă datele ca să preluăm tot ce nu s-a putut încărca
  useEffect(() => {
    const onOnline = () => {
      if (currentPipelineId) invalidateKanbanCacheForPipeline(currentPipelineId)
      loadDataRef.current?.()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [currentPipelineId])

  // Refresh: invalidăm cache pentru pipeline-ul curent apoi reîncărcăm (cache unificat)
  const refresh = useCallback(() => {
    if (currentPipelineId) invalidateKanbanCacheForPipeline(currentPipelineId)
    loadDataRef.current()
  }, [currentPipelineId])

  useEffect(() => {
    if (!currentPipelineId) return

    const ch = supabase.channel('kanban-rt')

    // Pentru schimbări structurale (pipelines, stages) - invalidate cache și refresh
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pipelines' },
      () => {
        try {
          invalidateCache()
          void loadDataRef.current?.()?.catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in (err as object) ? String((err as any).message) : String(err))
            console.error('[useKanbanData] Realtime pipelines loadData:', msg)
          })
        } catch (err) {
          console.error('[useKanbanData] Realtime pipelines:', err instanceof Error ? err.message : err)
        }
      }
    )

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stages', filter: `pipeline_id=eq.${currentPipelineId}` },
      () => {
        try {
          invalidateCache()
          void loadDataRef.current?.()?.catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in (err as object) ? String((err as any).message) : String(err))
            console.error('[useKanbanData] Realtime stages loadData:', msg)
          })
        } catch (err) {
          console.error('[useKanbanData] Realtime stages:', err instanceof Error ? err.message : err)
        }
      }
    )

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tags' },
      () => {
        try {
          debouncedRefresh()
        } catch (err) {
          console.error('[useKanbanData] Realtime tags:', err instanceof Error ? err.message : err)
        }
      }
    )

    // INCREMENTAL UPDATES pentru pipeline_items (noua arhitectură)
    ch.on(
      'postgres_changes',
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'pipeline_items',
        filter: `pipeline_id=eq.${currentPipelineId}`
      },
      async (payload) => {
        try {
          const newItem = payload.new as any
          if (newItem?.pipeline_id) invalidateKanbanCacheForPipeline(newItem.pipeline_id)
          const itemType = newItem.type as PipelineItemType
          const tryFetch = async (): Promise<{ data: any; error: any }> => getSingleKanbanItem(itemType, newItem.item_id, currentPipelineId)
          let { data: newKanbanItem, error } = await tryFetch()
          if (error && itemType === 'lead') {
            await new Promise(r => setTimeout(r, 350))
            const retry = await tryFetch()
            newKanbanItem = retry.data
            error = retry.error
          }
          if (!error && newKanbanItem) {
            setLeads(prev => {
              if (prev.find(l => l.id === newKanbanItem.id)) return prev
              return [...prev, newKanbanItem as any]
            })
          } else if (error) {
            debouncedRefresh()
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err ? String((err as any).message) : String(err))
          console.error('[useKanbanData] Realtime pipeline_items INSERT:', msg, err)
          debouncedRefresh()
        }
      }
    )

    ch.on(
      'postgres_changes',
      { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'pipeline_items',
        filter: `pipeline_id=eq.${currentPipelineId}`
      },
      async (payload) => {
        try {
          const updatedItem = payload.new as any
          const itemId = updatedItem?.item_id
          const isOurOwnMove = itemId != null && lastMovedItemIdRef.current === itemId && (Date.now() - lastMovedAtRef.current) < MOVE_DEBOUNCE_MS
          if (isOurOwnMove) return
          const stageName = stageIdToNameRef.current[updatedItem?.stage_id]
          if (stageName != null && itemId != null) {
            setLeads(prev => prev.map(l => l.id === itemId ? { ...l, stageId: updatedItem.stage_id, stage: stageName } : l))
            return
          }
          const itemType = (updatedItem?.type || 'lead') as PipelineItemType
          const { data: updatedKanbanItem, error } = await getSingleKanbanItem(itemType, updatedItem.item_id, currentPipelineId)
          if (!error && updatedKanbanItem) {
            setLeads(prev => prev.map(l => l.id === (updatedKanbanItem as any).id ? (updatedKanbanItem as any) : l))
          } else {
            setLeads(prev => prev.filter(l => l.id !== updatedItem.item_id))
            invalidateKanbanCacheForPipeline(currentPipelineId)
            debouncedRefresh()
          }
        } catch (err) {
          console.error('[useKanbanData] Realtime pipeline_items UPDATE:', err instanceof Error ? err.message : err)
          invalidateKanbanCacheForPipeline(currentPipelineId)
          debouncedRefresh()
        }
      }
    )

    ch.on(
      'postgres_changes',
      { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'pipeline_items'
      },
      (payload) => {
        try {
          const deletedItem = payload.old as any
          if (deletedItem?.pipeline_id) invalidateKanbanCacheForPipeline(deletedItem.pipeline_id)
          setLeads(prev => prev.filter(l => l.id !== deletedItem.item_id))
        } catch (err) {
          console.error('[useKanbanData] Realtime pipeline_items DELETE:', err instanceof Error ? err.message : err)
        }
      }
    )

    // Receptie: când tehnicianul mută tăvița în departament, actualizăm live cardul fișei (stage) – fără getSingleKanbanItem, căci cardurile virtuale nu au rând în pipeline_items Receptie.
    const deptIds = receptieDeptPipelineIdsRef.current
    if (isReceptieRef.current && deptIds.length > 0) {
      deptIds.forEach((deptPipelineId) => {
        ch.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'pipeline_items',
            filter: `pipeline_id=eq.${deptPipelineId}`,
          },
          async (payload) => {
            try {
              const updated = payload.new as any
              if (updated?.type !== 'tray' || !updated?.item_id || !updated?.stage_id) return
              const trayId = updated.item_id
              const newStageId = updated.stage_id
              const [{ data: trayRow }, { data: stageRow }] = await Promise.all([
                supabase.from('trays').select('service_file_id').eq('id', trayId).maybeSingle(),
                supabase.from('stages').select('name').eq('id', newStageId).maybeSingle(),
              ])
              const serviceFileId = (trayRow as any)?.service_file_id
              const stageName = (stageRow as any)?.name
              if (!serviceFileId || !stageName) return
              setLeads(prev =>
                prev.map(l =>
                  l.id === serviceFileId ? { ...l, stageId: newStageId, stage: stageName } : l
                )
              )
            } catch (err) {
              console.error('[useKanbanData] Realtime Receptie dept UPDATE:', err instanceof Error ? err.message : err)
            }
          }
        )
      })
    }

    // Pentru stage_history - actualizează stage-ul și stageMovedAt când se mută un lead
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'stage_history' },
      async (payload) => {
        const payloadNew = payload.new as any
        if (!payloadNew?.to_stage_id || !currentPipelineId) return

        // Re-fetch lead-ul pentru a obține stage-ul actualizat
        try {
          // TODO: Trebuie determinat tipul item-ului și item_id corect
          const { data: updatedLead, error } = await getSingleKanbanItem('lead', payloadNew.lead_id, currentPipelineId)
          if (!error && updatedLead) {
            // Actualizează lead-ul cu stage-ul nou și stageMovedAt
            setLeads(prev => {
              const exists = prev.find(l => l.id === updatedLead.id)
              if (!exists) return prev
              return prev.map(l => 
                l.id === updatedLead.id 
                  ? { ...l, stage: updatedLead.stage, stageId: updatedLead.stageId, stageMovedAt: payloadNew.moved_at }
                  : l
              )
            })
          }
        } catch (err) {
          console.error('Error fetching lead after stage move:', err)
        }
      }
    )

    // Pentru lead_tags - actualizează doar tag-urile
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lead_tags' },
      async (payload) => {
        const payloadNew = payload.new as any
        const payloadOld = payload.old as any
        const leadId = payloadNew?.lead_id || payloadOld?.lead_id
        if (!leadId) return

        // Re-fetch tags pentru acest lead (nu verificăm dacă există, real-time va actualiza)
        try {
          const { data: tagRows } = await supabase
            .from('v_lead_tags')
            .select('lead_id,tags')
            .eq('lead_id', leadId)
            .maybeSingle()

          if (tagRows) {
            setLeads(prev => {
              const exists = prev.find(l => l.id === leadId)
              if (!exists) return prev
              return prev.map(l => 
                l.id === leadId ? { ...l, tags: (tagRows as any).tags as any } : l
              )
            })
          }
        } catch (err) {
          console.error('Error fetching tags:', err)
        }
      }
    )

    // Pentru tray_items – update incremental (un getSingleKanbanItem per tray) în loc de refresh complet
    if (isDepartmentPipelineState && currentPipelineId) {
      ch.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tray_items',
        },
        async (payload) => {
          const row = (payload as any).new ?? (payload as any).old
          const trayId = row?.tray_id
          if (!trayId || !currentPipelineId) return
          try {
            const { data: updated, error } = await getSingleKanbanItem('tray', trayId, currentPipelineId)
            if (error || !updated) {
              debouncedRefresh()
              return
            }
            setLeads(prev => {
              const exists = prev.find(l => l.id === (updated as any).id)
              if (!exists) return prev
              return prev.map(l => l.id === (updated as any).id ? (updated as any) : l)
            })
          } catch {
            debouncedRefresh()
          }
        }
      )
    }

    // Pentru modificări în leads table - actualizează doar lead-ul afectat
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'leads' },
      async (payload) => {
        const leadId = payload.new.id
        if (!currentPipelineId) return

        // Re-fetch lead-ul actualizat
        try {
          // TODO: Trebuie determinat tipul item-ului pe baza lead-ului existent
          // Pentru moment, căutăm lead-ul în lista curentă pentru a determina tipul
          const existingLead = leads.find(l => l.id === leadId)
          const itemType = existingLead ? getItemType(existingLead) : 'lead'
          const itemId = existingLead ? getItemId(existingLead) : leadId
          const { data: updatedLead, error } = await getSingleKanbanItem(itemType, itemId, currentPipelineId)
          if (!error && updatedLead) {
            setLeads(prev => {
              const exists = prev.find(l => l.id === updatedLead.id)
              if (!exists) return prev
              return prev.map(l => l.id === updatedLead.id ? (updatedLead as any) : l)
            })
          }
        } catch (err) {
          console.error('Error fetching updated lead:', err)
        }
      }
    )

    ch.subscribe((status, err) => {
      if (process.env.NODE_ENV === 'development' && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err)) {
        console.warn('[useKanbanData] Realtime subscription:', status, err)
      }
    })
    return () => { 
      // Cleanup: curăță timeout-ul și resetează flag-ul de refresh
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      isRefreshingRef.current = false
      supabase.removeChannel(ch) 
    }
  }, [currentPipelineId, debouncedRefresh, invalidateCache, isDepartmentPipelineState])

  // La revenire pe tab: NU facem refresh automat – evita pierderea datelor (cineva introduce date și refresh-ul șterge ce a scris / forțează refacerea acțiunilor).
  // Actualizările în timp real se fac doar prin Realtime (pipeline_items, etc.); refresh manual rămâne disponibil.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
      if (skipAutoRefreshOnVisibleRef.current) return
      // Fără debouncedRefresh() la revenire pe tab – nu mai refacem refresh automat.
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const handleLeadMove = useCallback(async (leadId: string, newStageName: string) => {
    setError(null)
    const lead = leads.find(l => l.id === leadId)
    if (!lead) return

    const previousLead = { ...lead }
    const previousStageName = previousLead.stage?.toLowerCase() || ''

    // Folosește cache (ref) – fără call la mutare; doar dacă ref e gol (înainte de primul load)
    let pipelinesDataToUse = pipelinesRef.current
    if (!pipelinesDataToUse?.length) {
      pipelinesDataToUse = await getPipelines()
      if (pipelinesDataToUse?.length) pipelinesRef.current = pipelinesDataToUse
    }
    
    const leadAny = lead as any
    const isInReceptie = pipelineSlug === 'receptie'
    const hasOriginalPipeline = !!leadAny.originalPipelineId
    const newStageNameLower = newStageName.toLowerCase()
    
    // Blochează mutarea în stage-urile restricționate în Receptie
    if (isInReceptie) {
      const restrictedStages = ['facturat', 'facturată', 'in asteptare', 'în așteptare', 'in lucru', 'în lucru']
      
      if (!Array.isArray(restrictedStages)) {
        console.error('❌ [useKanbanData] ERROR: restrictedStages is NOT an array!', restrictedStages)
        return
      }
      
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      let isRestricted = false
      for (let i = 0; i < restrictedStages.length; i++) {
        const restricted = restrictedStages[i]
        if (newStageNameLower.includes(restricted)) {
          isRestricted = true
          break
        }
      }
      if (isRestricted) {
        return // Nu permite mutarea în stage-uri restricționate
      }
    }
    
    // Pentru carduri de tip tray sau service_file
    if (leadAny.isQuote || leadAny.isFisa) {
      // Găsește pipeline-ul curent
      const currentPipeline = pipelinesDataToUse.find((p: any) => p.id === lead.pipelineId)
      if (!currentPipeline) return
      
      const newStage = currentPipeline.stages.find((s: any) => s.name === newStageName)
      if (!newStage) return

      // Verifică dacă este o tăviță în pipeline-urile departamentelor
      const isTrayInDeptPipeline = leadAny.type === 'tray' && 
        ['Saloane', 'Frizerii', 'Horeca', 'Reparatii'].includes(currentPipeline.name)
      
      // Verifică dacă se mută din "Noua" în "In Lucru"
      // IMPORTANT: Folosește previousStageName care a fost setat la începutul funcției, înainte de optimistic update
      const isMovingFromNoua = previousStageName.includes('noua') || previousStageName.includes('nouă') || previousStageName.includes('new')
      const isMovingToInLucru = newStageNameLower.includes('lucru') || newStageNameLower.includes('work') || newStageNameLower.includes('progress')
      const shouldAssignTechnician = isTrayInDeptPipeline && isMovingFromNoua && isMovingToInLucru
      
      // Dacă este tăviță în pipeline-urile departamentelor, permite mutarea efectivă
      if (isTrayInDeptPipeline) {
        // OPTIMISTIC UPDATE: Actualizează UI-ul imediat pentru feedback vizual
        // IMPORTANT: Acest update se face DUPĂ ce am calculat previousStageName
        setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, stage: newStageName, stageId: newStage.id } : l)))
        const trayItemId = getItemId(lead)
        lastMovedItemIdRef.current = trayItemId
        lastMovedAtRef.current = Date.now()
        try {
          const itemType = getItemType(lead)
          const itemId = trayItemId
          
          // Verifică dacă există deja un pipeline_item în pipeline-ul curent
          const { data: existingPipelineItem } = await getPipelineItemForItem(itemType, itemId, lead.pipelineId)
          
          if (!existingPipelineItem) {
            // Dacă nu există, creează un pipeline_item nou în pipeline-ul curent
            const { data: newPipelineItem, error: addError } = await addTrayToPipeline(itemId, lead.pipelineId, newStage.id)
            if (addError) {
              throw addError
            }
          } else {
            // Dacă există, actualizează stage-ul
            const { error } = await moveItemToStage(itemType, itemId, lead.pipelineId, newStage.id)
            if (error) {
              throw error
            }
          }
          
          // Dacă se mută din "Noua" în "In Lucru", atribuie tehnicianul curent întregii tăvițe (trays.technician_id)
          if (shouldAssignTechnician && currentUserId) {
            const { error: updateTrayError } = await (supabase as any)
              .from('trays')
              .update({ technician_id: currentUserId } as any)
              .eq('id', itemId)
            if (updateTrayError) {
              console.error('⚠️ Eroare la atribuirea tăviței:', updateTrayError)
            } else {
              try {
                const currentUserOption = user ? { id: user.id, email: user.email ?? null } : undefined
                const [trayDetails, technicianDetails, currentUserDetails] = await Promise.all([
                  getTrayDetails(itemId),
                  getTechnicianDetails(currentUserId, { currentUser: currentUserOption }),
                  getUserDetails(currentUserId, { currentUser: currentUserOption }),
                ])
                const trayLabel = trayDetails
                  ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
                  : 'nesemnată'
                let pipelineForLog = trayDetails?.pipeline
                const leadAny = previousLead as any
                if ((!pipelineForLog?.name || pipelineForLog.name === 'Pipeline necunoscut') && leadAny?.pipelineId) {
                  const { pipeline } = await getPipelineStageDetails(leadAny.pipelineId, newStage.id)
                  if (pipeline) pipelineForLog = pipeline
                }
                await logItemEvent(
                  'tray',
                  itemId,
                  `Tehnician "${technicianDetails?.name || 'user necunoscut'}" a luat tăvița "${trayLabel}" în lucru`,
                  'technician_assigned',
                  {},
                  {
                    tray: trayDetails ? { id: trayDetails.id, number: trayDetails.number, status: trayDetails.status, service_file_id: trayDetails.service_file_id } : undefined,
                    technician: technicianDetails ? { id: technicianDetails.id, name: technicianDetails.name, email: technicianDetails.email } : undefined,
                    pipeline: pipelineForLog || undefined,
                    stage: trayDetails?.stage || undefined,
                    user: currentUserDetails || undefined,
                  },
                  { currentUserId: user?.id ?? undefined, currentUserName: user?.email?.split('@')[0] ?? null, currentUserEmail: user?.email ?? null }
                )
              } catch (logError) {
                console.error('[useKanbanData] Error logging technician assignment:', logError)
              }
            }
            // [FOST: atribuire per serviciu – acum tehnicianul se atribuie la nivel de tăviță]
            // await supabase.from('tray_items').update({ technician_id: currentUserId }).eq('tray_id', itemId).is('technician_id', null)
          }
          
          // Real-time subscription va actualiza automat când se salvează în baza de date
        } catch (err) {
          setLeads(prev => prev.map(l => (l.id === leadId ? previousLead : l)))
          setError('Failed to move tray')
          console.error('Eroare la mutarea tăviței:', err)
          throw err instanceof Error ? err : new Error('Mutarea tăviței a eșuat')
        }
        return
      }
      
      // Pentru alte cazuri (service_files sau tăvițe în alte pipeline-uri), doar update vizual
      // OPTIMISTIC UPDATE: Actualizează UI-ul imediat pentru feedback vizual
      setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, stage: newStageName, stageId: newStage.id } : l)))
      
      // Pentru tăvițe/service_files în alte pipeline-uri, mutarea este doar vizuală
      return
    }
    
    // Dacă suntem în Receptie, lead-ul vine din alt departament, și se mută din "Confirmari" în "In Lucru"
    if (isInReceptie && hasOriginalPipeline && 
        previousStageName.includes('confirmari') && 
        (newStageNameLower.includes('lucru') || newStageNameLower.includes('work') || newStageNameLower.includes('progress'))) {
      
      // Mută lead-ul în pipeline-ul original în stage-ul "In Lucru"
      const originalPipelineId = leadAny.originalPipelineId
      const originalPipeline = pipelinesDataToUse.find((p: any) => p.id === originalPipelineId)
      
      if (originalPipeline) {
        // Găsește stage-ul "In Lucru" în pipeline-ul original
        const inLucruStage = originalPipeline.stages.find((s: any) => {
          const stageName = s.name.toLowerCase()
          return stageName.includes('lucru') || stageName.includes('work') || stageName.includes('progress')
        })
        
        if (inLucruStage) {
          // Mută lead-ul în pipeline-ul original în stage-ul "In Lucru"
          const itemType = getItemType(lead)
          const itemId = getItemId(lead)
          const { error: originalError } = await moveItemToStage(itemType, itemId, originalPipelineId, inLucruStage.id)
          if (originalError) {
            console.error('Eroare la mutarea lead-ului în pipeline-ul original:', originalError)
            setLeads(prev => prev.map(l => (l.id === leadId ? previousLead : l)))
            setError('Failed to move lead')
            throw new Error((originalError as any)?.message ?? 'Mutarea a eșuat')
          }
          // Real-time subscription va actualiza automat când se salvează în baza de date
          // Nu mai e nevoie de refresh complet!
        }
      }
    }
    
    const itemType = getItemType(lead)
    const itemId = getItemId(lead)
    // Pentru service_file și tray folosim MEREU pipeline-ul board-ului curent (unde îl vedem),
    // nu pipelineId de pe card – evită "not found in the specified pipeline" când cardul are date vechi/greșite.
    const useBoardPipeline = (itemType === 'service_file' || itemType === 'tray') && !!currentPipelineId
    const targetPipelineId = useBoardPipeline ? currentPipelineId! : (leadAny.originalPipelineId || lead.pipelineId)
    const targetPipeline = pipelinesDataToUse.find((p: any) => p.id === targetPipelineId)
    
    if (!targetPipeline) return
    
    const newStage = targetPipeline.stages.find((s: any) => s.name === newStageName)
    if (!newStage) return

    // OPTIMISTIC UPDATE: Actualizează UI-ul imediat pentru feedback vizual
    setLeads(prev => prev.map(l => (l.id === leadId ? { ...l, stage: newStageName, stageId: newStage.id } : l)))
    
    lastMovedItemIdRef.current = itemId
    lastMovedAtRef.current = Date.now()
    
    try {
      let usedPipelineId = targetPipelineId
      let { error } = await moveItemToStage(itemType, itemId, targetPipelineId, newStage.id)
      // Fallback 1: pentru service_file/tray, dacă itemul "nu e în pipeline", încearcă cu pipeline-ul curent (board-ul pe care îl vedem)
      if (error && currentPipelineId && currentPipelineId !== targetPipelineId && (itemType === 'service_file' || itemType === 'tray')) {
        const err = error as any
        const msg = String(err?.message ?? err?.msg ?? '')
        if (msg.includes('not found in the specified pipeline')) {
          const currentPipeline = pipelinesDataToUse.find((p: any) => p.id === currentPipelineId)
          const stageInCurrent = currentPipeline?.stages?.find((s: any) => s.name === newStageName)
          if (stageInCurrent) {
            const retry = await moveItemToStage(itemType, itemId, currentPipelineId, stageInCurrent.id)
            if (!retry.error) {
              error = null
              usedPipelineId = currentPipelineId
            }
          }
        }
      }
      // Fallback 2: dacă încă "not found", rezolvă pipeline-ul real din DB și reîncearcă (card cu pipelineId vechi/stale)
      if (error && (itemType === 'service_file' || itemType === 'tray')) {
        const err = error as any
        const msg = String(err?.message ?? err?.msg ?? '')
        if (msg.includes('not found in the specified pipeline')) {
          const { data: actualPipelineId } = await getPipelineIdForItem(itemType, itemId)
          if (actualPipelineId) {
            const actualPipeline = pipelinesDataToUse.find((p: any) => p.id === actualPipelineId)
            const stageInActual = actualPipeline?.stages?.find((s: any) => s.name === newStageName)
            if (stageInActual) {
              const retry = await moveItemToStage(itemType, itemId, actualPipelineId, stageInActual.id)
              if (!retry.error) {
                error = null
                usedPipelineId = actualPipelineId
              }
            }
          }
        }
      }
      if (error) {
        setLeads(prev => prev.map(l => (l.id === leadId ? previousLead : l)))
        const err = error as any
        const msg = (err?.message ?? err?.msg ?? (typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err))) || 'Failed to move lead'
        console.error('[handleLeadMove] moveItemToStage failed:', msg, { itemType, itemId, targetPipelineId: usedPipelineId, newStageId: newStage.id, code: err?.code, details: err?.details })
        const isNotFoundInPipeline = typeof msg === 'string' && msg.includes('not found in the specified pipeline')
        if (isNotFoundInPipeline && currentPipelineId) {
          invalidateKanbanCacheForPipeline(currentPipelineId)
          loadDataRef.current?.()
          setError('Itemul nu mai este în acest pipeline sau a fost actualizat în alt tab. Lista s-a reîmprospătat.')
          return
        }
        setError(msg || 'Failed to move lead')
        throw new Error(typeof msg === 'string' ? msg : 'Mutarea a eșuat')
      } else {
        // Dacă mutarea a reușit și noul stage este "Arhivat", eliberează tăvițele
        const isArchiveStage = newStageNameLower.includes('arhivat') || newStageNameLower.includes('arhiva') || newStageNameLower.includes('archive')
        if (isArchiveStage && itemType === 'service_file') {
          try {
            const res = await fetch('/api/service-files/archive-and-release', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ service_file_id: itemId }),
              credentials: 'include',
            })
            const data = await res.json().catch(() => ({}))
            if (!data?.ok || res.status !== 200) {
              console.error('[handleLeadMove] ❌ Arhivare/eliberare eșuată:', data?.error)
              // R1, R11: rollback UI – mutăm cardul înapoi în stage-ul anterior
              const effectivePipeline = pipelinesDataToUse.find((p: any) => p.id === usedPipelineId) || targetPipeline
              const previousStage = effectivePipeline?.stages?.find((s: any) => (s.name || '').toLowerCase() === (previousLead.stage || '').toLowerCase())
              if (previousStage?.id) {
                await moveItemToStage('service_file', itemId, usedPipelineId, previousStage.id)
              }
              setLeads(prev => prev.map(l => (l.id === leadId ? previousLead : l)))
              if (currentPipelineId) invalidateKanbanCacheForPipeline(currentPipelineId)
              loadDataRef.current?.()
              toast.error('Arhivarea nu s-a putut finaliza. Verifică și reîncearcă.')
            } else {
              console.log(`[handleLeadMove] ✅ Arhivată și eliberate ${data.deletedCount ?? 0} tăvițe pentru fișa:`, itemId)
            }
          } catch (releaseErr) {
            console.error('[handleLeadMove] ❌ Eroare la arhivare/eliberare:', releaseErr)
            const effectivePipeline = pipelinesDataToUse.find((p: any) => p.id === usedPipelineId) || targetPipeline
            const previousStage = effectivePipeline?.stages?.find((s: any) => (s.name || '').toLowerCase() === (previousLead.stage || '').toLowerCase())
            if (previousStage?.id) {
              await moveItemToStage('service_file', itemId, usedPipelineId, previousStage.id)
            }
            setLeads(prev => prev.map(l => (l.id === leadId ? previousLead : l)))
            if (currentPipelineId) invalidateKanbanCacheForPipeline(currentPipelineId)
            loadDataRef.current?.()
            toast.error('Arhivarea nu s-a putut finaliza. Verifică și reîncearcă.')
          }
        }
        // Log mutare lead în Vânzări (fire-and-forget): nu blocăm UI-ul, mutarea = 1 call
        const effectivePipeline = pipelinesDataToUse.find((p: any) => p.id === usedPipelineId) || targetPipeline
        const pipelineName = String((effectivePipeline as any)?.name || '').toLowerCase()
        const isVanzari = pipelineName.includes('vanzari') || pipelineName.includes('sales')
        if (isVanzari && previousLead.stageId && newStage.id) {
          if (itemType === 'lead') {
            logItemEvent(
              'lead',
              itemId,
              `Mutat din ${previousLead.stage || ''} în ${newStageName}`,
              'stage_change',
              {
                from_stage_id: previousLead.stageId,
                to_stage_id: newStage.id,
                pipeline_id: usedPipelineId,
              },
              undefined,
              {
                currentUserId: user?.id ?? undefined,
                currentUserName: user?.email?.split('@')[0] ?? null,
                currentUserEmail: user?.email ?? null,
              }
            ).catch((logErr) => console.error('[handleLeadMove] logItemEvent (Vânzări):', logErr))
          }
          // Înregistrare apel: lead → Callback/No deal/Comandă/Nu răspunde SAU orice item → Curier trimis/Office direct
          if (isApelMove(previousLead.stage || '', newStageName)) {
            const leadIdForApel = itemType === 'lead' ? itemId : ((previousLead as any).leadId ?? itemId)
            recordVanzariApel({
              lead_id: leadIdForApel,
              pipeline_id: usedPipelineId,
              from_stage_id: previousLead.stageId,
              to_stage_id: newStage.id,
              moved_by: user?.id ?? null,
            }).then(({ error: apelErr }) => {
              if (apelErr) console.error('[handleLeadMove] recordVanzariApel:', apelErr)
            }).catch((e) => console.error('[handleLeadMove] recordVanzariApel:', e))
            // Actualizare lead curier_trimis_at/office_direct_at ca să intre la statistici Curier trimis / Office direct
            const isCurierTrimis = newStageNameLower.includes('curier') && newStageNameLower.includes('trimis')
            const isOfficeDirect = newStageNameLower.includes('office') && newStageNameLower.includes('direct')
            if (itemType === 'lead' && (isCurierTrimis || isOfficeDirect) && leadIdForApel) {
              const nowIso = new Date().toISOString()
              const leadUpdates: Record<string, unknown> = isOfficeDirect
                ? { office_direct_at: nowIso, office_direct_user_id: user?.id ?? null, curier_trimis_at: null, curier_trimis_user_id: null }
                : { curier_trimis_at: nowIso, curier_trimis_user_id: user?.id ?? null, office_direct_at: null, office_direct_user_id: null }
              if (user?.id) (leadUpdates as any).claimed_by = user.id
              updateLead(leadIdForApel, leadUpdates).then(({ error: leadUpdErr }) => {
                if (leadUpdErr) console.error('[handleLeadMove] updateLead (curier/office):', leadUpdErr)
              }).catch((e) => console.error('[handleLeadMove] updateLead (curier/office):', e))
            }
          }
        }
      }
      // Dacă reușește, real-time subscription va actualiza automat când se salvează în baza de date
      // Nu mai e nevoie de refresh complet!
    } catch (err) {
      setLeads(prev => prev.map(l => (l.id === leadId ? previousLead : l)))
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[handleLeadMove] Error:', err)
      const isNotFoundInPipeline = typeof msg === 'string' && msg.includes('not found in the specified pipeline')
      if (isNotFoundInPipeline && currentPipelineId) {
        invalidateKanbanCacheForPipeline(currentPipelineId)
        loadDataRef.current?.()
        setError('Itemul nu mai este în acest pipeline sau a fost actualizat în alt tab. Lista s-a reîmprospătat.')
        return
      }
      setError(msg || 'Failed to move lead')
      throw err instanceof Error ? err : new Error(msg || 'Mutarea a eșuat')
    }
  }, [leads, pipelineSlug, getPipelines, currentUserId, user?.id, currentPipelineId])

  /** Actualizare optimistă: mută vizual un item (ex. tăviță) în noul stage fără refetch. */
  /** Setăm lastMovedItemIdRef ca la mutare din desktop – când mutarea e făcută din sheet (mobil), Realtime nu va face refresh. */
  const updateItemStage = useCallback((itemId: string, newStageName: string, newStageId: string) => {
    lastMovedItemIdRef.current = itemId
    lastMovedAtRef.current = Date.now()
    setLeads(prev =>
      prev.map(l => (l.id === itemId ? { ...l, stage: newStageName, stageId: newStageId } : l))
    )
  }, [])

  /** Actualizare optimistă: „Nu răspunde” de la Receptie – tag + dată + mutare în coloana Nu răspunde, în timp real pe card. */
  const patchNuRaspundeReceptie = useCallback((
    serviceFileId: string,
    leadId: string,
    payload: { nuRaspundeCallbackAt: string; tag: Tag; stageId: string; stageName: string }
  ) => {
    lastMovedItemIdRef.current = serviceFileId
    lastMovedAtRef.current = Date.now()
    setLeads(prev =>
      prev.map(l => {
        if (l.id !== serviceFileId) return l
        const currentTags = Array.isArray((l as any).tags) ? (l as any).tags : []
        const hasTag = currentTags.some((t: any) => t.id === payload.tag.id)
        const newTags = hasTag ? currentTags : [...currentTags, payload.tag]
        return {
          ...l,
          tags: newTags,
          nu_raspunde_callback_at: payload.nuRaspundeCallbackAt,
          stage: payload.stageName,
          stageId: payload.stageId,
        } as any
      })
    )
  }, [])

  /** Pipelines cu stages din cache (fără call) – pentru UI (ex. stageId după mutare). */
  const getCachedPipelinesWithStages = useCallback(() => pipelinesRef.current ?? [], [])

  /** Adaugă un card nou în board (ex. după creare fișă din Receptie) – apare imediat fără refresh. */
  const addNewItemToBoard = useCallback((item: KanbanLead) => {
    setLeads(prev => (prev.find(l => l.id === item.id) ? prev : [...prev, item]))
  }, [])

  return { leads, stages, pipelines, loading, error, handleLeadMove, patchLeadTags, patchLeadClaim, patchLeadDeliveryClear, handlePinToggle, refresh, reload: () => loadDataRef.current(), updateItemStage, getCachedPipelinesWithStages, addNewItemToBoard, patchNuRaspundeReceptie }
}
