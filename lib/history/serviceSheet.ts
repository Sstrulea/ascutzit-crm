// lib/history/serviceSheet.ts
import { logLeadEvent, logItemEvent, getTrayDetails, getTechnicianDetails, getUserDetails } from "@/lib/supabase/leadOperations"
import {
  createTrayItem,
  updateTrayItem,
  deleteTrayItem,
  listTrayItemsForTray,
  getTrayItem,
  type TrayItem
} from "@/lib/supabase/serviceFileOperations"
import { addTrayToPipeline } from "@/lib/supabase/pipelineOperations"
import type { Service } from "@/lib/supabase/serviceOperations"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"

/**
 * Obține user_id pentru utilizatorul curent (folosit ca technician_id)
 * Folosește user_id din app_members
 */
/** Folosește getSession (evită apel auth server) – session.user e suficient pentru technician_id */
async function getCurrentUserTechnicianId(): Promise<string | null> {
  try {
    const supabase = supabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch (error) {
    console.error('Eroare la obținerea user_id pentru utilizatorul curent:', error)
    return null
  }
}

// Tip pentru transformarea datelor
type LeadQuoteItem = any

type SnapshotItem = {
  id: string
  name: string
  qty: number
  price: number
  discount_pct: number
  type: string | null
  urgent: boolean
  department?: string | null
  technician_id?: string | null
  pipeline_id?: string | null
  brand?: string | null
  serial_number?: string | null
  garantie?: boolean
}

type Totals = {
  subtotal: number
  totalDiscount: number
  urgentAmount: number
  total: number
}

// ELIMINAT: isLocalId - items-urile se salvează direct în DB, nu mai există local IDs
// Toate items-urile au ID-uri reale din DB
const isLocalId = (_id: string | number) => false // Nu mai există local IDs

const toSnap = (i: any): SnapshotItem => ({
  id: String(i.id ?? `${i.name_snapshot}:${i.item_type}`),
  name: i.name_snapshot,
  qty: Number(i.qty ?? 1),
  price: Number(i.price ?? 0),
  discount_pct: Number(i.discount_pct ?? 0),
  type: i.item_type ?? null,
  urgent: !!i.urgent,
  department: i.department ?? null,
  technician_id: i.technician_id ?? null,
  pipeline_id: i.pipeline_id ?? null,
  brand: i.brand ?? null,
  serial_number: i.serial_number ?? null,
  garantie: !!i.garantie,
})

function toMap(arr: SnapshotItem[]) {
  return Object.fromEntries(arr.map(x => [String(x.id), x]))
}

function diffSnapshots(prev: SnapshotItem[], next: SnapshotItem[]) {
  const pm = toMap(prev)
  const nm = toMap(next)
  const added = next.filter(x => !pm[x.id])
  const removed = prev.filter(x => !nm[x.id])
  
  // Pentru items actualizate, colectează și diferențele detaliate
  const updatedWithChanges: Array<{ item: SnapshotItem; prev: SnapshotItem; changes: Record<string, { old: any; new: any }> }> = []
  
  next.forEach(x => {
    const p = pm[x.id]
    if (!p) return
    
    const changes: Record<string, { old: any; new: any }> = {}
    
    if (p.qty !== x.qty) changes.qty = { old: p.qty, new: x.qty }
    if (p.price !== x.price) changes.price = { old: p.price, new: x.price }
    if (Number(p.discount_pct ?? 0) !== Number(x.discount_pct ?? 0)) changes.discount_pct = { old: p.discount_pct ?? 0, new: x.discount_pct ?? 0 }
    if (p.urgent !== x.urgent) changes.urgent = { old: p.urgent, new: x.urgent }
    if (p.department !== x.department) changes.department = { old: p.department, new: x.department }
    if (p.technician_id !== x.technician_id) changes.technician_id = { old: p.technician_id, new: x.technician_id }
    if (p.pipeline_id !== x.pipeline_id) changes.pipeline_id = { old: p.pipeline_id, new: x.pipeline_id }
    if (p.name !== x.name) changes.name = { old: p.name, new: x.name }
    if (p.type !== x.type) changes.type = { old: p.type, new: x.type }
    if (p.brand !== x.brand) changes.brand = { old: p.brand, new: x.brand }
    if (p.serial_number !== x.serial_number) changes.serial_number = { old: p.serial_number, new: x.serial_number }
    if (p.garantie !== x.garantie) changes.garantie = { old: p.garantie, new: x.garantie }
    
    if (Object.keys(changes).length > 0) {
      updatedWithChanges.push({ item: x, prev: p, changes })
    }
  })
  
  const updated = updatedWithChanges.map(u => u.item)
  return { added, removed, updated, updatedWithChanges, prevMap: pm }
}

async function composeMessage(
  next: SnapshotItem[], 
  d: ReturnType<typeof diffSnapshots>, 
  totals: Totals,
  quoteId: string,
  instruments?: Array<{ id: string; name: string; department_id: string | null }>,
  opts?: { globalDiscountPct?: number; subscriptionType?: 'services' | 'parts' | 'both' | ''; currentUserDetails?: { id: string; name: string; email: string | null } | null }
) {
  const servicesCount = next.filter(i => i.type === "service").length
  const partsCount = next.length - servicesCount
  const urgentCount = next.filter(i => i.urgent).length

  const chunks: string[] = []
  if (d.added.length)   chunks.push(`adăugate: ${d.added.slice(0,3).map(x=>x.name).join(", ")}${d.added.length>3?"…":""}`)
  if (d.removed.length) chunks.push(`șterse: ${d.removed.slice(0,3).map(x=>x.name).join(", ")}${d.removed.length>3?"…":""}`)
  if (d.updated.length) chunks.push(`actualizate: ${d.updated.slice(0,3).map(x=>x.name).join(", ")}${d.updated.length>3?"…":""}`)

  const headline = chunks.length ? `Fișa de serviciu salvată (${chunks.join(" · ")})` : "Fișa de serviciu salvată"
  const parts: string[] = [
    `servicii=${servicesCount}, piese=${partsCount}, linii_urgente=${urgentCount}, total=${totals.total.toFixed(2)} RON.`
  ]
  if ((opts?.globalDiscountPct ?? 0) > 0) {
    parts.push(`discount global ${opts!.globalDiscountPct}%`)
  }
  if (totals.totalDiscount > 0) {
    parts.push(`reduceri total ${totals.totalDiscount.toFixed(2)} RON`)
  }
  const message = `${headline}. ${parts.join(", ")}`

  // Obține detalii complete pentru fiecare item din diff
  const supabase = supabaseBrowser()
  
  // Obține instrumentele și cantitățile lor din tray_items
  const instrumentsMap = new Map<string, { name: string; totalQty: number }>()
  try {
    const { data: trayItems } = await listTrayItemsForTray(quoteId)
    if (trayItems?.data) {
      for (const item of trayItems.data) {
        if (item.instrument_id) {
          const instrumentName = instruments?.find(inst => inst.id === item.instrument_id)?.name || 'Instrument necunoscut'
          const current = instrumentsMap.get(item.instrument_id) || { name: instrumentName, totalQty: 0 }
          instrumentsMap.set(item.instrument_id, {
            name: current.name,
            totalQty: current.totalQty + (item.qty || 1)
          })
        }
      }
    }
  } catch (e) {
    console.warn('Error loading instruments for payload:', e)
  }
  
  // Obține toate ID-urile unice de departamente și tehnicieni
  const allDepartmentIds = new Set<string>()
  const allTechnicianIds = new Set<string>()
  const allTrayIds = new Set<string>()
  
  ;[...d.added, ...d.removed, ...d.updated].forEach(item => {
    // Obține department_id din item (poate fi în notes sau direct)
    if (item.department) {
      // department poate fi un string (nume) sau un ID - trebuie să obținem ID-ul
      // Pentru moment, vom încerca să obținem din tray_items
    }
    if (item.technician_id) {
      allTechnicianIds.add(item.technician_id)
    }
  })
  
  // Adaugă tray_id pentru toate items-urile
  allTrayIds.add(quoteId)
  
  // Obține detalii despre departamente, tehnicieni și tăvițe
  const [departmentsResult, techniciansResult, trayDetailsResult] = await Promise.all([
    supabase
      .from('departments')
      .select('id, name')
      .then(({ data }) => {
        const deptMap = new Map<string, { id: string; name: string }>()
        data?.forEach(d => deptMap.set(d.id, d))
        return deptMap
      }),
    Promise.all(Array.from(allTechnicianIds).map(async (techId) => {
      const techDetails = await getTechnicianDetails(techId)
      return techDetails ? { id: techId, details: techDetails } : null
    })).then(results => {
      const techMap = new Map<string, { id: string; name: string; email: string | null }>()
      results.forEach(r => {
        if (r) techMap.set(r.id, r.details)
      })
      return techMap
    }),
    getTrayDetails(quoteId),
  ])
  
  const departmentsMap = departmentsResult || new Map()
  const techniciansMap = techniciansResult || new Map()
  
  // Funcție helper pentru a obține detalii despre un item
  const getItemDetails = async (item: SnapshotItem, prevItem?: SnapshotItem, changes?: Record<string, { old: any; new: any }>) => {
    // Obține department_id și instrument_id din tray_items
    let departmentId: string | null = null
    let departmentName: string | null = null
    let instrumentId: string | null = null
    let instrumentName: string | null = null
    
    try {
      const { data: trayItem } = await getTrayItem(item.id)
      if (trayItem?.department_id) {
        departmentId = trayItem.department_id
        const dept = departmentsMap.get(departmentId)
        if (dept) {
          departmentName = dept.name
        }
      }
      if (trayItem?.instrument_id) {
        instrumentId = trayItem.instrument_id
        // Obține numele instrumentului din lista de instrumente pasată
        const instrument = instruments?.find(inst => inst.id === instrumentId)
        if (instrument) {
          instrumentName = instrument.name
        }
      }
    } catch (e) {
      // Ignoră eroarea
    }
    
    const technician = item.technician_id ? techniciansMap.get(item.technician_id) : null
    const prevTechnician = prevItem?.technician_id ? techniciansMap.get(prevItem.technician_id) : null
    
    // Construiește obiectul cu diferențe detaliate pentru afișare
    const detailedChanges: Record<string, { old: string; new: string; label: string }> = {}
    
    if (changes) {
      if (changes.qty) {
        detailedChanges.qty = { 
          old: String(changes.qty.old), 
          new: String(changes.qty.new),
          label: 'Cantitate'
        }
      }
      if (changes.price) {
        detailedChanges.price = { 
          old: `${Number(changes.price.old).toFixed(2)} RON`, 
          new: `${Number(changes.price.new).toFixed(2)} RON`,
          label: 'Preț'
        }
      }
      if (changes.discount_pct) {
        detailedChanges.discount_pct = { 
          old: `${Number(changes.discount_pct.old)}%`, 
          new: `${Number(changes.discount_pct.new)}%`,
          label: 'Discount (%)'
        }
      }
      if (changes.urgent) {
        detailedChanges.urgent = { 
          old: changes.urgent.old ? 'Da' : 'Nu', 
          new: changes.urgent.new ? 'Da' : 'Nu',
          label: 'Urgent'
        }
      }
      if (changes.technician_id) {
        const oldTechName = changes.technician_id.old ? (techniciansMap.get(changes.technician_id.old)?.name || 'Necunoscut') : 'Neatribuit'
        const newTechName = changes.technician_id.new ? (techniciansMap.get(changes.technician_id.new)?.name || 'Necunoscut') : 'Neatribuit'
        detailedChanges.technician = { 
          old: oldTechName, 
          new: newTechName,
          label: 'Tehnician'
        }
      }
      if (changes.brand) {
        detailedChanges.brand = { 
          old: changes.brand.old || '—', 
          new: changes.brand.new || '—',
          label: 'Brand'
        }
      }
      if (changes.serial_number) {
        detailedChanges.serial_number = { 
          old: changes.serial_number.old || '—', 
          new: changes.serial_number.new || '—',
          label: 'Serie'
        }
      }
      if (changes.garantie) {
        detailedChanges.garantie = { 
          old: changes.garantie.old ? 'Da' : 'Nu', 
          new: changes.garantie.new ? 'Da' : 'Nu',
          label: 'Garanție'
        }
      }
      if (changes.name) {
        detailedChanges.name = { 
          old: changes.name.old || '—', 
          new: changes.name.new || '—',
          label: 'Nume / Serviciu / Piesă'
        }
      }
      if (changes.type) {
        const typeLabel = (v: string | null) => v === 'service' ? 'Serviciu' : v === 'part' ? 'Piesă' : v ? String(v) : 'Instrument'
        detailedChanges.type = { 
          old: typeLabel(changes.type.old), 
          new: typeLabel(changes.type.new),
          label: 'Tip'
        }
      }
    }
    
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      qty: item.qty,
      price: item.price,
      discount_pct: item.discount_pct ?? 0,
      urgent: item.urgent,
      brand: item.brand,
      serial_number: item.serial_number,
      garantie: item.garantie,
      instrument: instrumentId ? {
        id: instrumentId,
        name: instrumentName,
      } : null,
      department: departmentId ? {
        id: departmentId,
        name: departmentName,
      } : null,
      technician: technician ? {
        id: technician.id,
        name: technician.name,
        email: technician.email,
      } : null,
      tray: trayDetailsResult ? {
        id: trayDetailsResult.id,
        number: trayDetailsResult.number,
      } : null,
      // Include informații despre versiunea anterioară pentru items actualizate
      previous: prevItem ? {
        qty: prevItem.qty,
        price: prevItem.price,
        discount_pct: prevItem.discount_pct ?? 0,
        urgent: prevItem.urgent,
        brand: prevItem.brand,
        serial_number: prevItem.serial_number,
        garantie: prevItem.garantie,
        technician: prevTechnician ? {
          id: prevTechnician.id,
          name: prevTechnician.name,
        } : null,
      } : undefined,
      // Include diferențele formatate pentru afișare ușoară
      changes: Object.keys(detailedChanges).length > 0 ? detailedChanges : undefined,
    }
  }
  
  // Obține detalii pentru toate items-urile din diff
  const [addedDetails, removedDetails, updatedDetails] = await Promise.all([
    Promise.all(d.added.map(item => getItemDetails(item))),
    Promise.all(d.removed.map(item => getItemDetails(item))),
    Promise.all(d.updatedWithChanges.map(u => getItemDetails(u.item, u.prev, u.changes))),
  ])
  
  // Obține detalii despre user-ul curent (din opts pentru a evita auth – Faza reducere auth calls)
  const currentUser = opts?.currentUserDetails ?? (await supabase.auth.getSession()
    .then(({ data: { session } }) => session?.user?.id ? getUserDetails(session.user.id, { currentUser: { id: session.user.id, email: session.user.email } }) : Promise.resolve(null)))

  // Convertește instrumentsMap în array pentru payload
  const instrumentsList = Array.from(instrumentsMap.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    quantity: data.totalQty,
  }))

  const payload = {
    totals: {
      subtotal: totals.subtotal,
      total_discount: totals.totalDiscount,
      urgent_amount: totals.urgentAmount,
      total: totals.total,
    },
    global_discount_pct: opts?.globalDiscountPct ?? null,
    subscription_type: opts?.subscriptionType ?? null,
    counts: { services: servicesCount, parts: partsCount, urgent_lines: urgentCount },
    instruments: instrumentsList,
    diff: {
      added: addedDetails,
      removed: removedDetails,
      updated: updatedDetails,
    },
    tray: trayDetailsResult ? {
      id: trayDetailsResult.id,
      number: trayDetailsResult.number,
      status: trayDetailsResult.status,
      service_file_id: trayDetailsResult.service_file_id,
    } : null,
    saved_by_user: currentUser ? {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
    } : null,
  }

  return { message, payload }
}

