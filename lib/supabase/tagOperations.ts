'use client'

import { supabaseBrowser } from './supabaseClient'
const supabase = supabaseBrowser()

export type TagColor =
  | 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'pink'
  | 'slate' | 'gray' | 'zinc' | 'neutral' | 'stone'
  | 'lime' | 'amber' | 'emerald' | 'teal' | 'cyan' | 'sky'
  | 'indigo' | 'violet' | 'purple' | 'fuchsia' | 'rose'
  | 'black' | 'white'

/** Tipuri de item pe care poate fi atribuit un tag. Gol/null = toate. */
export type TagItemType = 'lead' | 'service_file' | 'tray'

export type Tag = { id: string; name: string; color: TagColor; item_types?: TagItemType[] | null }

/** Clase Tailwind pentru fiecare culoare de tag (culori solide, nu nuante). */
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  yellow: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-800',
  orange: 'bg-orange-100 text-orange-800',
  blue: 'bg-blue-100 text-blue-800',
  pink: 'bg-pink-100 text-pink-800',
  slate: 'bg-slate-100 text-slate-800',
  gray: 'bg-gray-100 text-gray-800',
  zinc: 'bg-zinc-100 text-zinc-800',
  neutral: 'bg-neutral-100 text-neutral-800',
  stone: 'bg-stone-100 text-stone-800',
  lime: 'bg-lime-100 text-lime-800',
  amber: 'bg-amber-100 text-amber-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  teal: 'bg-teal-100 text-teal-800',
  cyan: 'bg-cyan-100 text-cyan-800',
  sky: 'bg-sky-100 text-sky-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  violet: 'bg-violet-100 text-violet-800',
  purple: 'bg-purple-100 text-purple-800',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-800',
  rose: 'bg-rose-100 text-rose-800',
  black: 'bg-black text-white',
  white: 'bg-white text-gray-900 border border-gray-300',
}

/** Returnează clasa CSS pentru culoarea unui tag; fallback pentru valori necunoscute. */
export function getTagColorClass(color: TagColor | string): string {
  return TAG_COLOR_CLASSES[color as TagColor] ?? 'bg-rose-100 text-rose-800'
}

/** Clase cu border pentru taguri (ex. pe mobile). */
export const TAG_COLOR_CLASSES_WITH_BORDER: Record<TagColor, string> = {
  green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  yellow: 'bg-amber-100 text-amber-800 border-amber-200',
  red: 'bg-rose-100 text-rose-800 border-rose-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  pink: 'bg-pink-100 text-pink-800 border-pink-200',
  slate: 'bg-slate-100 text-slate-800 border-slate-200',
  gray: 'bg-gray-100 text-gray-800 border-gray-200',
  zinc: 'bg-zinc-100 text-zinc-800 border-zinc-200',
  neutral: 'bg-neutral-100 text-neutral-800 border-neutral-200',
  stone: 'bg-stone-100 text-stone-800 border-stone-200',
  lime: 'bg-lime-100 text-lime-800 border-lime-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  teal: 'bg-teal-100 text-teal-800 border-teal-200',
  cyan: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  sky: 'bg-sky-100 text-sky-800 border-sky-200',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  rose: 'bg-rose-100 text-rose-800 border-rose-200',
  black: 'bg-black text-white border-black',
  white: 'bg-white text-gray-900 border border-gray-300',
}

export function getTagColorClassWithBorder(color: TagColor | string): string {
  return TAG_COLOR_CLASSES_WITH_BORDER[color as TagColor] ?? 'bg-gray-100 text-gray-800 border-gray-200'
}

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

/** Selectează taguri; dacă coloana item_types lipsește (migrare nerulată), folosește doar id,name,color. */
async function listTagsRaw(includeItemTypes: boolean): Promise<Tag[]> {
  const cols = includeItemTypes ? 'id,name,color,item_types' : 'id,name,color'
  const { data, error } = await supabase
    .from('tags')
    .select(cols)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Tag[]
}

/** Admin list (configurari). Toleră lipsa coloanei item_types. */
export async function listTags(): Promise<Tag[]> {
  try {
    return await listTagsRaw(true)
  } catch {
    return await listTagsRaw(false)
  }
}

/**
 * Taguri care pot fi atribuite unui anumit tip de item (lead, fișă, tăviță).
 * Un tag fără item_types sau cu array gol se consideră disponibil pentru toate tipurile.
 * Dacă coloana item_types lipsește în DB, returnează toate tagurile.
 */
export async function listTagsForItemType(itemType: TagItemType): Promise<Tag[]> {
  let all: Tag[]
  try {
    all = await listTagsRaw(true)
  } catch {
    all = await listTagsRaw(false)
  }
  return all.filter((t) => {
    const types = t.item_types
    if (!types || types.length === 0) return true
    return types.includes(itemType)
  })
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
export async function createTag(name: string, color: TagColor, item_types?: TagItemType[] | null) {
  const payload: Record<string, unknown> = { name, color }
  if (item_types !== undefined) payload.item_types = item_types?.length ? item_types : null
  const { data, error } = await supabase
    .from('tags')
    .insert([payload] as any)
    .select('id,name,color,item_types')
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
 * Updates a tag's name, color or item_types.
 * @param tagId - The ID of the tag to update
 * @param patch - Partial update object with name, color, item_types
 */
export async function updateTag(tagId: string, patch: Partial<Pick<Tag, 'name' | 'color' | 'item_types'>>) {
  const updateData: any = {}
  if (patch.name !== undefined) updateData.name = patch.name
  if (patch.color !== undefined) updateData.color = patch.color
  if (patch.item_types !== undefined) updateData.item_types = patch.item_types?.length ? patch.item_types : null

  const { data, error } = await supabase
    .from('tags')
    .update(updateData as any)
    .eq('id', tagId)
    .select('id,name,color,item_types')
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