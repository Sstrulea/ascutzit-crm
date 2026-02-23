'use client'

import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

export default function SignOutButton() {
  const router = useRouter()
  async function signOut() {
    const supabase = supabaseBrowser()
    await supabase.auth.signOut()
    router.replace('/auth/sign-in')
  }
  return (
    <button onClick={signOut} className="text-sm underline">
      Sign out
    </button>
  )
}
