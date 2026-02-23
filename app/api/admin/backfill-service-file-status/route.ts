import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Backfill status 'comanda' pentru service_files care au ≥1 instrument.
 * Rulează o dată după deploy; lead-urile cu fișe "comanda" vor apărea în "Avem Comandă".
 * POST /api/admin/backfill-service-file-status
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    if (!supabaseServiceKey) {
      return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY lipsește' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: files, error: listErr } = await supabase
      .from('service_files')
      .select('id')
      .eq('status', 'noua')
    if (listErr) throw listErr

    let updated = 0
    let errors = 0

    for (const sf of files || []) {
      try {
        const { data: trays } = await supabase
          .from('trays')
          .select('id')
          .eq('service_file_id', sf.id)
        if (!trays?.length) continue
        let hasInstrument = false
        for (const t of trays) {
          const { data: items } = await supabase
            .from('tray_items')
            .select('instrument_id')
            .eq('tray_id', t.id)
          if (items?.some((i: any) => i.instrument_id)) {
            hasInstrument = true
            break
          }
        }
        if (!hasInstrument) continue
        const { error: u } = await supabase
          .from('service_files')
          .update({ status: 'comanda', updated_at: new Date().toISOString() })
          .eq('id', sf.id)
        if (!u) updated++
        else errors++
      } catch {
        errors++
      }
    }

    return NextResponse.json({ ok: true, updated, errors, total: (files || []).length, message: `Actualizate ${updated} fișe (noua → comanda) cu instrumente.` })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Eroare backfill' }, { status: 500 })
  }
}
