'use client'

import { supabaseBrowser } from './supabaseClient'
const supabase = supabaseBrowser()

export type TagColor = 'green' | 'yellow' | 'red' | 'orange' | 'blue'
export type Tag = { id: string; name: string; color: TagColor }

function canonicalTagName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** admin list (configurari) */
export async function listTags(): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('id,name,color')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Tag[]
}

/** Toggle assign/unassign a tag on a lead */
export async function toggleLeadTag(leadId: string, tagId: string) {
  // does it exist?
  const { data: existing } = await supabase
    .from('lead_tags')
    .select('lead_id')
    .eq('lead_id', leadId)
    .eq('tag_id', tagId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('lead_tags')
      .delete()
      .eq('lead_id', leadId)
      .eq('tag_id', tagId)
    if (error) throw error
    return { removed: true }
  } else {
    const { error } = await supabase
      .from('lead_tags')
      .insert([{ lead_id: leadId, tag_id: tagId }] as any)
      .select('lead_id, tag_id')
      .single()

    // Dacă primim eroare de tip duplicate key (23505), înseamnă că în paralel
    // a fost deja inserată aceeași pereche (lead_id, tag_id). O putem ignora
    // și considerăm că tag-ul este deja adăugat.
    if (error && (error as any).code !== '23505') {
      throw error
    }

    return { added: true }
  }
}

export async function createTag(name: string, color: TagColor) {
  const { data, error } = await supabase
    .from('tags')
    .insert([{ name, color }] as any)
    .select('id,name,color')
    .single()
  if (error) throw error
  return data as Tag
}

export async function deleteTag(tagId: string) {
  const { error } = await supabase.from('tags').delete().eq('id', tagId)
  if (error) throw error
}

export async function updateTag(tagId: string, patch: Partial<Pick<Tag,'name'|'color'>>) {
  const updateData: any = {}
  if (patch.name !== undefined) updateData.name = patch.name
  if (patch.color !== undefined) updateData.color = patch.color
  
  const { data, error } = await supabase
    .from('tags')
    .update(updateData as any)
    .eq('id', tagId)
    .select('id,name,color')
    .single()
  if (error) throw error
  return data as Tag
}

/** Gaseste sau creeaza tag-ul PINNED */
export async function getOrCreatePinnedTag(): Promise<Tag> {
  // cauta tag-ul PINNED
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .eq('name', 'PINNED')
    .maybeSingle()
  
  if (existingTag) {
    return existingTag as Tag
  }
  
  // creeaza tag-ul PINNED daca nu exista
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'PINNED', color: 'blue' }] as any)
    .select('id,name,color')
    .single()
  
  if (error) throw error
  return newTag as Tag
}

/** Găsește sau creează tag-ul Urgentare (poziționează cardul primul în listă – pentru fișe de serviciu și tăvițe). */
export async function getOrCreateUrgentareTag(): Promise<Tag> {
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .eq('name', 'Urgentare')
    .maybeSingle()
  if (existingTag) return existingTag as Tag
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Urgentare', color: 'orange' }] as any)
    .select('id,name,color')
    .single()
  if (error) throw error
  return newTag as Tag
}

/** Găsește sau creează tag-ul "Nu raspunde" (pentru evidențiere card fișă). */
export async function getOrCreateNuRaspundeTag(): Promise<Tag> {
  // Pentru a evita duplicate ("Nu răspunde" vs "Nu raspunde"), listăm și canonicalizăm.
  let tags: Tag[] = []
  try {
    tags = await listTags()
  } catch {
    tags = []
  }
  const existing = tags.find((t) => canonicalTagName(t.name) === 'nuraspunde')
  if (existing) return existing
  return await createTag('Nu raspunde', 'red')
}

