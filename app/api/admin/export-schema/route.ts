/**
 * GET /api/admin/export-schema
 * Exportă doar structura tabelelor (nume tabele + coloane), fără date.
 * Doar admin sau owner. Returnează JSON descărcabil.
 */

import { NextResponse } from 'next/server'
import { requireAdminOrOwner } from '@/lib/supabase/api-helpers'

// Lista tabelelor din schema public (conform docs/Data base.sql)
const TABLE_NAMES = [
  'app_members',
  'arhiva_fise_serviciu',
  'arhiva_tray_items',
  'audit_log',
  'conversations',
  'departments',
  'instruments',
  'items_events',
  'lead_tags',
  'leads',
  'messages',
  'notifications',
  'parts',
  'pipeline_items',
  'pipelines',
  'push_subscriptions',
  'service_files',
  'services',
  'stage_history',
  'stages',
  'tags',
  'technician_work_sessions',
  'tray_images',
  'tray_items',
  'trays',
  'user_pipeline_permissions',
  'user_preferences',
  'vanzari_apeluri',
]

export async function GET() {
  try {
    const { admin } = await requireAdminOrOwner()
    const client = admin as any

    const tables: { name: string; columns: string[] }[] = []

    for (const tableName of TABLE_NAMES) {
      try {
        const { data: rows } = await client
          .from(tableName)
          .select('*')
          .limit(1)

        const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
        const columns = row ? Object.keys(row).sort() : []
        tables.push({ name: tableName, columns })
      } catch {
        tables.push({ name: tableName, columns: [] })
      }
    }

    const payload = {
      metadata: {
        timestamp: new Date().toISOString(),
        type: 'schema_only',
        description: 'Structura tabelelor bazei de date (fără date)',
      },
      tables,
    }

    const filename = `schema-tables-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: unknown) {
    if (err instanceof NextResponse) return err
    const message = err instanceof Error ? err.message : 'Eroare la export'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
