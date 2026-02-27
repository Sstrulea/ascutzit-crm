/**
 * GET /api/owner/db/tables
 * Listă tabele din schema public cu număr de rânduri (count).
 * Doar owner. Folosește service role pentru count-uri reale (fără RLS).
 */

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/supabase/api-helpers'

// Whitelist: doar tabele din schema public pe care le expunem pentru statistici
const TABLE_NAMES = [
  'leads',
  'service_files',
  'trays',
  'tray_items',
  'pipeline_items',
  'pipelines',
  'stages',
  'tags',
  'lead_tags',
  'app_members',
  'instruments',
  'services',
  'parts',
  'conversations',
  'messages',
  'departments',
  'items_events',
  'work_sessions',
  'stage_history',
  'arhiva_fise_serviciu',
  'arhiva_tray_items',
]

export async function GET() {
  let admin: Awaited<ReturnType<typeof requireOwner>>['admin']
  try {
    const result = await requireOwner()
    admin = result.admin
  } catch (err: unknown) {
    if (err instanceof NextResponse) return err
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const tables: { name: string; count: number | null; error?: string }[] = []

  for (const tableName of TABLE_NAMES) {
    try {
      const { count, error } = await (admin as any)
        .from(tableName)
        .select('*', { count: 'exact', head: true })

      if (error) {
        tables.push({ name: tableName, count: null, error: error.message })
      } else {
        tables.push({ name: tableName, count: count ?? null })
      }
    } catch (e) {
      tables.push({
        name: tableName,
        count: null,
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({ ok: true, tables })
}
