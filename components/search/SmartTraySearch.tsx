'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, useRef } from 'react'
import { TraySearch } from './TraySearch'
import type { TraySearchResult } from '@/lib/supabase/traySearchOperations'
import type { UnifiedSearchResult } from '@/lib/supabase/unifiedSearchServer'

const TRAY_SEARCH_OPEN_KEY = 'traySearchOpen'
/** Flag ca să nu redirecționăm „pipeline nepermis" imediat după deschidere din search (citit în CRMPage). */
export const PENDING_SEARCH_OPEN_KEY = 'crm:pending-search-open'
export const PENDING_SEARCH_OPEN_TTL_MS = 15000

const UNIFIED_PLACEHOLDER = 'Caută lead, fișă, tăviță, serial, brand...'

/** Debounce URL update (ms) – reduce lag la tastare */
const URL_DEBOUNCE_MS = 500

type TraySearchOpenPayload = {
  pipelineSlug: string
  openType: 'lead' | 'service_file' | 'tray'
  openId: string
  /** Dacă e setat, la Close din detalii revenim aici (ex: /dashboard/tehnician). */
  returnTo?: string
}

const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, '-')

const DEPT_SLUGS = ['saloane', 'horeca', 'frizerii', 'reparatii']

/**
 * Determină pipeline-ul și tipul de item de deschis conform contextului:
 * - Receptie → fișă de serviciu (service_file)
 * - Vânzări → lead
 * - Departamente (Saloane, Horeca, etc.) → tăviță (tray)
 */
function getOpenTarget(
  result: TraySearchResult,
  pipelineSlug: string | undefined
): { pipelineSlug: string; openType: 'lead' | 'service_file' | 'tray'; openId: string } {
  const slug = (pipelineSlug || 'receptie').toLowerCase()

  if (slug === 'receptie') {
    return { pipelineSlug: 'receptie', openType: 'service_file', openId: result.serviceFileId }
  }
  if (slug === 'vanzari') {
    return { pipelineSlug: 'vanzari', openType: 'lead', openId: result.leadId }
  }
  if (DEPT_SLUGS.includes(slug)) {
    return { pipelineSlug: slug, openType: 'tray', openId: result.trayId }
  }

  // Default: deschide ca fișă (Receptie)
  return { pipelineSlug: 'receptie', openType: 'service_file', openId: result.serviceFileId }
}

/**
 * Un singur search bar: sincronizat cu URL (?q=) pe /leads pentru filtrare,
 * cu dropdown de tăvițe la tipare. Caută: nume, email, telefon, tăviță, serial, brand.
 * onAfterSelect: apelat imediat după selectarea unui rezultat (ex. pentru închiderea unui sheet mobil).
 */
export function SmartTraySearch({
  placeholder,
  className,
  onAfterSelect,
}: { placeholder?: string; className?: string; onAfterSelect?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const match = pathname?.match(/^\/leads\/([^/?#]+)/)
  const currentPipelineSlug = match?.[1]

  const urlQuery = searchParams?.get('q') ?? ''
  const [localQuery, setLocalQuery] = useState(urlQuery)
  const urlDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const urlAbortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setLocalQuery(urlQuery)
  }, [urlQuery])

  const setQueryInUrl = useCallback(
    (value: string) => {
      // Abort URL updates anterioare
      const prevController = urlAbortControllerRef.current
      if (prevController) {
        prevController.abort()
      }
      urlAbortControllerRef.current = new AbortController()
      const signal = urlAbortControllerRef.current.signal

      if (urlDebounceRef.current) {
        clearTimeout(urlDebounceRef.current)
        urlDebounceRef.current = null
      }
      urlDebounceRef.current = setTimeout(() => {
        if (signal.aborted) return
        
        urlDebounceRef.current = null
        const params = new URLSearchParams(searchParams?.toString() ?? '')
        if (value.trim()) params.set('q', value.trim())
        else params.delete('q')
        const queryString = params.toString()
        router.replace(pathname + (queryString ? '?' + queryString : ''))
      }, URL_DEBOUNCE_MS)
    },
    [pathname, router, searchParams]
  )

  // Cleanup pentru abort controllers și debounce URL
  useEffect(() => {
    return () => {
      if (urlAbortControllerRef.current) {
        urlAbortControllerRef.current.abort()
      }
      if (urlDebounceRef.current) {
        clearTimeout(urlDebounceRef.current)
        urlDebounceRef.current = null
      }
    }
  }, [])

  const onValueChange = useCallback(
    (value: string) => {
      setLocalQuery(value)
      setQueryInUrl(value)
    },
    [setQueryInUrl]
  )

  const handleSelect = useCallback((result: TraySearchResult | UnifiedSearchResult) => {
    onAfterSelect?.()
    const isUnified = 'type' in result && (result.type === 'lead' || result.type === 'service_file' || result.type === 'tray')
    let payload: TraySearchOpenPayload
    if (isUnified) {
      const u = result as UnifiedSearchResult
      const pipelineSlug = u.type === 'tray' && currentPipelineSlug && DEPT_SLUGS.includes(toSlug(currentPipelineSlug))
        ? currentPipelineSlug
        : u.pipelineSlug
      payload = {
        pipelineSlug,
        openType: u.type,
        openId: u.openId,
      }
    } else {
      const target = getOpenTarget(result as TraySearchResult, currentPipelineSlug)
      payload = {
        pipelineSlug: target.pipelineSlug,
        openType: target.openType,
        openId: target.openId,
      }
    }

    const samePipeline = currentPipelineSlug && toSlug(currentPipelineSlug) === toSlug(payload.pipelineSlug)

    if (samePipeline) {
      try {
        sessionStorage.setItem(TRAY_SEARCH_OPEN_KEY, JSON.stringify(payload))
      } catch { /* ignore */ }
      setTimeout(() => {
        try {
          window.dispatchEvent(new CustomEvent('traySearchOpen', { detail: payload }))
        } catch {
          router.replace(`/leads/${payload.pipelineSlug}`)
        }
      }, 0)
      return
    }

    // Redirecționare: Lead → Vânzări, Fișă → Recepție, Tăviță → departament.
    try {
      sessionStorage.setItem(TRAY_SEARCH_OPEN_KEY, JSON.stringify(payload))
      sessionStorage.setItem(PENDING_SEARCH_OPEN_KEY, JSON.stringify({ ...payload, at: Date.now() }))
    } catch { /* ignore */ }
    const base = `/leads/${payload.pipelineSlug}`
    const params = new URLSearchParams()
    if (payload.openType === 'lead') params.set('openLeadId', payload.openId)
    else if (payload.openType === 'service_file') params.set('openServiceFileId', payload.openId)
    else if (payload.openType === 'tray') params.set('openTrayId', payload.openId)
    if (localQuery?.trim()) params.set('q', localQuery.trim())
    const targetUrl = params.toString() ? `${base}?${params.toString()}` : base
    router.push(targetUrl)
  }, [onAfterSelect, currentPipelineSlug, router, localQuery])

  return (
    <TraySearch
      onSelectTray={handleSelect}
      placeholder={placeholder ?? UNIFIED_PLACEHOLDER}
      className={className}
      value={localQuery}
      onValueChange={onValueChange}
    />
  )
}

export { TRAY_SEARCH_OPEN_KEY }
export type { TraySearchOpenPayload }
