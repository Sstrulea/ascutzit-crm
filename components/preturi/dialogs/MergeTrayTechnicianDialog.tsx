"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, GitMerge, X } from "lucide-react"
import { toast } from "sonner"
import type { LeadQuoteItem, Technician } from "@/lib/types/preturi"
import type { Service } from "@/lib/supabase/serviceOperations"

interface MergeTrayTechnicianDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: LeadQuoteItem[]
  technicians: Technician[]
  instruments: Array<{ id: string; name: string }>
  services: Service[]
  onConfirm: (args: { targetTechnicianId: string; moves: Array<{ trayItemId: string; qtyMove: number }> }) => Promise<void>
}

type RowVm = {
  id: string
  instrumentName: string
  serviceLabel: string
  qtyTotal: number
  hasBrandsOrSerials: boolean
  currentTechnicianId: string | null
  currentTechnicianName: string
}

export function MergeTrayTechnicianDialog({
  open,
  onOpenChange,
  items,
  technicians,
  instruments,
  services,
  onConfirm,
}: MergeTrayTechnicianDialogProps) {
  const [targetTechnicianId, setTargetTechnicianId] = useState<string>("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const instrumentNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of instruments || []) {
      if (i?.id) m.set(i.id, i.name || "Instrument")
    }
    return m
  }, [instruments])

  const technicianNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of technicians || []) {
      if (t?.id) m.set(t.id, t.name || "Tehnician")
    }
    return m
  }, [technicians])

  const rows: RowVm[] = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : []
    const safeServices = Array.isArray(services) ? services : []
    return safeItems
      .filter(it => it && it.id)
      .filter(it => (it.item_type !== null) || !!it.instrument_id) // ignoră rânduri invalide
      .map(it => {
        const qtyTotal = Number(it.qty || 1)

        const hasBrandsOrSerials = false

        const instrumentName = it.instrument_id ? (instrumentNameById.get(it.instrument_id) || "Instrument") : "—"
        const serviceLabel =
          it.item_type === "service"
            ? (it.name_snapshot || "Serviciu")
            : it.item_type === "part"
              ? (it.name_snapshot || "Schimb piesă")
              : "(fără serviciu)"

        // Tehnicianul e la nivel de tăviță (trays), nu per item; păstrăm null pentru compatibilitate cu dialogul vechi
        const currentTechnicianId: string | null = null
        const currentTechnicianName = "Neasignat"

        // Dacă rândul are service_id dar lipsește name_snapshot, încercăm să-l derivăm pentru UI
        const derivedServiceName =
          !it.name_snapshot && it.item_type === "service" && it.service_id
            ? (safeServices.find(s => s.id === it.service_id)?.name || null)
            : null

        return {
          id: it.id,
          instrumentName,
          serviceLabel: derivedServiceName || serviceLabel,
          qtyTotal,
          hasBrandsOrSerials,
          currentTechnicianId,
          currentTechnicianName,
        }
      })
  }, [items, instrumentNameById, technicianNameById, services])

  // Reset la deschidere
  useEffect(() => {
    if (!open) return
    setTargetTechnicianId("")
    setSelectedIds(new Set())
    setSubmitting(false)
  }, [open])

  // Auto-select: doar când utilizatorul alege tehnicianul țintă (o singură dată per alegere).
  // NU depindem de `rows` ca să nu re-rulăm la fiecare refresh items din parent (altfel selecția manuală se șterge).
  useEffect(() => {
    if (!open) return
    if (!targetTechnicianId) return
    setSelectedIds(prev => {
      const next = new Set<string>()
      for (const r of rows) {
        if (r.currentTechnicianId !== targetTechnicianId) next.add(r.id)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intenționat fără rows: auto-select doar la schimbarea tehnicianului
  }, [open, targetTechnicianId])

  const selectedCount = selectedIds.size
  const canSubmit = !!targetTechnicianId && selectedCount > 0 && !submitting

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      // Trimitem doar pozițiile care nu sunt deja la tehnicianul țintă (evită eroarea target_equals_current_technician din RPC)
      const moves = rows
        .filter(r => selectedIds.has(r.id) && r.currentTechnicianId !== targetTechnicianId)
        .map(r => ({ trayItemId: r.id, qtyMove: r.qtyTotal }))
        .filter(m => m.qtyMove > 0)

      if (moves.length === 0) {
        // Toate pozițiile selectate sunt deja la acest tehnician – comanda e deja reunîtă
        const techName = technicians.find(t => t.id === targetTechnicianId)?.name || 'tehnicianul ales'
        toast.success(`Toate pozițiile sunt deja la ${techName}. Comanda este deja reunîtă.`)
        onOpenChange(false)
        return
      }

      await onConfirm({ targetTechnicianId, moves })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden border-0 shadow-2xl">
        <DialogTitle className="sr-only">Reunește pozițiile către un tehnician</DialogTitle>

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-sky-700 px-6 py-5 relative">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <GitMerge className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-white truncate">Reunește către un singur tehnician</h2>
              <p className="text-indigo-100 text-sm">
                Mută integral pozițiile selectate la tehnicianul ales (în aceeași tăviță).
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-8 w-8 text-white hover:bg-white/20 hover:text-white"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tehnician final</Label>
            <Select value={targetTechnicianId} onValueChange={setTargetTechnicianId} disabled={submitting}>
              <SelectTrigger className="h-11">
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
            <p className="text-xs text-muted-foreground">
              După selectare, sunt bifate automat toate pozițiile care nu sunt deja la tehnicianul final.
            </p>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-muted/30 border-b flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase">
                Poziții ({rows.length})
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">
                  Selectate: <span className="font-semibold text-foreground">{selectedCount}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={submitting || rows.length === 0}
                  onClick={() => setSelectedIds(new Set(rows.map(r => r.id)))}
                >
                  Selectează tot
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={submitting || rows.length === 0}
                  onClick={() => setSelectedIds(new Set())}
                >
                  Deselectează
                </Button>
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto divide-y">
              {rows.map(r => {
                const checked = selectedIds.has(r.id)
                return (
                  <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleSelected(r.id, Boolean(v))}
                        disabled={submitting}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">
                            {r.instrumentName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.serviceLabel}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary">x{r.qtyTotal}</Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {r.currentTechnicianName}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
          >
            Anulează
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 px-6 shadow-lg"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Se reunește…
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4" />
                Reunește
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