export async function persistAndLogServiceSheet(params: {
  leadId: string
  quoteId: string
  items: LeadQuoteItem[]
  services: Service[]           // for mapping service name → service def when adding new rows
  instruments?: Array<{ id: string; name: string; department_id: string | null }>
  totals: Totals
  prevSnapshot: SnapshotItem[]
  pipelinesWithIds?: Array<{ id: string; name: string }>
  globalDiscountPct?: number
  subscriptionType?: 'services' | 'parts' | 'both' | ''
  /** Din useAuth() – evită getUser() la fiecare log (Faza reducere auth calls) */
  currentUserId?: string | null
  currentUserOption?: { id: string; email?: string | null }
}) {
  const { leadId, quoteId, items, services, instruments = [], totals, prevSnapshot, pipelinesWithIds = [], globalDiscountPct, subscriptionType, currentUserId: paramCurrentUserId, currentUserOption } = params
  
  // Obține technician_id și detalii user o singură dată (evită getUser repetat)
  const currentUserTechnicianId = paramCurrentUserId ?? await getCurrentUserTechnicianId()
  const currentUserDetails = currentUserTechnicianId
    ? (paramCurrentUserId && currentUserOption
        ? await getUserDetails(currentUserTechnicianId, { currentUser: currentUserOption })
        : await getUserDetails(currentUserTechnicianId))
    : null
  
  // Obține ID-ul pipeline-ului "Reparatii" pentru piese
  const reparatiiPipeline = pipelinesWithIds.find(p => p.name === 'Reparatii')
  const reparatiiPipelineId = reparatiiPipeline?.id || null

  // === 1) APPLY CHANGES TO DB (delete, update, add) ===

  // Verifică dacă suntem într-un pipeline departament (Saloane, Frizerii, Horeca, Reparatii)
  // Pentru aceste pipeline-uri, NU se face atribuire automată a tehnicianului
  const departmentPipelineNames = ['Saloane', 'Frizerii', 'Horeca', 'Reparatii']
  // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
  let isDepartmentPipeline = false
  if (Array.isArray(pipelinesWithIds)) {
    for (let i = 0; i < pipelinesWithIds.length; i++) {
      const p = pipelinesWithIds[i]
      if (p && p.name && departmentPipelineNames.includes(p.name)) {
        isDepartmentPipeline = true
        break
      }
    }
  }

  // Deletes: anything that existed before (real DB id) but not anymore in current items
  const currentDbIds = new Set(items.filter(it => !isLocalId(it.id)).map(it => String(it.id)))
  console.log('[persistAndLogServiceSheet] Current DB IDs:', Array.from(currentDbIds))
  console.log('[persistAndLogServiceSheet] Prev snapshot IDs:', prevSnapshot.map(p => p.id))
  for (const prev of prevSnapshot) {
    const wasDbId = !isLocalId(prev.id)
    if (wasDbId && !currentDbIds.has(String(prev.id))) {
      console.log('[persistAndLogServiceSheet] DELETING item:', prev.id, prev.name, prev.type)
      const { success, error } = await deleteTrayItem(String(prev.id))
      if (!success || error) {
        console.error('Error deleting tray item:', error)
        throw error || new Error('Failed to delete tray item')
      }
    }
  }

  // Updates: rows that still exist and changed
  // IMPORTANT: Items-urile noi create direct în DB (cu ID real, nu local) trebuie să fie păstrate
  // Dacă un item nu este în prevSnapshot dar are ID real din DB, înseamnă că a fost creat direct în DB
  // și trebuie păstrat (nu trebuie să fie procesat aici, va fi returnat în fresh)
  const beforeMap = new Map(prevSnapshot.map(b => [String(b.id), b]))
  for (const it of items) {
    if (isLocalId(it.id)) continue
    const prev = beforeMap.get(String(it.id))
    // Dacă nu este în prevSnapshot, înseamnă că este un item nou creat direct în DB
    // Aceste items vor fi returnate în fresh și nu trebuie procesate aici
    if (!prev) continue

    const patch: any = {}
    
    // Verifică dacă item_type s-a schimbat (de exemplu, de la null la 'service')
    const currentItemType = it.item_type ?? null
    const prevItemType = prev.type ?? null
    if (currentItemType !== prevItemType) {
      patch.item_type = currentItemType
      // Dacă item_type s-a schimbat la 'service', actualizează și service_id, name_snapshot, pipeline_id și technician_id
      if (currentItemType === 'service' && it.service_id) {
        patch.service_id = it.service_id
        patch.name_snapshot = it.name_snapshot
        // Include pipeline_id și technician_id când se transformă de la null la 'service'
        // Include chiar dacă sunt null pentru a le seta corect
        patch.pipeline_id = it.pipeline_id && String(it.pipeline_id).trim() ? String(it.pipeline_id).trim() : null
        patch.technician_id = it.technician_id && String(it.technician_id).trim() ? String(it.technician_id).trim() : null
      }
    }
    
    if (Number(it.qty) !== Number(prev.qty)) patch.qty = Number(it.qty)
    if (Number(it.price) !== Number(prev.price)) patch.price = Number(it.price)
    if (Number(it.discount_pct) !== Number((it as any).discount_pct ?? 0)) patch.discount_pct = Number(it.discount_pct ?? 0)
    if (Boolean(it.urgent) !== Boolean(prev.urgent)) patch.urgent = !!it.urgent
    // Department nu mai există - folosim pipeline_id pentru departament
    const currentTechnicianId = it.technician_id && String(it.technician_id).trim() ? String(it.technician_id).trim() : null
    const prevTechnicianId = prev.technician_id && String(prev.technician_id).trim() ? String(prev.technician_id).trim() : null
    if (currentTechnicianId !== prevTechnicianId) patch.technician_id = currentTechnicianId
    
    const currentPipelineId = it.pipeline_id && String(it.pipeline_id).trim() ? String(it.pipeline_id).trim() : null
    const prevPipelineId = (prev as any).pipeline_id && String((prev as any).pipeline_id).trim() ? String((prev as any).pipeline_id).trim() : null
    if (currentPipelineId !== prevPipelineId) patch.pipeline_id = currentPipelineId
    
    // Actualizează name_snapshot dacă s-a schimbat (pentru cazul când item_type se schimbă de la null la 'service')
    const currentName = String(it.name_snapshot ?? "").trim()
    const prevName = String(prev.name ?? "").trim()
    if (currentName !== prevName && currentName !== "") {
      patch.name_snapshot = currentName
    }
    
    // Brand, Serial Number and Garantie
    const currentBrand = it.brand && String(it.brand).trim() ? String(it.brand).trim() : null
    const prevBrand = prev.brand && String(prev.brand).trim() ? String(prev.brand).trim() : null
    if (currentBrand !== prevBrand) patch.brand = currentBrand
    
    const currentSerialNumber = it.serial_number && String(it.serial_number).trim() ? String(it.serial_number).trim() : null
    const prevSerialNumber = prev.serial_number && String(prev.serial_number).trim() ? String(prev.serial_number).trim() : null
    if (currentSerialNumber !== prevSerialNumber) patch.serial_number = currentSerialNumber
    
    const currentGarantie = !!it.garantie
    const prevGarantie = !!prev.garantie
    if (currentGarantie !== prevGarantie) patch.garantie = currentGarantie
    
    // For parts, name can be edited:
    if (it.item_type === "part") {
      const currentName = String(it.name_snapshot ?? "").trim()
      const prevName = String(prev.name ?? "").trim()
      if (currentName !== prevName && currentName !== "") {
        patch.name_snapshot = currentName
      }
    }

    if (Object.keys(patch).length) {
      // Obține item-ul actual din DB pentru a păstra notes existente
      const { data: existingItem } = await getTrayItem(String(it.id))
      
      // Parsează notes existente sau inițializează un obiect gol
      let notesData: any = {}
      if (existingItem?.notes) {
        try {
          notesData = JSON.parse(existingItem.notes)
        } catch (e) {
          // Notes nu este JSON, ignoră
        }
      }
      
      // Dacă nu există notes și item-ul actual are informații, păstrează-le
      if (!existingItem?.notes && it.item_type) {
        notesData.item_type = it.item_type
        if (it.name_snapshot) notesData.name_snapshot = it.name_snapshot
        if (it.price !== undefined) notesData.price = it.price
        if (it.discount_pct !== undefined) notesData.discount_pct = it.discount_pct
        if (it.urgent !== undefined) notesData.urgent = it.urgent
        if (it.brand) notesData.brand = it.brand
        if (it.serial_number) notesData.serial_number = it.serial_number
        if (it.garantie !== undefined) notesData.garantie = it.garantie
        if (it.pipeline_id) notesData.pipeline_id = it.pipeline_id
      }
      
      // Transformă patch-ul în format TrayItem
      const trayItemPatch: any = {}
      if (patch.qty !== undefined) trayItemPatch.qty = patch.qty
      if (patch.service_id !== undefined) {
        trayItemPatch.service_id = patch.service_id
        // Când se schimbă service_id, actualizează și instrument_id și department_id
        if (patch.service_id) {
          const svcDef = services.find(s => s.id === patch.service_id)
          if (svcDef?.instrument_id) {
            trayItemPatch.instrument_id = svcDef.instrument_id
            const instrument = instruments.find(inst => inst.id === svcDef.instrument_id)
            if (instrument?.department_id) {
              trayItemPatch.department_id = instrument.department_id
            }
          }
        }
      }
      if (patch.technician_id !== undefined) {
        // Dacă technician_id este setat explicit, folosește-l
        // Pentru pipeline-urile departament, NU se face atribuire automată
        trayItemPatch.technician_id = patch.technician_id || (isDepartmentPipeline ? null : currentUserTechnicianId)
        
        // Loghează atribuirea tehnicianului
        try {
          const itemName = it.name_snapshot || it.service_id || 'item'
          
          // Obține tray_id pentru a loga la nivel de tăviță
          const { data: trayItem } = await getTrayItem(String(it.id))
          if (trayItem?.tray_id) {
            // Obține detalii complete
            const [trayDetails, technicianDetails, previousTechnicianDetails] = await Promise.all([
              getTrayDetails(trayItem.tray_id),
              getTechnicianDetails(patch.technician_id),
              prev.technician_id ? getTechnicianDetails(prev.technician_id) : Promise.resolve(null),
            ])
            const currentUser = currentUserDetails
            
            const trayLabel = trayDetails 
              ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
              : 'nesemnată'
            
            // Tehnicianul este userul curent - folosește currentUser dacă technicianDetails nu este disponibil
            const finalTechnicianDetails = technicianDetails || (currentUser ? {
              id: currentUser.id,
              name: currentUser.name || currentUser.email || 'User necunoscut',
              email: currentUser.email,
            } : null)
            const technicianName = finalTechnicianDetails?.name || 'tehnician necunoscut'
            
            await logItemEvent(
              'tray',
              trayItem.tray_id,
              `Tehnician "${technicianName}" atribuit pentru "${itemName}" în tăvița "${trayLabel}"`,
              'technician_assigned',
              {
                item_id: it.id,
                item_name: itemName,
                item_type: it.item_type || null
              },
              {
                tray: trayDetails ? {
                  id: trayDetails.id,
                  number: trayDetails.number,
                  status: trayDetails.status,
                  service_file_id: trayDetails.service_file_id,
                } : undefined,
                technician: finalTechnicianDetails ? {
                  id: finalTechnicianDetails.id,
                  name: finalTechnicianDetails.name,
                  email: finalTechnicianDetails.email,
                } : undefined,
                previous_technician: previousTechnicianDetails ? {
                  id: previousTechnicianDetails.id,
                  name: previousTechnicianDetails.name,
                  email: previousTechnicianDetails.email,
                } : undefined,
                pipeline: trayDetails?.pipeline || undefined,
                stage: trayDetails?.stage || undefined,
                user: currentUser || undefined,
              }
            )
          }
        } catch (logError) {
          console.error('Eroare la logarea atribuirii tehnicianului:', logError)
          // Nu aruncă eroarea, doar loghează - să nu blocheze salvarea
        }
      }
      
      // Setează pipeline (numele pipeline-ului) direct în tray_items, nu în notes
      if (patch.pipeline_id !== undefined) {
        // Transformă pipeline_id (UUID) în numele pipeline-ului
        const pipeline = pipelinesWithIds.find(p => p.id === patch.pipeline_id)
        if (pipeline) {
          trayItemPatch.pipeline = pipeline.name
        }
      }
      
      // Salvează informații suplimentare în notes ca JSON (fără pipeline_id)
      if (patch.price !== undefined) notesData.price = patch.price
      if (patch.discount_pct !== undefined) notesData.discount_pct = patch.discount_pct
      if (patch.urgent !== undefined) notesData.urgent = patch.urgent
      if (patch.name_snapshot !== undefined) notesData.name_snapshot = patch.name_snapshot
      if (patch.brand !== undefined) notesData.brand = patch.brand
      if (patch.serial_number !== undefined) notesData.serial_number = patch.serial_number
      if (patch.garantie !== undefined) notesData.garantie = patch.garantie
      if (patch.item_type !== undefined) notesData.item_type = patch.item_type
      // Nu mai salvăm pipeline_id în notes
      
      // Actualizează notes cu toate informațiile
      trayItemPatch.notes = JSON.stringify(notesData)
      
      const { error } = await updateTrayItem(String(it.id), trayItemPatch)
      if (error) {
        console.error('Error updating tray item:', error)
        throw error
      }
    }
  }

  // Adds: local rows (id starts with local_)
  for (const it of items) {
    if (!isLocalId(it.id)) continue

    if (it.item_type === "service") {
      // IMPORTANT: Verifică dacă item-ul este doar instrument (is_instrument_only)
      // pentru a evita căutarea serviciilor după numele instrumentului
      const parsedNotes = it.notes ? (() => {
        try {
          return JSON.parse(it.notes)
        } catch {
          return {}
        }
      })() : {}
      
      if (parsedNotes.is_instrument_only === true) {
        // Acesta este un item doar cu instrument, nu un serviciu
        console.warn('Item detectat ca instrument-only, skip creare serviciu:', it)
        continue
      }
      
      // match by service_id first, then fallback to name
      // IMPORTANT: Nu căutăm servicii după name_snapshot dacă nu avem service_id,
      // pentru a evita crearea serviciilor cu numele instrumentului
      if (!it.service_id || !String(it.service_id).trim()) {
        console.warn('Item cu item_type="service" dar fără service_id valid, skip:', it)
        continue
      }
      
      const svcDef = services.find(s => s.id === String(it.service_id).trim())
      if (!svcDef || !svcDef.id || !svcDef.id.trim()) {
        console.warn('Serviciu negăsit sau fără ID valid:', it)
        continue
      }
      if (!svcDef.name || !svcDef.name.trim()) {
        console.warn('Serviciu fără nume valid:', svcDef)
        continue
      }
      // Setează technician_id: dacă este setat manual, folosește-l
      // Pentru pipeline-urile departament, NU se face atribuire automată - păstrează null
      const technicianId = it.technician_id && String(it.technician_id).trim()
        ? String(it.technician_id).trim()
        : (isDepartmentPipeline ? null : currentUserTechnicianId)
      
      const serviceItemOpts = {
        qty: Number(it.qty ?? 1),
        discount_pct: Number(it.discount_pct ?? 0),
        urgent: !!it.urgent,
        technician_id: technicianId,
        pipeline_id: it.pipeline_id && String(it.pipeline_id).trim() ? String(it.pipeline_id).trim() : null,
        brand: it.brand && String(it.brand).trim() ? String(it.brand).trim() : null,
        serial_number: it.serial_number && String(it.serial_number).trim() ? String(it.serial_number).trim() : null,
        garantie: !!it.garantie,
      }
      // Creează TrayItem pentru serviciu
      // Obține instrument_id și department_id - prioritate: din item -> serviciu -> instrument
      let departmentId: string | null = null
      let instrumentId: string | null = null
      
      // 1. Verifică dacă item-ul are deja instrument_id și department_id (din UI)
      if ((it as any).instrument_id) {
        instrumentId = (it as any).instrument_id
      }
      if ((it as any).department_id) {
        departmentId = (it as any).department_id
      }
      
      // 2. Dacă nu avem din item, verifică serviciul
      if (!departmentId && svcDef.department_id) {
        departmentId = svcDef.department_id
      }
      
      // 3. Dacă serviciul are instrument_id și nu avem încă instrumentId
      if (!instrumentId && svcDef.instrument_id) {
        instrumentId = svcDef.instrument_id
      }
      
      // 4. Dacă avem instrumentId dar nu departmentId, obține din instrument
      if (instrumentId && !departmentId) {
        const instrument = instruments.find(inst => inst.id === instrumentId)
        if (instrument?.department_id) {
          departmentId = instrument.department_id
        }
      }
      
      // Salvează informații suplimentare în notes ca JSON (fără pipeline_id)
      const notesData = {
        name_snapshot: svcDef.name,
        price: svcDef.price || 0,
        discount_pct: serviceItemOpts.discount_pct,
        urgent: serviceItemOpts.urgent,
        brand: serviceItemOpts.brand,
        serial_number: serviceItemOpts.serial_number,
        garantie: serviceItemOpts.garantie,
        item_type: 'service',
      }
      
      // Transformă pipeline_id în numele pipeline-ului
      let pipelineName: string | null = null
      if (serviceItemOpts.pipeline_id) {
        const pipeline = pipelinesWithIds.find(p => p.id === serviceItemOpts.pipeline_id)
        if (pipeline) {
          pipelineName = pipeline.name
        }
      }
      
      if (!departmentId) {
        console.error('Department_id missing for service:', svcDef)
        throw new Error(`Department_id lipsă pentru serviciul "${svcDef.name}". Verifică dacă serviciul sau instrumentul are department_id setat în baza de date.`)
      }
      
      const { data: createdServiceItem, error } = await createTrayItem({
        tray_id: quoteId,
        service_id: svcDef.id,
        instrument_id: instrumentId,
        department_id: departmentId,
        technician_id: serviceItemOpts.technician_id,
        qty: serviceItemOpts.qty,
        notes: JSON.stringify(notesData),
        pipeline: pipelineName,
      })
      if (error) {
        console.error('Error creating service tray item:', error)
        throw error
      }
      
      // Loghează atribuirea tehnicianului pentru itemul nou creat
      if (serviceItemOpts.technician_id) {
        try {
          const [trayDetails, technicianDetails] = await Promise.all([
            getTrayDetails(quoteId),
            getTechnicianDetails(serviceItemOpts.technician_id),
          ])
          const currentUser = currentUserDetails
          
          const trayLabel = trayDetails 
            ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
            : 'nesemnată'
          
          // Tehnicianul este userul curent - folosește currentUser dacă technicianDetails nu este disponibil
          const finalTechnicianDetails = technicianDetails || (currentUser ? {
            id: currentUser.id,
            name: currentUser.name || currentUser.email || 'User necunoscut',
            email: currentUser.email,
          } : null)
          const technicianName = finalTechnicianDetails?.name || 'tehnician necunoscut'
          
          await logItemEvent(
            'tray',
            quoteId,
            `Tehnician "${technicianName}" atribuit pentru "${svcDef.name}" în tăvița "${trayLabel}"`,
            'technician_assigned',
            {
              item_id: createdServiceItem?.id || null,
              item_name: svcDef.name,
              item_type: 'service'
            },
            {
              tray: trayDetails ? {
                id: trayDetails.id,
                number: trayDetails.number,
                status: trayDetails.status,
                service_file_id: trayDetails.service_file_id,
              } : undefined,
              technician: finalTechnicianDetails ? {
                id: finalTechnicianDetails.id,
                name: finalTechnicianDetails.name,
                email: finalTechnicianDetails.email,
              } : undefined,
              pipeline: trayDetails?.pipeline || undefined,
              stage: trayDetails?.stage || undefined,
              user: currentUser || undefined,
            }
          )
        } catch (logError) {
          console.error('Eroare la logarea atribuirii tehnicianului:', logError)
          // Nu aruncă eroarea, doar loghează
        }
      }
    } else if (it.item_type === null && (it as any).instrument_id) {
      // Item doar cu instrument (item_type: null) - datele instrumentului sunt deja salvate
      // Acest caz este gestionat de addInstrumentItem care creează direct în DB
      // Verificăm dacă are instrument_id și department_id din item
      const instrumentId = (it as any).instrument_id
      const departmentId = (it as any).department_id
      
      if (!instrumentId || !departmentId) {
        // Încearcă să obțină din lista de instrumente
        const instrument = instruments.find(inst => inst.id === instrumentId)
        const finalDeptId = departmentId || instrument?.department_id
        
        if (!finalDeptId) {
          console.error('Department_id missing for instrument item:', it)
          throw new Error(`Department_id lipsă pentru instrument. Verifică dacă instrumentul are department_id setat.`)
        }
        
        const notesData = {
          name_snapshot: it.name_snapshot,
          item_type: null,
          brand: it.brand || null,
          serial_number: it.serial_number || null,
          garantie: it.garantie || false,
        }
        
        // Transformă pipeline_id în numele pipeline-ului
        let pipelineNameForInstrument: string | null = null
        if ((it as any).pipeline_id) {
          const pipeline = pipelinesWithIds.find(p => p.id === (it as any).pipeline_id)
          if (pipeline) {
            pipelineNameForInstrument = pipeline.name
          }
        }
        
        // Pentru pipeline-urile departament, NU se face atribuire automată
        const technicianIdForInstrument = it.technician_id || (isDepartmentPipeline ? null : currentUserTechnicianId)
        const { data: createdInstrumentItem, error } = await createTrayItem({
          tray_id: quoteId,
          instrument_id: instrumentId,
          department_id: finalDeptId,
          service_id: null,
          technician_id: technicianIdForInstrument,
          qty: Number(it.qty ?? 1),
          notes: JSON.stringify(notesData),
          pipeline: pipelineNameForInstrument,
        })
        if (error) {
          console.error('Error creating instrument tray item:', error)
          throw error
        }
        
        // Loghează atribuirea tehnicianului pentru itemul cu instrument nou creat
        if (technicianIdForInstrument) {
          try {
            // Obține detalii complete despre tehnician folosind funcția dedicată
            const [trayDetails, technicianDetails] = await Promise.all([
              getTrayDetails(quoteId),
              getTechnicianDetails(technicianIdForInstrument),
            ])
            const currentUser = currentUserDetails
            
            const trayLabel = trayDetails 
              ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
              : 'nesemnată'
            
            // Tehnicianul este userul curent - folosește currentUser dacă technicianDetails nu este disponibil
            const finalTechnicianDetails = technicianDetails || (currentUser ? {
              id: currentUser.id,
              name: currentUser.name || currentUser.email || 'User necunoscut',
              email: currentUser.email,
            } : null)
            const technicianName = finalTechnicianDetails?.name || 'tehnician necunoscut'
            const instrumentName = it.name_snapshot || 'instrument'
            
            await logItemEvent(
              'tray',
              quoteId,
              `Tehnician "${technicianName}" atribuit pentru "${instrumentName}" în tăvița "${trayLabel}"`,
              'technician_assigned',
              {
                item_id: createdInstrumentItem?.id || null,
                item_name: instrumentName,
                technician_id: technicianIdForInstrument,
                technician_name: technicianName,
                item_type: null
              },
              {
                tray: trayDetails ? {
                  id: trayDetails.id,
                  number: trayDetails.number,
                  status: trayDetails.status,
                  service_file_id: trayDetails.service_file_id,
                } : undefined,
                technician: finalTechnicianDetails ? {
                  id: finalTechnicianDetails.id,
                  name: finalTechnicianDetails.name,
                  email: finalTechnicianDetails.email,
                } : undefined,
                pipeline: trayDetails?.pipeline || undefined,
                stage: trayDetails?.stage || undefined,
                user: currentUser || undefined,
              }
            )
          } catch (logError) {
            console.error('Eroare la logarea atribuirii tehnicianului:', logError)
            // Nu aruncă eroarea, doar loghează
          }
        }
    } else {
        // Item-ul are deja toate informațiile necesare
        const notesData = {
          name_snapshot: it.name_snapshot,
          item_type: null,
          brand: it.brand || null,
          serial_number: it.serial_number || null,
          garantie: it.garantie || false,
        }
        
        // Transformă pipeline_id în numele pipeline-ului
        let pipelineNameForInstrumentAlt: string | null = null
        if ((it as any).pipeline_id) {
          const pipeline = pipelinesWithIds.find(p => p.id === (it as any).pipeline_id)
          if (pipeline) {
            pipelineNameForInstrumentAlt = pipeline.name
          }
        }
        
        const { error } = await createTrayItem({
          tray_id: quoteId,
          instrument_id: instrumentId,
          department_id: departmentId,
          service_id: null,
          technician_id: it.technician_id || (isDepartmentPipeline ? null : currentUserTechnicianId),
          qty: Number(it.qty ?? 1),
          notes: JSON.stringify(notesData),
          pipeline: pipelineNameForInstrumentAlt,
          // Brand și serial_number se salvează în tabelul tray_item_brand_serials
          brandSerialGroups: it.brand || it.serial_number ? [{
            brand: it.brand || null,
            serialNumbers: it.serial_number ? [it.serial_number] : [],
            garantie: it.garantie || false
          }] : undefined,
        })
        if (error) {
          console.error('Error creating instrument tray item:', error)
          throw error
        }
      }
    } else if (it.item_type === 'part') {
      // part
      const partName = String(it.name_snapshot ?? '').trim()
      if (!partName) {
        console.warn('Piesă fără nume valid:', it)
        continue
      }
      
      // Pentru piese, obține instrument_id și department_id din item (setat din UI)
      let departmentId: string | null = (it as any).department_id || null
      let instrumentId: string | null = (it as any).instrument_id || null
      
      // Dacă nu avem din item, încearcă din alte surse (fallback)
      if (!departmentId || !instrumentId) {
        // Caută în alte items din tavă (locale)
        const otherServiceItem = items.find(other => other.item_type === 'service' && (other as any).instrument_id)
        if (otherServiceItem) {
          if (!instrumentId && (otherServiceItem as any).instrument_id) {
            instrumentId = (otherServiceItem as any).instrument_id
          }
          if (!departmentId && (otherServiceItem as any).department_id) {
            departmentId = (otherServiceItem as any).department_id
          }
        }
      }
      
      // Dacă încă nu avem, verifică items-urile existente din DB
      if (!departmentId || !instrumentId) {
        const { data: existingItems } = await listTrayItemsForTray(quoteId)
        const existingItem = existingItems?.find((ti: TrayItem) => ti.department_id && ti.instrument_id)
        if (existingItem) {
          if (!departmentId) departmentId = existingItem.department_id
          if (!instrumentId) instrumentId = existingItem.instrument_id
        }
      }
      
      // Fallback pentru department_id: folosește departamentul "Reparatii" pentru piese
      if (!departmentId) {
        const supabase = supabaseBrowser()
        const { data: reparatiiDept } = await supabase
          .from('departments')
          .select('id')
          .eq('name', 'Reparatii')
          .single()
        
        if (reparatiiDept?.id) {
          departmentId = reparatiiDept.id
        }
      }
      
      if (!departmentId || !instrumentId) {
        throw new Error(`Department_id sau instrument_id lipsă pentru piesa "${partName}". Te rog selectează un instrument înainte de a adăuga piese.`)
      }
      
      const pipelineId = it.pipeline_id && String(it.pipeline_id).trim() ? String(it.pipeline_id).trim() : reparatiiPipelineId
      
      // Transformă pipeline_id în numele pipeline-ului
      let pipelineNameForPart: string | null = null
      if (pipelineId) {
        const pipeline = pipelinesWithIds.find(p => p.id === pipelineId)
        if (pipeline) {
          pipelineNameForPart = pipeline.name
        }
      }
      
      // Pentru pipeline-urile departament, NU se face atribuire automată
      const technicianIdForPart = it.technician_id && String(it.technician_id).trim()
        ? String(it.technician_id).trim()
        : (isDepartmentPipeline ? null : currentUserTechnicianId)
      
      // Obține part_id din item dacă există
      const partId = (it as any).part_id || null
      
      // Extrage serial_number - poate fi string sau obiect {serial, garantie}
      let serialNumberValue: string | null = null
      if (it.serial_number) {
        if (typeof it.serial_number === 'string') {
          serialNumberValue = it.serial_number
        } else if (typeof it.serial_number === 'object' && it.serial_number !== null && 'serial' in it.serial_number) {
          serialNumberValue = (it.serial_number as any).serial || null
        } else {
          serialNumberValue = String(it.serial_number)
        }
      }
      
      const { data: createdPartItem, error } = await createTrayItem({
        tray_id: quoteId,
        service_id: null, // Piese nu au service_id
        part_id: partId,
        instrument_id: instrumentId,
        department_id: departmentId,
        technician_id: technicianIdForPart,
        qty: Number(it.qty ?? 1),
        notes: JSON.stringify({
          name: partName,
          price: Number(it.price ?? 0),
        discount_pct: Number(it.discount_pct ?? 0),
        urgent: !!it.urgent,
          brand: it.brand || null,
          serial_number: serialNumberValue,
        garantie: !!it.garantie,
        }), // Salvează informații suplimentare în notes ca JSON (fără pipeline_id)
        pipeline: pipelineNameForPart,
      })
      if (error) {
        console.error('Error creating part tray item:', error)
        throw error
      }
      
      // Loghează atribuirea tehnicianului pentru piesa nou creată
      if (technicianIdForPart) {
        try {
          const [trayDetails, technicianDetails] = await Promise.all([
            getTrayDetails(quoteId),
            getTechnicianDetails(technicianIdForPart),
          ])
          const currentUser = currentUserDetails
          
          const trayLabel = trayDetails 
            ? `${trayDetails.number}${trayDetails.status ? ` - ${trayDetails.status}` : ''}`
            : 'nesemnată'
          
          // Tehnicianul este userul curent - folosește currentUser dacă technicianDetails nu este disponibil
          const finalTechnicianDetails = technicianDetails || (currentUser ? {
            id: currentUser.id,
            name: currentUser.name || currentUser.email || 'User necunoscut',
            email: currentUser.email,
          } : null)
          const technicianName = finalTechnicianDetails?.name || 'tehnician necunoscut'
          
          await logItemEvent(
            'tray',
            quoteId,
            `Tehnician "${technicianName}" atribuit pentru piesa "${partName}" în tăvița "${trayLabel}"`,
            'technician_assigned',
            {
              item_id: createdPartItem?.id || null,
              item_name: partName,
              item_type: 'part'
            },
            {
              tray: trayDetails ? {
                id: trayDetails.id,
                number: trayDetails.number,
                status: trayDetails.status,
                service_file_id: trayDetails.service_file_id,
              } : undefined,
              technician: finalTechnicianDetails ? {
                id: finalTechnicianDetails.id,
                name: finalTechnicianDetails.name,
                email: finalTechnicianDetails.email,
              } : undefined,
              pipeline: trayDetails?.pipeline || undefined,
              stage: trayDetails?.stage || undefined,
              user: currentUser || undefined,
            }
          )
        } catch (logError) {
          console.error('Eroare la logarea atribuirii tehnicianului:', logError)
          // Nu aruncă eroarea, doar loghează
        }
      }
    }
  }

  // === 2) Reload canonical DB rows ===
  const { data: trayItems, error: loadError } = await listTrayItemsForTray(quoteId)
  if (loadError) {
    console.error('Error loading tray items:', loadError)
    throw loadError
  }
  
  // Transformă TrayItem în LeadQuoteItem pentru UI
  const fresh: LeadQuoteItem[] = (trayItems || []).map((item: TrayItem) => {
    // Încearcă să parseze notes pentru a obține informații suplimentare (pentru piese)
    let additionalData: any = {}
    if (item.notes) {
      try {
        additionalData = JSON.parse(item.notes)
      } catch (e) {
        // Notes nu este JSON, ignoră
      }
    }
    
    // Determină item_type
    let item_type: 'service' | 'part' | null = additionalData.item_type || null
    if (!item_type) {
      if (item.service_id) {
        item_type = 'service'
      } else if (additionalData.name || additionalData.name_snapshot) {
        item_type = 'part'
      }
    }
    
    // Obține prețul
    let price = additionalData.price || 0
    if (!price && item_type === 'service' && item.service_id && services) {
      const service = services.find((s: Service) => s.id === item.service_id)
      price = service?.price || 0
    }
    
    // Obține name_snapshot
    let name_snapshot = additionalData.name_snapshot || additionalData.name || ''
    if (!name_snapshot && item_type === 'service' && item.service_id && services) {
      const service = services.find((s: Service) => s.id === item.service_id)
      name_snapshot = service?.name || ''
    }
    
    // Transformă pipeline (nume) în pipeline_id (UUID) pentru UI
    let pipeline_id: string | null = null
    if (item.pipeline) {
      const pipeline = pipelinesWithIds.find(p => p.name === item.pipeline)
      if (pipeline) {
        pipeline_id = pipeline.id
      }
    }
    // Fallback la pipeline_id din notes dacă nu există în câmpul pipeline
    if (!pipeline_id && additionalData.pipeline_id) {
      pipeline_id = additionalData.pipeline_id
    }
    
    return {
      id: item.id,
      tray_id: item.tray_id,
      item_type,
      service_id: item.service_id,
      name_snapshot,
      price,
      qty: item.qty,
      discount_pct: additionalData.discount_pct || 0,
      urgent: additionalData.urgent || false,
      technician_id: item.technician_id,
      pipeline_id,
      brand: additionalData.brand || null,
      serial_number: additionalData.serial_number || null,
      garantie: additionalData.garantie || false,
    } as LeadQuoteItem
  })
  
  const freshSnap = (fresh ?? []).map(toSnap)

  // === 2.5) AUTO-ADD TRAY TO DEPARTMENT PIPELINE ===
  // Verifică dacă există items cu pipeline_id setat și adaugă tăvița în pipeline-ul corespunzător
  if (pipelinesWithIds.length > 0) {
    const supabase = supabaseBrowser()
    
    // Colectează toate pipeline_id-urile unice din items
    const pipelineIdsFromItems = new Set<string>()
    for (const item of fresh) {
      if (item.pipeline_id) {
        pipelineIdsFromItems.add(item.pipeline_id)
      }
    }
    
    // TODO: Auto-adaugarea tăvițelor în pipeline-urile departamentelor a fost dezactivată
    // Tăvițele vor fi adăugate în departamente doar când se apasă butonul "Trimite tăvițele"
    // din pipeline-ul Curier sau Receptie, nu automat la salvare
    // 
    // Logica veche (comentată):
    // Pentru fiecare pipeline_id unic, verifică dacă tăvița trebuie adăugată
    // for (const pipelineId of pipelineIdsFromItems) {
    //   // Verifică dacă este un pipeline departament (Saloane, Frizerii, Horeca, Reparatii)
    //   const pipeline = pipelinesWithIds.find(p => p.id === pipelineId)
    //   if (!pipeline) continue
    //   
    //   const departmentPipelines = ['saloane', 'frizerii', 'horeca', 'reparatii']
    //   const isDepartmentPipeline = departmentPipelines.some(dept => 
    //     pipeline.name.toLowerCase() === dept.toLowerCase()
    //   )
    //   
    //   if (isDepartmentPipeline) {
    //     // Adaugă tăvița în pipeline doar când se apasă "Trimite tăvițele"
    //     // Nu se mai adaugă automat la salvare
    //   }
    // }
  }

  // === 3) Compose message + payload and log ===
  const d = diffSnapshots(prevSnapshot, freshSnap)
  const { message, payload } = await composeMessage(freshSnap, d, totals, quoteId, instruments, { globalDiscountPct, subscriptionType, currentUserDetails })
  await logLeadEvent(leadId, message, "service_sheet_save", payload)

  // === 4) Return new items + snapshot for the caller to update UI flags ===
  return { items: fresh ?? [], snapshot: freshSnap }
}
