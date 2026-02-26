'use client'

/**
 * Încarcă datele VanzariViewV4 din baza de date (tray_items) pentru afișare la deschiderea fișei.
 * Folosește un număr minim de apeluri: listTraysForServiceFile + listTrayItemsForTrays.
 */

import { listTraysForServiceFile, listTrayItemsForTrays } from '@/lib/supabase/serviceFileOperations'

export interface V4LoadedInstrument {
  id: string
  localId: string
  name: string
  quantity: number
  serialNumber: string
  discount?: number
  garantie?: boolean
}

export interface V4LoadedService {
  instrumentLocalId: string
  serviceId: string
  serviceName: string
  basePrice: number
  quantity: number
  instrumentQty?: number
  discount: number
  unrepairedCount: number
  trayId?: string
  forSerialNumbers?: string[]
}

export interface V4LoadedPart {
  id: string
  instrumentLocalId: string
  name: string
  unitPrice: number
  quantity: number
  trayId?: string
  forSerialNumbers?: string[]
}

export interface V4LoadedTray {
  id: string
  number: string
}

export interface V4InitialData {
  instruments: V4LoadedInstrument[]
  services: V4LoadedService[]
  parts: V4LoadedPart[]
  trays: V4LoadedTray[]
  instrumentTrayId: Record<string, string | undefined>
}

