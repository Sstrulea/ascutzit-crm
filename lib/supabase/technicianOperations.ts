'use client'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

export type Technician = {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
}

const supabase = supabaseBrowser()

export async function listTechnicians(): Promise<Technician[]> {
  const { data, error } = await supabase
    .from('technicians')
    .select('id,name,active,created_at,updated_at')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Technician[]
}

export async function createTechnician(name: string) {
  const { data: userRes, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userRes.user) throw userErr ?? new Error('No user')
  const { error } = await supabase.from('technicians').insert({
    name: name.trim(),
    created_by: userRes.user.id,
  })
  if (error) throw error
}

export async function deleteTechnician(id: string) {
  const { error } = await supabase.from('technicians').delete().eq('id', id)
  if (error) throw error
}
