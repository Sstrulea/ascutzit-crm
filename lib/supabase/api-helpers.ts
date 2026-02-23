import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export async function createApiSupabaseClient() {
  const cookieStore = await cookies()
  return createRouteHandlerClient({ cookies: () => cookieStore })
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
  const supabase = await createApiSupabaseClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  const user = session?.user
  if (error || !user) {
    throw NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return { user, supabase }
}

export async function requireOwner() {
  const { user } = await requireAuth()
  const admin = createAdminClient()
  
  const { data: membership } = await admin
    .from('app_members')
    .select('role')
    .eq('user_id', user.id)
    .single()
  
  if (!membership || membership.role !== 'owner') {
    throw NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  
  return { user, admin }
}
