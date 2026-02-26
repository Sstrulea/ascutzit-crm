'use client'

/**
 * Persistă datele din VanzariViewV4 (instruments, servicii, piese, tăvițe) în baza de date.
 * Creează/actualizează tăvițe și tray_items pentru fișa de serviciu dată.
 */

import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import {
  createTray,
  createTrayItem,
  listTraysForServiceFile,
  listTrayItemsForTray,
} from '@/lib/supabase/serviceFileOperations'

const supabase = supabaseBrowser()

function parseSerialNumbers(serialNumber: string | undefined): string[] {
  if (!serialNumber?.trim()) return []
  return serialNumber
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function serialsFromInstrumentOrList(inst: V4Instrument | undefined, forSerialNumbers?: string[]): string | null {
  if (forSerialNumbers && forSerialNumbers.length > 0) return forSerialNumbers.join(', ')
  if (inst?.serialNumber) {
    const list = parseSerialNumbers(inst.serialNumber)
    return list.length > 0 ? list.join(', ') : null
  }
  return null
}

/** Construiește brandSerialGroups pentru createTrayItem (pentru salvare garantie și eventual S/N). */
function buildBrandSerialGroupsForGarantie(
  inst: V4Instrument | undefined,
  forSerialNumbers?: string[]
): Array<{ brand: string | null; serialNumbers: string[]; garantie?: boolean }> {
  const serials = forSerialNumbers?.length
    ? forSerialNumbers
    : parseSerialNumbers(inst?.serialNumber ?? '')
  const garantie = inst?.garantie ?? false
  if (!garantie && serials.length === 0) return []
  return [{ brand: '—', serialNumbers: serials, garantie }]
}

export interface V4Instrument {
  localId: string
  instrumentId: string
  name: string
  quantity: number
  serialNumber?: string
  discount?: number
  garantie?: boolean
}

export interface V4SelectedService {
  instrumentLocalId: string
  serviceId: string
  serviceName: string
  basePrice: number
  quantity: number
  discount: number
  unrepairedCount?: number
  trayId?: string
  forSerialNumbers?: string[]
}

export interface V4Part {
  id: string
  instrumentLocalId: string
  name: string
  unitPrice: number
  quantity: number
  trayId?: string
  forSerialNumbers?: string[]
}

export interface V4LocalTray {
  id: string
  number: string
}

export interface V4SaveData {
  instruments: V4Instrument[]
  services: V4SelectedService[]
  parts: V4Part[]
  trays: V4LocalTray[]
  /** Tăviță atribuită per instrument (localId -> trayId), inclusiv pentru instrumente fără servicii/piese. */
  instrumentTrayId?: Record<string, string | undefined>
}

export interface V4SaveContext {
  /** Instrumente cu department_id (pentru tray_items) */
  instrumentsWithDept: Array<{ id: string; name: string; department_id: string | null }>
  /** Dacă un instrument nu are department_id, se folosește acest id (ex. departament Reparatii). Obligatoriu pentru a respecta NOT NULL pe tray_items.department_id. */
  defaultDepartmentId?: string | null
  /** Catalog servicii (pentru validare) */
  servicesCatalog?: Array<{ id: string; name: string; price: number }>
  urgent?: boolean
  /**
   * Când e setat (salvare din view departament, ex. Saloane), ștergem/actualizăm doar tray_items cu acest department_id.
   * Evită pierderea itemilor din alte departamente (Frizerii, Horeca etc.) când utilizatorul salvează din view-ul unui singur departament.
   */
  filterDepartmentId?: string | null
}

/**
 * Salvează datele VanzariViewV4 în DB: tăvițe + tray_items.
 * - Șterge tray_items existente pentru toate tăvițele fișei, apoi creează tăvițe din data.trays și inserează tray_items pentru fiecare serviciu/piesă.
 */
export async function saveVanzariViewV4ToDb(
  fisaId: string,
  data: V4SaveData,
  context: V4SaveContext
): Promise<{ error: Error | null }> {
  try {
    const { trays: localTrays, instruments: instrumentsRaw, services, parts } = data
    const { instrumentsWithDept, defaultDepartmentId } = context

    // Normalizare: view-ul poate trimite "id" (catalog), V4SaveData așteaptă "instrumentId"
    const instruments: V4Instrument[] = instrumentsRaw.map((inst: any) => ({
      ...inst,
      instrumentId: inst.instrumentId ?? inst.id ?? '',
    }))

    // Dacă există instrumente/servicii/piese dar nici o tăviță, creăm o tăviță implicită (număr gol)
    const traysToUse =
      localTrays.length > 0
        ? localTrays
        : instruments.length > 0 || services.length > 0 || parts.length > 0
          ? [{ id: '__default__', number: '' }]
          : []

    // 1. Încarcă tăvițele existente pentru fișă
    const { data: existingTrays, error: listErr } = await listTraysForServiceFile(fisaId)
    if (listErr) throw listErr
    const existing = existingTrays || []

    // 2. Șterge tray_items doar pentru tăvițe care sunt în payload (le resincronizăm).
    // Tăvițe existente care nu sunt în payload (ex. trimise în departament) nu le atingem.
    // PROTECȚIE: Nu goli tray_items pentru o tăviță dacă payload-ul nu conține niciun serviciu/piesă
    // pentru acea tăviță – evită pierderea accidentală când state-ul e incomplet (ex. după repartizare).
    const payloadTrayNumbers = new Set(traysToUse.map((t) => (t.number?.trim() ?? '').toLowerCase()))
    const payloadHasItemsForTray = (trayNumber: string): boolean => {
      const key = (trayNumber?.trim() ?? '').toLowerCase()
      return services.some((s) => {
        const lt = traysToUse.find((x) => x.id === s.trayId)
        return lt && (lt.number?.trim() ?? '').toLowerCase() === key
      }) || parts.some((p) => {
        const lt = traysToUse.find((x) => x.id === p.trayId)
        return lt && (lt.number?.trim() ?? '').toLowerCase() === key
      })
    }
    const filterDepartmentId = context.filterDepartmentId ?? null
    for (const tray of existing) {
      const key = (tray.number?.trim() ?? '').toLowerCase()
      if (!payloadTrayNumbers.has(key)) continue
      if (!payloadHasItemsForTray(tray.number ?? '')) {
        const { data: items } = await listTrayItemsForTray(tray.id)
        if (items && items.length > 0) {
          console.warn(`[saveVanzariViewV4ToDb] NU golesc tăvița "${tray.number}" (id: ${tray.id}) – payload fără itemi pentru ea, dar tăvița are ${items.length} itemi.`)
          continue
        }
      }
      const { data: items } = await listTrayItemsForTray(tray.id)
      const itemsList = items ?? []
      const toDelete = filterDepartmentId
        ? itemsList.filter((i: any) => i.department_id === filterDepartmentId)
        : itemsList
      const itemIds = toDelete.map((i: any) => i.id)
      if (itemIds.length > 0) {
        await supabase.from('tray_item_brands').delete().in('tray_item_id', itemIds)
      }
      if (filterDepartmentId) {
        await supabase.from('tray_items').delete().eq('tray_id', tray.id).eq('department_id', filterDepartmentId)
      } else {
        await supabase.from('tray_items').delete().eq('tray_id', tray.id)
      }
    }

    // 3. Șterge doar tăvițe care nu mai sunt în data.trays ȘI nu există deja în DB pentru această fișă.
    // IMPORTANT: Nu ștergem tăvițe existente doar pentru că lipsesc din payload (ex: tăviță trimisă
    // în departament poate să nu fie în state la salvare) – evită bugul „tăvița dispare după urgent”.
    // PROTECȚIE: Nu ștergem niciodată o tăviță care are tray_items (conținut) – evită pierderea accidentală.
    const wantedKeysFromPayload = new Set(traysToUse.map((t) => (t.number?.trim() ?? '').toLowerCase()))
    const existingKeys = new Set(existing.map((t) => (t.number?.trim() ?? '').toLowerCase()))
    const wantedKeys = new Set([...wantedKeysFromPayload, ...existingKeys])
    for (const t of existing) {
      const key = (t.number?.trim() ?? '').toLowerCase()
      if (!wantedKeys.has(key)) {
        const { data: itemsCheck } = await supabase.from('tray_items').select('id').eq('tray_id', t.id).limit(1)
        if (itemsCheck && itemsCheck.length > 0) {
          console.warn(`[saveVanzariViewV4ToDb] NU ștergem tăvița "${t.number}" (id: ${t.id}) – are ${itemsCheck.length}+ itemi. Evită pierderea datelor.`)
          continue
        }
        await supabase.from('pipeline_items').delete().eq('type', 'tray').eq('item_id', t.id)
        await supabase.from('tray_images').delete().eq('tray_id', t.id)
        await supabase.from('trays').delete().eq('id', t.id)
      }
    }

    // 4. Creează sau obține tăviță pentru fiecare LocalTray; construiește map localId -> dbTrayId
    // IMPORTANT: Pentru tăvițe cu number gol (''), verificăm mai întâi dacă există deja una pentru această fișă
    // pentru a evita crearea de duplicate (race condition când se creează în paralel)
    const localTrayIdToDbTrayId = new Map<string, string>()
    
    // Verifică dacă există deja o tăviță goală pentru această fișă (pentru a evita duplicate)
    let existingEmptyTray: { id: string } | null = null
    
    // Verifică dacă există tăvițe cu number gol în traysToUse
    const hasEmptyTrays = traysToUse.some(lt => !lt.number || lt.number.trim() === '')
    
    if (hasEmptyTrays) {
      // Caută o tăviță existentă cu number = '' sau number IS NULL (evită duplicate)
      const { data: emptyTrays } = await supabase
        .from('trays')
        .select('id')
        .eq('service_file_id', fisaId)
        .or('number.eq.,number.is.null')
        .limit(1)
      
      if (emptyTrays && emptyTrays.length > 0) {
        existingEmptyTray = emptyTrays[0] as { id: string }
      }
    }
    
    // Creează tăvițele (secvențial pentru tăvițe goale pentru a evita race condition)
    for (const lt of traysToUse) {
      const trayNumber = lt.number.trim() || ''
      
      // IMPORTANT: Pentru tăvițe goale, folosim întotdeauna aceeași tăviță existentă sau creăm doar una
      if (trayNumber === '') {
        // Dacă există deja o tăviță goală, folosește-o pentru toate tăvițele goale
        if (existingEmptyTray) {
          localTrayIdToDbTrayId.set(lt.id, existingEmptyTray.id)
          continue
        }
        
        // Altfel, creează o singură tăviță goală (createTray verifică unicitatea)
        const { data: dbTray, error: createErr } = await createTray({
          service_file_id: fisaId,
          number: trayNumber,
          status: 'in_receptie',
        })
        
        if (createErr) throw createErr
        if (!dbTray?.id) throw new Error('createTray nu a returnat id')
        
        // Salvează tăvița goală creată pentru următoarele tăvițe goale
        existingEmptyTray = { id: dbTray.id }
        localTrayIdToDbTrayId.set(lt.id, dbTray.id)
        continue
      }
      
      // Pentru tăvițe cu număr, creează normal (createTray verifică unicitatea)
      const { data: dbTray, error: createErr } = await createTray({
        service_file_id: fisaId,
        number: trayNumber,
        status: 'in_receptie',
      })
      
      if (createErr) throw createErr
      if (!dbTray?.id) throw new Error('createTray nu a returnat id')
      
      localTrayIdToDbTrayId.set(lt.id, dbTray.id)
    }

    // Helper: tray_id pentru un instrument (primul serviciu/piesă al instrumentului are trayId)
    const getTrayIdForInstrument = (instrumentLocalId: string): string | null => {
      const svc = services.find((s) => s.instrumentLocalId === instrumentLocalId)
      if (svc?.trayId) return localTrayIdToDbTrayId.get(svc.trayId) ?? null
      const part = parts.find((p) => p.instrumentLocalId === instrumentLocalId)
      if (part?.trayId) return localTrayIdToDbTrayId.get(part.trayId) ?? null
      const firstTrayId = traysToUse[0]?.id
      return firstTrayId ? localTrayIdToDbTrayId.get(firstTrayId) ?? null : null
    }

    const getDepartmentId = (instrumentId: string): string => {
      const inst = instrumentsWithDept.find((i) => i.id === instrumentId)
      const id = inst?.department_id ?? defaultDepartmentId ?? null
      if (!id) {
        const name = inst?.name ?? instrumentId
        throw new Error(`Instrumentul "${name}" nu are departament setat. Setează departamentul în Catalog → Instrumente sau adaugă un departament.`)
      }
      return id
    }

    // 5. Inserează tray_items pentru servicii
    for (const svc of services) {
      const inst = instruments.find((i) => i.localId === svc.instrumentLocalId)
      if (!inst || !inst.instrumentId) continue
      const trayId = svc.trayId ? localTrayIdToDbTrayId.get(svc.trayId) : getTrayIdForInstrument(svc.instrumentLocalId)
      if (!trayId) continue
      const departmentId = getDepartmentId(inst.instrumentId)
      const notes = {
        name_snapshot: svc.serviceName,
        item_type: 'service',
        price: svc.basePrice,
        discount_pct: svc.discount,
        qty: svc.quantity,
        unrepairedCount: svc.unrepairedCount ?? 0,
        forSerialNumbers: svc.forSerialNumbers ?? [],
        instrument_discount_pct: inst.discount ?? 0,
        garantie: inst.garantie ?? false,
      }
      const serialsSummary = serialsFromInstrumentOrList(inst, svc.forSerialNumbers)
      const brandGroups = buildBrandSerialGroupsForGarantie(inst, svc.forSerialNumbers)
      const { error: itemErr } = await createTrayItem({
        tray_id: trayId,
        instrument_id: inst.instrumentId,
        service_id: svc.serviceId,
        part_id: null,
        department_id: departmentId,
        qty: svc.quantity,
        unrepaired_qty: svc.unrepairedCount ?? 0,
        notes: JSON.stringify(notes),
        pipeline: null,
        serials: serialsSummary ?? undefined,
        brandSerialGroups: brandGroups.length > 0 ? brandGroups : undefined,
      })
      if (itemErr) throw itemErr
    }

    // 6. Inserează tray_items pentru piese (part_id null, nume/preț în notes)
    for (const part of parts) {
      const inst = instruments.find((i) => i.localId === part.instrumentLocalId)
      if (!inst || !inst.instrumentId) continue
      const trayId = part.trayId ? localTrayIdToDbTrayId.get(part.trayId) : getTrayIdForInstrument(part.instrumentLocalId)
      if (!trayId) continue
      const departmentId = getDepartmentId(inst.instrumentId)
      const notes = {
        name_snapshot: part.name,
        item_type: 'part',
        price: part.unitPrice,
        qty: part.quantity,
        forSerialNumbers: part.forSerialNumbers ?? [],
        instrument_discount_pct: inst.discount ?? 0,
        garantie: inst.garantie ?? false,
      }
      const serialsSummary = serialsFromInstrumentOrList(inst, part.forSerialNumbers)
      const brandGroups = buildBrandSerialGroupsForGarantie(inst, part.forSerialNumbers)
      const { error: itemErr } = await createTrayItem({
        tray_id: trayId,
        instrument_id: inst.instrumentId,
        service_id: null,
        part_id: null,
        department_id: departmentId,
        qty: part.quantity,
        notes: JSON.stringify(notes),
        pipeline: null,
        serials: serialsSummary ?? undefined,
        brandSerialGroups: brandGroups.length > 0 ? brandGroups : undefined,
      })
      if (itemErr) throw itemErr
    }

    // 7. Instrumente doar în tăviță (fără serviciu/piesă): creează un tray_item per instrument fără servicii/piese (folosește tăvița asignată sau prima tăviță)
    const instrumentTrayIdMap = data.instrumentTrayId ?? {}
    const hasServiceOrPart = new Set(
      [...services.map((s) => s.instrumentLocalId), ...parts.map((p) => p.instrumentLocalId)]
    )
    const defaultLocalTrayId = traysToUse[0]?.id ?? null
    for (const inst of instruments) {
      if (!inst.instrumentId || hasServiceOrPart.has(inst.localId)) continue
      const localTrayId = instrumentTrayIdMap[inst.localId] ?? defaultLocalTrayId
      if (!localTrayId) continue
      const trayId = localTrayIdToDbTrayId.get(localTrayId)
      if (!trayId) continue
      const departmentId = getDepartmentId(inst.instrumentId)
      const notes = {
        name_snapshot: inst.name,
        item_type: 'instrument_only',
        qty: inst.quantity,
        instrument_discount_pct: inst.discount ?? 0,
        garantie: inst.garantie ?? false,
      }
      const serialsSummary = serialsFromInstrumentOrList(inst)
      const brandGroups = buildBrandSerialGroupsForGarantie(inst)
      const { error: itemErr } = await createTrayItem({
        tray_id: trayId,
        instrument_id: inst.instrumentId,
        service_id: null,
        part_id: null,
        department_id: departmentId,
        qty: inst.quantity,
        notes: JSON.stringify(notes),
        pipeline: null,
        serials: serialsSummary ?? undefined,
        brandSerialGroups: brandGroups.length > 0 ? brandGroups : undefined,
      })
      if (itemErr) throw itemErr
    }

    return { error: null }
  } catch (e: any) {
    console.error('[saveVanzariViewV4ToDb]', e)
    const message =
      e instanceof Error
        ? e.message
        : typeof e === 'object' && e !== null
          ? (e.message ?? e.error_description ?? e.details ?? JSON.stringify(e))
          : String(e)
    return { error: e instanceof Error ? e : new Error(message || 'Eroare la salvarea în baza de date') }
  }
}
