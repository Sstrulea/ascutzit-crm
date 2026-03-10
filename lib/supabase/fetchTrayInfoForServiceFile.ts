/**
 * Încarcă direct de la Supabase: tăvițe, numere, tehnician și (opțional) departament
 * pentru o fișă de serviciu. Folosit când strategia/cache nu furnizează datele.
 */

import { supabaseBrowser } from './supabaseClient'
import { loadTechnicianCache, getTechnicianName } from './kanban/cache'
import { fetchTrayItems } from './kanban/fetchers'

export type TrayInfoRow = {
  trayId: string
  trayNumber: string | null
  technician: string | null
  department: string | null
}

export type TrayInfoResult = {
  trayNumbers: string[]
  technician: string | null
  trays: TrayInfoRow[]
}

/**
 * Fetch direct: trays pentru service_file_id, cu număr, tehnician și departament.
 * Folosește doar coloane de bază (id, number, service_file_id, technician_id) pentru a evita 400.
 */
export async function fetchTrayInfoForServiceFile(
  serviceFileId: string
): Promise<TrayInfoResult> {
  const result: TrayInfoResult = { trayNumbers: [], technician: null, trays: [] }
  if (!serviceFileId || typeof serviceFileId !== 'string') return result

  try {
    await loadTechnicianCache()
    const supabase = supabaseBrowser()

    // 1) Tăvițe – încearcă cu toate coloanele tehnician; la eroare fallback doar technician_id
    let traysRows: Array<{ id: string; number: string | null; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }> | null = null
    const { data: dataFull, error: traysErr } = await supabase
      .from('trays')
      .select('id, number, service_file_id, technician_id, technician2_id, technician3_id')
      .eq('service_file_id', serviceFileId)
    if (!traysErr && dataFull?.length) {
      traysRows = dataFull as typeof traysRows
    } else if (traysErr) {
      const { data: dataMin } = await supabase
        .from('trays')
        .select('id, number, service_file_id, technician_id')
        .eq('service_file_id', serviceFileId)
      if (dataMin?.length) traysRows = dataMin as typeof traysRows
    }
    if (!traysRows?.length) return result

    const trays = traysRows

    const trayIds = trays.map((t) => t.id).filter(Boolean)
    if (trayIds.length === 0) return result

    // 2) Care tăvițe au cel puțin un item (pentru numere afișate)
    const { data: trayItemsRows } = await fetchTrayItems(trayIds)
    const trayIdsWithItems = new Set(
      (trayItemsRows ?? []).map((r: { tray_id: string }) => r.tray_id)
    )

    // 3) Departament: pipeline în care e tăvița (Saloane, Frizerii, etc.)
    let departmentByTrayId = new Map<string, string>()
    const { data: piRows } = await supabase
      .from('pipeline_items')
      .select('item_id, pipeline_id')
      .eq('type', 'tray')
      .in('item_id', trayIds)
    if (piRows?.length) {
      const pipelineIds = [...new Set((piRows as any[]).map((r) => r.pipeline_id))]
      if (pipelineIds.length > 0) {
        const { data: pipelines } = await supabase
          .from('pipelines')
          .select('id, name')
          .in('id', pipelineIds)
        const idToName = new Map(
          (pipelines || []).map((p: { id: string; name: string }) => [p.id, p.name])
        )
        for (const r of piRows as any[]) {
          const name = idToName.get(r.pipeline_id)
          if (name) departmentByTrayId.set(r.item_id, name)
        }
      }
    }

    const trayNumbers: string[] = []
    const traysOut: TrayInfoRow[] = []
    let firstTechnician: string | null = null

    for (const t of trays) {
      const hasItems = trayIdsWithItems.has(t.id)
      const num =
        t.number != null && String(t.number).trim() !== ''
          ? String(t.number).trim()
          : null
      const techId = t.technician_id ?? (t as any).technician2_id ?? (t as any).technician3_id ?? null
      const techName = techId ? getTechnicianName(techId) : null
      const allIds = [t.technician_id, (t as any).technician2_id, (t as any).technician3_id].filter(Boolean) as string[]
      const allNames = allIds.map((id) => getTechnicianName(id)).filter(Boolean)
      const techNameDisplay = allNames.length > 0 ? allNames.join(' • ') : techName
      if (techNameDisplay && !firstTechnician) firstTechnician = techNameDisplay
      const dept = departmentByTrayId.get(t.id) ?? null

      traysOut.push({
        trayId: t.id,
        trayNumber: num,
        technician: techNameDisplay || null,
        department: dept,
      })
      if (hasItems) trayNumbers.push(num ?? '—')
    }

    result.trays = traysOut
    result.trayNumbers = trayNumbers
    result.technician = firstTechnician
    return result
  } catch {
    return result
  }
}
