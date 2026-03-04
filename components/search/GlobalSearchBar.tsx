'use client'

import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Loader2, Package, FileText, User, ChevronRight } from 'lucide-react'
import { cn, removeDiacritics } from '@/lib/utils'
import type { UnifiedSearchResult } from '@/lib/supabase/unifiedSearchServer'

const DEBOUNCE_MS = 400
const URL_DEBOUNCE_MS = 400
const MIN_CHARS = 2
const MAX_PER_GROUP = 5
const SEARCH_PAGE_PATH = '/search'
const TRAY_SEARCH_OPEN_KEY = 'traySearchOpen'
const PENDING_SEARCH_OPEN_KEY = 'crm:pending-search-open'
const SEARCH_HISTORY_KEY = 'crm:global-search-history'
const SEARCH_HISTORY_MAX = 8

function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.slice(0, SEARCH_HISTORY_MAX) : []
  } catch {
    return []
  }
}

function pushSearchHistory(term: string) {
  const t = term.trim()
  if (!t || t.length < 2) return
  try {
    const prev = getSearchHistory()
    const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, SEARCH_HISTORY_MAX)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
  } catch {}
}

const DEPT_SLUGS = ['saloane', 'horeca', 'frizerii', 'reparatii']
const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, '-')

type OpenPayload = { pipelineSlug: string; openType: 'lead' | 'service_file' | 'tray'; openId: string }

function buildOpenPayload(u: UnifiedSearchResult, currentPipelineSlug: string | undefined): OpenPayload {
  const pipelineSlug = u.type === 'tray' && currentPipelineSlug && DEPT_SLUGS.includes(toSlug(currentPipelineSlug))
    ? currentPipelineSlug
    : u.pipelineSlug
  return { pipelineSlug, openType: u.type, openId: u.openId }
}

/** Map: fiecare index în text normalizat -> index start în textul original */
function buildNormToOrigMap(text: string): number[] {
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const norm = removeDiacritics(text[i]).toLowerCase()
    for (let k = 0; k < norm.length; k++) map.push(i)
    if (norm.length === 0) map.push(i)
  }
  return map
}

/** Highlight terms in text (case + diacritics insensitive: "popescu" match "Popeșcu") */
function highlightText(text: string, terms: string[]): React.ReactNode {
  if (!text || terms.length === 0) return text
  const filtered = terms.map((t) => removeDiacritics(t).trim().toLowerCase()).filter(Boolean)
  if (filtered.length === 0) return text
  const normMap = buildNormToOrigMap(text)
  const normText = removeDiacritics(text).toLowerCase()
  const segments: Array<{ start: number; end: number; match: boolean }> = []
  let normPos = 0
  while (normPos < normText.length) {
    let found = false
    for (const t of filtered) {
      if (t.length === 0) continue
      if (normText.slice(normPos, normPos + t.length) === t) {
        const oStart = normMap[normPos] ?? 0
        const oEndIdx = normPos + t.length - 1
        const oEnd = oEndIdx < normMap.length ? (normMap[oEndIdx] ?? 0) + 1 : text.length
        segments.push({ start: oStart, end: oEnd, match: true })
        normPos += t.length
        found = true
        break
      }
    }
    if (!found) {
      const nextMatch = filtered.reduce((best, t) => {
        if (!t) return best
        const i = normText.indexOf(t, normPos)
        return i >= 0 && (best === -1 || i < best) ? i : best
      }, -1)
      if (nextMatch === -1) {
        const oStart = normMap[normPos] ?? 0
        segments.push({ start: oStart, end: text.length, match: false })
        break
      }
      if (nextMatch > normPos) {
        const oStart = normMap[normPos] ?? 0
        const oEnd = normMap[nextMatch] ?? text.length
        segments.push({ start: oStart, end: oEnd, match: false })
      }
      const tLen = filtered.find((t) => normText.slice(nextMatch, nextMatch + (t?.length ?? 0)) === t)?.length ?? 0
      const oStart = normMap[nextMatch] ?? 0
      const oEndIdx = nextMatch + tLen - 1
      const oEnd = oEndIdx < normMap.length ? (normMap[oEndIdx] ?? 0) + 1 : text.length
      segments.push({ start: oStart, end: oEnd, match: true })
      normPos = nextMatch + tLen
    }
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.match ? (
          <mark key={i} className="bg-primary/20 rounded px-0.5">{text.slice(seg.start, seg.end)}</mark>
        ) : (
          <span key={i}>{text.slice(seg.start, seg.end)}</span>
        )
      )}
    </>
  )
}

