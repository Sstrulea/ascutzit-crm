'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

const supabase = supabaseBrowser()

// ✅ Types
interface Pipeline {
  id: string
  name: string
  color?: string
  sort_order?: number
}

interface Stage {
  id: string
  name: string
  pipeline_id: string
  sort_order: number
  color?: string
}

// ✅ Query Keys - pentru invalidare precisă
export const pipelineKeys = {
  all: ['pipelines'] as const,
  list: () => [...pipelineKeys.all, 'list'] as const,
  detail: (id: string) => [...pipelineKeys.all, id] as const,
  stages: (pipelineId: string) => [...pipelineKeys.all, pipelineId, 'stages'] as const,
}

// ✅ Fetch toate pipeline-urile - CACHED 30 min
export function usePipelines() {
  return useQuery({
    queryKey: pipelineKeys.list(),
    queryFn: async (): Promise<Pipeline[]> => {
      const { data, error } = await supabase
        .from('pipelines')
        .select('id, name, color, sort_order')
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data || []
    },
    staleTime: 30 * 60 * 1000, // 30 minute - pipelines se schimbă rar
    gcTime: 60 * 60 * 1000, // 1 oră în cache
  })
}

// ✅ Fetch stages pentru un pipeline - CACHED 15 min
export function useStages(pipelineId: string | null) {
  return useQuery({
    queryKey: pipelineKeys.stages(pipelineId || ''),
    queryFn: async (): Promise<Stage[]> => {
      if (!pipelineId) return []
      
      const { data, error } = await supabase
        .from('stages')
        .select('id, name, pipeline_id, sort_order, color')
        .eq('pipeline_id', pipelineId)
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!pipelineId,
    staleTime: 15 * 60 * 1000, // 15 minute
    gcTime: 30 * 60 * 1000,
  })
}

// ✅ Fetch pipeline by slug
export function usePipelineBySlug(slug: string | null) {
  return useQuery({
    queryKey: ['pipeline-by-slug', slug],
    queryFn: async (): Promise<Pipeline | null> => {
      if (!slug) return null
      
      // Convertim slug în name (ex: "saloane" -> "Saloane")
      const name = slug.charAt(0).toUpperCase() + slug.slice(1)
      
      const { data, error } = await supabase
        .from('pipelines')
        .select('id, name, color, sort_order')
        .ilike('name', name)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!slug,
    staleTime: 30 * 60 * 1000,
  })
}

