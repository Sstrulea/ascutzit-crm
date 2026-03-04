/**
 * Căutare tăvițe pe server (API routes). Nu folosește supabaseBrowser – primește
 * clientul Supabase creat pe server (createApiSupabaseClient / createAdminClient).
 * Căutarea ignoră diacritice: "tavita" găsește "tăviță", "38m" etc.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { removeDiacritics, getDiacriticVariants } from '@/lib/utils'

export interface TraySearchResultServer {
  trayId: string
  trayNumber: string
  leadId: string
  leadName: string
  leadPhone?: string
  leadEmail?: string
  serviceFileNumber: string
  serviceFileId: string
  matchType: 'tray_number'
  matchDetails?: string
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
    const termNorm = removeDiacritics(searchTerm).toLowerCase()
    const numberVariants = getDiacriticVariants(termNorm).map((v) => `number.ilike.%${v}%`)
    const numberOr = numberVariants.length > 0 ? numberVariants.join(',') : `number.ilike.%${searchTerm}%`

    const { data: traysByNumber } = await supabase
      .from('trays')
      .select(`
        id,
        number,
        service_file_id,
        service_file:service_files!inner(
          id,
          number,
          lead_id,
          lead:leads!inner(id, full_name, email, phone_number)
        )
      `)
      .or(numberOr)

    const results: TraySearchResultServer[] = []

    ;(traysByNumber as any[])?.forEach((tray: any) => {
      if (tray?.service_file?.lead) {
        results.push({
          trayId: tray.id,
          trayNumber: tray.number,
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

    return { data: results, error: null }
  } catch (error: any) {
    console.error('[searchTraysGloballyWithClient] Error:', error)
    return { data: [], error }
  }
}
