import { supabaseBrowser } from './supabaseClient'

export interface TraySearchResult {
  trayId: string
  trayNumber: string
  traySize: string
  leadId: string
  leadName: string
  leadPhone?: string
  leadEmail?: string
  serviceFileNumber: string
  serviceFileId: string
  matchType: 'tray_number' | 'serial_number' | 'brand'
  matchDetails?: string
  serialNumbers?: string[]
  brands?: string[]
}

/**
 * Caută tăvițe global după:
 * - Numărul tăviței
 * - Serial numbers
 * - Brand-uri
 * 
 * @param query - Textul de căutat
 * @returns Array cu rezultatele căutării
 */
function toArray(v: unknown): any[] {
  return Array.isArray(v) ? v : []
}

export async function searchTraysGlobally(query: string): Promise<{ data: TraySearchResult[]; error: any }> {
  try {
    if (!query || query.trim().length < 2) {
      return { data: [], error: null }
    }

    const supabase = supabaseBrowser()
    if (!supabase || typeof supabase.from !== 'function') {
      return { data: [], error: null }
    }
    const searchTerm = query.toLowerCase().trim()

    // 1. Caută după numărul tăviței
    const { data: traysByNumber } = await supabase
      .from('trays')
      .select(`
        id,
        number,
        size,
        service_file_id,
        service_file:service_files!inner(
          id,
          number,
          lead_id,
          lead:leads!inner(id, full_name, email, phone_number)
        )
      `)
      .ilike('number', `%${searchTerm}%`)

    // 2. Caută după serial numbers și brand-uri
    const { data: trayItemBrands } = await supabase
      .from('tray_item_brands')
      .select(`
        id,
        brand,
        tray_item:tray_items!inner(
          id,
          tray_id,
          tray:trays!inner(
            id,
            number,
            size,
            service_file_id,
            service_file:service_files!inner(
              id,
              number,
              lead_id,
              lead:leads!inner(id, full_name, email, phone_number)
            )
          )
        ),
        tray_item_brand_serials(serial_number)
      `)
      .ilike('brand', `%${searchTerm}%`)

    // 3. Caută după serial numbers
    const { data: serialNumbers } = await supabase
      .from('tray_item_brand_serials')
      .select(`
        serial_number,
        brand:tray_item_brands!inner(
          brand,
          tray_item:tray_items!inner(
            id,
            tray_id,
            tray:trays!inner(
              id,
              number,
              size,
              service_file_id,
              service_file:service_files!inner(
                id,
                number,
                lead_id,
                lead:leads!inner(id, full_name, email, phone_number)
              )
            )
          )
        )
      `)
      .ilike('serial_number', `%${searchTerm}%`)

    // Consolidează rezultatele (obiect în loc de Map ca să evite probleme cu bundler-ul)
    const resultsMap: { [key: string]: TraySearchResult } = {}

    // Adaugă rezultate din căutarea după numărul tăviței
    toArray(traysByNumber).forEach((tray: any) => {
      if (tray?.service_file?.lead) {
        const key = tray.id
        resultsMap[key] = {
          trayId: tray.id,
          trayNumber: tray.number,
          traySize: tray.size,
          leadId: tray.service_file.lead.id,
          leadName: tray.service_file.lead.full_name || 'Unknown',
          leadPhone: tray.service_file.lead.phone_number,
          leadEmail: tray.service_file.lead.email,
          serviceFileNumber: tray.service_file.number,
          serviceFileId: tray.service_file.id,
          matchType: 'tray_number',
          matchDetails: `Tăviță: ${tray.number}`,
        }
      }
    })

    // Adaugă rezultate din căutarea după brand
    toArray(trayItemBrands).forEach((brand: any) => {
      const tray = brand?.tray_item?.[0]?.tray?.[0]
      if (tray?.service_file?.lead) {
        const key = tray.id
        if (!(key in resultsMap)) {
          resultsMap[key] = {
            trayId: tray.id,
            trayNumber: tray.number,
            traySize: tray.size,
            leadId: tray.service_file.lead.id,
            leadName: tray.service_file.lead.full_name || 'Unknown',
            leadPhone: tray.service_file.lead.phone_number,
            leadEmail: tray.service_file.lead.email,
            serviceFileNumber: tray.service_file.number,
            serviceFileId: tray.service_file.id,
            matchType: 'brand',
            matchDetails: `Brand: ${brand.brand}`,
            brands: [brand.brand],
          }
        } else {
          const existing = resultsMap[key]
          if (!existing.brands) existing.brands = []
          if (!existing.brands.includes(brand.brand)) {
            existing.brands.push(brand.brand)
          }
        }
      }
    })

    // Adaugă rezultate din căutarea după serial number
    toArray(serialNumbers).forEach((sn: any) => {
      const tray = sn?.brand?.[0]?.tray_item?.[0]?.tray?.[0]
      if (tray?.service_file?.lead) {
        const key = tray.id
        if (!(key in resultsMap)) {
          resultsMap[key] = {
            trayId: tray.id,
            trayNumber: tray.number,
            traySize: tray.size,
            leadId: tray.service_file.lead.id,
            leadName: tray.service_file.lead.full_name || 'Unknown',
            leadPhone: tray.service_file.lead.phone_number,
            leadEmail: tray.service_file.lead.email,
            serviceFileNumber: tray.service_file.number,
            serviceFileId: tray.service_file.id,
            matchType: 'serial_number',
            matchDetails: `Serial: ${sn.serial_number}`,
            serialNumbers: [sn.serial_number],
          }
        } else {
          const existing = resultsMap[key]
          if (!existing.serialNumbers) existing.serialNumbers = []
          if (!existing.serialNumbers.includes(sn.serial_number)) {
            existing.serialNumbers.push(sn.serial_number)
          }
        }
      }
    })

    return { data: Object.values(resultsMap), error: null }
  } catch (error: any) {
    console.error('[searchTraysGlobally] Error:', error)
    return { data: [], error }
  }
}

