/**
 * Căutare tăvițe pe server (API routes). Nu folosește supabaseBrowser – primește
 * clientul Supabase creat pe server (createApiSupabaseClient / createAdminClient).
 * Căutarea ignoră diacritice: "tavita" găsește "tăviță", "38m" etc.
 * Suportă căutare după:
 * - Număr tăviță (trays.number)
 * - Serial number în tray_items.serials
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
  matchType: 'tray_number' | 'serial_number'
  matchDetails?: string
}

const LIMIT_TRAYS = 15

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
    const results: TraySearchResultServer[] = []
    const seenTrayIds = new Set<string>()

    // Helper pentru a adăuga rezultate fără duplicate
    const addResult = (result: TraySearchResultServer) => {
      if (seenTrayIds.has(result.trayId)) return
      seenTrayIds.add(result.trayId)
      results.push(result)
    }

    // ═══════════════════════════════════════════════════════════════════
    // 1. Căutare după NUMĂR TĂVIȚĂ (trays.number) - exact match
    // ═══════════════════════════════════════════════════════════════════
    const numberVariants = getDiacriticVariants(termNorm).map((v) => `number.eq.${v}`)
    const numberOr = numberVariants.length > 0 ? numberVariants.join(',') : `number.eq.${searchTerm}`

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
      .limit(LIMIT_TRAYS)

    ;(traysByNumber as any[])?.forEach((tray: any) => {
      if (tray?.service_file?.lead) {
        addResult({
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

    // ═══════════════════════════════════════════════════════════════════
    // 2. Căutare după SERIAL NUMBER (tray_items.serials) - exact match
    // ═══════════════════════════════════════════════════════════════════
    const serialVariants = getDiacriticVariants(termNorm).map((v) => `serials.eq.${v}`)
    const serialOr = serialVariants.length > 0 ? serialVariants.join(',') : `serials.eq.${searchTerm}`

    const { data: trayItemsBySerial } = await supabase
      .from('tray_items')
      .select(`
        id,
        serials,
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
      `)
      .not('serials', 'is', null)
      .not('serials', 'eq', '')
      .or(serialOr)
      .limit(LIMIT_TRAYS)

    ;(trayItemsBySerial as any[])?.forEach((item: any) => {
      const tray = item?.tray
      if (tray?.service_file?.lead) {
        addResult({
          trayId: tray.id,
          trayNumber: tray.number,
          leadId: tray.service_file.lead.id,
          leadName: tray.service_file.lead.full_name || 'Unknown',
          leadPhone: tray.service_file.lead.phone_number,
          leadEmail: tray.service_file.lead.email,
          serviceFileNumber: tray.service_file.number,
          serviceFileId: tray.service_file.id,
          matchType: 'serial_number',
          matchDetails: `Serial: ${item.serials}`,
        })
      }
    })

    // ═══════════════════════════════════════════════════════════════════
    // 3. Căutare după SERIAL NUMBER în notes (JSON cu serial_number)
    // ═══════════════════════════════════════════════════════════════════
    // Caută în notes care conțin serial_number în format JSON
    const notesSerialOr = `notes.ilike.%"serial_number%"${serialOr.replace('serials.ilike', 'and notes.ilike')}`

    const { data: trayItemsByNotes } = await supabase
      .from('tray_items')
      .select(`
        id,
        notes,
        serials,
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
      `)
      .not('notes', 'is', null)
      .ilike('notes', `%"serial_number"%`)
      .or(serialOr.replace('serials.ilike', 'notes.ilike'))
      .limit(LIMIT_TRAYS)

    ;(trayItemsByNotes as any[])?.forEach((item: any) => {
      const tray = item?.tray
      if (tray?.service_file?.lead) {
        // Încearcă să extragi serial din notes JSON
        let serialInfo = item.serials || ''
        if (item.notes) {
          try {
            const notesObj = typeof item.notes === 'string' ? JSON.parse(item.notes) : item.notes
            if (notesObj?.serial_number) {
              serialInfo = notesObj.serial_number
            }
          } catch {
            // Dacă nu e JSON valid, folosește notes ca at
            serialInfo = item.notes
          }
        }
        
        addResult({
          trayId: tray.id,
          trayNumber: tray.number,
          leadId: tray.service_file.lead.id,
          leadName: tray.service_file.lead.full_name || 'Unknown',
          leadPhone: tray.service_file.lead.phone_number,
          leadEmail: tray.service_file.lead.email,
          serviceFileNumber: tray.service_file.number,
          serviceFileId: tray.service_file.id,
          matchType: 'serial_number',
          matchDetails: `Serial: ${serialInfo}`,
        })
      }
    })

    return { data: results, error: null }
  } catch (error: any) {
    console.error('[searchTraysGloballyWithClient] Error:', error)
    return { data: [], error }
  }
}
