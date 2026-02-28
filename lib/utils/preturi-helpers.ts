import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import {
  listTraysForServiceFile,
  createTray,
  listTrayItemsForTray,
  createTrayItem,
  type TrayItem,
} from '@/lib/supabase/serviceFileOperations'
import type { LeadQuote, LeadQuoteItem } from '@/lib/types/preturi'

const supabase = supabaseBrowser()

/**
 * Funcții helper pentru componenta Preturi
 */

/**
 * Obține toate tăvițele pentru o fișă de serviciu
 */
export const listTraysForServiceSheet = async (fisaId: string): Promise<LeadQuote[]> => {
  const { data, error } = await listTraysForServiceFile(fisaId)
  if (error) {
    console.error('Error loading trays:', error)
    return []
  }
  return (data || []).map(tray => ({
    ...tray,
    fisa_id: fisaId,
  })) as LeadQuote[]
}

/**
 * Obține toate tăvițele pentru un lead (prin toate fișele de serviciu)
 */
export const listQuotesForLead = async (leadId: string): Promise<LeadQuote[]> => {
  // Obține toate tăvițele pentru lead prin toate fișele de serviciu
  const { data: serviceFiles } = await supabase
    .from('service_files')
    .select('id')
    .eq('lead_id', leadId)
  
  if (!serviceFiles || serviceFiles.length === 0) {
    return []
  }
  
  const serviceFileIds = serviceFiles.map((sf: any) => sf.id)
  const { data: trays } = await supabase
    .from('trays')
    .select('*')
    .in('service_file_id', serviceFileIds)
    .order('created_at', { ascending: true })
  
  return (trays || []) as LeadQuote[]
}

/**
 * Creează o tăviță nouă pentru un lead
 * (Conversația se creează când se apasă "Trimite Tăvițe", nu la crearea tăviței)
 */
export const createQuoteForLead = async (
  leadId: string, 
  name?: string, 
  fisaId?: string | null
): Promise<LeadQuote> => {
  if (!fisaId) {
    throw new Error('fisaId is required for creating trays in new architecture')
  }
  
  // Creează o tavă nouă pentru fișa de serviciu
  // Pentru vânzători, numărul poate fi gol (undefined)
  const trayData = {
    number: name || '',
    service_file_id: fisaId,
    status: 'in_receptie' as const,
  }
  
  const { data, error } = await createTray(trayData)
  if (error || !data) {
    console.error('Error creating tray:', error)
    throw error || new Error('Failed to create tray')
  }
  
  return {
    ...data,
    fisa_id: fisaId,
  } as LeadQuote
}

/**
 * Actualizează o tăviță
 */
export const updateQuote = async (quoteId: string, updates: Partial<LeadQuote>) => {
  // trays nu are is_cash, is_card, subscription_type
  // Aceste câmpuri nu sunt stocate în tabelul trays
  if (updates.is_cash !== undefined || updates.is_card !== undefined || updates.subscription_type !== undefined) {
    console.warn('is_cash, is_card, subscription_type nu pot fi actualizate - aceste câmpuri nu sunt stocate în trays')
    // Nu aruncăm eroare, doar ignorăm aceste câmpuri
  }
  
  // Actualizăm doar câmpurile care există în trays
  const trayUpdates: any = {}
  
  if (updates.number !== undefined) trayUpdates.number = updates.number
  if (updates.status !== undefined) trayUpdates.status = updates.status
  // urgent nu mai există în trays - este gestionat doar în service_files
  
  // Dacă există actualizări pentru tray, le aplicăm
  if (Object.keys(trayUpdates).length > 0) {
    const { error } = await supabase
      .from('trays')
      .update(trayUpdates)
      .eq('id', quoteId)
    
    if (error) {
      console.error('Error updating tray:', error)
      throw error
    }
  }
  
  // Dacă nu există actualizări pentru tray (doar is_cash, is_card, subscription_type),
  // returnează tray-ul existent
  return
}

/**
 * Obține items-urile pentru o tăviță și le transformă în formatul pentru UI
 */
