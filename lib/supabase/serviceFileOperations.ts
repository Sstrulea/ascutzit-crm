'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseBrowser } from './supabaseClient'
import { logItemEvent } from './leadOperations'

const supabase = supabaseBrowser()

/** Etichete pentru afișare în istoric la modificări câmpuri fișă de serviciu. */
export const SERVICE_FILE_FIELD_LABELS: Record<string, string> = {
  number: 'Număr fișă',
  date: 'Data',
  status: 'Status',
  notes: 'Note',
  details: 'Detalii fișă',
  office_direct: 'Office direct',
  office_direct_at: 'Data office direct',
  curier_trimis: 'Curier trimis',
  curier_scheduled_at: 'Data programare curier',
  colet_neridicat: 'Colet neridicat',
  nu_raspunde_callback_at: 'Nu răspunde (callback)',
  no_deal: 'No deal',
  urgent: 'Urgent',
  retur: 'Retur',
  cash: 'Plată cash',
  card: 'Plată card',
  global_discount_pct: 'Discount global (%)',
  is_locked: 'Blocat',
}

// Tipuri pentru noile tabele
export type ServiceFile = {
  id: string
  lead_id: string
  number: string
  date: string
  status: 'noua' | 'in_lucru' | 'finalizata' | 'comanda' | 'facturata'
  notes: string | null
  details: string | null // Detalii Fișă de Serviciu. Text simplu. Populate automat din formular sau introduse manual.
  technician_details?: TechnicianDetailEntry[] | null // Detalii comunicate de tehnician (append-only, cu stage)
  office_direct: boolean // Checkbox pentru "Office direct"
  office_direct_at: string | null // Când a fost bifat Office Direct / „închisă” fișa (pentru afișare „o zi” în Vânzări)
  curier_trimis: boolean // Checkbox pentru "Curier Trimis"
  curier_scheduled_at: string | null // Data și ora programată pentru ridicarea curierului
  colet_neridicat: boolean // Marcat ca colet neridicat; afișat în stage COLET NERIDICAT până la Trimite Tăvițele / status comanda
  nu_raspunde_callback_at: string | null // Data și ora programată pentru a suna din nou clientul
  no_deal: boolean       // Checkbox pentru "No Deal" în Vânzări
  urgent: boolean        // Flag urgent pentru toate tăvițele din fișă
  retur: boolean         // Marchează fișa ca retur; lead-ul poartă tag Retur cât timp fișa e activă
  archived_at: string | null // Setat la arhivare; null = fișă activă
  cash: boolean          // Checkbox pentru "Cash" - metodă de plată
  card: boolean          // Checkbox pentru "Card" - metodă de plată
  global_discount_pct: number // Discount global (%) aplicat întregii fișe de serviciu (0-100)
  is_locked: boolean     // Flag pentru blocarea fișei după prima salvare (doar pentru Vanzari pipeline)
  created_at: string
  updated_at: string
}

export type TechnicianDetailEntry = {
  stage: string
  stageLabel: string
  text: string
  at: string
  userId?: string
}

/**
 * Adaugă o intrare la technician_details (append-only).
 * Editat doar în departamente tehnice.
 */
export async function appendTechnicianDetail(
  serviceFileId: string,
  entry: Omit<TechnicianDetailEntry, 'at'>,
  userId?: string
): Promise<{ data: TechnicianDetailEntry[] | null; error: any }> {
  try {
    const { data: sf, error: fetchErr } = await supabase
      .from('service_files')
      .select('technician_details')
      .eq('id', serviceFileId)
      .single()

    if (fetchErr || !sf) return { data: null, error: fetchErr || new Error('Fișă negăsită') }

    const existing = Array.isArray(sf.technician_details) ? sf.technician_details : []
    const newEntry: TechnicianDetailEntry = {
      ...entry,
      at: new Date().toISOString(),
      ...(userId ? { userId } : {}),
    }
    const updated = [...existing, newEntry]

    const { data, error } = await supabase
      .from('service_files')
      .update({ technician_details: updated, updated_at: new Date().toISOString() })
      .eq('id', serviceFileId)
      .select('technician_details')
      .single()

    if (error) return { data: null, error }
    // Înregistrare în istoric: mesaj QC / notă tehnician (cine a scris, când, ce text)
    logItemEvent(
      'service_file',
      serviceFileId,
      `Mesaj QC (${entry.stageLabel}): ${entry.text}`,
      'qc_message',
      { stage: entry.stage, stageLabel: entry.stageLabel, text: entry.text }
    ).catch((err) => console.warn('[appendTechnicianDetail] logItemEvent:', err))
    return { data: (data?.technician_details as TechnicianDetailEntry[]) ?? updated, error: null }
  } catch (e: any) {
    return { data: null, error: e }
  }
}

export type Tray = {
  id: string
  number: string
  service_file_id: string
  status: 'in_receptie' | 'in_lucru' | 'gata' | 'Splited' | '2' | '3'
  created_at: string
  /** Tehnician atribuit întregii tăvițe (setat la În lucru / În așteptare / Finalizată). */
  technician_id?: string | null
  technician2_id?: string | null
  technician3_id?: string | null
  /** Pentru tăvițe create la Împarte: id-ul tăviței originale. NULL pentru tăvițe normale. */
  parent_tray_id?: string | null
  /** Notițe din Quality Check (validare / nevalidare). */
  qc_notes?: string | null
  /** Imagine reprezentativă pentru tăviță (FK tray_images.id). Setată din detaliile fișei (Recepție / departamente). */
  assigned_image_id?: string | null
}

export type TrayItem = {
  id: string
  tray_id: string
  department_id: string | null
  instrument_id: string | null
  service_id: string | null
  part_id: string | null
  qty: number
  /** Cantitate instrumente nereparate (pentru servicii). */
  unrepaired_qty?: number
  /** Sumă text numere de serie (pentru raportare/filtrare). */
  serials?: string | null
  notes: string | null
  pipeline: string | null
  // Joined data
  service?: {
    id: string
    name: string
    price: number
  } | null
  // Noua structură pentru brand-uri și serial numbers
  tray_item_brands?: Array<{
    id: string
    brand: string
    garantie: boolean
    tray_item_brand_serials?: Array<{
      id: string
      serial_number: string
    }>
  }>
}

// ==================== SERVICE FILES ====================

/**
 * Creează o nouă fișă de serviciu (service file) asociată cu un lead.
 * O fișă de serviciu reprezintă un document de lucru care conține detalii despre serviciile
 * care trebuie efectuate pentru un client. Poate include status, note și flag-uri pentru
 * "Office direct", "Curier Trimis" și "No Deal".
 * 
 * @param data - Datele fișei de serviciu:
 *   - lead_id: ID-ul lead-ului pentru care se creează fișa
 *   - number: Numărul fișei (ex: "Fisa 1")
 *   - date: Data fișei (format ISO)
 *   - status: Statusul fișei ('noua', 'in_lucru', 'finalizata', 'comanda', 'facturata') - implicit 'noua'
 *   - notes: Note opționale despre fișă
 *   - office_direct: Flag pentru "Office direct" - implicit false
 *   - curier_trimis: Flag pentru "Curier Trimis" - implicit false
 *   - no_deal: Flag pentru "No Deal" în pipeline-ul Vânzări - implicit false
 *   - details: Detalii Fișă de Serviciu (text). Populate automat din formular sau null.
 * @returns Obiect cu data fișei create sau null și eroarea dacă există
 */
