'use client'

import { useState, useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { PrintView } from '@/components/print'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { Lead } from '@/app/(crm)/dashboard/page'
import type { LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { TrayItem } from '@/lib/supabase/serviceFileOperations'
import type { LeadQuoteItem } from '@/lib/types/preturi'

const supabase = supabaseBrowser()

interface PrintViewDataProps {
  lead: Lead
  quotes: LeadQuote[]
  allSheetsTotal: number
  urgentMarkupPct: number
  subscriptionType: 'services' | 'parts' | 'both' | ''
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>
  pipelinesWithIds: Array<{ id: string; name: string }>
  serviceFileNumber?: string | number
  isPrintMode?: boolean
}

/**
 * Componenta pentru calcularea si afisarea datelor de print pentru toate tavitele
 */
export function PrintViewData({ 
  lead, 
  quotes, 
  allSheetsTotal, 
  urgentMarkupPct,
  subscriptionType,
  services,
  instruments,
  pipelinesWithIds,
  serviceFileNumber,
  isPrintMode = true
}: PrintViewDataProps) {
  const [sheetsData, setSheetsData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadAllSheetsData = async () => {
      if (!quotes.length) {
        setSheetsData([])
        setLoading(false)
        return
      }

      // Încarcă toate tray_items pentru tăvițele din quotes (id = tray id; fallback la tray_id)
      const trayIds = quotes.map(q => q.id || (q as any).tray_id).filter(Boolean)
      if (trayIds.length === 0) {
        setSheetsData([])
        setLoading(false)
        return
      }
      const { data: allTrayItems, error: itemsError } = await supabase
        .from('tray_items')
        .select('id, tray_id, instrument_id, service_id, part_id, department_id, qty, notes, pipeline, created_at')
        .in('tray_id', trayIds)
        .order('tray_id', { ascending: true })
        .order('id', { ascending: true })

      if (itemsError) {
        console.error('[PrintViewData] Eroare la încărcarea tray_items:', itemsError)
        setSheetsData([])
        setLoading(false)
        return
      }
      
      // Grupează items-urile pe tăviță
      const itemsByTray = new Map<string, TrayItem[]>()
      allTrayItems?.forEach((item: TrayItem) => {
        if (!itemsByTray.has(item.tray_id)) {
          itemsByTray.set(item.tray_id, [])
        }
        itemsByTray.get(item.tray_id)!.push(item)
      })

      // Tehnicienii sunt la nivel de tăviță (trays), nu per item
      const technicianIds = new Set<string>()
      quotes.forEach((q: LeadQuote) => {
        if ((q as any).technician_id) technicianIds.add((q as any).technician_id)
        if ((q as any).technician2_id) technicianIds.add((q as any).technician2_id)
        if ((q as any).technician3_id) technicianIds.add((q as any).technician3_id)
      })
      const technicianMap = new Map<string, string>()
      if (technicianIds.size > 0) {
        const { data: technicians } = await supabase
          .from('app_members')
          .select('user_id, name')
          .in('user_id', Array.from(technicianIds))
        ;(technicians as Array<{ user_id: string; name: string | null }> | null)?.forEach(tech => {
          if (tech.name) technicianMap.set(tech.user_id, tech.name)
        })
      }

      // Creează map-uri pentru instrumente și pipeline-uri (o singură dată)
      const instrumentPipelineMap = new Map<string, string | null>()
      const pipelineMap = new Map<string, string>()
      
      if (instruments) {
        instruments.forEach(inst => {
          if (inst.pipeline) {
            instrumentPipelineMap.set(inst.id, inst.pipeline)
          }
        })
      }
      
      if (pipelinesWithIds) {
        pipelinesWithIds.forEach(p => {
          pipelineMap.set(p.id, p.name)
        })
      }

      // Procesează fiecare tăviță (fără query-uri suplimentare)
      const sheets = quotes.map((quote) => {
          const trayId = quote.id || (quote as any).tray_id
          const trayItems = itemsByTray.get(trayId) || []
          
          // Transformă TrayItem în LeadQuoteItem (aceeași logică ca în listQuoteItems)
          const items = trayItems.map((item: TrayItem) => {
            let notesData: any = {}
            if (item.notes) {
              try {
                notesData = JSON.parse(item.notes)
              } catch (e) {}
            }
            const getSerialFromNotes = () => {
              if (notesData.serial_number) return notesData.serial_number
              return null
            }
            
            // Determină item_type
            // IMPORTANT: Un item este "part" DOAR dacă are explicit part_id setat
            let item_type: 'service' | 'part' | null = notesData.item_type || null
            if (!item_type) {
              if (item.service_id) {
                item_type = 'service'
              } else if (item.part_id) {
                item_type = 'part'
              }
              // Dacă nu are nici service_id nici part_id, rămâne null (instrument)
            }
            
            let price = notesData.price || 0
            if (!price && item_type === 'service' && item.service_id && services) {
              const service = services.find((s: any) => s.id === item.service_id)
              price = service?.price || 0
            }
            
            let department: string | null = null
            let instrumentId = item.instrument_id
            let instrumentName: string | null = null
            
            if (!instrumentId && item_type === 'service' && item.service_id && services) {
              const service = services.find((s: any) => s.id === item.service_id)
              if (service?.instrument_id) {
                instrumentId = service.instrument_id
              }
            }
            
            // Obține numele instrumentului din array-ul instruments
            if (instrumentId && instruments) {
              const instrument = instruments.find(inst => inst.id === instrumentId)
              if (instrument) {
                instrumentName = instrument.name
              }
            }
            
            // Tehnician la nivel de tăviță (quote), nu per item
            const trayTechIds = [(quote as any).technician_id, (quote as any).technician2_id, (quote as any).technician3_id].filter(Boolean)
            const technicianName = trayTechIds.length > 0
              ? trayTechIds.map((id: string) => technicianMap.get(id) || id).join(', ')
              : null
            
            if (instrumentId && instrumentPipelineMap.size > 0 && pipelineMap.size > 0) {
              const pipelineId = instrumentPipelineMap.get(instrumentId)
              if (pipelineId) {
                department = pipelineMap.get(pipelineId) || null
              }
            }
            
            // IMPORTANT: Nu folosim ...item pentru a evita referințe circulare
            // Extragem explicit doar proprietățile necesare
            return {
              id: item.id,
              tray_id: item.tray_id,
              department_id: item.department_id || null,
              instrument_id: instrumentId || item.instrument_id || null,
              instrument_name: instrumentName,
              service_id: item.service_id || null,
              part_id: item.part_id || null,
              technician_id: (quote as any).technician_id || null,
              technician_name: technicianName,
              notes: item.notes || null,
              item_type,
              price: price || 0,
              discount_pct: notesData.discount_pct || 0,
              urgent: notesData.urgent || false,
              name_snapshot: notesData.name_snapshot || notesData.name || '',
              brand: notesData.brand || null,
              serial_number: getSerialFromNotes() || null,
              garantie: notesData.garantie || false,
              pipeline_id: notesData.pipeline_id || null,
              pipeline: item.pipeline || null,
              department,
              qty: item.qty || 1,
              technician: technicianName, // Pentru compatibilitate cu print-view
            } as LeadQuoteItem & { price: number; department?: string | null; instrument_name?: string | null; technician_name?: string | null; technician?: string | null }
          })
          
          // Exclude items-urile cu item_type: null (doar instrument, fără serviciu) din calculele de totaluri
          const visibleItems = items.filter(it => it.item_type !== null)
          
          // Helper: qty reparabil = qty - nr. nereparate (tray_items.unrepaired_qty sau notes)
          const getRepairableQty = (it: any) => {
            const qty = it.qty || 1
            const unrepaired = Number(it.unrepaired_qty ?? it.non_repairable_qty) || 0
            return Math.max(0, qty - unrepaired)
          }
          
          // Calculeaza totalurile pentru aceasta tavita
          // Scădem cantitatea de nereparabile din calcul
          const subtotal = visibleItems.reduce((acc, it) => acc + getRepairableQty(it) * it.price, 0)
          const totalDiscount = visibleItems.reduce(
            (acc, it) => acc + getRepairableQty(it) * it.price * (Math.min(100, Math.max(0, it.discount_pct || 0)) / 100),
            0
          )
          const urgentAmount = visibleItems.reduce((acc, it) => {
            const afterDisc = getRepairableQty(it) * it.price * (1 - Math.min(100, Math.max(0, it.discount_pct || 0)) / 100)
            return acc + (it.urgent ? afterDisc * (urgentMarkupPct / 100) : 0)
          }, 0)

          // Calculeaza discount-urile pentru abonament (10% servicii, 5% piese)
          const servicesTotal = items
            .filter(it => it.item_type === 'service')
            .reduce((acc, it) => {
              const base = getRepairableQty(it) * it.price
              const disc = base * (Math.min(100, Math.max(0, it.discount_pct || 0)) / 100)
              const afterDisc = base - disc
              const urgent = it.urgent ? afterDisc * (URGENT_MARKUP_PCT / 100) : 0
              return acc + afterDisc + urgent
            }, 0)
          
          const partsTotal = items
            .filter(it => it.item_type === 'part')
            .reduce((acc, it) => {
              const base = getRepairableQty(it) * it.price
              const disc = base * (Math.min(100, Math.max(0, it.discount_pct || 0)) / 100)
              return acc + base - disc
            }, 0)
          
          let subscriptionDiscountAmount = 0
          if (subscriptionType === 'services' || subscriptionType === 'both') {
            subscriptionDiscountAmount += servicesTotal * 0.10
          }
          if (subscriptionType === 'parts' || subscriptionType === 'both') {
            subscriptionDiscountAmount += partsTotal * 0.05
          }

          const total = subtotal - totalDiscount + urgentAmount - subscriptionDiscountAmount

          return {
            quote,
            items,
            subtotal,
            totalDiscount,
            urgentAmount,
            total,
            hasSubscription: subscriptionType !== '',
            subscriptionDiscountServices: (subscriptionType === 'services' || subscriptionType === 'both') ? 10 : undefined,
            subscriptionDiscountParts: (subscriptionType === 'parts' || subscriptionType === 'both') ? 5 : undefined,
            isCash: (quote as any).is_cash || false,
            isCard: (quote as any).is_card || false,
          }
        })

      setSheetsData(sheets)
      setLoading(false)
    }

    loadAllSheetsData()
  }, [quotes, subscriptionType, urgentMarkupPct, services, instruments, pipelinesWithIds])

  if (loading) {
    return (
      <div id="print-section" className="p-4 bg-white text-black">
        <div className="text-center text-gray-500">Se încarcă datele pentru print...</div>
      </div>
    )
  }

  if (sheetsData.length === 0) {
    return (
      <div id="print-section" className="p-4 bg-white text-black">
        <div className="text-center text-gray-500">
          <p>Nu există date pentru print.</p>
          <p className="text-xs mt-2">
            (Quotes: {quotes?.length || 0}, Services: {services?.length || 0})
          </p>
        </div>
      </div>
    )
  }

  return (
    <PrintView
      lead={lead}
      sheets={sheetsData}
      allSheetsTotal={allSheetsTotal}
      urgentMarkupPct={urgentMarkupPct}
      services={services}
      instruments={instruments}
      serviceFileNumber={serviceFileNumber || quotes[0]?.number}
      isPrintMode={isPrintMode}
    />
  )
}



