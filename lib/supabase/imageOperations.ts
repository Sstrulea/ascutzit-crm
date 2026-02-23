'use client'

import { supabaseBrowser } from './supabaseClient'

const supabase = supabaseBrowser()
const TRAY_BUCKET_NAME = 'tray_images'

export interface TrayImage {
  id: string
  tray_id: string
  url: string
  filename: string
  file_path: string
  created_at: string
}

/**
 * Upload o imagine pentru o tăviță
 */
export async function uploadTrayImage(trayId: string, file: File): Promise<{ url: string; path: string }> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${trayId}/${Date.now()}.${fileExt}`
  const filePath = `${fileName}`

  const { data, error } = await supabase.storage
    .from(TRAY_BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from(TRAY_BUCKET_NAME)
    .getPublicUrl(filePath)

  return { url: publicUrl, path: filePath }
}

/**
 * Șterge o imagine pentru o tăviță
 */
export async function deleteTrayImage(filePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(TRAY_BUCKET_NAME)
    .remove([filePath])

  if (error) throw error
}

/**
 * Obține toate imaginile pentru o tăviță
 */
export async function listTrayImages(trayId: string): Promise<TrayImage[]> {
  const { data, error } = await supabase
    .from('tray_images')
    .select('id, tray_id, url, filename, file_path, created_at')
    .eq('tray_id', trayId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as TrayImage[]
}

/**
 * Salvează referința unei imagini în baza de date pentru o tăviță
 */
export async function saveTrayImageReference(trayId: string, url: string, filePath: string, filename: string): Promise<TrayImage> {
  const { data, error } = await supabase
    .from('tray_images')
    .insert([{
      tray_id: trayId,
      url: url,
      file_path: filePath,
      filename: filename
    }] as any)
    .select('id, tray_id, url, filename, file_path, created_at')
    .single()

  if (error) throw error
  return data as TrayImage
}

/**
 * Șterge referința unei imagini din baza de date pentru o tăviță
 */
export async function deleteTrayImageReference(imageId: string): Promise<void> {
  const { error } = await supabase
    .from('tray_images')
    .delete()
    .eq('id', imageId)

  if (error) throw error
}

/**
 * Setează imaginea reprezentativă (atribuită) pentru o tăviță.
 * Util în detaliile fișei: Recepție și departamente tehnice.
 * @param trayId - ID tăviță
 * @param imageId - ID imagine (tray_images.id) sau null pentru a scoate atribuirea
 */
export async function setTrayAssignedImage(trayId: string, imageId: string | null): Promise<{ error: any }> {
  const { error } = await supabase
    .from('trays')
    .update({ assigned_image_id: imageId })
    .eq('id', trayId)

  return { error: error ?? null }
}
