import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { serviceFileIds } = body

    if (!Array.isArray(serviceFileIds) || serviceFileIds.length === 0) {
      return NextResponse.json(
        { error: 'serviceFileIds must be a non-empty array' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Setează colet_ajuns = true pentru toate fișele de service
    const { data, error } = await supabase
      .from('service_files')
      .update({ colet_ajuns: true })
      .in('id', serviceFileIds)
      .select()

    if (error) {
      console.error('Eroare la setarea colet_ajuns:', error)
      return NextResponse.json(
        { success: false, error: error?.message || 'Eroare la setarea colet_ajuns' },
        { status: 500 }
      )
    }

    const updatedIds = (data || []).map((r: { id?: string }) => r.id).filter(Boolean)
    const nowIso = new Date().toISOString()
    const stageName = 'Colet ajuns'

    if (updatedIds.length > 0) {
      const eventRows = updatedIds.map((item_id: string) => ({
        type: 'service_file',
        item_id,
        event_type: 'colet_ajuns',
        message: `Marcat ca ${stageName}`,
        payload: { to: stageName },
        created_at: nowIso,
      }))
      const { error: eventsErr } = await supabase.from('items_events').insert(eventRows)
      if (eventsErr) {
        console.error('Eroare la inserarea items_events colet_ajuns:', eventsErr)
        // Nu eșuăm requestul – flag-ul pe service_files e setat; strategia poate folosi colet_ajuns
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: data?.length || 0,
      data
    })
  } catch (error) {
    console.error('Eroare la API set-colet-ajuns:', error)
    return NextResponse.json(
      { error: 'Eroare internă de server' },
      { status: 500 }
    )
  }
}