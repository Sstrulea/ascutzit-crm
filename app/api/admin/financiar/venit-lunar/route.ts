/**
 * Venit lunar din servicii prestate (fișe facturate/arhivate).
 * GET /api/admin/financiar/venit-lunar
 * Doar owner poate accesa.
 */

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/supabase/api-helpers'

export const dynamic = 'force-dynamic'

function parseNotes(notes: string | null): { price?: number; discount?: number } {
  if (!notes) return {}
  try {
    const o = JSON.parse(notes) as Record<string, unknown>
    return {
      price: typeof o.price === 'number' ? o.price : undefined,
      discount: typeof o.discount === 'number' ? o.discount : undefined,
    }
  } catch {
    return {}
  }
}

export async function GET() {
  try {
    const { admin } = await requireOwner()

    const { data: fise, error: fiseErr } = await admin
      .from('arhiva_fise_serviciu')
      .select('id, created_at')

    if (fiseErr) {
      return NextResponse.json({ ok: false, error: fiseErr.message }, { status: 500 })
    }

    const fisaIds = (fise ?? []).map((f: any) => f.id)
    const fisaCreatedAt = new Map<string, string>()
    for (const f of fise ?? []) {
      fisaCreatedAt.set((f as any).id, (f as any).created_at)
    }

    if (fisaIds.length === 0) {
      return NextResponse.json({ ok: true, months: [] })
    }

    const { data: items, error: itemsErr } = await admin
      .from('arhiva_tray_items')
      .select(`
        arhiva_fisa_id,
        qty,
        notes,
        service_id,
        part_id,
        services ( price ),
        parts ( price )
      `)
      .in('arhiva_fisa_id', fisaIds)

    if (itemsErr) {
      return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 })
    }

    const byMonth = new Map<string, number>()
    for (const it of items ?? []) {
      const o = it as any
      const createdAt = fisaCreatedAt.get(o.arhiva_fisa_id)
      if (!createdAt) continue
      const d = new Date(createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const service = Array.isArray(o.services) ? o.services[0] : o.services
      const part = Array.isArray(o.parts) ? o.parts[0] : o.parts
      const servicePrice = Number(service?.price ?? part?.price ?? 0) || 0
      const notesData = parseNotes(o.notes ?? null)
      const priceTva = notesData.price ?? servicePrice
      const discount = notesData.discount ?? 0
      const qty = Math.max(0, Number(o.qty) || 1)
      const pretFinal = Math.max(0, priceTva - discount) * qty
      byMonth.set(key, (byMonth.get(key) ?? 0) + pretFinal)
    }

    const monthNames = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']
    const months = Array.from(byMonth.entries())
      .map(([key, total]) => {
        const [y, m] = key.split('-').map(Number)
        return {
          year: y,
          month: m,
          monthLabel: `${monthNames[m - 1]} ${y}`,
          total: Math.round(total * 100) / 100,
        }
      })
      .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month))

    return NextResponse.json({ ok: true, months })
  } catch (err: unknown) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Eroare la încărcare venit lunar'
    console.error('[venit-lunar]', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
