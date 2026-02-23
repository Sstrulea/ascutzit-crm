/**
 * GET /api/owner/db/table/[tableName]
 * Returnează coloanele și primele N rânduri ale unui tabel (read-only).
 * Doar owner. tableName trebuie să fie în whitelist.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/supabase/api-helpers'

const TABLE_WHITELIST = [
  'leads', 'service_files', 'trays', 'tray_items', 'pipeline_items',
  'pipelines', 'stages', 'tags', 'lead_tags', 'app_members',
  'instruments', 'services', 'parts', 'conversations', 'messages',
  'departments', 'items_events', 'work_sessions', 'stage_history',
  'tray_item_brands', 'tray_item_brand_serials',
  'arhiva_fise_serviciu', 'arhiva_tray_items',
]

const MAX_ROWS = 50

function inferType(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return 'boolean'
  if (typeof val === 'number') return 'number'
  if (typeof val === 'object' && typeof (val as { toISOString?: () => string }).toISOString === 'function') return 'timestamp'
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return 'date/text'
  return 'text'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tableName: string }> }
) {
  const { tableName } = await params
  if (!tableName || !TABLE_WHITELIST.includes(tableName)) {
    return NextResponse.json({ ok: false, error: 'Tabel invalid sau nepermis' }, { status: 400 })
  }

  let admin: Awaited<ReturnType<typeof requireOwner>>['admin']
  try {
    const result = await requireOwner()
    admin = result.admin
  } catch (err: unknown) {
    if (err instanceof NextResponse) return err
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const client = admin as any
    const table = client.from(tableName)

    const [{ data: rows, error: rowsError }, { count: totalRows, error: countError }] = await Promise.all([
      table.select('*').limit(MAX_ROWS),
      table.select('*', { count: 'exact', head: true }),
    ])

    if (rowsError) {
      const msg = (rowsError as { message?: string })?.message ?? String(rowsError)
      return NextResponse.json({ ok: false, error: msg }, { status: 400 })
    }

    const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
    const total = countError ? null : (totalRows ?? null)

    const allKeys = new Set<string>()
    list.forEach((row) => Object.keys(row || {}).forEach((k) => allKeys.add(k)))
    const columns = Array.from(allKeys).sort()

    const columnInfoBase = columns.map((col) => {
      const firstVal = list.length ? list[0][col] : null
      return { name: col, inferredType: inferType(firstVal) }
    })

    const nonNullCounts = await Promise.all(
      columns.map(async (col) => {
        try {
          const { count, error } = await table
            .select(col, { count: 'exact', head: true })
            .not(col, 'is', null)
          if (error) return null
          return count ?? null
        } catch {
          return null
        }
      })
    )

    const columnInfo = columnInfoBase.map((info, i) => ({
      ...info,
      nonNullCount: nonNullCounts[i] ?? null,
    }))

    return NextResponse.json({
      ok: true,
      tableName,
      totalRows: total,
      columns: columnInfo,
      rows: list,
      totalReturned: list.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
