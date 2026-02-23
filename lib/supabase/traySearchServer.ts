/**
 * Căutare tăvițe pe server (API routes). Nu folosește supabaseBrowser – primește
 * clientul Supabase creat pe server (createApiSupabaseClient / createAdminClient).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface TraySearchResultServer {
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

export async function searchTraysGloballyWithClient(
  supabase: SupabaseClient,
  query: string
): Promise<{ data: TraySearchResultServer[]; error: any }> {
  try {
    if (!query || query.trim().length < 2) {
      return { data: [], error: null }
    }

    const searchTerm = query.trim()
    const searchTermLower = searchTerm.toLowerCase()

    // 1a. Caută după număr SAU dimensiune (ex. "21" sau "L")
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
      .or(`number.ilike.%${searchTermLower}%`)

    // 1b. Caută după number+size concatenat (ex. "21l" găsește tăvița 21+L) – RPC
    const { data: traysByNumberSize } = await supabase.rpc('search_trays_by_number_size', {
      p_search_term: searchTerm,
    })

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
      .ilike('brand', `%${searchTermLower}%`)

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
      .ilike('serial_number', `%${searchTermLower}%`)

    const resultsMap = new Map<string, TraySearchResultServer>()

    ;(traysByNumber as any[])?.forEach((tray: any) => {
      if (tray?.service_file?.lead) {
        const key = tray.id
        resultsMap.set(key, {
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
        })
      }
    })

    // Rezultate din RPC (number+size concatenat, ex. "21l" → 21+L)
    const rpcRows = Array.isArray(traysByNumberSize) ? traysByNumberSize : []
    rpcRows.forEach((row: any) => {
      const key = row?.tray_id
      if (!key || resultsMap.has(key)) return
      resultsMap.set(key, {
        trayId: row.tray_id,
        trayNumber: row.tray_number ?? '',
        traySize: row.tray_size ?? '',
        leadId: row.lead_id,
        leadName: row.lead_name ?? 'Unknown',
        leadPhone: row.lead_phone ?? undefined,
        leadEmail: row.lead_email ?? undefined,
        serviceFileNumber: row.service_file_number ?? '',
        serviceFileId: row.service_file_id,
        matchType: 'tray_number',
        matchDetails: `Tăviță: ${row.tray_number ?? ''}${row.tray_size ? ` (${row.tray_size})` : ''}`,
      })
    })

    ;(trayItemBrands as any[])?.forEach((brand: any) => {
      const tray = brand?.tray_item?.[0]?.tray?.[0]
      if (tray?.service_file?.lead) {
        const key = tray.id
        if (!resultsMap.has(key)) {
          resultsMap.set(key, {
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
          })
        } else {
          const existing = resultsMap.get(key)!
          if (!existing.brands) existing.brands = []
          if (!existing.brands.includes(brand.brand)) {
            existing.brands.push(brand.brand)
          }
        }
      }
    })

    ;(serialNumbers as any[])?.forEach((sn: any) => {
      const tray = sn?.brand?.[0]?.tray_item?.[0]?.tray?.[0]
      if (tray?.service_file?.lead) {
        const key = tray.id
        if (!resultsMap.has(key)) {
          resultsMap.set(key, {
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
          })
        } else {
          const existing = resultsMap.get(key)!
          if (!existing.serialNumbers) existing.serialNumbers = []
          if (!existing.serialNumbers.includes(sn.serial_number)) {
            existing.serialNumbers.push(sn.serial_number)
          }
        }
      }
    })

    return { data: Array.from(resultsMap.values()), error: null }
  } catch (error: any) {
    console.error('[searchTraysGloballyWithClient] Error:', error)
    return { data: [], error }
  }
}
