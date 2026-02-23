'use client'

import { useMemo } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'

interface InstrumentWithRepairable {
  id: string
  name: string
  repairable?: boolean
}

interface InstrumenteReparatieDefectSectionProps {
  items: LeadQuoteItem[]
  instruments: InstrumentWithRepairable[]
  services: Service[]
}

/** Secțiune în detaliile fișă/tăviță/lead: instrumente din comandă care nu s-au supus reparației sau au fost defectate */
export function InstrumenteReparatieDefectSection({
  items,
  instruments,
  services,
}: InstrumenteReparatieDefectSectionProps) {
  const nonRepairable = useMemo(() => {
    const list: Array<{ instrumentName: string; itemName: string }> = []
    const safeItems = Array.isArray(items) ? items : []
    const safeInstruments = Array.isArray(instruments) ? instruments : []
    const safeServices = Array.isArray(services) ? services : []

    safeItems.forEach((item) => {
      let instrumentId: string | null = item.instrument_id || null
      if (!instrumentId && item.service_id) {
        const svc = safeServices.find((s) => s.id === item.service_id)
        if (svc?.instrument_id) instrumentId = svc.instrument_id
      }
      if (!instrumentId) return

      const inst = safeInstruments.find((i) => i.id === instrumentId)
      const instrumentName = inst?.name ?? 'Instrument'
      const itemName = item.name_snapshot || (item.item_type === 'part' ? 'Piesă' : 'Serviciu')
      const qty = item.qty ?? 1
      const nrep = Number((item as any).unrepaired_qty ?? item.non_repairable_qty) || 0

      if (nrep > 0) {
        const label = `${itemName} (${nrep} din ${qty} nereparabile)`
        if (!list.some((x) => x.instrumentName === instrumentName && x.itemName === label)) {
          list.push({ instrumentName, itemName: label })
        }
      } else if (inst?.repairable === false) {
        if (!list.some((x) => x.instrumentName === instrumentName && x.itemName === itemName)) {
          list.push({ instrumentName, itemName })
        }
      }
    })

    return list
  }, [items, instruments, services])

  const hasAny = nonRepairable.length > 0
  if (!hasAny) return null

  return (
    <div className="mx-2 sm:mx-4 mb-4 p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          Instrumente în comandă: nereparabile
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
          <XCircle className="h-3.5 w-3.5" />
          Nu se pot repara (catalog sau cantitate în comandă)
        </div>
        <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
          {nonRepairable.map((x, i) => (
            <li key={i}>
              {x.instrumentName} — {x.itemName}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
