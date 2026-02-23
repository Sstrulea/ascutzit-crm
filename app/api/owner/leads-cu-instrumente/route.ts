/**
 * API: Lead-uri care au avut vreodată instrumente
 * GET /api/owner/leads-cu-instrumente
 * Doar pentru owner.
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member, error: memberErr } = await supabase
    .from('app_members')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (memberErr || !member || member.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Lead IDs: tray_items cu instrument_id direct SAU serviciu cu instrument_id
  const allLeadIds = new Set<string>()

  // 1. tray_items cu instrument_id direct
  const { data: itemsWithInst } = await supabase
    .from('tray_items')
    .select('tray_id')
    .not('instrument_id', 'is', null)

  const trayIds1 = [...new Set((itemsWithInst || []).map((r: any) => r.tray_id).filter(Boolean))]
  if (trayIds1.length > 0) {
    const { data: trays1 } = await supabase.from('trays').select('service_file_id').in('id', trayIds1)
    const sfIds1 = [...new Set((trays1 || []).map((t: any) => t.service_file_id).filter(Boolean))]
    if (sfIds1.length > 0) {
      const { data: sfs1 } = await supabase
        .from('service_files')
        .select('lead_id')
        .in('id', sfIds1)
        .not('lead_id', 'is', null)
      ;(sfs1 || []).forEach((sf: any) => { if (sf?.lead_id) allLeadIds.add(sf.lead_id) })
    }
  }

  // 2. tray_items cu service_id -> services.instrument_id
  const { data: itemsWithSvc } = await supabase
    .from('tray_items')
    .select('tray_id, service_id')
    .not('service_id', 'is', null)

  const serviceIds = [...new Set((itemsWithSvc || []).map((r: any) => r.service_id).filter(Boolean))]
  if (serviceIds.length > 0) {
    const { data: svcsWithInst } = await supabase
      .from('services')
      .select('id')
      .in('id', serviceIds)
      .not('instrument_id', 'is', null)
    const svcIdsSet = new Set((svcsWithInst || []).map((s: any) => s.id))
    const trayIds2 = (itemsWithSvc || [])
      .filter((r: any) => svcIdsSet.has(r.service_id))
      .map((r: any) => r.tray_id)
    const uniqueTrayIds2 = [...new Set(trayIds2)]
    if (uniqueTrayIds2.length > 0) {
      const { data: trays2 } = await supabase.from('trays').select('service_file_id').in('id', uniqueTrayIds2)
      const sfIds2 = [...new Set((trays2 || []).map((t: any) => t.service_file_id).filter(Boolean))]
      if (sfIds2.length > 0) {
        const { data: sfs2 } = await supabase
          .from('service_files')
          .select('lead_id')
          .in('id', sfIds2)
          .not('lead_id', 'is', null)
        ;(sfs2 || []).forEach((sf: any) => { if (sf?.lead_id) allLeadIds.add(sf.lead_id) })
      }
    }
  }

  const leadIds = [...allLeadIds]
  if (leadIds.length === 0) {
    return NextResponse.json({ total: 0, leads: [] })
  }

  const { data: leads } = await supabase
    .from('leads')
    .select('id, full_name, email, phone_number, company_name')
    .in('id', leadIds)
    .order('full_name')

  const leadsList = (leads || []).map((l: any) => ({
    id: l.id,
    name: l.full_name || l.company_name || l.email || '(Fără nume)',
    email: l.email,
    phone: l.phone_number,
    company: l.company_name,
  }))

  return NextResponse.json({ total: leadsList.length, leads: leadsList })
}
