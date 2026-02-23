import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export async function createApiSupabaseClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Ignored if called from Server Component
        }
      },
    },
  })
}

export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase admin credentials')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function requireAuth() {
  console.log('[requireAuth] Checking authentication...')
  const supabase = await createApiSupabaseClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  console.log('[requireAuth] Session:', session ? { userId: session.user.id, email: session.user.email } : null)
  console.log('[requireAuth] Error:', error)

  const user = session?.user
  if (error || !user) {
    console.log('[requireAuth] Authentication failed - throwing 401')
    throw NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[requireAuth] User authenticated successfully:', user.id)
  return { user, supabase }
}

export async function requireOwner() {
  console.log('[requireOwner] Checking owner permissions...')
  const { user } = await requireAuth()
  const admin = createAdminClient()

  console.log('[requireOwner] Querying app_members for user:', user.id)
  const { data: membership, error } = await admin
    .from('app_members')
    .select('role')
    .eq('user_id', user.id)
    .single()

  console.log('[requireOwner] Membership data:', membership)
  console.log('[requireOwner] Membership error:', error)

  if (!membership || membership.role !== 'owner') {
    console.log('[requireOwner] Not an owner - throwing 403. Membership:', membership)
    throw NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  console.log('[requireOwner] Owner verified successfully:', user.id)
  return { user, admin }
}