/** Adaugă un tag pe lead dacă nu există deja (pentru Curier Trimis / Office direct – tag real persistent). */
export async function addLeadTagIfNotPresent(leadId: string, tagId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('lead_tags')
    .select('lead_id')
    .eq('lead_id', leadId)
    .eq('tag_id', tagId)
    .maybeSingle()
  if (existing) return
  const { error } = await supabase
    .from('lead_tags')
    .insert([{ lead_id: leadId, tag_id: tagId }] as any)
  if (error && (error as any).code !== '23505') throw error
}

/** Scoate un tag de pe lead (dacă există). */
export async function removeLeadTag(leadId: string, tagId: string): Promise<void> {
  await supabase
    .from('lead_tags')
    .delete()
    .eq('lead_id', leadId)
    .eq('tag_id', tagId)
}

/** Găsește sau creează tag-ul "Curier Trimis" (tag real – persistă și după mutarea lead-ului). */
export async function getOrCreateCurierTrimisTag(): Promise<Tag> {
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'Curier Trimis')
    .maybeSingle()
  if (existingTag) return existingTag as Tag
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Curier Trimis', color: 'blue' }] as any)
    .select('id,name,color')
    .single()
  if (error) throw error
  return newTag as Tag
}

/** Găsește sau creează tag-ul "Office direct" (tag real – persistă și după mutarea lead-ului). */
export async function getOrCreateOfficeDirectTag(): Promise<Tag> {
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'Office direct')
    .maybeSingle()
  if (existingTag) return existingTag as Tag
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Office direct', color: 'blue' }] as any)
    .select('id,name,color')
    .single()
  if (error) throw error
  return newTag as Tag
}

/** Găsește sau creează tag-ul "Suna!" (după expirarea termenului Call back / Nu răspunde – afișat pe card cu X pentru eliminare). */
export async function getOrCreateSunaTag(): Promise<Tag> {
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'suna!')
    .maybeSingle()
  if (existingTag) return existingTag as Tag
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Suna!', color: 'red' }] as any)
    .select('id,name,color')
    .single()
  if (error) throw error
  return newTag as Tag
}

/** Găsește sau creează tag-ul "Urgent" (pentru livrări urgente; lead-ul îl poartă pe perioada fișei). */
export async function getOrCreateUrgentTag(): Promise<Tag> {
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'urgent')
    .maybeSingle()
  if (existingTag) return existingTag as Tag
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Urgent', color: 'red' }] as any)
    .select('id,name,color')
    .single()
  if (error) throw error
  return newTag as Tag
}

/** Găsește sau creează tag-ul "Retur" (pentru atribuire la butonul Close din detalii). */
export async function getOrCreateReturTag(): Promise<Tag> {
  // Caută tag-ul Retur (case-insensitive)
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'retur')
    .maybeSingle()
  
  if (existingTag) {
    return existingTag as Tag
  }
  
  // Creează tag-ul Retur dacă nu există
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Retur', color: 'orange' }] as any)
    .select('id,name,color')
    .single()
  
  if (error) throw error
  return newTag as Tag
}

/** Găsește sau creează tag-ul "Nu A Venit" (pentru fișe în Office Direct – clientul nu a venit). */
export async function getOrCreateNuAVenitTag(): Promise<Tag> {
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'Nu A Venit')
    .maybeSingle()
  if (existingTag) return existingTag as Tag
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Nu A Venit', color: 'orange' }] as any)
    .select('id,name,color')
    .single()
  if (error) throw error
  return newTag as Tag
}

/** Găsește sau creează tag-ul "Garantie" (pentru afișare pe card când checkbox-ul garantie este activ). */
export async function getOrCreateGarantieTag(): Promise<Tag> {
  // Caută tag-ul Garantie (case-insensitive)
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'garantie')
    .maybeSingle()
  
  if (existingTag) {
    return existingTag as Tag
  }
  
  // Creează tag-ul Garantie dacă nu există
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Garantie', color: 'blue' }] as any)
    .select('id,name,color')
    .single()
  
  if (error) throw error
  return newTag as Tag
}