export const listQuoteItems = async (
  quoteId: string, 
  services?: any[],
  instruments?: Array<{ id: string; name: string; weight: number; department_id: string | null; pipeline?: string | null }>,
  pipelines?: Array<{ id: string; name: string }>
): Promise<LeadQuoteItem[]> => {
  const { data, error } = await listTrayItemsForTray(quoteId)
  if (error) {
    console.error('Error loading tray items:', error)
    return []
  }
  
  // Creează map-uri pentru instrumente și pipeline-uri
  const instrumentPipelineMap = new Map<string, string | null>()
  const pipelineMap = new Map<string, string>()
  
  if (instruments) {
    instruments.forEach(inst => {
      if (inst.pipeline) {
        instrumentPipelineMap.set(inst.id, inst.pipeline)
      }
    })
  }
  
  if (pipelines) {
    pipelines.forEach(p => {
      pipelineMap.set(p.id, p.name)
    })
  }
  
  // Transformă TrayItem în LeadQuoteItem pentru UI
  return (data || []).map((item: TrayItem) => {
    // Parsează notes pentru a obține informații suplimentare
    let notesData: any = {}
    if (item.notes) {
      try {
        notesData = JSON.parse(item.notes)
      } catch (e) {
        // Notes nu este JSON, ignoră
      }
    }
    
    // Determină item_type
    // IMPORTANT: Un item este "part" DOAR dacă are explicit part_id setat
    // Nu marcam automat ca "part" item-urile care nu au instrument_id, deoarece
    // acestea pot fi item-uri incomplete sau vechi din baza de date
    let item_type: 'service' | 'part' | null = notesData.item_type || null
    if (!item_type) {
      if (item.service_id) {
        item_type = 'service'
      } else if (item.part_id) {
        // Dacă are part_id, este clar un part
        item_type = 'part'
      }
      // Dacă nu are nici service_id nici part_id, rămâne null
      // (poate fi doar instrument sau item incomplet)
    }
    
    // Obține prețul
    let price = notesData.price || 0
    if (!price && item_type === 'service' && item.service_id && services) {
      const service = services.find((s: any) => s.id === item.service_id)
      price = service?.price || 0
    }
    
    // Obține departamentul din instruments.pipeline
    let department: string | null = null
    let instrumentId = item.instrument_id
    
    // Pentru servicii, obține instrument_id din serviciu dacă nu există direct pe item
    if (!instrumentId && item_type === 'service' && item.service_id && services) {
      const service = services.find((s: any) => s.id === item.service_id)
      if (service?.instrument_id) {
        instrumentId = service.instrument_id
      }
    }
    
    // Obține pipeline-ul din instrument și apoi numele departamentului
    if (instrumentId && instrumentPipelineMap.size > 0 && pipelineMap.size > 0) {
      const pipelineId = instrumentPipelineMap.get(instrumentId)
      if (pipelineId) {
        department = pipelineMap.get(pipelineId) || null
      }
    }
    
    // IMPORTANT: Nu folosim ...item pentru a evita copierea proprietăților care pot conține referințe circulare
    // Extragem explicit doar proprietățile primitive necesare
    return {
      // Proprietăți din TrayItem - doar cele primitive
      id: item.id,
      tray_id: item.tray_id,
      department_id: item.department_id || null,
      instrument_id: instrumentId || item.instrument_id || null,
      service_id: item.service_id || null,
      part_id: item.part_id || null,
      technician_id: item.technician_id || null,
      notes: item.notes || null,
      pipeline: item.pipeline || null,
      // Câmpuri calculate/derivate
      item_type,
      price: price || 0,
      discount_pct: notesData.discount_pct || 0,
      urgent: notesData.urgent || false,
      name_snapshot: notesData.name_snapshot || notesData.name || '',
      brand: notesData.brand || null,
      serial_number: notesData.serial_number || null,
      garantie: notesData.garantie || false,
      pipeline_id: notesData.pipeline_id || null,
      department,
      qty: item.qty || 1,
      non_repairable_qty: typeof notesData.non_repairable_qty === 'number' ? Math.max(0, notesData.non_repairable_qty) : 0,
      unrepaired_qty: typeof (item as any).unrepaired_qty === 'number' ? Math.max(0, (item as any).unrepaired_qty) : (typeof notesData.non_repairable_qty === 'number' ? Math.max(0, notesData.non_repairable_qty) : 0),
    } as LeadQuoteItem & { price: number; department?: string | null; unrepaired_qty?: number }
  })
}

/**
 * Adaugă un item de tip piesă într-o tăviță
 */
export const addPartItem = async (quoteId: string, name: string, unitPrice: number, opts?: any) => {
  const { error } = await createTrayItem({
    tray_id: quoteId,
    name_snapshot: name,
    qty: opts?.qty || 1,
    notes: opts?.notes || null,
    department_id: opts?.department_id || null,
    technician_id: opts?.technician_id || null,
  } as any)
  if (error) throw error
}

/**
 * Adaugă un item de tip instrument într-o tăviță
 */
export const addInstrumentItem = async (quoteId: string, instrumentName: string, opts?: any) => {
  // Salvează informații suplimentare în notes ca JSON (pentru compatibilitate)
  // IMPORTANT: Nu setăm name_snapshot la numele instrumentului pentru a evita confuzia
  // când se caută servicii după name_snapshot. Item-urile cu item_type: null nu ar trebui
  // să aibă name_snapshot setat, deoarece nu sunt servicii.
  const notesData = {
    // name_snapshot: instrumentName, // REMOVED: Poate cauza confuzie când se caută servicii
    item_type: null, // null înseamnă doar instrument, fără serviciu
    pipeline_id: opts?.pipeline_id || null,
    // Adăugăm un flag pentru a identifica că acesta este un item doar cu instrument
    is_instrument_only: true,
  }
  
  const { error } = await createTrayItem({
    tray_id: quoteId,
    instrument_id: opts.instrument_id,
    department_id: opts.department_id,
    service_id: null, // Doar instrument, fără serviciu
    technician_id: opts?.technician_id || null,
    qty: opts?.qty || 1,
    notes: JSON.stringify(notesData),
    pipeline: opts?.pipeline_id || null,
  })
  if (error) throw error
}



