"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Loader2, Users, X } from "lucide-react"
import type { LeadQuoteItem } from "@/lib/types/preturi"
import type { Service } from "@/lib/supabase/serviceOperations"

export type SplitTrayAssignmentPayload = {
  technicianId: string
  displayName: string
  trayItemIds?: string[]
  items?: { trayItemId: string; quantity: number }[]
}

type ItemWithQty = { id: string; qty: number }

type GroupVm = {
  key: string
  instrumentName: string
  /** Pool pentru distribuire: fiecare item cu cantitatea lui */
  items: ItemWithQty[]
  qtyBase: number
}

interface SplitTrayToRealTraysDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: LeadQuoteItem[]
  instruments: Array<{ id: string; name: string }>
  technicians: Array<{ id: string; name: string }>
  currentUserId: string
  currentUserDisplayName: string
  onConfirm: (args: { assignments: SplitTrayAssignmentPayload[] }) => Promise<void>
}

type AssignTo = "me" | "tech1" | "tech2"

export function SplitTrayToRealTraysDialog({
  open,
  onOpenChange,
  items,
  instruments,
  technicians,
  currentUserId,
  currentUserDisplayName,
  onConfirm,
}: SplitTrayToRealTraysDialogProps) {
  const [splitMode, setSplitMode] = useState<2 | 3>(2)
  const [tech1Id, setTech1Id] = useState("")
  const [tech2Id, setTech2Id] = useState("")
  const [assignByGroup, setAssignByGroup] = useState<Record<string, AssignTo>>({})
  /** Cantitate per destinație per instrument (me, tech1, tech2); suma = qtyBase */
  const [qtySplit, setQtySplit] = useState<Record<string, { me: number; tech1: number; tech2: number }>>({})
  const [submitting, setSubmitting] = useState(false)

  const instrumentNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of instruments || []) {
      if (i?.id) m.set(i.id, i.name || "Instrument")
    }
    return m
  }, [instruments])

  const groups: GroupVm[] = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : []
    const byKey = new Map<string, LeadQuoteItem[]>()
    for (const it of safeItems) {
      if (!it?.id) continue
      const key = it.instrument_id || "__unknown__"
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(it)
    }
    const out: GroupVm[] = []
    for (const [key, list] of byKey) {
      const instrumentId = key === "__unknown__" ? null : key
      const instrumentName = instrumentId ? (instrumentNameById.get(instrumentId) || "Instrument") : "Instrument"
      const itemsWithQty: ItemWithQty[] = list.map((x) => ({
        id: String(x.id),
        qty: Math.max(1, Math.floor(Number(x.qty) || 1)),
      }))
      const qtyBase = itemsWithQty.reduce((s, x) => s + x.qty, 0)
      out.push({ key, instrumentName, items: itemsWithQty, qtyBase })
    }
    out.sort((a, b) => b.qtyBase - a.qtyBase || a.instrumentName.localeCompare(b.instrumentName))
    return out
  }, [items, instrumentNameById])

  useEffect(() => {
    if (!open) return
    setSplitMode(2)
    setTech1Id("")
    setTech2Id("")
    setAssignByGroup({})
    setQtySplit({})
    setSubmitting(false)
  }, [open])

  function getDefaultQtyForGroup(qtyBase: number, n: 2 | 3): { me: number; tech1: number; tech2: number } {
    if (n === 2) {
      const me = qtyBase === 1 ? 1 : Math.floor(qtyBase / 2)
      return { me, tech1: qtyBase - me, tech2: 0 }
    }
    const third = Math.floor(qtyBase / 3)
    const rem = qtyBase - 3 * third
    const me = third + (rem >= 1 ? 1 : 0)
    const tech1 = third + (rem >= 2 ? 1 : 0)
    return { me, tech1, tech2: qtyBase - me - tech1 }
  }

  useEffect(() => {
    if (!open) return
    const next: Record<string, AssignTo> = {}
    const nextQty: Record<string, { me: number; tech1: number; tech2: number }> = {}
    const n = splitMode
    for (const g of groups) {
      const cur = assignByGroup[g.key]
      if (splitMode === 2 && cur === "tech2") next[g.key] = "me"
      else if (cur) next[g.key] = cur
      else next[g.key] = "me"
      nextQty[g.key] = qtySplit[g.key] ?? getDefaultQtyForGroup(g.qtyBase, n)
    }
    setAssignByGroup(next)
    setQtySplit((prev) => ({ ...nextQty, ...prev }))
  }, [open, splitMode, groups.length])

  const tech1 = technicians.find((t) => t.id === tech1Id)
  const tech2 = technicians.find((t) => t.id === tech2Id)

  const qtyValid = useMemo(() => {
    return groups.every((g) => {
      const q = qtySplit[g.key] ?? getDefaultQtyForGroup(g.qtyBase, splitMode)
      const sum = q.me + q.tech1 + (splitMode === 3 ? q.tech2 : 0)
      return sum === g.qtyBase && q.me >= 0 && q.tech1 >= 0 && (splitMode === 2 ? q.tech2 === 0 : q.tech2 >= 0)
    })
  }, [groups, qtySplit, splitMode])

  const canSubmit =
    (splitMode === 2 ? !!tech1Id : !!tech1Id && !!tech2Id && tech1Id !== tech2Id) &&
    groups.every((g) => assignByGroup[g.key]) &&
    qtyValid

  function distributePool(
    pool: ItemWithQty[],
    targetMe: number,
    targetTech1: number,
    targetTech2: number
  ): { me: { trayItemId: string; quantity: number }[]; tech1: { trayItemId: string; quantity: number }[]; tech2: { trayItemId: string; quantity: number }[] } {
    const me: { trayItemId: string; quantity: number }[] = []
    const tech1: { trayItemId: string; quantity: number }[] = []
    const tech2: { trayItemId: string; quantity: number }[] = []
    let needMe = targetMe
    let needTech1 = targetTech1
    let needTech2 = targetTech2
    for (const { id, qty } of pool) {
      let left = qty
      if (needMe > 0 && left > 0) {
        const take = Math.min(left, needMe)
        if (take > 0) {
          me.push({ trayItemId: id, quantity: take })
          needMe -= take
          left -= take
        }
      }
      if (needTech1 > 0 && left > 0) {
        const take = Math.min(left, needTech1)
        if (take > 0) {
          tech1.push({ trayItemId: id, quantity: take })
          needTech1 -= take
          left -= take
        }
      }
      if (needTech2 > 0 && left > 0) {
        const take = Math.min(left, needTech2)
        if (take > 0) {
          tech2.push({ trayItemId: id, quantity: take })
          needTech2 -= take
        }
      }
    }
    return { me, tech1, tech2 }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const rowQtyById = new Map<string, number>()
      for (const g of groups) {
        for (const it of g.items) rowQtyById.set(it.id, it.qty)
      }
      function fullRowIds(items: { trayItemId: string; quantity: number }[]): string[] {
        return items.filter((i) => rowQtyById.get(i.trayItemId) === i.quantity).map((i) => i.trayItemId)
      }

      const meItems: { trayItemId: string; quantity: number }[] = []
      const tech1Items: { trayItemId: string; quantity: number }[] = []
      const tech2Items: { trayItemId: string; quantity: number }[] = []
      for (const g of groups) {
        const q = qtySplit[g.key] ?? getDefaultQtyForGroup(g.qtyBase, splitMode)
        const { me, tech1, tech2 } = distributePool(g.items, q.me, q.tech1, splitMode === 3 ? q.tech2 : 0)
        meItems.push(...me)
        tech1Items.push(...tech1)
        tech2Items.push(...tech2)
      }

      const assignments: SplitTrayAssignmentPayload[] = [
        {
          technicianId: currentUserId,
          displayName: currentUserDisplayName,
          ...(meItems.length > 0 ? { items: meItems, trayItemIds: fullRowIds(meItems) } : { trayItemIds: [] }),
        },
        {
          technicianId: tech1Id,
          displayName: tech1?.name ?? "",
          ...(tech1Items.length > 0 ? { items: tech1Items, trayItemIds: fullRowIds(tech1Items) } : { trayItemIds: [] }),
        },
      ]
      if (splitMode === 3 && tech2Id) {
        assignments.push({
          technicianId: tech2Id,
          displayName: tech2?.name ?? "",
          ...(tech2Items.length > 0 ? { items: tech2Items, trayItemIds: fullRowIds(tech2Items) } : { trayItemIds: [] }),
        })
      }
      await onConfirm({ assignments })
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
        <DialogTitle className="sr-only">Împarte tăvița în 2 sau 3 tăvițe</DialogTitle>

        <div className="bg-gradient-to-r from-fuchsia-600 to-purple-700 px-4 py-4 sm:px-6 sm:py-5 relative flex-shrink-0 pr-12">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">
                Împarte tăvița în 2 sau 3 tăvițe
              </h2>
              <p className="text-fuchsia-100 text-xs sm:text-sm mt-1">
                Se creează tăvițe noi (number+username). Fiecare tăviță se mișcă independent; la finalizare se reunesc automat.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 sm:top-4 sm:right-4 h-10 w-10 sm:h-8 sm:w-8 text-white hover:bg-white/20 touch-manipulation"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </Button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Împarte cu</Label>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                type="button"
                variant={splitMode === 2 ? "default" : "outline"}
                size="sm"
                className="h-11 min-h-[44px] touch-manipulation"
                onClick={() => setSplitMode(2)}
                disabled={submitting}
              >
                Un tehnician (2 tăvițe)
              </Button>
              <Button
                type="button"
                variant={splitMode === 3 ? "default" : "outline"}
                size="sm"
                className="h-11 min-h-[44px] touch-manipulation"
                onClick={() => setSplitMode(3)}
                disabled={submitting}
              >
                Doi tehnicieni (3 tăvițe)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tehnician 1</Label>
              <Select value={tech1Id} onValueChange={setTech1Id} disabled={submitting}>
                <SelectTrigger className="h-11 min-h-[44px] touch-manipulation">
                  <SelectValue placeholder="Alege…" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.filter((t) => t.id !== currentUserId).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {splitMode === 3 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tehnician 2</Label>
                <Select value={tech2Id} onValueChange={setTech2Id} disabled={submitting}>
                  <SelectTrigger className="h-11 min-h-[44px] touch-manipulation">
                    <SelectValue placeholder="Alege…" />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians.filter((t) => t.id !== currentUserId && t.id !== tech1Id).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="border rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-2.5 sm:py-2 bg-muted/30 border-b text-xs font-semibold text-muted-foreground uppercase flex-shrink-0">
              Atribuie fiecare instrument
            </div>
            <div className="max-h-[40vh] sm:max-h-[45vh] overflow-y-auto divide-y overscroll-contain">
              {groups.map((g) => {
                const q = qtySplit[g.key] ?? { me: g.qtyBase, tech1: 0, tech2: 0 }
                const setQty = (dest: "me" | "tech1" | "tech2", val: number) => {
                  const n = Math.max(0, Math.min(g.qtyBase, Math.floor(val)))
                  setQtySplit((prev) => {
                    const cur = prev[g.key] ?? { me: g.qtyBase, tech1: 0, tech2: 0 }
                    const next = { ...cur, [dest]: n }
                    if (splitMode === 2) {
                      next.tech2 = 0
                      if (dest === "me") next.tech1 = g.qtyBase - n
                      else if (dest === "tech1") next.me = g.qtyBase - n
                    } else {
                      const rest = g.qtyBase - n
                      if (dest === "me") {
                        next.tech1 = Math.max(0, Math.min(rest, cur.tech1))
                        next.tech2 = rest - next.tech1
                      } else if (dest === "tech1") {
                        next.tech2 = Math.max(0, Math.min(rest, cur.tech2))
                        next.me = rest - next.tech2
                      } else {
                        next.tech1 = Math.max(0, Math.min(rest, cur.tech1))
                        next.me = rest - next.tech1
                      }
                    }
                    return { ...prev, [g.key]: next }
                  })
                }
                return (
                  <div key={g.key} className="px-4 py-4 sm:py-3 space-y-3 touch-manipulation">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{g.instrumentName}</div>
                        <div className="text-xs text-muted-foreground">Total: x{g.qtyBase}</div>
                      </div>
                      <Select
                        value={assignByGroup[g.key] ?? "me"}
                        onValueChange={(v) => {
                          const to = v as AssignTo
                          setAssignByGroup((prev) => ({ ...prev, [g.key]: to }))
                          setQtySplit((prev) => {
                            const base = to === "me" ? { me: g.qtyBase, tech1: 0, tech2: 0 }
                              : to === "tech1" ? { me: 0, tech1: g.qtyBase, tech2: 0 }
                              : { me: 0, tech1: 0, tech2: g.qtyBase }
                            return { ...prev, [g.key]: base }
                          })
                        }}
                        disabled={submitting}
                      >
                        <SelectTrigger className="h-11 min-h-[44px] w-full sm:w-[140px] touch-manipulation">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="me">Eu ({currentUserDisplayName})</SelectItem>
                          <SelectItem value="tech1">{tech1 ? tech1.name : "Tehnician 1"}</SelectItem>
                          {splitMode === 3 && (
                            <SelectItem value="tech2">{tech2 ? tech2.name : "Tehnician 2"}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-2 text-xs">
                      <span className="text-muted-foreground w-full sm:w-16">Cantități:</span>
                      <label className="flex items-center gap-1.5">
                        <span className="text-muted-foreground min-w-[1.5rem]">Eu</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={g.qtyBase}
                          className="h-11 min-h-[44px] w-16 sm:w-14 text-center touch-manipulation"
                          value={q.me}
                          onChange={(e) => setQty("me", Number(e.target.value))}
                          disabled={submitting}
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span className="text-muted-foreground min-w-[1.5rem]">T1</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={g.qtyBase}
                          className="h-11 min-h-[44px] w-16 sm:w-14 text-center touch-manipulation"
                          value={q.tech1}
                          onChange={(e) => setQty("tech1", Number(e.target.value))}
                          disabled={submitting}
                        />
                      </label>
                      {splitMode === 3 && (
                        <label className="flex items-center gap-1.5">
                          <span className="text-muted-foreground min-w-[1.5rem]">T2</span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={g.qtyBase}
                            className="h-11 min-h-[44px] w-16 sm:w-14 text-center touch-manipulation"
                            value={q.tech2}
                            onChange={(e) => setQty("tech2", Number(e.target.value))}
                            disabled={submitting}
                          />
                        </label>
                      )}
                      <span className="text-muted-foreground w-full sm:w-auto mt-1 sm:mt-0">
                        = {q.me + q.tech1 + (splitMode === 3 ? q.tech2 : 0)} / {g.qtyBase}
                      </span>
                    </div>
                  </div>
                )
              })}
              {groups.length === 0 && (
                <div className="px-4 py-6 text-sm text-muted-foreground">Nu există instrumente.</div>
              )}
            </div>
          </div>
        </div>

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
