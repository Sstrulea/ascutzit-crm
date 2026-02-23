import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/supabase/api-helpers'

function randomPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function POST(req: Request) {
  try {
    const { userId } = await req.json()
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 })
    }

    const { admin } = await requireOwner()

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
    if (userError || !userData?.user) {
      return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })
    }

    const temporaryPassword = randomPassword(12)
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
    })

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      temporaryPassword,
      message: 'Parola a fost resetată. Comunică utilizatorului parola temporară.',
    })
  } catch (error: any) {
    if (error instanceof Response) return error
    return NextResponse.json({ ok: false, error: error?.message || 'Error' }, { status: 500 })
  }
}
