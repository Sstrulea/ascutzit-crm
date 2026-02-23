'use client'

import { supabaseBrowser } from './supabaseClient'

const supabase = supabaseBrowser()

/**
 * ✅ Query-uri Optimizate pentru Supabase
 * 
 * Principii:
 * 1. Select minimal - doar coloanele necesare
 * 2. Paginare pentru liste mari
 * 3. Cache-friendly - query-uri consistente
 * 4. Batch queries - multiple în paralel
 */

// ==========================================
// LEADS - Query-uri Optimizate
// ==========================================

const LEAD_SELECT_MINIMAL = `
  id,
  full_name,
  email,
  phone_number,
  created_at,
  updated_at
`

const LEAD_SELECT_LIST = `
  id,
  full_name,
  email,
  phone_number,
  created_at,
  updated_at,
  lead_tags(tag:tags(id, name, color))
`

const LEAD_SELECT_FULL = `
  *,
  lead_tags(tag:tags(id, name, color))
`

interface PaginationOptions {
  page?: number
  pageSize?: number
}

/**
 * ✅ Leads pentru Kanban - paginat și minimal
 */
export async function getLeadsForKanban(
  pipelineId: string, 
  stageId: string,
  options: PaginationOptions = {}
) {
  const { page = 0, pageSize = 50 } = options
  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from('pipeline_items')
    .select(`
      id,
      item_type,
      item_id,
      stage_id,
      sort_order,
      entered_stage_at,
      lead:leads!pipeline_items_item_id_fkey(${LEAD_SELECT_LIST})
    `, { count: 'exact' })
    .eq('pipeline_id', pipelineId)
    .eq('stage_id', stageId)
    .eq('item_type', 'lead')
    .order('sort_order', { ascending: true })
    .range(from, to)

  if (error) throw error

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
    hasMore: (count || 0) > to + 1,
  }
}

/**
 * ✅ Lead singular - pentru detalii
 */
export async function getLeadById(leadId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select(LEAD_SELECT_FULL)
    .eq('id', leadId)
    .single()

  if (error) throw error
  return data
}

// ==========================================
// TRAYS - Query-uri Optimizate
// ==========================================

const TRAY_SELECT_MINIMAL = `
  id,
  number,
  size,
  status,
  service_file_id,
  created_at
`

const TRAY_SELECT_WITH_ITEMS = `
  id,
  number,
  size,
  status,
  service_file_id,
  created_at,
  service_file:service_files!inner(
    id,
    number,
    lead:leads!inner(id, full_name)
  )
`

/**
 * ✅ Tray cu items - pentru pagina tehnician
 */
export async function getTrayWithItems(trayId: string) {
  // Batch queries în paralel
  const [trayResult, itemsResult, imagesResult] = await Promise.all([
    // 1. Tray cu service_file și lead
    supabase
      .from('trays')
      .select(`
        id, number, status,
        service_file:service_files!inner(
          id, number,
          lead:leads!inner(id, full_name, email, phone_number)
        )
      `)
      .eq('id', trayId)
      .single(),

    // 2. Tray items cu servicii și departamente
    supabase
      .from('tray_items')
      .select(`
        id, tray_id, instrument_id, service_id, technician_id, 
        qty, notes, created_at,
        service:services(id, name, price),
        department:departments(id, name),
        tray_item_brands(id, brand, garantie, tray_item_brand_serials(id, serial_number))
      `)
      .eq('tray_id', trayId)
      .order('created_at'),

    // 3. Imagini
    supabase
      .from('tray_images')
      .select('id, url, filename, file_path, created_at')
      .eq('tray_id', trayId)
      .order('created_at', { ascending: false }),
  ])

  if (trayResult.error) throw trayResult.error
  if (itemsResult.error) throw itemsResult.error

  return {
    tray: trayResult.data,
    items: itemsResult.data || [],
    images: imagesResult.data || [],
  }
}

// ==========================================
// STATS - Query-uri Agregate
// ==========================================

/**
 * ✅ Dashboard stats - o singură query agregată
 */
export async function getDashboardStats() {
  const { data, error } = await supabase.rpc('get_dashboard_stats')
  
  if (error) {
    // Fallback la query-uri individuale
    const [leads, trays, serviceFiles] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      supabase.from('trays').select('id', { count: 'exact', head: true }),
      supabase.from('service_files').select('id', { count: 'exact', head: true }),
    ])
    
    return {
      totalLeads: leads.count || 0,
      totalTrays: trays.count || 0,
      totalServiceFiles: serviceFiles.count || 0,
    }
  }
  
  return data
}

// ==========================================
// BATCH LOADER - Pentru încărcare inițială
// ==========================================

/**
 * ✅ Încarcă toate datele statice într-un batch
 * Folosit la mount pentru a popula cache-ul
 */
export async function loadStaticData() {
  const [pipelines, stages, departments, instruments, services, technicians] = await Promise.all([
    supabase
      .from('pipelines')
      .select('id, name, color, sort_order')
      .order('sort_order'),
    
    supabase
      .from('stages')
      .select('id, name, pipeline_id, sort_order, color')
      .order('sort_order'),
    
    supabase
      .from('departments')
      .select('id, name')
      .order('name'),
    
    supabase
      .from('instruments')
      .select('id, name, department_id, pipeline, weight, active')
      .eq('active', true)
      .order('name'),
    
    supabase
      .from('services')
      .select('id, name, price, instrument_id, department_id, active')
      .eq('active', true)
      .order('name'),
    
    supabase
      .from('app_members')
      .select('user_id, name')
      .order('name'),
  ])

  return {
    pipelines: pipelines.data || [],
    stages: stages.data || [],
    departments: departments.data || [],
    instruments: instruments.data || [],
    services: services.data || [],
    technicians: technicians.data || [],
  }
}

