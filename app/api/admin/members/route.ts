import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/supabase/api-helpers'

export async function GET() {
  try {
    console.log('[GET /api/admin/members] Request received')
    const { admin, user } = await requireOwner()
    console.log('[GET /api/admin/members] User authenticated:', user?.id, user?.email)

    const { data: members, error } = await admin
      .from('app_members')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error

    const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const emails = new Map<string, string>()
    const names = new Map<string, string>()
    
    authData?.users?.forEach(u => {
      if (u.email) emails.set(u.id, u.email)
      const name = u.user_metadata?.name || u.user_metadata?.full_name || null
      if (name) names.set(u.id, name)
    })

    const result = (members || []).map(m => ({
      ...m,
      email: emails.get(m.user_id) || `User ${m.user_id.slice(0, 8)}...`,
      name: (m as any).name || names.get(m.user_id) || null,
      status: (m as any).is_active === false ? 'inactive' as const : 'active' as const
    }))

    return NextResponse.json({ ok: true, members: result })
  } catch (error: any) {
    if (error instanceof Response) return error
    return NextResponse.json({ ok: false, error: error?.message || 'Error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { memberId } = await req.json()
    if (!memberId) {
      return NextResponse.json({ ok: false, error: 'memberId required' }, { status: 400 })
    }

    const { admin } = await requireOwner()

    const { data: target } = await admin
      .from('app_members')
      .select('role')
      .eq('user_id', memberId)
      .single()

    if (target?.role === 'owner') {
      return NextResponse.json({ ok: false, error: 'Cannot delete owner' }, { status: 403 })
    }

    const { error } = await admin
      .from('app_members')
      .delete()
      .eq('user_id', memberId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error instanceof Response) return error
    return NextResponse.json({ ok: false, error: error?.message || 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { memberId, role, name, status } = await req.json()
    
    if (!memberId) {
      return NextResponse.json({ ok: false, error: 'memberId required' }, { status: 400 })
    }

    const { admin } = await requireOwner()

    const updates: any = {}
    if (role && ['owner', 'admin', 'member', 'vanzator', 'receptie', 'tehnician'].includes(role)) {
      updates.role = role
    }
    if (name !== undefined) {
      updates.name = name
      // Obține user_metadata existent pentru a-l păstra
      const { data: existingUser } = await admin.auth.admin.getUserById(memberId)
      const existingMetadata = existingUser?.user?.user_metadata || {}
      await admin.auth.admin.updateUserById(memberId, {
        user_metadata: { ...existingMetadata, name, full_name: name, display_name: name }
      })
    }
    if (status === 'active' || status === 'inactive') {
      updates.is_active = status === 'active'
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: false, error: 'No updates provided' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('app_members')
      .update(updates)
      .eq('user_id', memberId)
      .select()

    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error instanceof Response) return error
    return NextResponse.json({ ok: false, error: error?.message || 'Error' }, { status: 500 })
  }
}
