'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Loader2, Package, User, ChevronRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { removeDiacritics } from '@/lib/utils'
import type { UnifiedSearchResult, MatchedByType } from '@/lib/supabase/unifiedSearchServer'

const TRAY_SEARCH_OPEN_KEY = 'traySearchOpen'
const PENDING_SEARCH_OPEN_KEY = 'crm:pending-search-open'

function buildNormToOrigMap(text: string): number[] {
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const norm = removeDiacritics(text[i]).toLowerCase()
    for (let k = 0; k < norm.length; k++) map.push(i)
    if (norm.length === 0) map.push(i)
  }
  return map
}

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
          <mark key={i} className="bg-primary/20 rounded px-0.5">
            {text.slice(seg.start, seg.end)}
          </mark>
        ) : (
          <span key={i}>{text.slice(seg.start, seg.end)}</span>
        )
      )}
    </>
  )
}

const MATCHED_BY_LABELS: Record<MatchedByType, string> = {
  phone: 'Telefon',
  name: 'Nume',
  email: 'Email',
  company: 'Companie',
  serial: 'Serial',
  number: 'Număr',
  tag: 'Tag',
  technician: 'Tehnician',
}

function ResultRow({
  r,
  highlightTerms,
  onSelect,
  isSelected,
}: {
  r: UnifiedSearchResult
  highlightTerms: string[]
  onSelect: () => void
  isSelected: boolean
}) {
  // Badge-ul arată cum a fost găsit lead-ul
  const matchedBy = r.matchedBy || 'name'
  const badge = MATCHED_BY_LABELS[matchedBy] || 'Lead'
  
  // Culori bazate pe matchedBy
  const isServiceMatch = ['serial', 'number', 'technician'].includes(matchedBy)
  const bg = isServiceMatch
    ? 'bg-amber-100 dark:bg-amber-900/30'
    : 'bg-green-100 dark:bg-green-900/30'
  const badgeCls = isServiceMatch
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-3 flex items-center gap-3 transition-colors rounded-lg ${isSelected ? 'bg-accent' : 'hover:bg-accent/50'}`}
    >
      <div className={`flex-shrink-0 h-9 w-9 rounded-lg ${bg} flex items-center justify-center`}>
        <User className="h-4 w-4 text-green-600 dark:text-green-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{highlightText(r.title, highlightTerms)}</p>
        {r.subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {highlightText(r.subtitle, highlightTerms)}
          </p>
        )}
        {(r.pipelineName || r.stageName) && (
          <p className="text-[11px] text-muted-foreground/90 truncate mt-0.5">
            {[r.pipelineName, r.stageName].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-1 rounded-md ${badgeCls}`}>
        {badge}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  )
}

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(q)
  const [results, setResults] = useState<UnifiedSearchResult[]>([])
  const [loading, setLoading] = useState(!!q)
  const [error, setError] = useState<string | null>(null)

  const performSearch = useCallback(async (term: string) => {
    const trimmed = term.trim()
    if (trimmed.length < 2) {
      setResults([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/search/unified?q=${encodeURIComponent(trimmed)}`)
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Eroare la căutare')
        setResults([])
      } else {
        setResults(Array.isArray(data.data) ? data.data : [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la conectare')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (q) {
      setQuery(q)
      performSearch(q)
    } else {
      setResults([])
      setLoading(false)
    }
  }, [q, performSearch])

  const handleSelect = useCallback(
    (result: UnifiedSearchResult) => {
      // Toate rezultatele sunt acum de tip lead
      // pipelineSlug este deja setat corect (receptie pentru lead-uri găsite prin fișă/tăviță/serial, vanzări pentru celelalte)
      const payload = {
        pipelineSlug: result.pipelineSlug,
        openType: 'lead' as const,
        openId: result.openId,
      }
      try {
        sessionStorage.setItem(TRAY_SEARCH_OPEN_KEY, JSON.stringify(payload))
        sessionStorage.setItem(
          PENDING_SEARCH_OPEN_KEY,
          JSON.stringify({ ...payload, at: Date.now() })
        )
      } catch {}
      const base = `/leads/${payload.pipelineSlug}`
      const params = new URLSearchParams()
      params.set('openLeadId', payload.openId)
      router.push(`${base}?${params.toString()}`)
    },
    [router]
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length >= 2) {
      router.replace(`/search?q=${encodeURIComponent(query.trim())}`)
      performSearch(query.trim())
    }
  }

  const highlightTerms = query.trim() ? [query.trim()] : []

  return (
    <div className="flex flex-col h-full min-h-0 p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Înapoi
        </Button>
      </div>
      <Card className="shrink-0">
        <CardHeader className="pb-2">
          <h1 className="text-lg font-semibold">Căutare globală</h1>
          <p className="text-sm text-muted-foreground">
            Lead-uri și fișe de serviciu. Căutare după nume, telefon, email, tăviță sau serial. Poți scrie fără diacritice.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Caută nume, email, telefon, tăviță, serial..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={query.trim().length < 2}>
              Caută
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="py-4 text-sm text-destructive bg-destructive/10 rounded-lg px-4">
          {error}
        </div>
      )}

      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <Card className="mt-4">
          <CardContent className="py-8 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
            <p className="text-sm font-medium text-muted-foreground mt-2">Nu s-a găsit nimic</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-[260px] mx-auto">
              Încearcă cu mai puține caractere sau alt termen. Poți scrie fără diacritice.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-4 space-y-6 overflow-y-auto min-h-0">
          <div>
            <p className="px-1 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Rezultate ({results.length})
            </p>
            <div className="space-y-1">
              {results.map((r) => (
                <ResultRow
                  key={`${r.type}:${r.id}`}
                  r={r}
                  highlightTerms={highlightTerms}
                  onSelect={() => handleSelect(r)}
                  isSelected={false}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
