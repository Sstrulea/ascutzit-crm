'use client'

import { supabaseBrowser } from './supabaseClient'
const supabase = supabaseBrowser()

export type TagColor = 'green' | 'yellow' | 'red' | 'orange' | 'blue'
export type Tag = { id: string; name: string; color: TagColor }

/**
 * Normalizes tag name by removing diacritics and non-alphanumeric characters.
 * Used for case-insensitive comparison (e.g., "Nu răspunde" = "Nu raspunde").
 */
function canonicalTagName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Admin list (configurari) */
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

    // If we receive a duplicate key error (23505), it means in parallel
    // the same pair (lead_id, tag_id) was already inserted. We can ignore it
    // and consider that the tag is already added.
    if (error && (error as any).code !== '23505') {
      throw error
    }

    return { added: true }
  }
}

/**
 * Creates a new tag with the specified name and color.
 * @param name - Tag name
 * @param color - Tag color from predefined options
 */
export async function createTag(name: string, color: TagColor) {
  const { data, error } = await supabase
    .from('tags')
    .insert([{ name, color }] as any)
    .select('id,name,color')
    .single()
  if (error) throw error
  return data as Tag
}

/**
 * Deletes a tag by its ID.
 * @param tagId - The ID of the tag to delete
 */
export async function deleteTag(tagId: string) {
  const { error } = await supabase.from('tags').delete().eq('id', tagId)
  if (error) throw error
}

/**
 * Updates a tag's name or color.
 * @param tagId - The ID of the tag to update
 * @param patch - Partial update object with name or color
 */
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

/** Finds or creates PINNED tag (used for pinning leads) */
export async function getOrCreatePinnedTag(): Promise<Tag> {
  // search for PINNED tag
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .eq('name', 'PINNED')
    .maybeSingle()
  
  if (existingTag) {
    return existingTag as Tag
  }
  
  // create PINNED tag if it doesn't exist
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'PINNED', color: 'blue' }] as any)
    .select('id,name,color')
    .single()
  
  if (error) throw error
  return newTag as Tag
}

/** Finds or creates "Urgentare" tag (positions card first in list – for service files and trays). */
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

/** Finds or creates "Nu raspunde" tag (for highlighting service file card). */
export async function getOrCreateNuRaspundeTag(): Promise<Tag> {
  // To avoid duplicates ("Nu răspunde" vs "Nu raspunde"), list and canonicalize.
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

/** Adds a tag to a lead if it doesn't already exist (for Curier Trimis / Office direct – real persistent tag). */
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

/** Removes a tag from a lead (if it exists). */
export async function removeLeadTag(leadId: string, tagId: string): Promise<void> {
  await supabase
    .from('lead_tags')
    .delete()
    .eq('lead_id', leadId)
    .eq('tag_id', tagId)
}

/** Finds or creates "Curier Trimis" tag (real tag – persists even after moving the lead). */
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

/** Finds or creates "Office direct" tag (real tag – persists even after moving the lead). */
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

/** Finds or creates "Suna!" tag (after Call back / Nu răspunde expires – displayed on card with X for removal). */
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

/** Finds or creates "Urgent" tag (for urgent deliveries; lead carries it during the service file period). */
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

/** Finds or creates "Retur" tag (for assignment to Close button in details). */
export async function getOrCreateReturTag(): Promise<Tag> {
  // Search for Retur tag (case-insensitive)
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'retur')
    .maybeSingle()
  
  if (existingTag) {
    return existingTag as Tag
  }
  
  // Create Retur tag if it doesn't exist
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Retur', color: 'orange' }] as any)
    .select('id,name,color')
    .single()
  
  if (error) throw error
  return newTag as Tag
}

/** Finds or creates "Nu A Venit" tag (for service files in Office Direct – client didn't show up). */
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

/** Finds or creates "Garantie" tag (for display on card when warranty checkbox is active). */
export async function getOrCreateGarantieTag(): Promise<Tag> {
  // Search for Garantie tag (case-insensitive)
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id,name,color')
    .ilike('name', 'garantie')
    .maybeSingle()
  
  if (existingTag) {
    return existingTag as Tag
  }
  
  // Create Garantie tag if it doesn't exist
  const { data: newTag, error } = await supabase
    .from('tags')
    .insert([{ name: 'Garantie', color: 'blue' }] as any)
    .select('id,name,color')
    .single()
  
  if (error) throw error
  return newTag as Tag
}