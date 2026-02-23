'use client'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

export type Part = {
  id: string
  name: string
  price: number
  active: boolean
  created_at: string
  updated_at: string
}

const supabase = supabaseBrowser()

export async function listParts(): Promise<Part[]> {
  const { data, error } = await supabase
    .from('parts')
    .select('id,name,price,active,created_at,updated_at')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((p: any) => ({ ...p, price: Number(p.price) })) as Part[]
}

export async function createPart(input: { name: string; price: number }) {
  const { data: userRes, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userRes.user) throw userErr ?? new Error('No user')
  const { error } = await supabase.from('parts').insert({
    name: input.name.trim(),
    price: input.price,
    created_by: userRes.user.id,
  })
  if (error) throw error
}

export async function deletePart(id: string) {
  const { error } = await supabase.from('parts').delete().eq('id', id)
  if (error) throw error
}
