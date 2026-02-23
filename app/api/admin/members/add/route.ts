import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/supabase/api-helpers'

type Role = 'owner' | 'admin' | 'member'

export async function POST(req: Request) {
  try {
    const { email, name, password, role }: { email?: string; name?: string; password?: string; role?: Role } = await req.json()
    
    if (!email || !password || !name) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 })
    }

    const { admin } = await requireOwner()

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: role ?? 'admin', name, full_name: name, display_name: name },
    })

    let userId: string | null = null
    
    if (created.error) {
      if (String(created.error.message).toLowerCase().includes('already registered')) {
        const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const existing = list.data?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
        if (!existing) {
          return NextResponse.json({ ok: false, error: 'User exists but not found' }, { status: 409 })
        }
        userId = existing.id
      } else {
        return NextResponse.json({ ok: false, error: created.error.message }, { status: 400 })
      }
    } else {
      userId = created.data.user?.id ?? null
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'No user id' }, { status: 500 })
    }

    const { error } = await admin
      .from('app_members')
      .upsert({ user_id: userId, role: role ?? 'admin', name: name })
    
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, created: !created.error })
  } catch (error: any) {
    if (error instanceof Response) return error
    return NextResponse.json({ ok: false, error: error?.message || 'Error' }, { status: 500 })
  }
}
