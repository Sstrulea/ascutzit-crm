import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/supabase/api-helpers'

/**
 * PATCH /api/work-sessions/[id]
 * Actualizează started_at și/sau finished_at ale unei sesiuni de lucru.
 * Doar utilizatorii cu rol owner pot modifica sesiunile.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { admin } = await requireOwner()
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Session id required' }, { status: 400 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const startedAt = body.started_at as string | undefined
  const finishedAt = body.finished_at as string | undefined

  const updates: Record<string, unknown> = {}
  if (startedAt !== undefined) {
    const t = new Date(startedAt).getTime()
    if (!Number.isFinite(t)) return NextResponse.json({ error: 'Invalid started_at' }, { status: 400 })
    updates.started_at = startedAt
  }
  if (finishedAt !== undefined) {
    if (finishedAt !== null) {
      const t = new Date(finishedAt).getTime()
      if (!Number.isFinite(t)) return NextResponse.json({ error: 'Invalid finished_at' }, { status: 400 })
    }
    updates.finished_at = finishedAt
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  // Validare: finished_at trebuie să fie după started_at
  const started = updates.started_at != null ? new Date(updates.started_at as string).getTime() : null
  const finished = updates.finished_at != null ? new Date(updates.finished_at as string).getTime() : null
  if (started != null && finished != null && finished < started) {
    return NextResponse.json({ error: 'Sfârșitul trebuie să fie după început' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('technician_work_sessions')
    .update(updates)
    .eq('id', id)
    .select('id, started_at, finished_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
