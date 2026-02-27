'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Wrench, Plus, Trash2, RotateCcw, Zap } from 'lucide-react'
import { useMemo, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface AddInstrumentFormProps {
  instrumentForm: {
    instrument: string
    qty: string
    garantie?: boolean
  }
  availableInstruments: Array<{ id: string; name: string; department_id?: string | null }>
  instruments?: Array<{ id: string; name: string; department_id: string | null; pipeline?: string | null }>
  departments?: Array<{ id: string; name: string }>
  instrumentSettings: Record<string, any>
  hasServicesOrInstrumentInSheet: boolean
  isVanzariPipeline: boolean
  isDepartmentPipeline: boolean
  isTechnician: boolean
  onInstrumentChange: (instrumentId: string) => void
  onInstrumentDoubleClick?: (instrumentId: string) => void
  onQtyChange: (qty: string) => void
  setIsDirty?: (dirty: boolean) => void
  isAddInstrumentDisabled?: boolean
  onAddInstrumentDirect?: (instrumentId: string, qty: number) => void
  onClearForm?: () => void
// -------------------------------------------------- COD PENTRU POPULARE CASETE -----------------------------------------------------
  onUndo?: () => void
  previousFormState?: any
// -----------------------------------------------------------------------------------------------------------------------------------
}

export function AddInstrumentForm({
  instrumentForm,
  availableInstruments,
  instruments = [],
  departments = [],
  instrumentSettings,
  hasServicesOrInstrumentInSheet,
  isVanzariPipeline,
  isDepartmentPipeline,
  isTechnician,
  onInstrumentChange,
  onInstrumentDoubleClick,
  onQtyChange,
  setIsDirty,
  isAddInstrumentDisabled = false,
  onAddInstrumentDirect,
  onClearForm,
// -------------------------------------------------- COD PENTRU POPULARE CASETE -----------------------------------------------------
  onUndo,
  previousFormState,
// -----------------------------------------------------------------------------------------------------------------------------------
}: AddInstrumentFormProps) {
  const [instrumentQuery, setInstrumentQuery] = useState('')
  const [instrumentSearchFocused, setInstrumentSearchFocused] = useState(false)

  // Reset search la schimbarea selecției / reset form (ca să nu rămână filtrarea blocată)
  useEffect(() => {
    setInstrumentQuery('')
  }, [instrumentForm.instrument])

  const normalize = (s: string) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  // Edit distance cu early-exit (pentru typo tolerance: 1–2 greșeli)
  const levenshteinWithin = (aRaw: string, bRaw: string, maxDist: number): number | null => {
    const a = aRaw
    const b = bRaw
    const la = a.length
    const lb = b.length
    if (Math.abs(la - lb) > maxDist) return null
    if (la === 0) return lb <= maxDist ? lb : null
    if (lb === 0) return la <= maxDist ? la : null

    // DP pe 2 rânduri; early exit dacă min pe rând depășește maxDist
    let prev = new Array(lb + 1).fill(0).map((_, i) => i)
    let curr = new Array(lb + 1).fill(0)
    for (let i = 1; i <= la; i++) {
      curr[0] = i
      let rowMin = curr[0]
      const ca = a.charCodeAt(i - 1)
      for (let j = 1; j <= lb; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
        const v = Math.min(
          prev[j] + 1, // delete
          curr[j - 1] + 1, // insert
          prev[j - 1] + cost // subst
        )
        curr[j] = v
        if (v < rowMin) rowMin = v
      }
      if (rowMin > maxDist) return null
      const tmp = prev
      prev = curr
      curr = tmp
    }
    const d = prev[lb]
    return d <= maxDist ? d : null
  }

  // Match pe subsecvență (ex: "frz" match în "foarfeca frizerie")
  const subsequenceScore = (text: string, query: string): number => {
    if (!query) return 0
    let ti = 0
    let qi = 0
    let score = 0
    let lastMatch = -2
    while (ti < text.length && qi < query.length) {
      if (text[ti] === query[qi]) {
        // Bonus pentru match-uri apropiate (context)
        score += (ti === lastMatch + 1) ? 6 : 2
        lastMatch = ti
        qi++
      }
      ti++
    }
    if (qi !== query.length) return 0
    // Bonus dacă query apare devreme
    score += Math.max(0, 40 - (lastMatch - query.length))
    return score
  }

  const scoreInstrument = (name: string, q: string): number => {
    if (!q) return 0
    const n = normalize(name)
    const query = normalize(q)
    if (!query) return 0
    if (n === query) return 1000
    if (n.startsWith(query)) return 700
    if (n.includes(query)) return 500

    // token match (toate token-urile din query trebuie să apară)
    const qTokens = query.split(' ').filter(Boolean)
    if (qTokens.length) {
      let ok = true
      let s = 0
      for (const t of qTokens) {
        const idx = n.indexOf(t)
        if (idx === -1) {
          // typo tolerance pe token: încercăm match cu distanță mică pe cuvinte
          const words = n.split(' ').filter(Boolean)
          let best: number | null = null
          for (const w of words) {
            const d = levenshteinWithin(w, t, 2)
            if (d === null) continue
            best = best === null ? d : Math.min(best, d)
            if (best === 0) break
          }
          if (best === null) { ok = false; break }
          // distanță mai mică => scor mai mare
          s += 90 - best * 25
        } else {
          // token mai devreme în string => scor mai bun
          s += Math.max(0, 120 - idx)
        }
      }
      if (ok) return 250 + s
    }

    // match inițiale (ex: "drp" pentru "Dalta Reparatii Professional")
    const initials = n.split(' ').filter(Boolean).map(w => w[0]).join('')
    if (initials && initials.startsWith(query.replace(/\s+/g, ''))) return 220

    // match contextual pe caractere (subsecvență) – când user scrie „context” fără spații perfecte
    const sub = subsequenceScore(n.replace(/\s+/g, ''), query.replace(/\s+/g, ''))
    if (sub > 0) return 160 + sub

    // fallback: dacă query e aproape de întregul nume (typo în propoziție)
    const dWhole = levenshteinWithin(n.replace(/\s+/g, ''), query.replace(/\s+/g, ''), 2)
    if (dWhole != null) return 140 + (2 - dWhole) * 35

    // Boost contextual: dacă query conține cuvinte de departament/pipeline și numele instrumentului le conține
    // (ex: \"repar\", \"horeca\", \"frizer\", \"salo\", \"ascut\") – ajută când user scrie contextul.
    const deptHints: Array<{ k: string; w: number }> = [
      { k: 'repar', w: 40 },
      { k: 'horeca', w: 40 },
      { k: 'frizer', w: 40 },
      { k: 'salon', w: 40 },
      { k: 'ascut', w: 30 },
    ]
    let hintScore = 0
    for (const h of deptHints) {
      if (query.includes(h.k) && n.includes(h.k)) hintScore += h.w
    }
    return hintScore
  }

  const filteredAvailableInstruments = useMemo(() => {
    const list = Array.isArray(availableInstruments) ? availableInstruments : []
    const q = instrumentQuery.trim()
    if (!q) return list
    const scored = list
      .map(inst => ({ inst, score: scoreInstrument(inst?.name || '', q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || String(a.inst?.name || '').localeCompare(String(b.inst?.name || '')))
      .map(x => x.inst)
    // Limită de siguranță (performanță + UX)
    return scored.slice(0, 200)
  }, [availableInstruments, instrumentQuery])

  const selectedInstrumentName = useMemo(() => {
    if (!instrumentForm.instrument) return ''
    const inst = (Array.isArray(availableInstruments) ? availableInstruments : []).find(
      (i) => i?.id === instrumentForm.instrument
    )
    return inst?.name || ''
  }, [availableInstruments, instrumentForm.instrument])

  return (
    <div className="mx-2 sm:mx-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {/* Header — CRM: neutru + accent */}
        <div className="px-3 py-3 sm:px-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col gap-3 max-md:gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="h-9 w-9 sm:h-9 sm:w-9 flex-shrink-0 rounded-xl bg-slate-600 flex items-center justify-center shadow-sm">
                <Wrench className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  Adaugă Instrument
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  Selectează instrumentul pentru servicii
                </p>
              </div>
            </div>
{/* -------------------------------------------------- COD PENTRU POPULARE CASETE ----------------------------------------------------- */}
            {/* Butoane: Undo și Reset — touch-friendly pe mobile */}
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {previousFormState && onUndo && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onUndo}
                  className="min-h-11 min-w-[44px] md:min-h-9 md:min-w-0 px-3 text-slate-700 border-slate-300 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700/50"
                  title="Anulează ultima selecție și restaurează formularele"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Undo
                </Button>
              )}
              {instrumentForm.instrument && onClearForm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClearForm}
                  className="min-h-11 min-w-[44px] md:min-h-9 md:min-w-0 px-3 text-slate-600 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/50"
                  title="Golește toate formularele"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Golește
                </Button>
              )}
            </div>
{/* ----------------------------------------------------------------------------------------------------------------------------------- */}
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-12 gap-3">
            {/* Instrument Select */}
            <div 
              className="col-span-12 sm:col-span-9"
              onDoubleClick={(e) => {
                const target = e.target as HTMLElement
                if (target.tagName === 'SELECT' && instrumentForm.instrument && onInstrumentDoubleClick) {
                  onInstrumentDoubleClick(instrumentForm.instrument)
                } else if (target.closest('select') && instrumentForm.instrument && onInstrumentDoubleClick) {
                  onInstrumentDoubleClick(instrumentForm.instrument)
                }
              }}
            >
              <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 block">
                Instrument{' '}
                <span className="hidden md:inline text-xs text-muted-foreground font-normal">(dublu click pentru adăugare rapidă)</span>
              </Label>
              <div className="flex flex-col gap-2 max-md:gap-2 md:block">
                {/* Instrument cu search + dropdown (ca la servicii) */}
                <div className="relative">
                  <Input
                    className="min-h-11 md:min-h-10 text-base md:text-sm pr-10 md:pr-8 border-2 border-slate-200 dark:border-slate-700 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20 touch-manipulation"
                    value={instrumentSearchFocused ? instrumentQuery : (instrumentQuery || selectedInstrumentName)}
                    onChange={(e) => setInstrumentQuery(e.target.value)}
                    onFocus={() => setInstrumentSearchFocused(true)}
                    onBlur={() => setInstrumentSearchFocused(false)}
                    placeholder="Caută instrument sau tap pentru listă..."
                    disabled={isAddInstrumentDisabled}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const first = filteredAvailableInstruments[0]
                        if (first?.id) {
                          e.preventDefault()
                          onInstrumentChange(first.id)
                          setInstrumentQuery(first.name || '')
                          setInstrumentSearchFocused(false)
                        }
                      }
                      if (e.key === 'Escape') {
                        setInstrumentQuery('')
                        setInstrumentSearchFocused(false)
                      }
                    }}
                  />
                  {(instrumentQuery || instrumentForm.instrument) && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setInstrumentQuery('')
                        onInstrumentChange('')
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1 text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
                      aria-label="Golește selecția"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {(instrumentSearchFocused || instrumentQuery) && (
                  <div className="mt-1 max-h-60 overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg shadow-xl">
                    {!instrumentQuery && (
                      <div className="px-3 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-b sticky top-0">
                        {Array.isArray(availableInstruments) ? availableInstruments.length : 0} instrumente disponibile
                      </div>
                    )}
                    {(instrumentQuery ? filteredAvailableInstruments.slice(0, 10) : (Array.isArray(availableInstruments) ? availableInstruments.slice(0, 20) : [])).map((inst) => (
                      <button
                        key={inst.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onInstrumentChange(inst.id)
                          setInstrumentQuery(inst.name || '')
                          setInstrumentSearchFocused(false)
                        }}
                        onDoubleClick={() => {
                          onInstrumentChange(inst.id)
                          if (onInstrumentDoubleClick) onInstrumentDoubleClick(inst.id)
                        }}
                        className="w-full text-left px-3 py-3 md:py-2.5 min-h-11 md:min-h-0 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-700/50 flex justify-between items-center gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors touch-manipulation"
                      >
                        <span className="font-medium min-w-0 flex-1 truncate">{inst.name}</span>
                      </button>
                    ))}
                    {instrumentQuery && filteredAvailableInstruments.length === 0 && (
                      <div className="px-3 py-4 text-sm text-center text-muted-foreground">Nu s-au găsit instrumente</div>
                    )}
                  </div>
                )}

                {/* Buton „Adaugă rapid” — vizibil doar pe mobile/tabletă (touch); înlocuiește dublu-click */}
                {instrumentForm.instrument && onInstrumentDoubleClick && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onInstrumentDoubleClick(instrumentForm.instrument)}
                    className="md:hidden min-h-11 w-full border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/50 touch-manipulation"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Adaugă rapid (fără serviciu)
                  </Button>
                )}
              </div>
            </div>
            
            {/* Cantitate */}
            <div className="col-span-12 sm:col-span-3">
              <Label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 block">
                Cantitate
              </Label>
              <Input
                className="min-h-11 md:min-h-10 text-base md:text-sm text-center border-2 border-slate-200 dark:border-slate-700 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20 disabled:opacity-50 touch-manipulation"
                inputMode="numeric"
                value={instrumentForm.qty}
                onChange={e => onQtyChange(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder="1"
                disabled={isAddInstrumentDisabled}
              />
            </div>
          </div>

        </div>

        {/* Butoane Acțiuni — full width pe mobile */}
        <div className="px-3 py-3 sm:px-4 border-t border-emerald-200/60 dark:border-emerald-700/40 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap gap-2 sm:gap-3">
          {onAddInstrumentDirect && instrumentForm.instrument && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const qty = Math.max(1, Number(instrumentForm.qty) || 1)
                onAddInstrumentDirect(instrumentForm.instrument, qty)
              }}
              className="w-full md:w-auto max-md:min-h-11 border-slate-600 bg-slate-600 text-white hover:bg-slate-700 dark:bg-slate-600 dark:hover:bg-slate-700 touch-manipulation"
            >
              Adaugă Instrument (fără Serviciu)
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
