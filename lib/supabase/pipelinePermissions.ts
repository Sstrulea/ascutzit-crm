'use client'

import { supabaseBrowser } from './supabaseClient'

const supabase = supabaseBrowser()

/**
 * Adaugă permisiune pentru un utilizator să vadă un pipeline
 * Doar owner-ii pot folosi această funcție
 */
export async function grantPipelineAccess(
  userId: string,
  pipelineId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_pipeline_permissions')
    .insert({
      user_id: userId,
      pipeline_id: pipelineId,
    })

  if (error && error.code !== '23505') { // Ignoră duplicate key error
    throw new Error(`Eroare la acordarea permisiunii: ${error.message}`)
  }
}

/**
 * Revocă permisiunea unui utilizator pentru un pipeline
 * Doar owner-ii pot folosi această funcție
 */
export async function revokePipelineAccess(
  userId: string,
  pipelineId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_pipeline_permissions')
    .delete()
    .eq('user_id', userId)
    .eq('pipeline_id', pipelineId)

  if (error) {
    throw new Error(`Eroare la revocarea permisiunii: ${error.message}`)
  }
}

/**
 * Obține toate permisiunile de pipeline pentru un utilizator
 */
export async function getUserPipelinePermissions(userId: string) {
  const { data, error } = await supabase.rpc('get_user_pipeline_permissions', {
    target_user_id: userId,
  })

  if (error) {
    throw new Error(`Eroare la obținerea permisiunilor: ${error.message}`)
  }

  return data || []
}

/**
 * Obține toate pipeline-urile disponibile pentru utilizatorul curent
 * (va respecta automat RLS - va returna doar pipeline-urile permise)
 */
export async function getAvailablePipelines() {
  const { data, error } = await supabase
    .from('pipelines')
    .select('id, name, description, position, is_active')
    .eq('is_active', true)
    .order('position', { ascending: true })

  if (error) {
    throw new Error(`Eroare la obținerea pipeline-urilor: ${error.message}`)
  }

  return data || []
}

/**
 * Adaugă permisiuni pentru multiple pipeline-uri simultan
 */
export async function grantMultiplePipelineAccess(
  userId: string,
  pipelineIds: string[]
): Promise<void> {
  const promises = pipelineIds.map((pipelineId) =>
    grantPipelineAccess(userId, pipelineId)
  )

  await Promise.all(promises)
}

/**
 * Revocă permisiuni pentru multiple pipeline-uri simultan
 */
export async function revokeMultiplePipelineAccess(
  userId: string,
  pipelineIds: string[]
): Promise<void> {
  const promises = pipelineIds.map((pipelineId) =>
    revokePipelineAccess(userId, pipelineId)
  )

  await Promise.all(promises)
}



