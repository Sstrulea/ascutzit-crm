'use client'

import { supabaseBrowser } from './supabaseClient'

const supabase = supabaseBrowser()

// Tipuri pentru noile tabele
export type ServiceFile = {
  id: string
  lead_id: string
  number: string
  date: string
  status: 'noua' | 'in_lucru' | 'finalizata'
  notes: string | null
  office_direct: boolean // Checkbox pentru "Office direct"
  curier_trimis: boolean // Checkbox pentru "Curier Trimis"
  created_at: string
  updated_at: string
}

export type Tray = {
  id: string
  number: string
  size: string
  service_file_id: string
  status: 'in_receptie' | 'in_lucru' | 'gata'
  created_at: string
}

export type TrayItem = {
  id: string
  tray_id: string
  department_id: string | null
  instrument_id: string | null
  service_id: string | null
  technician_id: string | null
  qty: number
  notes: string | null
  pipeline: string | null
}

// ==================== SERVICE FILES ====================

export async function createServiceFile(data: {
  lead_id: string
  number: string
  date: string
  status?: 'noua' | 'in_lucru' | 'finalizata'
  notes?: string | null
  office_direct?: boolean
  curier_trimis?: boolean
}): Promise<{ data: ServiceFile | null; error: any }> {
  try {
    const { data: result, error } = await supabase
      .from('service_files')
      .insert([{
        lead_id: data.lead_id,
        number: data.number,
        date: data.date,
        status: data.status || 'noua',
        notes: data.notes || null,
        office_direct: data.office_direct || false,
        curier_trimis: data.curier_trimis || false,
      }])
      .select()
      .single()

    if (error) throw error
    return { data: result as ServiceFile, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

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

export async function updateServiceFile(
  serviceFileId: string,
  updates: Partial<Pick<ServiceFile, 'number' | 'date' | 'status' | 'notes' | 'office_direct' | 'curier_trimis'>>
): Promise<{ data: ServiceFile | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('service_files')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', serviceFileId)
      .select()
      .single()

    if (error) throw error
    return { data: data as ServiceFile, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

export async function deleteServiceFile(serviceFileId: string): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('service_files')
      .delete()
      .eq('id', serviceFileId)

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}

// ==================== TRAYS ====================

export async function createTray(data: {
  number: string
  size: string
  service_file_id: string
  status?: 'in_receptie' | 'in_lucru' | 'gata'
}): Promise<{ data: Tray | null; error: any }> {
  try {
    const { data: result, error } = await supabase
      .from('trays')
      .insert([{
        number: data.number,
        size: data.size,
        service_file_id: data.service_file_id,
        status: data.status || 'in_receptie',
      }])
      .select()
      .single()

    if (error) throw error
    return { data: result as Tray, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

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

export async function listTraysForServiceFile(serviceFileId: string): Promise<{ data: Tray[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('trays')
      .select('*')
      .eq('service_file_id', serviceFileId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return { data: (data ?? []) as Tray[], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

export async function updateTray(
  trayId: string,
  updates: Partial<Pick<Tray, 'number' | 'size' | 'status'>>
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

export async function deleteTray(trayId: string): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('trays')
      .delete()
      .eq('id', trayId)

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}

// ==================== TRAY ITEMS ====================

export async function createTrayItem(data: {
  tray_id: string
  department_id?: string | null
  instrument_id?: string | null
  service_id?: string | null
  technician_id?: string | null
  qty: number
  notes?: string | null
  pipeline?: string | null
}): Promise<{ data: TrayItem | null; error: any }> {
  try {
    const { data: result, error } = await supabase
      .from('tray_items')
      .insert([{
        tray_id: data.tray_id,
        department_id: data.department_id || null,
        instrument_id: data.instrument_id || null,
        service_id: data.service_id || null,
        technician_id: data.technician_id || null,
        qty: data.qty,
        notes: data.notes || null,
        pipeline: data.pipeline || null,
      }])
      .select()
      .single()

    if (error) throw error
    return { data: result as TrayItem, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

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

export async function listTrayItemsForTray(trayId: string): Promise<{ data: TrayItem[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('tray_items')
      .select('*')
      .eq('tray_id', trayId)
      .order('id', { ascending: true })

    if (error) throw error
    return { data: (data ?? []) as TrayItem[], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

export async function updateTrayItem(
  trayItemId: string,
  updates: Partial<Pick<TrayItem, 'department_id' | 'instrument_id' | 'service_id' | 'technician_id' | 'qty' | 'notes' | 'pipeline'>>
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