function generateLocalId(): string {
  return `v4-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function parseNotes(notes: string | null): Record<string, unknown> {
  if (!notes || typeof notes !== 'string') return {}
  try {
    return JSON.parse(notes) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Încarcă datele pentru VanzariViewV4 din DB.
 * - Dacă traysPreloaded e dat: 1 apel (listTrayItemsForTrays).
 * - Altfel: 2 apeluri (listTraysForServiceFile + listTrayItemsForTrays).
 */
export async function loadVanzariViewV4FromDb(
  fisaId: string,
  instrumentsCatalog: Array<{ id: string; name: string }>,
  options?: {
    traysPreloaded?: Array<{ id: string; number?: string }>
    /** Când e setat (ex. view departament), se afișează doar tray_items cu department_id = filterDepartmentId. */
    filterDepartmentId?: string | null
  }
): Promise<{ data: V4InitialData | null; error: Error | null }> {
  try {
    let trays: Array<{ id: string; number?: string }>
    if (options?.traysPreloaded?.length) {
      trays = options.traysPreloaded
    } else {
      const { data: traysData, error: traysErr } = await listTraysForServiceFile(fisaId)
      if (traysErr) throw traysErr
      trays = traysData ?? []
    }
    if (trays.length === 0) {
      return { data: { instruments: [], services: [], parts: [], trays: [], instrumentTrayId: {} }, error: null }
    }

    const trayIds = trays.map((t) => t.id)
    const { data: items, error: itemsErr } = await listTrayItemsForTrays(trayIds)
    if (itemsErr) throw itemsErr
    let trayItems = items ?? []

    // În view-ul de departament: afișează doar itemurile care aparțin pipeline-ului (department_id = id-ul pipeline-ului)
    if (options?.filterDepartmentId) {
      trayItems = trayItems.filter((row: any) => row.department_id === options.filterDepartmentId)
    }

    const catalogMap = new Map(instrumentsCatalog.map((i) => [i.id, i.name]))

    // Când filtrăm după departament, păstrăm doar tăvițele care au cel puțin un item în acel departament
    const trayIdsWithItems = options?.filterDepartmentId
      ? new Set((trayItems as any[]).map((r: any) => r.tray_id))
      : null
    const traysToUse =
      trayIdsWithItems && trayIdsWithItems.size > 0
        ? trays.filter((t) => trayIdsWithItems.has(t.id))
        : trays

    const traysOut: V4LoadedTray[] = traysToUse.map((t: { id: string; number?: string }) => ({
      id: t.id,
      number: String(t.number ?? '').trim(),
    }))

    const instrumentIdToLocalId = new Map<string, string>()
    const instrumentsMap = new Map<string, V4LoadedInstrument>()
    const servicesOut: V4LoadedService[] = []
    const partsOut: V4LoadedPart[] = []
    const instrumentTrayId: Record<string, string> = {}

    for (const row of trayItems as any[]) {
      const instrumentId = row.instrument_id
      if (!instrumentId) continue
      const trayId = row.tray_id
      const qty = Number(row.qty) || 1
      const notes = parseNotes(row.notes)
      const itemType = (notes.item_type as string) || (row.service_id ? 'service' : row.part_id ? 'part' : 'instrument_only')
      const nameSnapshot = (notes.name_snapshot as string) || catalogMap.get(instrumentId) || instrumentId
      const rowSerials = typeof row.serials === 'string' ? row.serials.trim() : ''

      const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
      const instrumentDiscount = num(notes.instrument_discount_pct)
      const instrumentGarantie = Boolean(notes.garantie)

      let localId = instrumentIdToLocalId.get(instrumentId)
      if (!localId) {
        localId = generateLocalId()
        instrumentIdToLocalId.set(instrumentId, localId)
        instrumentsMap.set(instrumentId, {
          id: instrumentId,
          localId,
          name: catalogMap.get(instrumentId) || instrumentId,
          quantity: qty,
          serialNumber: rowSerials,
          discount: instrumentDiscount,
          garantie: instrumentGarantie,
        })
      } else {
        const existing = instrumentsMap.get(instrumentId)
        if (existing) {
          existing.quantity = Math.max(existing.quantity, qty)
          if (rowSerials && !existing.serialNumber) existing.serialNumber = rowSerials
          if (instrumentDiscount !== 0 && existing.discount === undefined) existing.discount = instrumentDiscount
          if (instrumentGarantie && !existing.garantie) existing.garantie = true
        }
      }

      if (itemType === 'service' || row.service_id) {
        const serviceId = row.service_id || (notes.service_id as string)
        if (serviceId) {
          // Articol = numele serviciului; folosim name_snapshot, apoi numele din join service:services(id,name), nu numele instrumentului
          const serviceName =
            (notes.name_snapshot as string)?.trim() ||
            (row.service?.name && String(row.service.name).trim()) ||
            catalogMap.get(instrumentId) ||
            instrumentId
          const unrepaired =
            typeof (row as { unrepaired_qty?: number }).unrepaired_qty === 'number'
              ? (row as { unrepaired_qty: number }).unrepaired_qty
              : num(notes.unrepairedCount ?? notes.unrepaired_count)
          servicesOut.push({
            instrumentLocalId: localId!,
            serviceId,
            serviceName,
            basePrice: num(notes.price),
            quantity: qty,
            instrumentQty: qty,
            discount: num(notes.discount_pct),
            unrepairedCount: unrepaired,
            trayId: trayId,
            forSerialNumbers: (notes.forSerialNumbers as string[]) ?? [],
          })
        }
      } else if (itemType === 'part' || row.part_id) {
        partsOut.push({
          id: generateLocalId(),
          instrumentLocalId: localId!,
          name: nameSnapshot,
          unitPrice: num(notes.price),
          quantity: qty,
          trayId: trayId,
          forSerialNumbers: (notes.forSerialNumbers as string[]) ?? [],
        })
      }
      // Atribuie tăvița instrumentului la fiecare rând (serviciu, piesă sau doar instrument), ca la re-deschidere butonul „Trimite tăvițele” să fie activ
      instrumentTrayId[localId!] = trayId
    }

    const instrumentsOut = Array.from(instrumentsMap.values())

    return {
      data: {
        instruments: instrumentsOut,
        services: servicesOut,
        parts: partsOut,
        trays: traysOut,
        instrumentTrayId,
      },
      error: null,
    }
  } catch (e: any) {
    console.error('[loadVanzariViewV4FromDb]', e)
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) }
  }
}
