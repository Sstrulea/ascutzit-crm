import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/api-helpers'

export async function POST(req: Request) {
  try {
    const { username } = await req.json()
    
    if (!username) {
      return NextResponse.json({ ok: false, error: 'Username required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const trimmedUsername = username.trim().toLowerCase()

    // 1. Caută mai întâi în app_members.name
    const { data: member, error: memberError } = await admin
      .from('app_members')
      .select('name, user_id')
      .ilike('name', trimmedUsername)
      .maybeSingle()

    if (memberError) {
      return NextResponse.json({ ok: false, error: memberError.message }, { status: 500 })
    }

    // Dacă găsește în app_members, obține email-ul din auth.users
    if (member && member.user_id) {
      const { data: authUser } = await admin.auth.admin.getUserById(member.user_id)
      if (authUser?.user?.email) {
        return NextResponse.json({ ok: true, email: authUser.user.email })
      }
    }

    // 2. Dacă nu găsește în app_members, caută în auth.users după display_name, name sau full_name
    // Folosim listUsers doar dacă nu am găsit în app_members pentru a reduce request-urile
    try {
      const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      
      const matchingUser = authUsers?.users?.find(u => {
        const displayName = (u.user_metadata as any)?.display_name?.toLowerCase()
        const name = (u.user_metadata as any)?.name?.toLowerCase()
        const fullName = (u.user_metadata as any)?.full_name?.toLowerCase()
        
        return displayName === trimmedUsername || 
               name === trimmedUsername || 
               fullName === trimmedUsername
      })

      if (matchingUser && matchingUser.email) {
        return NextResponse.json({ ok: true, email: matchingUser.email })
      }
    } catch (listUsersError: any) {
      // Dacă listUsers eșuează (rate limit), continuă cu eroarea de mai jos
      console.warn('listUsers failed:', listUsersError.message)
    }

    // 3. Dacă tot nu găsește, returnează eroare
    return NextResponse.json({ ok: false, error: 'Username not found' }, { status: 404 })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Error' }, { status: 500 })
  }
}