export interface GlobalSearchBarProps {
  placeholder?: string
  className?: string
  onAfterSelect?: () => void
  /** Controlled value (e.g. from URL); when set, sync input */
  value?: string
  onValueChange?: (value: string) => void
}

export interface GlobalSearchBarRef {
  focus: () => void
}

export const GlobalSearchBar = forwardRef<GlobalSearchBarRef, GlobalSearchBarProps>(function GlobalSearchBar({
  placeholder = 'Caută lead, fișă, tăviță, serial, tag...',
  className,
  onAfterSelect,
  value: controlledValue,
  onValueChange,
}, ref) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const match = pathname?.match(/^\/leads\/([^/?#]+)/)
  const currentPipelineSlug = match?.[1]
  const onLeadsPage = Boolean(pathname?.match(/^\/leads\/[^/?#]+/))
  const urlQuery = searchParams?.get('q') ?? ''

  const [internalQuery, setInternalQuery] = useState('')
  const [leadsPageInputValue, setLeadsPageInputValue] = useState(urlQuery)
  const isControlled = controlledValue !== undefined && onValueChange !== undefined
  const query = onLeadsPage
    ? leadsPageInputValue
    : isControlled
      ? (controlledValue ?? '')
      : internalQuery
  const setQuery = useCallback(
    (value: string) => {
      if (onLeadsPage) {
        setLeadsPageInputValue(value)
      } else if (isControlled) {
        onValueChange?.(value)
      } else {
        setInternalQuery(value)
      }
    },
    [onLeadsPage, isControlled, onValueChange]
  )

  useEffect(() => {
    if (onLeadsPage && urlQuery !== leadsPageInputValue) {
      setLeadsPageInputValue(urlQuery)
    }
  }, [onLeadsPage, urlQuery])

  const urlDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const updateUrlWithQuery = useCallback(
    (q: string) => {
      if (!pathname || !onLeadsPage) return
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      const trimmed = q.trim()
      if (trimmed) params.set('q', trimmed)
      else params.delete('q')
      const queryString = params.toString()
      router.replace(pathname + (queryString ? '?' + queryString : ''), { scroll: false })
    },
    [pathname, onLeadsPage, searchParams, router]
  )

  const [results, setResults] = useState<UnifiedSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const resultsRef = useRef<UnifiedSearchResult[]>([])
  const flatListRef = useRef<UnifiedSearchResult[]>([])
  const searchGenerationRef = useRef(0)
  const mountedRef = useRef(true)

  useImperativeHandle(ref, () => ({
    focus: () => {
      setIsOpen(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    },
  }), [])

  useEffect(() => { resultsRef.current = results }, [results])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const performSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < MIN_CHARS) {
      if (mountedRef.current) {
        setResults([])
        setError(null)
      }
      return
    }
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    const generation = ++searchGenerationRef.current
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch(`/api/search/unified?q=${encodeURIComponent(trimmed)}`, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (signal.aborted || !mountedRef.current) return
      if (generation !== searchGenerationRef.current) return
      if (!data.success) {
        setError(data.error || 'Eroare la căutare')
        setResults([])
      } else {
        const list = Array.isArray(data.data) ? data.data : []
        setResults(list)
        setSelectedIndex(list.length > 0 ? 0 : -1)
        if (trimmed.length >= 2) pushSearchHistory(trimmed)
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (mountedRef.current && generation === searchGenerationRef.current) {
        setError(err instanceof Error ? err.message : 'Eroare la conectare')
        setResults([])
      }
    } finally {
      if (mountedRef.current && generation === searchGenerationRef.current && !signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (isOpen && query.length === 0) setSearchHistory(getSearchHistory())
  }, [isOpen, query.length])

  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    setIsOpen(true)
    setSelectedIndex(-1)
    if (onLeadsPage) {
      if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current)
      urlDebounceRef.current = setTimeout(() => {
        urlDebounceRef.current = null
        updateUrlWithQuery(value)
      }, URL_DEBOUNCE_MS)
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (value.trim().length < MIN_CHARS) {
      setResults([])
      setError(null)
      return
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      performSearch(value)
    }, DEBOUNCE_MS)
  }, [setQuery, performSearch, onLeadsPage, updateUrlWithQuery])

  const handleSelect = useCallback((result: UnifiedSearchResult) => {
    // Pentru tăvițe: deschidem detaliile fișei de serviciu (Recepție sau Arhivare), nu pipeline-ul departamentului
    const openAsServiceFile =
      result.type === 'tray' && result.serviceFileId
    const serviceFilePipeline = result.serviceFilePipelineSlug || 'receptie'
    const payload = openAsServiceFile
      ? { pipelineSlug: serviceFilePipeline, openType: 'service_file' as const, openId: result.serviceFileId }
      : buildOpenPayload(result, currentPipelineSlug)
    try {
      sessionStorage.setItem(TRAY_SEARCH_OPEN_KEY, JSON.stringify(payload))
      sessionStorage.setItem(PENDING_SEARCH_OPEN_KEY, JSON.stringify({ ...payload, at: Date.now() }))
    } catch { /* ignore */ }
    const base = `/leads/${payload.pipelineSlug}`
    const params = new URLSearchParams()
    if (payload.openType === 'lead') params.set('openLeadId', payload.openId)
    else if (payload.openType === 'service_file') params.set('openServiceFileId', payload.openId)
    else if (payload.openType === 'tray') params.set('openTrayId', payload.openId)
    const targetUrl = params.toString() ? `${base}?${params.toString()}` : base
    router.push(targetUrl)
    onAfterSelect?.()
    setQuery('')
    setResults([])
    setIsOpen(false)
    setSelectedIndex(-1)
  }, [currentPipelineSlug, router, setQuery, onAfterSelect])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const leads = useMemo(() => results.filter((r) => r.type === 'lead'), [results])
  const serviceFiles = useMemo(() => results.filter((r) => r.type === 'service_file'), [results])
  const trays = useMemo(() => results.filter((r) => r.type === 'tray'), [results])
  const flatList = useMemo(
    () => [
      ...leads.slice(0, MAX_PER_GROUP),
      ...serviceFiles.slice(0, MAX_PER_GROUP),
      ...trays.slice(0, MAX_PER_GROUP),
    ],
    [leads, serviceFiles, trays]
  )
  flatListRef.current = flatList
  const termsForHint = useMemo(
    () => (query.includes(',') ? query.split(',').map((t) => t.trim()).filter(Boolean) : []),
    [query]
  )

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (flatList.length === 0) return -1
      return Math.min(prev, flatList.length - 1)
    })
  }, [flatList.length])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || flatListRef.current.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % flatListRef.current.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev <= 0 ? flatListRef.current.length - 1 : prev - 1))
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault()
        const r = flatListRef.current[selectedIndex]
        if (r) handleSelect(r)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        setSelectedIndex(-1)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, handleSelect])

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current)
    }
  }, [])

  const handleClear = useCallback(() => {
    setQuery('')
    setResults([])
    setError(null)
    setSelectedIndex(-1)
    if (urlDebounceRef.current) {
      clearTimeout(urlDebounceRef.current)
      urlDebounceRef.current = null
    }
    if (onLeadsPage) updateUrlWithQuery('')
    inputRef.current?.focus()
  }, [setQuery, onLeadsPage, updateUrlWithQuery])

  const handleVeziToate = useCallback(
    (type: 'lead' | 'service_file' | 'tray') => {
      const slug =
        type === 'lead' ? 'vanzari' : type === 'service_file' ? 'receptie' : 'saloane'
      setIsOpen(false)
      setResults([])
      setSelectedIndex(-1)
      onAfterSelect?.()
      const q = query.trim()
      const url = q ? `/leads/${slug}?q=${encodeURIComponent(q)}` : `/leads/${slug}`
      router.push(url)
    },
    [query, router, onAfterSelect]
  )

  const highlightTerms = query.includes(',') ? termsForHint : (query.trim() ? [query.trim()] : [])

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          className="pl-10 pr-10"
          onKeyDown={(e) => {
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isOpen) e.preventDefault()
          }}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />}
        {query && !loading && (
          <button type="button" onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            ✕
          </button>
        )}
        {!query && !loading && (
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        )}
      </div>

      {isOpen && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 max-h-[28rem] overflow-y-auto shadow-xl">
          <CardContent className="p-0">
            {(query.length === 0 || query.trim().length < MIN_CHARS) && searchHistory.length > 0 && (
              <div className="px-3 py-2 border-b bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Căutări recente</p>
                <div className="space-y-0.5">
                  {searchHistory.slice(0, 5).map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setQuery(item)
                        performSearch(item)
                      }}
                      className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent/50 flex items-center gap-2"
                    >
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {query.length > 0 && (
            <>
            {loading && (
              <div className="p-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground mt-2">Se caută...</p>
              </div>
            )}
            {error && (
              <div className="p-4 text-sm text-destructive bg-destructive/10">{error}</div>
            )}
            {!loading && !error && results.length === 0 && query.trim().length >= MIN_CHARS && (
              <div className="p-6 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-muted-foreground mt-2">Nu s-a găsit nimic</p>
                <p className="text-xs text-muted-foreground mt-2 max-w-[260px] mx-auto">
                  Încearcă cu mai puține caractere sau alt termen. Poți scrie fără diacritice (ex. popescu, tavita).
                </p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <>
                {termsForHint.length >= 2 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/30">
                    Căutare combinată: {termsForHint.map((t, i) => (
                      <span key={i}>{i > 0 ? ' + ' : ''}&quot;{t}&quot;</span>
                    ))}
                  </div>
                )}
                <div className="divide-y divide-border">
                  {leads.length > 0 && (
                    <div className="py-1">
                      <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Lead-uri</p>
                      {leads.slice(0, MAX_PER_GROUP).map((r, idx) => {
                        const flatIdx = flatList.indexOf(r)
                        return (
                          <button
                            key={`lead:${r.id}`}
                            type="button"
                            onClick={() => handleSelect(r)}
                            onMouseEnter={() => setSelectedIndex(flatIdx)}
                            className={cn(
                              'w-full text-left p-3 flex items-center gap-3 transition-colors',
                              selectedIndex === flatIdx ? 'bg-accent' : 'hover:bg-accent/50'
                            )}
                          >
                            <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                              <User className="h-4 w-4 text-green-600 dark:text-green-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{highlightText(r.title, highlightTerms)}</p>
                              {r.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{highlightText(r.subtitle, highlightTerms)}</p>}
                              {(r.pipelineName || r.stageName) && (
                                <p className="text-[11px] text-muted-foreground/90 truncate mt-0.5">
                                  {[r.pipelineName, r.stageName].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                            <span className="flex-shrink-0 text-[10px] font-medium px-2 py-1 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Lead</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </button>
                        )
                      })}
                      {leads.length > MAX_PER_GROUP && (
                        <button
                          type="button"
                          onClick={() => handleVeziToate('lead')}
                          className="w-full px-3 py-2 text-xs text-primary font-medium hover:bg-accent/50 text-left rounded transition-colors"
                        >
                          Vezi toate ({leads.length}) lead-uri
                        </button>
                      )}
                    </div>
                  )}
                  {serviceFiles.length > 0 && (
                    <div className="py-1">
                      <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fișe de serviciu</p>
                      {serviceFiles.slice(0, MAX_PER_GROUP).map((r, idx) => {
                        const flatIdx = flatList.indexOf(r)
                        return (
                          <button
                            key={`sf:${r.id}`}
                            type="button"
                            onClick={() => handleSelect(r)}
                            onMouseEnter={() => setSelectedIndex(flatIdx)}
                            className={cn(
                              'w-full text-left p-3 flex items-center gap-3 transition-colors',
                              selectedIndex === flatIdx ? 'bg-accent' : 'hover:bg-accent/50'
                            )}
                          >
                            <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                              <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{highlightText(r.title, highlightTerms)}</p>
                              {r.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{highlightText(r.subtitle, highlightTerms)}</p>}
                              {(r.pipelineName || r.stageName) && (
                                <p className="text-[11px] text-muted-foreground/90 truncate mt-0.5">
                                  {[r.pipelineName, r.stageName].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                            <span className="flex-shrink-0 text-[10px] font-medium px-2 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Fișă</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </button>
                        )
                      })}
                      {serviceFiles.length > MAX_PER_GROUP && (
                        <button
                          type="button"
                          onClick={() => handleVeziToate('service_file')}
                          className="w-full px-3 py-2 text-xs text-primary font-medium hover:bg-accent/50 text-left rounded transition-colors"
                        >
                          Vezi toate ({serviceFiles.length}) fișe
                        </button>
                      )}
                    </div>
                  )}
                  {trays.length > 0 && (
                    <div className="py-1">
                      <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tăvițe</p>
                      {trays.slice(0, MAX_PER_GROUP).map((r) => {
                        const flatIdx = flatList.indexOf(r)
                        return (
                          <button
                            key={`tray:${r.id}`}
                            type="button"
                            onClick={() => handleSelect(r)}
                            onMouseEnter={() => setSelectedIndex(flatIdx)}
                            className={cn(
                              'w-full text-left p-3 flex items-center gap-3 transition-colors',
                              selectedIndex === flatIdx ? 'bg-accent' : 'hover:bg-accent/50'
                            )}
                          >
                            <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{highlightText(r.title, highlightTerms)}</p>
                              {r.subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{highlightText(r.subtitle, highlightTerms)}</p>}
                              {(r.pipelineName || r.stageName) && (
                                <p className="text-[11px] text-muted-foreground/90 truncate mt-0.5">
                                  {[r.pipelineName, r.stageName].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                            <span className="flex-shrink-0 text-[10px] font-medium px-2 py-1 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Tăviță</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </button>
                        )
                      })}
                      {trays.length > MAX_PER_GROUP && (
                        <button
                          type="button"
                          onClick={() => handleVeziToate('tray')}
                          className="w-full px-3 py-2 text-xs text-primary font-medium hover:bg-accent/50 text-left rounded transition-colors"
                        >
                          Vezi toate ({trays.length}) tăvițe
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="border-t bg-muted/30 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false)
                      setResults([])
                      const q = query.trim()
                      if (q) router.push(`${SEARCH_PAGE_PATH}?q=${encodeURIComponent(q)}`)
                      onAfterSelect?.()
                    }}
                    className="w-full text-center text-xs font-medium text-primary hover:underline"
                  >
                    Vezi toate rezultatele ({results.length})
                  </button>
                </div>
              </>
            )}
            </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
})