export async function createServiceFile(data: {
  lead_id: string
  number: string
  date: string
  status?: 'noua' | 'in_lucru' | 'finalizata' | 'comanda' | 'facturata'
  notes?: string | null
  details?: string | null
  office_direct?: boolean
  curier_trimis?: boolean
  no_deal?: boolean
}): Promise<{ data: ServiceFile | null; error: any }> {
  try {
    // PROTECȚIE: Verifică dacă există deja o fișă cu acest număr
    const { data: existing, error: checkError } = await supabase
      .from('service_files')
      .select('id, number, lead_id')
      .eq('number', data.number)
      .maybeSingle()
    
    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = "not found" (ok), alte erori sunt probleme reale
      throw checkError
    }
    
    if (existing) {
      // Fișă cu acest număr există deja
      return { 
        data: null, 
        error: new Error(`Fișa cu numărul "${data.number}" există deja (ID: ${existing.id}, Lead: ${existing.lead_id}). Te rog folosește un alt număr sau verifică duplicate-urile.`) 
      }
    }
    
    // Dacă nu există, inserează
    const { data: result, error } = await supabase
      .from('service_files')
      .insert([{
        lead_id: data.lead_id,
        number: data.number,
        date: data.date,
        status: data.status || 'noua',
        notes: data.notes || null,
        details: data.details ?? null,
        office_direct: data.office_direct || false,
        curier_trimis: data.curier_trimis || false,
        no_deal: data.no_deal ?? false,
      }])
      .select()
      .single()

    if (error) {
      // Dacă e eroare de unique constraint (dacă există în DB), înseamnă că s-a inserat între timp
      if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
        // Încearcă să obții fișa existentă
        const { data: existingAfterInsert } = await supabase
          .from('service_files')
          .select('*')
          .eq('number', data.number)
          .single()
        
        if (existingAfterInsert) {
          return { 
            data: null, 
            error: new Error(`Fișa cu numărul "${data.number}" a fost creată deja de alt proces (race condition). ID: ${existingAfterInsert.id}`) 
          }
        }
      }
      throw error
    }
    
    return { data: result as ServiceFile, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Obține o fișă de serviciu după ID-ul său.
 * Funcția returnează toate detaliile unei fișe de serviciu, inclusiv status, note și flag-uri.
 * 
 * @param serviceFileId - ID-ul unic al fișei de serviciu
 * @returns Obiect cu data fișei sau null dacă nu există, și eroarea dacă există
 */
export async function getServiceFile(serviceFileId: string): Promise<{ data: ServiceFile | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('service_files')
      .select('*')
      .eq('id', serviceFileId)
      .single()

    if (error) throw error
    return { data: data as ServiceFile, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Obține următorul număr global pentru o fișă de serviciu.
 * Numărul este global pentru toate fișele din sistem, nu doar pentru un lead specific.
 * 
 * @returns Următorul număr global disponibil
 */
export async function getNextGlobalServiceFileNumber(): Promise<{ data: number | null; error: any }> {
  try {
    // Numără toate fișele existente pentru a obține următorul număr global
    const { count, error } = await supabase
      .from('service_files')
      .select('*', { count: 'exact', head: true })

    if (error) throw error
    const nextNumber = (count ?? 0) + 1
    return { data: nextNumber, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Listează toate fișele de serviciu asociate cu un lead specificat.
 * Fișele sunt returnate în ordine descrescătoare după data creării (cele mai noi primele).
 * Această funcție este folosită pentru a afișa toate fișele unui client în panoul de detalii.
 * 
 * @param leadId - ID-ul lead-ului pentru care se caută fișele
 * @returns Array cu toate fișele de serviciu ale lead-ului sau array gol dacă nu există
 */
export async function listServiceFilesForLead(leadId: string): Promise<{ data: ServiceFile[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('service_files')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { data: (data ?? []) as ServiceFile[], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Actualizează o fișă de serviciu existentă.
 * Permite modificarea oricărui câmp al fișei: număr, dată, status, note sau flag-uri.
 * Funcția actualizează automat câmpul updated_at cu data curentă.
 * 
 * @param serviceFileId - ID-ul fișei de serviciu de actualizat
 * @param updates - Obiect parțial cu câmpurile de actualizat:
 *   - number: Numărul fișei
 *   - date: Data fișei
 *   - status: Statusul fișei ('noua', 'in_lucru', 'finalizata', 'comanda', 'facturata')
 *   - notes: Note despre fișă
 *   - office_direct: Flag pentru "Office direct"
 *   - curier_trimis: Flag pentru "Curier Trimis"
 *   - curier_scheduled_at: Data și ora programată pentru ridicarea curierului
 *   - nu_raspunde_callback_at: Data și ora programată pentru a suna din nou clientul
 *   - no_deal: Flag pentru "No Deal"
 * @returns Obiect cu data fișei actualizate sau null și eroarea dacă există
 */
export async function updateServiceFile(
  serviceFileId: string,
  updates: Partial<Pick<ServiceFile, 'number' | 'date' | 'status' | 'notes' | 'details' | 'office_direct' | 'office_direct_at' | 'curier_trimis' | 'curier_scheduled_at' | 'colet_neridicat' | 'nu_raspunde_callback_at' | 'no_deal' | 'urgent' | 'retur' | 'cash' | 'card' | 'global_discount_pct' | 'is_locked'>>
): Promise<{ data: ServiceFile | null; error: any }> {
  try {
    // IMPORTANT: Nu mai citim details dacă nu este în updates pentru a evita erorile 400
    // Supabase va păstra automat valoarea existentă pentru câmpurile care nu sunt incluse în update
    // Doar includem câmpurile care sunt explicit specificate în updates
    // Câmpuri care acceptă null explicit (pentru a le șterge / reseta)
    const nullableKeys = new Set(['notes', 'details', 'curier_scheduled_at', 'nu_raspunde_callback_at', 'office_direct_at', 'archived_at'])
    const finalUpdates: any = {
      updated_at: new Date().toISOString(),
    }
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && (value !== null || nullableKeys.has(key))) {
        finalUpdates[key] = value
      }
    }
    
    let result = await supabase
      .from('service_files')
      .update(finalUpdates)
      .eq('id', serviceFileId)
      .select()
      .single()

    if (result.error) {
      const msg = result.error?.message || ''
      // Fallback: dacă coloana retur (sau archived_at) lipsește din DB, refacem update fără ele (până rulezi migrarea)
      if (msg.includes('retur') && (msg.includes('schema cache') || msg.includes('Could not find'))) {
        const { retur: _r, archived_at: _a, ...fallbackUpdates } = finalUpdates
        result = await supabase
          .from('service_files')
          .update(fallbackUpdates)
          .eq('id', serviceFileId)
          .select()
          .single()
      }
    }

    if (result.error) {
      console.error('[updateServiceFile] Supabase error:', result.error?.message || 'Unknown error')
      throw result.error
    }

    return { data: result.data as ServiceFile, error: null }
  } catch (error: any) {
    console.error('[updateServiceFile] Error:', error?.message || 'Unknown error')
    return { data: null, error }
  }
}

export type UpdateServiceFileWithHistoryActor = {
  currentUserId?: string
  currentUserName?: string | null
  currentUserEmail?: string | null
}

type ServiceFileUpdateKeys = 'number' | 'date' | 'status' | 'notes' | 'details' | 'office_direct' | 'office_direct_at' | 'curier_trimis' | 'curier_scheduled_at' | 'colet_neridicat' | 'nu_raspunde_callback_at' | 'no_deal' | 'urgent' | 'retur' | 'cash' | 'card' | 'global_discount_pct' | 'is_locked'

/**
 * Actualizează o fișă de serviciu și înregistrează în items_events fiecare câmp modificat (istoric).
 * Folosiți această funcție când doriți ca modificările să apară în istoricul lead-ului / fișei.
 */
export async function updateServiceFileWithHistory(
  serviceFileId: string,
  updates: Partial<Pick<ServiceFile, ServiceFileUpdateKeys>>,
  actorOption?: UpdateServiceFileWithHistoryActor
): Promise<{ data: ServiceFile | null; error: any }> {
  const keys = Object.keys(updates).filter(k => k !== 'updated_at') as ServiceFileUpdateKeys[]
  if (keys.length === 0) {
    return updateServiceFile(serviceFileId, updates)
  }

  try {
    const { data: current, error: fetchErr } = await supabase
      .from('service_files')
      .select(keys.join(','))
      .eq('id', serviceFileId)
      .single()

    if (fetchErr || !current) {
      return updateServiceFile(serviceFileId, updates)
    }

    const changes: Array<{ field: string; field_label: string; previous_value: unknown; new_value: unknown }> = []
    for (const field of keys) {
      const prev = (current as any)[field]
      const next = (updates as any)[field]
      const prevStr = prev == null ? '' : String(prev)
      const nextStr = next == null ? '' : String(next)
      if (prevStr.trim() !== nextStr.trim()) {
        changes.push({
          field,
          field_label: SERVICE_FILE_FIELD_LABELS[field] || field,
          previous_value: prev,
          new_value: next,
        })
      }
    }

    const { data, error } = await updateServiceFile(serviceFileId, updates)
    if (error) return { data: null, error }

    if (changes.length > 0) {
      const fmt = (v: unknown) => (v != null && v !== '' ? String(v).trim() : '—')
      const oneLine = (c: (typeof changes)[0]) => `${c.field_label}: ${fmt(c.previous_value)} --- > ${fmt(c.new_value)}`
      const message =
        changes.length === 1
          ? `Fișă: ${oneLine(changes[0])}`
          : `Fișă: ${oneLine(changes[0])} și alte ${changes.length - 1} câmpuri`
      await logItemEvent(
        'service_file',
        serviceFileId,
        message,
        'service_file_field_updated',
        { changes },
        undefined,
        actorOption
      ).catch((err) => console.error('[updateServiceFileWithHistory] logItemEvent:', err))
    }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Șterge o fișă de serviciu și toate tăvițele ei (pipeline_items, tray_*, service_files).
 * ATENȚIE: Operația este ireversibilă.
 */
export async function deleteServiceFile(serviceFileId: string): Promise<{ success: boolean; error: any }> {
  try {
    const { data: trays, error: traysErr } = await supabase
      .from('trays')
      .select('id')
      .eq('service_file_id', serviceFileId)
    if (traysErr) throw traysErr
    const trayIds = (trays || []).map((t: any) => t.id)

    if (trayIds.length) {
      await supabase.from('pipeline_items').delete().eq('type', 'tray').in('item_id', trayIds)
      const { data: trayItems } = await supabase.from('tray_items').select('id').in('tray_id', trayIds)
      if (trayItems?.length) {
        const itemIds = trayItems.map((ti: any) => ti.id)
        await supabase.from('tray_item_brands').delete().in('tray_item_id', itemIds)
      }
      await supabase.from('tray_items').delete().in('tray_id', trayIds)
      await supabase.from('tray_images').delete().in('tray_id', trayIds)
      await supabase.from('trays').delete().in('id', trayIds)
    }

    await supabase.from('pipeline_items').delete().eq('type', 'service_file').eq('item_id', serviceFileId)
    const { error } = await supabase.from('service_files').delete().eq('id', serviceFileId)
    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}

// ==================== TRAYS ====================

/**
 * Creează o nouă tăviță (tray) asociată cu o fișă de serviciu.
 * O tăviță reprezintă un container fizic sau logic care conține item-uri de lucru.
 * Funcția verifică dacă există deja o tăviță cu același număr și fișă de serviciu,
 * și dacă da, returnează tăvița existentă în loc să creeze una duplicată.
 * 
 * @param data - Datele tăviței:
 *   - number: Numărul tăviței (ex: "Tăbliță 1")
 *   - service_file_id: ID-ul fișei de serviciu căreia îi aparține tăvița
 *   - status: Statusul tăviței ('in_receptie', 'in_lucru', 'gata') - implicit 'in_receptie'
 * @returns Obiect cu data tăviței create sau existente, sau null și eroarea dacă există
 */
export async function createTray(data: {
  number: string
  service_file_id: string
  status?: 'in_receptie' | 'in_lucru' | 'gata' | 'Splited' | '2' | '3'
  parent_tray_id?: string | null
  technician_id?: string | null
  technician2_id?: string | null
  technician3_id?: string | null
}): Promise<{ data: Tray | null; error: any }> {
  try {
    // La split nu verificăm unicitate (number = 24Moein etc. e unic per split)
    const skipUniqueness = data.status === 'Splited' || data.parent_tray_id != null
    if (!skipUniqueness) {
      const { data: existing } = await supabase
        .from('trays')
        .select('*')
        .eq('service_file_id', data.service_file_id)
        .eq('number', data.number)
        .maybeSingle()

      if (existing) {
        return { data: existing as Tray, error: null }
      }
    }

    const { data: result, error } = await supabase
      .from('trays')
      .insert([{
        number: data.number,
        service_file_id: data.service_file_id,
        status: data.status || 'in_receptie',
        ...(data.parent_tray_id != null && { parent_tray_id: data.parent_tray_id }),
        ...(data.technician_id != null && { technician_id: data.technician_id }),
        ...(data.technician2_id != null && { technician2_id: data.technician2_id }),
        ...(data.technician3_id != null && { technician3_id: data.technician3_id }),
      }])
      .select()
      .single()

    if (error) throw error
    return { data: result as Tray, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Verifică disponibilitatea unei tăvițe la nivel global.
 * Compară numărul introdus de utilizator cu toate tăvițele înregistrate în baza de date.
 * Dacă o tăviță cu același număr există deja, funcția returnează o eroare.
 * 
 * @param trayNumber - Numărul tăviței (ex: "Tăbliță 1")
 * @returns Obiect cu available: true dacă tăvița poate fi creată, false dacă există deja,
 *          și existingTray cu datele tăviței existente (dacă aceasta există)
 */
export async function checkTrayAvailability(
  trayNumber: string
): Promise<{ available: boolean; existingTray?: Tray; error: any }> {
  try {
    // Caută orice tăviță cu același număr.
    // La arhivare, tăvițele sunt redenumite (41 → 41-copy1), deci numărul original devine disponibil.
    const { data, error } = await supabase
      .from('trays')
      .select('*')
      .eq('number', trayNumber.trim())
      .maybeSingle()
    
    if (error) {
      console.error('[checkTrayAvailability] Error checking tray availability:', error)
      throw error
    }
    
    // Dacă nu găsim vreo tăviță cu acest număr, e disponibilă
    if (!data) {
      return { available: true, error: null }
    }
    
    // Dacă găsim o tăviță existentă, nu e disponibilă
    return { 
      available: false, 
      existingTray: data as Tray,
      error: null 
    }
  } catch (error) {
    return { available: false, error }
  }
}

/**
 * Obține o tăviță după ID-ul său.
 * Returnează toate detaliile unei tăvițe, inclusiv număr, status și flag-ul urgent.
 * 
 * @param trayId - ID-ul unic al tăviței
 * @returns Obiect cu data tăviței sau null dacă nu există, și eroarea dacă există
 */
export async function getTray(trayId: string): Promise<{ data: Tray | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('trays')
      .select('*')
      .eq('id', trayId)
      .single()

    if (error) throw error
    return { data: data as Tray, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Listează toate tăvițele asociate cu o fișă de serviciu specificată.
 * Tăvițele sunt returnate în ordine crescătoare după data creării (cele mai vechi primele).
 * Această funcție este folosită pentru a afișa toate tăvițele unei fișe în panoul de detalii.
 * 
 * @param serviceFileId - ID-ul fișei de serviciu pentru care se caută tăvițele
 * @returns Array cu toate tăvițele fișei sau array gol dacă nu există
 */
export async function listTraysForServiceFile(serviceFileId: string): Promise<{ data: Tray[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('trays')
      .select('*')
      .eq('service_file_id', serviceFileId)
      // Exclude split parent trays (status '2' și '3' sunt tăvițe parinte split-ate)
      // Afișează doar tăvițele reale sau split children
      .not('status', 'in', '("2","3")')
      .order('created_at', { ascending: true })

    if (error) throw error
    return { data: (data ?? []) as Tray[], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Încarcă toate tăvițele pentru mai multe fișe de serviciu într-un singur request (batch).
 * Util pentru panoul de detalii lead / Receptie – evită N+1.
 */
export async function listTraysForServiceFiles(serviceFileIds: string[]): Promise<{ data: Tray[]; error: any }> {
  if (serviceFileIds.length === 0) return { data: [], error: null }
  try {
    const { data, error } = await supabase
      .from('trays')
      .select('*')
      .in('service_file_id', serviceFileIds)
      // Exclude split parent trays (status '2' și '3' sunt tăvițe parinte split-ate)
      // Afișează doar tăvițele reale sau split children
      .not('status', 'in', '("2","3")')
      .order('created_at', { ascending: true })
    if (error) throw error
    return { data: (data ?? []) as Tray[], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Verifică dacă fișa de serviciu conține cel puțin un instrument (tray_item cu instrument_id).
 * Folosit pentru setarea statusului 'comanda' când fișa are conținut.
 */
export async function serviceFileHasAnyInstrument(serviceFileId: string): Promise<boolean> {
  const { data: trays, error: traysErr } = await listTraysForServiceFile(serviceFileId)
  if (traysErr || !trays?.length) return false
  for (const t of trays) {
    const { data: items, error: itemsErr } = await listTrayItemsForTray(t.id)
    if (itemsErr) continue
    if (items?.some((i: any) => i.instrument_id)) return true
  }
  return false
}

/**
 * Actualizează statusul fișei în funcție de conținut: 'comanda' dacă are ≥1 instrument, altfel 'noua'.
 * Apelat după salvare (persist) pentru a menține statusul corect.
 */
export async function updateServiceFileStatusByContent(serviceFileId: string): Promise<{ error: any }> {
  try {
    const has = await serviceFileHasAnyInstrument(serviceFileId)
    const { error } = await updateServiceFile(serviceFileId, { status: has ? 'comanda' : 'noua' })
    return { error }
  } catch (e: any) {
    return { error: e }
  }
}

/**
 * Actualizează o tăviță existentă.
 * Permite modificarea oricărui câmp al tăviței: număr, status, tehnicieni, etc.
 * Dacă nu sunt furnizate actualizări, funcția returnează tăvița existentă fără modificări.
 * 
 * @param trayId - ID-ul tăviței de actualizat
 * @param updates - Obiect parțial cu câmpurile de actualizat:
 *   - number: Numărul tăviței
 *   - status: Statusul tăviței ('in_receptie', 'in_lucru', 'gata')
 * @returns Obiect cu data tăviței actualizate sau existente, sau null și eroarea dacă există
 */
export async function updateTray(
  trayId: string,
  updates: Partial<Pick<Tray, 'number' | 'status' | 'technician_id' | 'technician2_id' | 'technician3_id' | 'parent_tray_id' | 'qc_notes' | 'assigned_image_id'>>
): Promise<{ data: Tray | null; error: any }> {
  try {
    // Verifică dacă există actualizări
    if (!updates || Object.keys(updates).length === 0) {
      // Dacă nu există actualizări, doar returnează tray-ul existent
      return await getTray(trayId)
    }
    
    const { data, error } = await supabase
      .from('trays')
      .update(updates)
      .eq('id', trayId)
      .select()
      .single()

    if (error) throw error
    return { data: data as Tray, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Șterge o tăviță din baza de date (pipeline_items, tray_item_brands, tray_items, tray_images, trays).
 * ATENȚIE: Operația este ireversibilă.
 */
export async function deleteTray(trayId: string): Promise<{ success: boolean; error: any }> {
  try {
    // IMPORTANT: Ștergem DOAR tăvița și datele ei asociate.
    // NU ștergem fișa de serviciu sau lead-ul.

    // 1. Șterge pipeline_items pentru tăviță (pozița în kanban)
    await supabase.from('pipeline_items').delete().eq('type', 'tray').eq('item_id', trayId)

    // 2. Șterge work_sessions asociate (au FK ON DELETE CASCADE, dar le ștergem explicit pentru siguranță)
    await supabase.from('work_sessions').delete().eq('tray_id', trayId)

    // 3. Șterge stage_history pentru tăviță
    await supabase.from('stage_history').delete().eq('tray_id', trayId)

    // 4. Șterge tray_item_brands (seriale) ale tăviței
    const { data: trayItems } = await supabase.from('tray_items').select('id').eq('tray_id', trayId)
    if (trayItems?.length) {
      const ids = trayItems.map((ti: any) => ti.id)
      await supabase.from('tray_item_brands').delete().in('tray_item_id', ids)
      // Șterge și tray_item_brand_serials dacă există
      try {
        await supabase.from('tray_item_brand_serials').delete().in('tray_item_id', ids)
      } catch { /* ignore if table doesn't exist */ }
    }

    // 5. Șterge tray_items (servicii, piese, instrumente din tăviță)
    await supabase.from('tray_items').delete().eq('tray_id', trayId)

    // 6. Șterge imaginile tăviței
    await supabase.from('tray_images').delete().eq('tray_id', trayId)

    // 7. Șterge arhiva_tavite_unite dacă există
    try {
      await supabase.from('arhiva_tavite_unite').delete().eq('parent_tray_id', trayId)
    } catch { /* ignore if not applicable */ }

    // 8. În final, șterge tăvița
    const { error } = await supabase.from('trays').delete().eq('id', trayId)
    if (error) throw error

    return { success: true, error: null }
  } catch (error) {
    console.error('[deleteTray] Error:', error)
    return { success: false, error }
  }
}

/**
 * La Facturare: șterge din pipeline_items înregistrările pentru tăvițele fișei
 * (tăvițele își pierd poziția în stage). Tăvițele în sine rămân.
 *
 * @param serviceFileId - ID-ul fișei de serviciu facturate
 * @returns { success, deletedCount, error }
 */
export async function clearTrayPositionsOnFacturare(serviceFileId: string): Promise<{
  success: boolean
  deletedCount: number
  error: any
}> {
  try {
    const { data: trays, error: traysErr } = await supabase
      .from('trays')
      .select('id')
      .eq('service_file_id', serviceFileId)

    if (traysErr) throw traysErr
    if (!trays?.length) {
      return { success: true, deletedCount: 0, error: null }
    }

    const trayIds = trays.map((t: { id: string }) => t.id)

    const { error: delErr } = await supabase
      .from('pipeline_items')
      .delete()
      .eq('type', 'tray')
      .in('item_id', trayIds)

    if (delErr) {
      console.error('[clearTrayPositionsOnFacturare] Eroare la ștergerea pipeline_items:', delErr)
      throw delErr
    }

    return { success: true, deletedCount: trayIds.length, error: null }
  } catch (e: any) {
    console.error('[clearTrayPositionsOnFacturare]', e)
    return { success: false, deletedCount: 0, error: e }
  }
}

/**
 * Arhivează în DB toată informația fișei de serviciu (fișa, tray_items cu Info text, istoric)
 * când fișa ajunge în stage-ul Arhivat. Trebuie apelată ÎNAINTE de releaseTraysOnArchive.
 *
 * @param serviceFileId - ID-ul fișei de serviciu
 * @returns success, arhivaFisaId (id în arhiva_fise_serviciu), error
 */
export async function archiveServiceFileToDb(
  serviceFileId: string,
  supabaseClient?: SupabaseClient
): Promise<{ success: boolean; arhivaFisaId?: string; error?: any }> {
  const db = supabaseClient ?? supabase
  try {
    const { data: sf, error: sfErr } = await db
      .from('service_files')
      .select('*')
      .eq('id', serviceFileId)
      .single()

    if (sfErr || !sf) {
      console.error('[archiveServiceFileToDb] Fișă negăsită:', serviceFileId, sfErr)
      return { success: false, error: sfErr || new Error('Fișă negăsită') }
    }

    const { data: trays, error: traysErr } = await db
      .from('trays')
      .select('id, number')
      .eq('service_file_id', serviceFileId)

    if (traysErr) {
      console.error('[archiveServiceFileToDb] Eroare tăvițe:', traysErr)
      return { success: false, error: traysErr }
    }

    const trayIds = (trays || []).map((t: any) => t.id)
    let stageHistory: any[] = []
    let itemsEvents: any[] = []

    if (trayIds.length > 0) {
      const { data: sh } = await (db as any)
        .from('stage_history')
        .select('id, tray_id, pipeline_id, from_stage_id, to_stage_id, moved_by, moved_at, notes')
        .not('tray_id', 'is', null)
        .in('tray_id', trayIds)
        .order('moved_at', { ascending: true })
      stageHistory = sh || []

      const { data: ieTray } = await (db as any)
        .from('items_events')
        .select('id, type, item_id, event_type, message, payload, actor_id, actor_name, created_at')
        .eq('type', 'tray')
        .in('item_id', trayIds)
        .order('created_at', { ascending: true })
      itemsEvents = ieTray || []
    }

    const { data: ieSf } = await (db as any)
      .from('items_events')
      .select('id, type, item_id, event_type, message, payload, actor_id, actor_name, created_at')
      .eq('type', 'service_file')
      .eq('item_id', serviceFileId)
      .order('created_at', { ascending: true })
    itemsEvents = [...itemsEvents, ...(ieSf || [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // Conversația lead-ului (mesaje) – snapshot la momentul arhivării
    let conversatie: any[] = []
    const { data: conv } = await (db as any)
      .from('conversations')
      .select('id')
      .eq('related_id', sf.lead_id)
      .eq('type', 'lead')
      .maybeSingle()
    if (conv?.id) {
      const { data: msgs } = await (db as any)
        .from('messages')
        .select('id, sender_id, content, message_type, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true })
      conversatie = msgs || []
    }

    const allTrayItems: any[] = []
    if (trayIds.length > 0) {
      const { data: items, error: itemsErr } = await (db as any)
        .from('tray_items')
        .select(`
          id, tray_id, department_id, instrument_id, service_id, part_id, qty, notes, pipeline,
          tray_item_brands(id, brand, garantie, tray_item_brand_serials(id, serial_number))
        `)
        .in('tray_id', trayIds)

      if (!itemsErr && items?.length) allTrayItems.push(...items)
    }

    // Snapshot tăvițe: number și itemi cu datele introduse (brand/serial/garanție în info)
    const traysSnapshot = (trays || []).map((t: any) => {
      const itemsInTray = allTrayItems
        .filter((ti: any) => ti.tray_id === t.id)
        .map((ti: any) => {
          const brands = ti.tray_item_brands as any[] | undefined
          let info = ''
          if (brands?.length) {
            const parts = brands.map((b: any) => {
              const serials = (b.tray_item_brand_serials || []).map((s: any) => s.serial_number).filter(Boolean)
              const ser = serials.length ? ` Serial: ${serials.join(', ')}` : ''
              const gar = b.garantie ? ' Garanție: Da' : ' Garanție: Nu'
              return `Brand: ${b.brand || ''}${ser}${gar}`
            })
            info = parts.join(' | ')
          }
          return {
            department_id: ti.department_id ?? null,
            instrument_id: ti.instrument_id ?? null,
            service_id: ti.service_id ?? null,
            part_id: ti.part_id ?? null,
            qty: ti.qty ?? 1,
            notes: ti.notes ?? null,
            pipeline: ti.pipeline ?? null,
            info: info || null,
          }
        })
      return { id: t.id, number: t.number, items: itemsInTray }
    })

    const istoric = {
      stage_history: stageHistory,
      items_events: itemsEvents,
      trays: traysSnapshot,
      conversatie,
    }

    const row: Record<string, any> = {
      lead_id: sf.lead_id,
      number: sf.number ?? '',
      date: sf.date ?? null,
      status: sf.status ?? 'noua',
      notes: sf.notes ?? null,
      details: sf.details ?? null,
      technician_details: sf.technician_details ?? [],
      office_direct: sf.office_direct ?? false,
      office_direct_at: sf.office_direct_at ?? null,
      curier_trimis: sf.curier_trimis ?? false,
      curier_scheduled_at: sf.curier_scheduled_at ?? null,
      nu_raspunde_callback_at: sf.nu_raspunde_callback_at ?? null,
      no_deal: sf.no_deal ?? false,
      urgent: sf.urgent ?? false,
      cash: sf.cash ?? false,
      card: sf.card ?? false,
      global_discount_pct: sf.global_discount_pct ?? 0,
      is_locked: sf.is_locked ?? false,
      istoric,
    }

    const { data: insertedFisa, error: insertFisaErr } = await (db as any)
      .from('arhiva_fise_serviciu')
      .insert(row)
      .select('id')
      .single()

    if (insertFisaErr || !insertedFisa?.id) {
      console.error('[archiveServiceFileToDb] Eroare insert arhiva_fise_serviciu:', insertFisaErr)
      return { success: false, error: insertFisaErr }
    }

    const arhivaFisaId = insertedFisa.id

    for (const ti of allTrayItems) {
      const brands = ti.tray_item_brands as any[] | undefined
      let info = ''
      if (brands?.length) {
        const parts = brands.map((b: any) => {
          const serials = (b.tray_item_brand_serials || []).map((s: any) => s.serial_number).filter(Boolean)
          const ser = serials.length ? ` Serial: ${serials.join(', ')}` : ''
          const gar = b.garantie ? ' Garanție: Da' : ' Garanție: Nu'
          return `Brand: ${b.brand || ''}${ser}${gar}`
        })
        info = parts.join(' | ')
      }

      const { error: insertItemErr } = await (db as any)
        .from('arhiva_tray_items')
        .insert({
          arhiva_fisa_id: arhivaFisaId,
          department_id: ti.department_id ?? null,
          instrument_id: ti.instrument_id ?? null,
          service_id: ti.service_id ?? null,
          part_id: ti.part_id ?? null,
          technician_id: null,
          qty: ti.qty ?? 1,
          notes: ti.notes ?? null,
          pipeline: ti.pipeline ?? null,
          info: info || null,
        })

      if (insertItemErr) {
        console.error('[archiveServiceFileToDb] Eroare insert arhiva_tray_items:', insertItemErr)
      }
    }

    console.log('[archiveServiceFileToDb] ✅ Arhivată fișa', serviceFileId, '→ arhiva_fise_serviciu', arhivaFisaId)
    return { success: true, arhivaFisaId }
  } catch (err: any) {
    console.error('[archiveServiceFileToDb] ❌ Eroare:', err)
    return { success: false, error: err }
  }
}

/**
 * Găsește un număr de tăviță disponibil în format "original-copyN".
 * Ex: A12 → A12-copy1, dacă A12-copy1 există → A12-copy2, etc.
 */
async function findAvailableCopyNumber(
  db: SupabaseClient,
  originalNumber: string
): Promise<string> {
  let copyIndex = 1
  let newNumber = `${originalNumber}-copy${copyIndex}`
  
  // Verifică dacă există deja tăvițe cu acest număr
  while (true) {
    const { data: existing } = await db
      .from('trays')
      .select('id')
      .eq('number', newNumber)
      .limit(1)
    
    if (!existing || existing.length === 0) {
      return newNumber
    }
    
    copyIndex++
    newNumber = `${originalNumber}-copy${copyIndex}`
    
    // Safety: max 100 copii pentru a evita loop infinit
    if (copyIndex > 100) {
      return `${originalNumber}-copy${Date.now()}`
    }
  }
}

/**
 * Eliberează tăvițele asociate cu o fișă de serviciu când aceasta este arhivată.
 * NU șterge tăvițele, ci:
 * 1. Redenumește tăvița (A12 → A12-copy1, A12-copy2, etc.)
 * 2. Desasociază tăvița de fișă (service_file_id = null)
 * 3. Scoate tăvița din pipeline_items (nu mai apare pe board)
 * 4. Păstrează toate datele (instrumente, servicii, brand-uri, imagini) în tăvița redenumită
 * 
 * Astfel, numărul original (A12) devine disponibil pentru reutilizare.
 * 
 * @param serviceFileId - ID-ul fișei de serviciu pentru care se eliberează tăvițele
 * @returns Obiect cu success: true dacă eliberarea a reușit, 
 *          deletedCount: numărul de tăvițe eliberate,
 *          și eroarea dacă există
 */
export async function releaseTraysOnArchive(
  serviceFileId: string,
  supabaseClient?: SupabaseClient
): Promise<{ success: boolean; deletedCount: number; error: any }> {
  const db = supabaseClient ?? supabase
  try {
    const { data: trays, error: fetchError } = await db
      .from('trays')
      .select('id, number')
      .eq('service_file_id', serviceFileId)

    if (fetchError) throw fetchError

    if (!trays || trays.length === 0) {
      console.log('[releaseTraysOnArchive] Nu există tăvițe pentru fișa:', serviceFileId)
      return { success: true, deletedCount: 0, error: null }
    }

    const trayIds = trays.map(t => t.id)
    console.log('[releaseTraysOnArchive] Se eliberează', trayIds.length, 'tăvițe pentru fișa:', serviceFileId)
    console.log('[releaseTraysOnArchive] Tăvițe de eliberat:', trays.map(t => t.number).join(', '))

    // Scoate tăvițele din pipeline_items (nu mai apar pe board)
    const { error: pipelineError } = await db
      .from('pipeline_items')
      .delete()
      .eq('type', 'tray')
      .in('item_id', trayIds)

    if (pipelineError) {
      console.error('[releaseTraysOnArchive] Eroare la ștergerea pipeline_items:', pipelineError)
      // Continuăm chiar dacă ștergerea pipeline_items eșuează
    }

    // Pentru fiecare tăviță: redenumește (păstrează service_file_id - tăvița rămâne asociată cu fișa arhivată)
    for (const tray of trays) {
      const newNumber = await findAvailableCopyNumber(db, tray.number)
      
      const { error: updateError } = await db
        .from('trays')
        .update({
          number: newNumber,
          // service_file_id rămâne neschimbat - tăvița rămâne asociată cu fișa arhivată
        })
        .eq('id', tray.id)
      
      if (updateError) {
        console.error(`[releaseTraysOnArchive] Eroare la redenumire tăviță ${tray.number} → ${newNumber}:`, updateError)
      } else {
        console.log(`[releaseTraysOnArchive] Tăviță redenumită: ${tray.number} → ${newNumber}`)
      }
    }

    console.log('[releaseTraysOnArchive] ✅ Au fost eliberate', trays.length, 'tăvițe pentru fișa:', serviceFileId)
    return { success: true, deletedCount: trays.length, error: null }
  } catch (error) {
    console.error('[releaseTraysOnArchive] ❌ Eroare:', error)
    return { success: false, deletedCount: 0, error }
  }
}

// ==================== TRAY ITEMS ====================

/**
 * Creează un nou item într-o tăviță (tray item).
 * Un tray item reprezintă un serviciu, piese sau instrument care trebuie procesat în cadrul unei tăvițe.
 * Funcția suportă noua structură cu brand-uri și serial numbers, salvând datele în tabelele
 * tray_item_brands și tray_item_brand_serials. Dacă aceste tabele nu există, funcția va funcționa
 * doar cu câmpurile de bază.
 * 
 * @param data - Datele item-ului:
 *   - tray_id: ID-ul tăviței căreia îi aparține item-ul
 *   - department_id: ID-ul departamentului (opțional)
 *   - instrument_id: ID-ul instrumentului (opțional)
 *   - service_id: ID-ul serviciului (opțional)
 *   - part_id: ID-ul piesei (opțional)
 *   - qty: Cantitatea item-ului
 *   - notes: Note JSON cu detalii (preț, discount, urgent, item_type, brand, serial_number)
 *   - pipeline: Pipeline-ul asociat (opțional)
 *   - brandSerialGroups: Array cu grupuri de brand-uri și serial numbers (noua structură)
 * @returns Obiect cu data item-ului creat sau null și eroarea dacă există
 */
export async function createTrayItem(data: {
  tray_id: string
  department_id?: string | null
  instrument_id?: string | null
  service_id?: string | null
  part_id?: string | null
  qty: number
  /** Cantitate instrumente nereparate (pentru servicii). */
  unrepaired_qty?: number
  notes?: string | null
  pipeline?: string | null
  /** Grupuri brand + serialuri (structura normalizată) */
  brandSerialGroups?: Array<{ brand: string | null; serialNumbers: string[]; garantie?: boolean }>
  /**
   * Sumă text a tuturor serial number-elor pentru acest tray_item.
   * Dacă nu este furnizat, se calculează automat din brandSerialGroups (dacă există).
   * Stocat în coloana `serials` (text) pentru raportare/filtrare rapidă.
   */
  serials?: string | null
}): Promise<{ data: TrayItem | null; error: any }> {
  try {
    // Serial summary pentru coloana tray_items.serials
    let serialsText: string | null = data.serials ?? null
    if (!serialsText && data.brandSerialGroups && data.brandSerialGroups.length > 0) {
      const allSerials: string[] = []
      for (const group of data.brandSerialGroups) {
        const serialNumbers = Array.isArray(group.serialNumbers) ? group.serialNumbers : []
        for (const sn of serialNumbers) {
          const trimmed = typeof sn === 'string' ? sn.trim() : ''
          if (trimmed) allSerials.push(trimmed)
        }
      }
      if (allSerials.length > 0) {
        serialsText = allSerials.join(', ')
      }
    }

    // Creează tray_item-ul (brand/serial_number se salvează în tray_item_brands și tray_item_brand_serials)
    const { data: result, error } = await supabase
      .from('tray_items')
      .insert([{
        tray_id: data.tray_id,
        department_id: data.department_id || null,
        instrument_id: data.instrument_id || null,
        service_id: data.service_id || null,
        part_id: data.part_id || null,
        qty: data.qty,
        notes: data.notes || null,
        pipeline: data.pipeline || null,
        serials: serialsText,
        
      }])
      .select()
      .single()

    if (error) {
      console.error('[createTrayItem] Error creating tray_item:', error?.message || 'Unknown error')
      throw error
    }
    
    if (!result) {
      console.error('[createTrayItem] No result returned from tray_items insert')
      return { data: null, error: new Error('Failed to create tray item') }
    }

    // Salvează brand-urile și serial numbers în noile tabele
    if (data.brandSerialGroups && data.brandSerialGroups.length > 0) {
      // console.log('[createTrayItem] Saving brandSerialGroups:', JSON.stringify(data.brandSerialGroups, null, 2))
      for (const group of data.brandSerialGroups) {
        const brandName = group.brand?.trim()
        if (!brandName) {
          console.warn('[createTrayItem] Skipping group without brand name')
          continue
        }
        
        const garantie = group.garantie || false
        const safeSerialNumbers = Array.isArray(group.serialNumbers) ? group.serialNumbers : []
        // IMPORTANT: Include TOATE serial numbers-urile, inclusiv cele goale (pentru a păstra pozițiile ocupate)
        // Acest lucru asigură că toate serial numbers-urile sunt salvate și afișate în tabel
        const serialNumbers = safeSerialNumbers.map(sn => sn && sn.trim() ? sn.trim() : '')
        
        // console.log(`[createTrayItem] Creating brand "${brandName}" with ${serialNumbers.length} serial numbers:`, serialNumbers)
        
        // Creează brand-ul în tray_item_brands
        const { data: brandResult, error: brandError } = await supabase
          .from('tray_item_brands')
          .insert([{
            tray_item_id: result.id,
            brand: brandName,
            garantie: garantie,
          }])
          .select()
          .single()
        
        if (brandError) {
          console.error('[createTrayItem] Error creating brand:', brandError?.message || 'Unknown error')
          continue
        }
        
        // Creează serial numbers pentru acest brand (inclusiv cele goale)
        if (serialNumbers.length > 0) {
          const serialsToInsert = serialNumbers.map(sn => ({
            brand_id: brandResult.id,
            serial_number: sn || '', // Salvează string gol pentru serial numbers goale (nu null)
          }))
          
          // console.log(`[createTrayItem] Inserting ${serialsToInsert.length} serial numbers for brand "${brandName}"`)
          
          const { error: serialsError } = await supabase
            .from('tray_item_brand_serials')
            .insert(serialsToInsert)
          
          if (serialsError) {
            console.error('[createTrayItem] Error creating serials:', serialsError?.message || 'Unknown error')
          } else {
            // console.log(`[createTrayItem] Successfully created ${serialsToInsert.length} serial numbers for brand "${brandName}"`)
          }
        }
      }
    }

    return { data: result as TrayItem, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Obține un item de tăviță după ID-ul său.
 * Returnează toate detaliile unui item, inclusiv relațiile cu servicii, brand-uri și serial numbers.
 * 
 * @param trayItemId - ID-ul unic al item-ului de tăviță
 * @returns Obiect cu data item-ului sau null dacă nu există, și eroarea dacă există
 */
export async function getTrayItem(trayItemId: string): Promise<{ data: TrayItem | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('tray_items')
      .select('*')
      .eq('id', trayItemId)
      .single()

    if (error) throw error
    return { data: data as TrayItem, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Listează toate item-urile dintr-o tăviță specificată.
 * Funcția încearcă să folosească noua structură cu tray_item_brands și tray_item_brand_serials.
 * Dacă aceste tabele nu există sau apar erori, funcția face fallback la structura veche.
 * Item-urile sunt returnate în ordine crescătoare după ID (ordinea creării).
 * Funcția gestionează și cazurile în care RLS (Row Level Security) blochează join-urile cu services,
 * încărcând serviciile separat dacă este necesar.
 * 
 * @param trayId - ID-ul tăviței pentru care se caută item-urile
 * @returns Array cu toate item-urile tăviței sau array gol dacă nu există
 */
export async function listTrayItemsForTray(trayId: string): Promise<{ data: TrayItem[]; error: any }> {
  try {
    // Încearcă mai întâi noua structură cu tray_item_brands
    let data: any[] | null = null
    let useNewStructure = true
    
    try {
      const result = await supabase
        .from('tray_items')
        .select(`
          id, 
          tray_id, 
          instrument_id, 
          service_id,
          part_id, 
          department_id, 
          qty, 
          unrepaired_qty,
          notes, 
          pipeline, 
          serials,
          created_at,
          service:services(id, name, price),
          tray_item_brands(
            id, 
            brand, 
            garantie, 
            created_at,
            tray_item_brand_serials(id, serial_number, created_at)
          )
        `)
        .eq('tray_id', trayId)
        .order('id', { ascending: true })
      
      if (result.error) {
        // Dacă eroarea e legată de tabel inexistent, folosește structura veche
        console.warn('[listTrayItemsForTray] New structure failed, trying old structure:', result.error.message)
        useNewStructure = false
      } else {
        data = result.data
      }
    } catch (e) {
      console.warn('[listTrayItemsForTray] New structure exception, trying old structure')
      useNewStructure = false
    }
    
    // Fallback la structura veche (fără brand tables)
    if (!useNewStructure || !data) {
      const result = await supabase
        .from('tray_items')
        .select(`
          id, 
          tray_id, 
          instrument_id, 
          service_id,
          part_id, 
          department_id, 
          qty, 
          unrepaired_qty,
          notes, 
          pipeline, 
          serials,
          created_at,
          service:services(id, name, price)
        `)
        .eq('tray_id', trayId)
        .order('id', { ascending: true })
      
      if (result.error) {
        console.error('[listTrayItemsForTray] Error:', result.error?.message || 'Unknown error')
        throw result.error
      }
      
      data = result.data
    }
    
    // Verifică dacă RLS blochează join-ul cu services
    const itemsWithServiceIdButNoJoin = data?.filter((i: any) => i.service_id && !i.service) || []
    if (itemsWithServiceIdButNoJoin.length > 0) {
      console.warn('[listTrayItemsForTray] RLS might be blocking service joins. Loading services separately...')
      const serviceIds = itemsWithServiceIdButNoJoin.map((i: any) => i.service_id).filter(Boolean)
      if (serviceIds.length > 0) {
        const { data: servicesData, error: servicesError } = await supabase
          .from('services')
          .select('id, name, price')
          .in('id', serviceIds)
        
        if (!servicesError && servicesData) {
          const servicesMap = new Map(servicesData.map((s: any) => [s.id, s]))
          data?.forEach((item: any) => {
            if (item.service_id && !item.service && servicesMap.has(item.service_id)) {
              item.service = servicesMap.get(item.service_id)
            }
          })
        }
      }
    }

    // Normalizare: serials, brand, serial_number, garantie din tray_item_brands/tray_item_brand_serials
    // ca pe mobile și alte view-uri să afișeze aceleași date ca pe desktop (PC)
    data?.forEach((item: any) => {
      const brands = Array.isArray(item.tray_item_brands) ? item.tray_item_brands : []
      if (brands.length > 0) {
        const allSerials: string[] = []
        let firstSerial: string | null = null
        let firstBrand: string | null = null
        let firstGarantie = false
        for (const b of brands) {
          const serials = Array.isArray(b?.tray_item_brand_serials) ? b.tray_item_brand_serials : []
          for (const s of serials) {
            const sn = s?.serial_number != null ? String(s.serial_number).trim() : ''
            if (sn) allSerials.push(sn)
            if (firstSerial == null && sn) firstSerial = sn
          }
          if (firstBrand == null && b?.brand) firstBrand = String(b.brand).trim() || null
          if (firstGarantie === false && b?.garantie) firstGarantie = true
        }
        if (allSerials.length > 0) item.serials = allSerials.join(', ')
        if (firstSerial != null) item.serial_number = firstSerial
        if (firstBrand != null) item.brand = firstBrand
        item.garantie = firstGarantie
      }
    })

    return { data: (data ?? []) as TrayItem[], error: null }
  } catch (error: any) {
    console.error('[listTrayItemsForTray] Exception:', error?.message || 'Unknown error')
    return { data: [], error }
  }
}

const TRAY_ITEMS_SELECT = `
  id, 
  tray_id, 
  instrument_id, 
  service_id,
  part_id, 
  department_id, 
  qty, 
  notes, 
  pipeline, 
  serials,
  created_at,
  service:services(id, name, price),
  tray_item_brands(
    id, 
    brand, 
    garantie, 
    created_at,
    tray_item_brand_serials(id, serial_number, created_at)
  )
`
const TRAY_ITEMS_SELECT_LEGACY = `
  id, 
  tray_id, 
  instrument_id, 
  service_id,
  part_id, 
  department_id, 
  qty, 
  notes, 
  pipeline, 
  serials,
  created_at,
  service:services(id, name, price)
`

/**
 * Încarcă toate item-urile pentru mai multe tăvițe într-un singur request (batch).
 * Util pentru panoul de detalii / Receptie – evită N+1 la tray_items.
 */
export async function listTrayItemsForTrays(trayIds: string[]): Promise<{ data: TrayItem[]; error: any }> {
  if (trayIds.length === 0) return { data: [], error: null }
  const out: any[] = []
  const CHUNK = 200
  for (let i = 0; i < trayIds.length; i += CHUNK) {
    const chunk = trayIds.slice(i, i + CHUNK)
    try {
      let result = await supabase
        .from('tray_items')
        .select(TRAY_ITEMS_SELECT)
        .in('tray_id', chunk)
        .order('id', { ascending: true })
      if (result.error) {
        result = await supabase
          .from('tray_items')
          .select(TRAY_ITEMS_SELECT_LEGACY)
          .in('tray_id', chunk)
          .order('id', { ascending: true })
      }
      if (result.error) throw result.error
      if (result.data?.length) out.push(...result.data)
    } catch (e: any) {
      console.warn('[listTrayItemsForTrays] chunk failed:', e?.message)
      return { data: [], error: e }
    }
  }
  return { data: out as TrayItem[], error: null }
}

/**
 * Actualizează un item de tăviță existent.
 * Permite modificarea oricărui câmp al item-ului: departament, instrument, serviciu, piesă,
 * tehnician, cantitate, note sau pipeline. Note-urile pot conține JSON cu detalii suplimentare
 * (preț, discount, urgent, item_type, brand, serial_number).
 * 
 * @param trayItemId - ID-ul item-ului de actualizat
 * @param updates - Obiect parțial cu câmpurile de actualizat:
 *   - department_id: ID-ul departamentului
 *   - instrument_id: ID-ul instrumentului
 *   - service_id: ID-ul serviciului
 *   - part_id: ID-ul piesei
 *   - qty: Cantitatea item-ului
 *   - notes: Note JSON cu detalii
 *   - pipeline: Pipeline-ul asociat
 * @returns Obiect cu data item-ului actualizat sau null și eroarea dacă există
 */
export async function updateTrayItem(
  trayItemId: string,
  updates: Partial<Pick<TrayItem, 'department_id' | 'instrument_id' | 'service_id' | 'part_id' | 'qty' | 'unrepaired_qty' | 'serials' | 'notes' | 'pipeline'>>
): Promise<{ data: TrayItem | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('tray_items')
      .update(updates)
      .eq('id', trayItemId)
      .select()
      .single()

    if (error) throw error
    return { data: data as TrayItem, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Șterge un item de tăviță din baza de date.
 * ATENȚIE: Ștergerea unui item este ireversibilă și va șterge și toate brand-urile și
 * serial numbers asociate (dacă există noua structură).
 * 
 * @param trayItemId - ID-ul item-ului de șters
 * @returns Obiect cu success: true dacă ștergerea a reușit, false altfel, și eroarea dacă există
 */
export async function deleteTrayItem(trayItemId: string): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('tray_items')
      .delete()
      .eq('id', trayItemId)

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}

/**
 * Împarte volumul (qty) dintr-un tray_item către alt tehnician, în aceeași tăviță.
 * Implementarea folosește RPC-ul `rpc_split_tray_items_to_technician` pentru operație atomică.
 *
 * Notă:
 * - Pentru item-uri cu serial numbers (tray_item_brands), RPC-ul blochează split-ul parțial.
 */
export async function splitTrayItemsToTechnician(params: {
  trayId: string
  targetTechnicianId: string
  moves: Array<{ trayItemId: string; qtyMove: number }>
}): Promise<{ data: any | null; error: any }> {
  try {
    const movesJson = (params.moves || []).map(m => ({
      tray_item_id: m.trayItemId,
      qty_move: m.qtyMove,
    }))

    // În DB au existat două variante de nume parametri:
    // - v1: tray_id, target_technician_id, moves_json
    // - v2: p_tray_id, p_target_technician_id, p_moves_json
    // Încercăm ambele pentru compatibilitate.
    const fn = 'rpc_split_tray_items_to_technician'

    const callV1 = async () =>
      (supabase as any).rpc(fn, {
        tray_id: params.trayId,
        target_technician_id: params.targetTechnicianId,
        moves_json: movesJson,
      })

    const callV2 = async () =>
      (supabase as any).rpc(fn, {
        p_tray_id: params.trayId,
        p_target_technician_id: params.targetTechnicianId,
        p_moves_json: movesJson,
      })

    const res1 = await callV1()
    if (!res1?.error) {
      return { data: res1.data, error: null }
    }

    const err1 = res1.error
    const msg1 = typeof err1?.message === 'string' ? err1.message : ''
    const code1 = typeof err1?.code === 'string' ? err1.code : ''

    const looksLikeFnNotFound =
      code1 === 'PGRST202' ||
      msg1.toLowerCase().includes('could not find the function') ||
      msg1.toLowerCase().includes('schema cache')

    if (looksLikeFnNotFound) {
      const res2 = await callV2()
      if (!res2?.error) {
        return { data: res2.data, error: null }
      }
      throw res2.error
    }

    // altă eroare reală din RPC
    throw err1
  } catch (error: any) {
    // Normalizează eroarea pentru cazuri comune (RPC lipsă / schema cache)
    const msg = typeof error?.message === 'string' ? error.message : ''
    const code = typeof error?.code === 'string' ? error.code : ''
    if (
      code === 'PGRST202' ||
      msg.toLowerCase().includes('could not find the function') ||
      msg.toLowerCase().includes('schema cache')
    ) {
      return {
        data: null,
        error: {
          code: code || 'PGRST202',
          message:
            'RPC lipsă în DB sau parametrii nu corespund: `public.rpc_split_tray_items_to_technician`. Rulează SQL-ul din `docs/Implementare Impartire Tavita/sql/rpc_split_tray_items_to_technician.sql` (după un `DROP FUNCTION`) și apoi așteaptă 30-60s pentru refresh la schema cache.',
          raw: error,
        },
      }
    }
    return { data: null, error }
  }
}

/** Un assignment pentru split: tehnicianul și itemurile mutate în tăvița lui. */
export type SplitTrayAssignment = {
  technicianId: string
  displayName: string
  /** Mută întregul item; folosit când nu se folosește items. */
  trayItemIds?: string[]
  /** Cantități parțiale per item; dacă e prezent, RPC folosește acest format. */
  items?: { trayItemId: string; quantity: number }[]
}

/**
 * Împarte o tăviță în 2 sau 3 tăvițe reale (plan: number+username, status Splited, parent_tray_id).
 * Apelează RPC split_tray_to_real_trays: creează trays noi, mută tray_items, actualizează original (status '2'/'3'), pipeline_items.
 *
 * @param originalTrayId - ID tăvița originală
 * @param pipelineId - Pipeline în care se află tăvița (pentru ștergere/inserare pipeline_items)
 * @param assignments - 2 sau 3 elemente: { technicianId, displayName, trayItemIds }
 */
export async function splitTrayToRealTrays(params: {
  originalTrayId: string
  pipelineId: string
  assignments: SplitTrayAssignment[]
}): Promise<{
  data: { original_tray_id: string; new_tray_ids: string[]; status_set: string } | null
  error: any
}> {
  try {
    const assignmentsJson = params.assignments.map((a) => {
      const techId = a.technicianId?.trim()
      const base = {
        technician_id: techId ? techId : null,
        display_name: a.displayName ?? '',
      }
      const trayItemIds = a.trayItemIds ?? []
      if (a.items != null && a.items.length > 0) {
        return {
          ...base,
          items: a.items.map((x) => ({ tray_item_id: x.trayItemId, quantity: x.quantity })),
          tray_item_ids: trayItemIds,
        }
      }
      return { ...base, tray_item_ids: trayItemIds }
    })

    const { data, error } = await supabase.rpc('split_tray_to_real_trays', {
      p_original_tray_id: params.originalTrayId,
      p_pipeline_id: params.pipelineId,
      p_assignments: assignmentsJson,
    })

    if (error) throw error
    return { data: data as { original_tray_id: string; new_tray_ids: string[]; status_set: string }, error: null }
  } catch (error: any) {
    return { data: null, error }
  }
}

/**
 * Reuniune automată: dacă toate tăvițele split (același parent_tray_id) sunt în stage-ul Finalizare,
 * mută items în tăvița originală, completează technician_id/2/3, șterge tăvițele split.
 * Apelat după mutarea unei tăvițe (ex. din moveItemToStage); idempotent dacă nu sunt toate în Finalizare.
 */
export async function mergeSplitTraysIfAllFinalized(
  trayId: string,
  pipelineId: string
): Promise<{ data: { merged: boolean; parent_tray_id?: string }; error: any }> {
  try {
    const { data, error } = await supabase.rpc('merge_split_trays_if_all_finalized', {
      p_tray_id: trayId,
      p_pipeline_id: pipelineId,
    })
    if (error) return { data: null, error }
    const result = data as { merged?: boolean; parent_tray_id?: string } | null
    return {
      data: result ? { merged: !!result.merged, parent_tray_id: result.parent_tray_id } : { merged: false },
      error: null,
    }
  } catch (error: any) {
    return { data: null, error }
  }
}

/**
 * Consolidează rândurile din tray_items pentru un tehnician: grupează după (instrument_id, service_id, part_id),
 * însumează cantitățile și păstrează un singur rând per grup (ex: Cleste x2 + Cleste x3 → Cleste x5).
 * Rândurile care au brand/serial (tray_item_brands) nu sunt incluse în consolidare.
 * Folosește RPC-ul PostgreSQL pentru o singură tranzacție atomică; la eroare face fallback pe logica client.
 *
 * Apelată după reunire (merge) ca să nu rămână înregistrări duplicate (cleste 2, cleste 3) ci una singură (cleste 5).
 */
export async function consolidateTrayItemsForTechnician(
  trayId: string,
  _technicianId?: string
): Promise<{ data: { mergedCount: number }; error: any }> {
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('consolidate_tray_items', {
      p_tray_id: trayId,
    })
    if (!rpcErr) {
      const mergedCount = (rpcData as { mergedCount?: number } | null)?.mergedCount ?? 0
      return { data: { mergedCount }, error: null }
    }
    console.warn('[consolidateTrayItemsForTechnician] RPC failed, fallback client:', rpcErr?.message)
  } catch (_) {
    /* fallback below */
  }

  try {
    const { data: rows, error: fetchErr } = await supabase
      .from('tray_items')
      .select('id, instrument_id, service_id, part_id, qty, tray_item_brands(id)')
      .eq('tray_id', trayId)

    if (fetchErr) return { data: { mergedCount: 0 }, error: fetchErr }
    if (!rows?.length) return { data: { mergedCount: 0 }, error: null }

    const hasBrands = (r: any) =>
      Array.isArray(r?.tray_item_brands) && r.tray_item_brands.length > 0

    const key = (r: any) =>
      [r.instrument_id ?? '', r.service_id ?? '', r.part_id ?? ''].join('|')

    const groups = new Map<string, typeof rows>()
    for (const r of rows) {
      const k = key(r)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }

    let mergedCount = 0
    for (const [, group] of groups) {
      const withoutBrands = group.filter((r: any) => !hasBrands(r))
      if (withoutBrands.length < 2) continue

      const keep = withoutBrands[0]
      const toDelete = withoutBrands.slice(1)
      const totalQty = withoutBrands.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0)

      const { error: updateErr } = await supabase
        .from('tray_items')
        .update({ qty: totalQty })
        .eq('id', keep.id)
      if (updateErr) {
        console.error('[consolidateTrayItemsForTechnician] update qty:', updateErr)
        continue
      }

      // 🔥 OPTIMIZARE: Batch delete folosind .in() în loc de N delete-uri secvențiale
      if (toDelete.length > 0) {
        const idsToDelete = toDelete.map((r: any) => r.id)
        const { error: delErr } = await supabase
          .from('tray_items')
          .delete()
          .in('id', idsToDelete)
        
        if (delErr) {
          console.error('[consolidateTrayItemsForTechnician] batch delete:', delErr)
        } else {
          mergedCount += toDelete.length
        }
      }
    }

    return { data: { mergedCount }, error: null }
  } catch (e: any) {
    console.error('[consolidateTrayItemsForTechnician]', e)
    return { data: { mergedCount: 0 }, error: e }
  }
}
