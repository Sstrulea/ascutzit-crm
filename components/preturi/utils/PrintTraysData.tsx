'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { PrintTraysView } from '@/components/print'
import { listTraysForServiceSheet } from '@/lib/utils/preturi-helpers'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { TrayItem } from '@/lib/supabase/serviceFileOperations'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { TrayPrintSheet } from '@/lib/utils/printTrayDocument'

const supabase = supabaseBrowser()

interface PrintTraysDataProps {
  lead: Lead
  quotes: LeadQuote[]
  officeDirect: boolean
  curierTrimis: boolean
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  serviceFileNumber?: string | number
  /** ID fișă – folosit când quotes e gol pentru a încărca tăvițele din DB. */
  serviceFileId?: string | null
  isPrintMode?: boolean
  /** Apelat când datele pentru print sunt încărcate (pentru print din date, nu din DOM). */
  onSheetsLoaded?: (sheets: TrayPrintSheet[]) => void
}

interface SheetData {
  quote: LeadQuote
  items: LeadQuoteItem[]
  subtotal: number
  totalDiscount: number
  urgentAmount: number
  total: number
}

export function PrintTraysData({
  lead,
  quotes: quotesProp,
  officeDirect,
  curierTrimis,
  services,
  instruments,
  pipelinesWithIds,
  serviceFileNumber,
  serviceFileId,
  isPrintMode = true,
  onSheetsLoaded,
}: PrintTraysDataProps) {
  const [sheetsData, setSheetsData] = useState<SheetData[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchedQuotes, setFetchedQuotes] = useState<LeadQuote[] | null>(null)
  const [techniciansByTrayId, setTechniciansByTrayId] = useState<Map<string, string>>(new Map())

  const quotes = quotesProp?.length ? quotesProp : (fetchedQuotes ?? [])

  useEffect(() => {
    if (!quotesProp?.length && serviceFileId) {
      listTraysForServiceSheet(serviceFileId)
        .then((trays) => setFetchedQuotes(trays || []))
        .catch(() => setFetchedQuotes([]))
      return
    }
    if (!quotesProp?.length) setFetchedQuotes(null)
  }, [serviceFileId, quotesProp?.length])

  useEffect(() => {
    const load = async () => {
      if (!quotes.length) {
        if (serviceFileId && fetchedQuotes === null) return
        setSheetsData([])
        setLoading(false)
        return
      }

      const trayIds = quotes.map((q) => q.id)
      const { data: allTrayItems, error: itemsError } = await supabase
        .from('tray_items')
        .select('id, tray_id, instrument_id, service_id, part_id, department_id, qty, notes, pipeline, created_at')
        .in('tray_id', trayIds)
        .order('tray_id, id', { ascending: true })

      if (itemsError) {
        setSheetsData([])
        setLoading(false)
        return
      }

      const itemsByTray = new Map<string, TrayItem[]>()
      ;(allTrayItems || []).forEach((item: TrayItem) => {
        if (!itemsByTray.has(item.tray_id)) itemsByTray.set(item.tray_id, [])
        itemsByTray.get(item.tray_id)!.push(item)
      })

      const instrumentPipelineMap = new Map<string, string | null>()
      const pipelineMap = new Map<string, string>()
      instruments.forEach((i) => {
        if (i.pipeline) instrumentPipelineMap.set(i.id, i.pipeline)
      })
      pipelinesWithIds.forEach((p) => pipelineMap.set(p.id, p.name))

      const sheets: SheetData[] = quotes.map((quote) => {
        const trayItems = itemsByTray.get(quote.id) || []
        const items = trayItems.map((item: TrayItem) => {
          let notesData: any = {}
          try {
            if (item.notes) notesData = JSON.parse(item.notes)
          } catch {}
          let item_type: 'service' | 'part' | null = (notesData.item_type as any) || null
          if (!item_type) {
            if (item.service_id) item_type = 'service'
            else if (item.part_id) item_type = 'part'
          }
          let price = notesData.price || 0
          if (!price && item_type === 'service' && item.service_id && services) {
            const s = services.find((x: any) => x.id === item.service_id)
            price = s?.price || 0
          }
          let instrumentId = item.instrument_id
          let instrumentName: string | null = null
          if (!instrumentId && item_type === 'service' && item.service_id && services) {
            const s = services.find((x: any) => x.id === item.service_id)
            if (s?.instrument_id) instrumentId = s.instrument_id
          }
          if (instrumentId && instruments) {
            const inst = instruments.find((x) => x.id === instrumentId)
            if (inst) instrumentName = inst.name
          }
          let department: string | null = null
          if (instrumentId && instrumentPipelineMap.size && pipelineMap.size) {
            const pid = instrumentPipelineMap.get(instrumentId)
            if (pid) department = pipelineMap.get(pid) || null
          }
          return {
            id: item.id,
            tray_id: item.tray_id,
            department_id: item.department_id || null,
            instrument_id: instrumentId || item.instrument_id || null,
            instrument_name: instrumentName,
            service_id: item.service_id || null,
            part_id: item.part_id || null,
            technician_id: (quote as LeadQuote & { technician_id?: string | null }).technician_id || null,
            notes: item.notes || null,
            item_type,
            price: price || 0,
            discount_pct: notesData.discount_pct || 0,
            urgent: notesData.urgent || false,
            name_snapshot: notesData.name_snapshot || notesData.name || '',
            brand: notesData.brand || null,
            serial_number: notesData.serial_number || null,
            garantie: notesData.garantie || false,
            pipeline_id: notesData.pipeline_id || null,
            pipeline: item.pipeline || null,
            department,
            qty: item.qty || 1,
          } as LeadQuoteItem & {
            price: number
            department?: string | null
            instrument_name?: string | null
          }
        })

        const visible = items.filter((it) => it.item_type != null)
        const subtotal = visible.reduce((a, it) => a + (it.qty ?? 1) * (it as any).price, 0)
        const totalDiscount = visible.reduce(
          (a, it) =>
            a +
            (it.qty ?? 1) * (it as any).price * (Math.min(100, Math.max(0, it.discount_pct ?? 0)) / 100),
          0
        )
        const urgentAmount = visible.reduce((a, it) => {
          const after = (it.qty ?? 1) * (it as any).price * (1 - Math.min(100, Math.max(0, it.discount_pct ?? 0)) / 100)
          return a + (it.urgent ? after * 0.3 : 0)
        }, 0)
        const total = subtotal - totalDiscount + urgentAmount

        return {
          quote,
          items,
          subtotal,
          totalDiscount,
          urgentAmount,
          total,
        }
      })

      const techIds = new Set<string>()
      quotes.forEach((q: any) => {
        if (q?.technician_id) techIds.add(q.technician_id)
        if (q?.technician2_id) techIds.add(q.technician2_id)
        if (q?.technician3_id) techIds.add(q.technician3_id)
      })
      let techNamesMap = new Map<string, string>()
      if (techIds.size > 0) {
        const { data: members } = await supabase
          .from('app_members')
          .select('user_id, name')
          .in('user_id', Array.from(techIds))
        ;(members || []).forEach((m: any) => {
          techNamesMap.set(m.user_id, m.name || m.Name || `User ${String(m.user_id).slice(0, 8)}`)
        })
      }
      const techniciansByTrayId = new Map<string, string>()
      quotes.forEach((q: any) => {
        const names: string[] = []
        for (const id of [q?.technician_id, q?.technician2_id, q?.technician3_id].filter(Boolean)) {
          const n = techNamesMap.get(id)
          if (n && !names.includes(n)) names.push(n)
        }
        techniciansByTrayId.set(q.id, names.join(', ') || '—')
      })

      setSheetsData(sheets)
      setTechniciansByTrayId(techniciansByTrayId)
      onSheetsLoaded?.(sheets as TrayPrintSheet[])
      setLoading(false)
    }

    load()
    // onSheetsLoaded nu în deps: evită re-run la fiecare schimbare de referință și apel dublu la print
  }, [quotes, services, instruments, pipelinesWithIds, serviceFileId, fetchedQuotes])

  if (loading) {
    return (
      <div id="print-trays-section" className="p-4 bg-white text-black">
        <div className="text-center text-gray-500">Se încarcă datele pentru print...</div>
      </div>
    )
  }

  if (!sheetsData.length) {
    return (
      <div id="print-trays-section" className="p-4 bg-white text-black">
        <div className="text-center text-gray-500">Nu există tăvițe pentru această fișă.</div>
      </div>
    )
  }

  return (
    <PrintTraysView
      lead={lead}
      sheets={sheetsData}
      serviceFileNumber={serviceFileNumber ?? (quotes[0] as any)?.number}
      officeDirect={officeDirect}
      curierTrimis={curierTrimis}
      services={services}
      instruments={instruments}
      techniciansByTrayId={techniciansByTrayId}
      isPrintMode={isPrintMode}
    />
  )
}
