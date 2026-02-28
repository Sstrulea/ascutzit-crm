"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Users, X } from "lucide-react"
import type { LeadQuoteItem, Technician } from "@/lib/types/preturi"
import type { Service } from "@/lib/supabase/serviceOperations"
import { parseServiceTimeToSeconds } from "@/lib/utils/service-time"

interface SplitTrayTechnicianDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: LeadQuoteItem[]
  technicians: Technician[]
  instruments: Array<{ id: string; name: string }>
  services: Service[]
  onConfirm: (args: { targetTechnicianId: string; moves: Array<{ trayItemId: string; qtyMove: number }> }) => Promise<void>
}

type GroupVm = {
  key: string
  instrumentId: string | null
  instrumentName: string
  qtyBase: number
  canSplitPartially: boolean
  hasBrandsOrSerials: boolean
  trayItemIds: string[]
  // pentru UI
  lines: Array<{
    trayItemId: string
    item_type: 'service' | 'part' | null
    label: string
    qtyTotal: number
    estSecondsTotal: number
  }>
  estSecondsTotal: number
}

export function SplitTrayTechnicianDialog({
  open,
  onOpenChange,
  items,
  technicians,
  instruments,
  services,
  onConfirm,
}: SplitTrayTechnicianDialogProps) {
  const [targetTechnicianId, setTargetTechnicianId] = useState<string>("")
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<Set<string>>(new Set())
  const [qtyByGroupKey, setQtyByGroupKey] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)

  const instrumentNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of instruments || []) {
      if (i?.id) m.set(i.id, i.name || "Instrument")
    }
    return m
  }, [instruments])

  const serviceTimeSecondsById = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of services || []) {
      if (!s?.id) continue
      const sec = parseServiceTimeToSeconds((s as any)?.time)
      if (sec > 0) m.set(s.id, sec)
    }
    return m
  }, [services])

  const groups: GroupVm[] = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : []
    const byKey = new Map<string, LeadQuoteItem[]>()

    for (const it of safeItems) {
      if (!it?.id) continue
      const instrumentId = it.instrument_id || null
      const key = instrumentId || '__unknown__'
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(it)
    }

    const out: GroupVm[] = []
    for (const [key, list] of byKey) {
      const instrumentId = key === '__unknown__' ? null : key
      const instrumentName = instrumentId ? (instrumentNameById.get(instrumentId) || "Instrument") : "Instrument"

      const trayItemIds = list.map((x) => String(x.id)).filter(Boolean)

      // qtyBase: preferăm rândul de instrument (item_type null), altfel max qty din rânduri
      const instrumentRow = list.find((x) => !x.item_type)
      const qtyBaseRaw =
        Number(instrumentRow?.qty ?? 0) ||
        Math.max(0, ...list.map((x) => Number(x.qty ?? 0) || 0))
      const qtyBase = Math.max(1, Math.floor(qtyBaseRaw || 1))

      const hasBrandsOrSerials = false

      const canSplitPartially = qtyBase > 1

      const lines = list
        .map((it) => {
          const qtyTotal = Math.max(0, Math.floor(Number(it.qty ?? 0) || 0))
          const item_type = (it.item_type ?? null) as any
          const label =
            item_type === "service"
              ? (it.name_snapshot || "Serviciu")
              : item_type === "part"
                ? (it.name_snapshot || "Schimb piesă")
                : "Instrument"
          const sec =
            item_type === "service" && it.service_id
              ? (serviceTimeSecondsById.get(it.service_id) ?? 0)
              : 0
          const estSecondsTotal = sec > 0 ? sec * qtyTotal : 0
          return {
            trayItemId: String(it.id),
            item_type: (item_type === "service" || item_type === "part") ? item_type : null,
            label,
            qtyTotal,
            estSecondsTotal,
          }
        })
        .filter((l) => l.trayItemId)

      const estSecondsTotal = lines.reduce((acc, l) => acc + (Number(l.estSecondsTotal) || 0), 0)

      out.push({
        key,
        instrumentId,
        instrumentName,
        qtyBase,
        canSplitPartially,
        hasBrandsOrSerials,
        trayItemIds,
        lines,
        estSecondsTotal,
      })
    }

    // sort: instrumentele cu qty mai mare primele
    out.sort((a, b) => (b.qtyBase - a.qtyBase) || a.instrumentName.localeCompare(b.instrumentName))
    return out
  }, [items, instrumentNameById, serviceTimeSecondsById])

  // Reset la deschidere (NU depindem de `rows`, altfel pierdem selecția la re-render)
  useEffect(() => {
    if (!open) return
    setTargetTechnicianId("")
    setSelectedGroupKeys(new Set())
    setQtyByGroupKey({})
    setSubmitting(false)
  }, [open])

  // Reconciliere când se schimbă lista de grupuri (de ex. items încărcate/refresh)
  // - păstrăm selecțiile existente (doar pentru rândurile care încă există)
  // - inițializăm qtyByGroupKey pentru grupuri noi
  // - dacă un rând nu permite split parțial, forțăm qtyMove = qtyTotal
  useEffect(() => {
    if (!open) return

    const keys = new Set(groups.map(g => g.key))

    setSelectedGroupKeys(prev => {
      const next = new Set<string>()
      prev.forEach(k => {
        if (keys.has(k)) next.add(k)
      })
      return next
    })

    setQtyByGroupKey(prev => {
      const next: Record<string, number> = {}
      for (const g of groups) {
        const prevVal = prev[g.key]
        const base = typeof prevVal === 'number' ? prevVal : g.qtyBase
        const enforced = g.canSplitPartially ? base : g.qtyBase
        const v = Number.isFinite(enforced) ? Math.floor(enforced) : 1
        const clamped = g.canSplitPartially ? Math.max(1, Math.min(g.qtyBase, v)) : g.qtyBase
        next[g.key] = clamped
      }
      return next
    })
  }, [open, groups])

  const selectedCount = selectedGroupKeys.size

  const canSubmit =
    !!targetTechnicianId &&
    selectedCount > 0 &&
    !submitting

  const toggleSelected = (key: string, checked: boolean) => {
    setSelectedGroupKeys(prev => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const setQtyMove = (key: string, value: number, qtyBase: number, canSplitPartially: boolean) => {
    const v = Number.isFinite(value) ? Math.floor(value) : 1
    const clamped = canSplitPartially ? Math.max(1, Math.min(qtyBase, v)) : qtyBase
    setQtyByGroupKey(prev => ({ ...prev, [key]: clamped }))
  }

  const estSecondsSelected = useMemo(() => {
    let total = 0
    for (const g of groups) {
      if (!selectedGroupKeys.has(g.key)) continue
      const qtyMove = g.canSplitPartially ? (qtyByGroupKey[g.key] || g.qtyBase) : g.qtyBase
      const ratio = g.qtyBase > 0 ? qtyMove / g.qtyBase : 1
      // aproximăm: scalăm doar timpul serviciilor, proporțional cu qty
      total += Math.round(g.estSecondsTotal * ratio)
    }
    return total
  }, [groups, selectedGroupKeys, qtyByGroupKey])

  const formatSecondsHhMm = (seconds: number): string => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0))
    if (total <= 0) return '—'
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    if (h > 0 && m > 0) return `${h} h ${m} m`
    if (h > 0) return `${h} h`
    return `${m} m`
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const moves: Array<{ trayItemId: string; qtyMove: number }> = []

      for (const g of groups) {
        if (!selectedGroupKeys.has(g.key)) continue
        const qtyMoveInstrument = g.canSplitPartially ? (qtyByGroupKey[g.key] || g.qtyBase) : g.qtyBase
        const ratio = g.qtyBase > 0 ? qtyMoveInstrument / g.qtyBase : 1

        // Mutăm toate liniile din instrument (instrument + servicii/piese) proporțional ca să păstrăm consistența.
        for (const line of g.lines) {
          const qtyTotal = Math.max(0, Math.floor(Number(line.qtyTotal) || 0))
          if (qtyTotal <= 0) continue
          // Pentru instrument row, încercăm să mutăm exact qtyMoveInstrument (dacă există rând dedicat)
          const isInstrumentRow = line.item_type === null
          let qtyMove = isInstrumentRow ? qtyMoveInstrument : Math.round(qtyTotal * ratio)
          qtyMove = Math.max(0, Math.min(qtyTotal, Math.floor(qtyMove)))
          if (qtyMove <= 0) continue
          moves.push({ trayItemId: line.trayItemId, qtyMove })
        }
      }

      await onConfirm({ targetTechnicianId, moves })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full max-w-[100vw] h-[90vh] max-h-[100dvh] sm:h-auto sm:max-h-[85vh] sm:max-w-3xl p-0 overflow-hidden border-0 shadow-2xl flex flex-col rounded-t-2xl sm:rounded-lg pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <DialogTitle className="sr-only">Împarte tăvița către tehnician</DialogTitle>

        {/* Header */}
        <div className="bg-gradient-to-r from-fuchsia-600 to-purple-700 px-4 py-4 sm:px-6 sm:py-5 relative flex-shrink-0">
          <div className="flex items-start gap-3 pr-10">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">
                Împarte instrumentele către alt tehnician
              </h2>
              <p className="text-fuchsia-100 text-xs sm:text-sm mt-1">
                Selectezi instrumentele și cantitatea care se mută la alt tehnician; serviciile/piesele aferente se mută proporțional (în aceeași tăviță).
              </p>
            </div>
          </div>
          {/* Close button - touch friendly */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 sm:top-4 sm:right-4 h-10 w-10 sm:h-8 sm:w-8 text-white hover:bg-white/20 hover:text-white touch-manipulation"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </Button>
        </div>

        {/* Content - scrollable on mobile */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 min-h-0 overflow-y-auto">
          {/* Target technician */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tehnician țintă</Label>
            <Select value={targetTechnicianId} onValueChange={setTargetTechnicianId} disabled={submitting}>
              <SelectTrigger className="h-11 min-h-[44px] touch-manipulation">
                <SelectValue placeholder="Alege tehnicianul…" />
              </SelectTrigger>
              <SelectContent>
                {(technicians || []).map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items list */}
          <div className="border rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-2.5 sm:py-2 bg-muted/30 border-b flex items-center justify-between gap-3 flex-shrink-0">
              <div className="text-xs font-semibold text-muted-foreground uppercase">
                Instrumente ({groups.length})
              </div>
              <div className="text-xs text-muted-foreground">
                Selectate: <span className="font-semibold text-foreground">{selectedCount}</span>
              </div>
            </div>

            <div className="max-h-[40vh] sm:max-h-[45vh] overflow-y-auto divide-y overscroll-contain">
              {groups.map(g => {
                const checked = selectedGroupKeys.has(g.key)
                const qtyMove = qtyByGroupKey[g.key] ?? g.qtyBase
                return (
                  <div key={g.key} className="px-4 py-4 sm:py-3 flex items-start gap-3 touch-manipulation">
                    <div className="pt-0.5 sm:pt-1 shrink-0 -ml-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleSelected(g.key, Boolean(v))}
                        disabled={submitting}
                        className="h-5 w-5 sm:h-4 sm:w-4"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">
                            {g.instrumentName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {g.lines
                              .filter(l => l.item_type === 'service')
                              .slice(0, 2)
                              .map(l => l.label)
                              .join(', ') || '—'}
                            {g.lines.filter(l => l.item_type === 'service').length > 2 ? '…' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-xs">x{g.qtyBase}</Badge>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
                        <Label className="text-xs text-muted-foreground w-16 sm:w-20 shrink-0">Cant. mutată</Label>
                        <Input
                          className="h-11 min-h-[44px] w-24 sm:w-28 touch-manipulation"
                          inputMode="numeric"
                          value={String(g.canSplitPartially ? qtyMove : g.qtyBase)}
                          disabled={!checked || submitting || !g.canSplitPartially}
                          onChange={(e) => setQtyMove(g.key, Number(e.target.value || 1), g.qtyBase, g.canSplitPartially)}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}

              {groups.length === 0 && (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  Nu există instrumente care pot fi împărțite.
                </div>
              )}
            </div>
          </div>

          {/* Estimare timp pentru selecție */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border bg-muted/20 px-4 py-3 flex-shrink-0">
            <div className="text-sm">
              <span className="text-muted-foreground">Timp aprox mutat:</span>{' '}
              <span className="font-semibold">{formatSecondsHhMm(estSecondsSelected)}</span>
            </div>
            <Badge variant="outline" className="text-[11px] w-fit">
              bazat pe timpii serviciilor
            </Badge>
          </div>
        </div>

        {/* Footer - touch friendly, safe area */}
        <div className="border-t px-4 sm:px-6 py-4 bg-gray-50 dark:bg-slate-800/50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-11 min-h-[44px] touch-manipulation sm:flex-initial order-2 sm:order-1"
          >
            Anulează
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-purple-700 hover:bg-purple-800 text-white gap-2 h-11 min-h-[44px] touch-manipulation flex-1 sm:flex-initial order-1 sm:order-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Se aplică…
              </>
            ) : (
              "Aplică împărțirea"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

