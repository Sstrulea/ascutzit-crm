import { supabaseBrowser } from './supabaseClient'

export interface TraySearchResult {
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

/**
 * Caută tăvițe global după numărul tăviței.
 * 
 * @param query - Textul de căutat
 * @returns Array cu rezultatele căutării
 */
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
      .ilike('number', `%${searchTerm}%`)

    const results: TraySearchResult[] = []

    ;(traysByNumber ?? []).forEach((tray: any) => {
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
    console.error('[searchTraysGlobally] Error:', error)
    return { data: [], error }
  }
}

