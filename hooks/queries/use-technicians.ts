'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

const supabase = supabaseBrowser()

interface Technician {
  user_id: string
  name: string | null
}

// ✅ Query Keys
export const technicianKeys = {
  all: ['technicians'] as const,
  list: () => [...technicianKeys.all, 'list'] as const,
}

// ✅ Fetch toți tehnicienii - CACHED 30 min
export function useTechnicians() {
  return useQuery({
    queryKey: technicianKeys.list(),
    queryFn: async (): Promise<Technician[]> => {
      const { data, error } = await supabase
        .from('app_members')
        .select('user_id, name')
        .order('name')

      if (error) throw error
      return data || []
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}

// ✅ Hook pentru map de tehnicieni (user_id -> nume)
export function useTechniciansMap() {
  const { data: technicians } = useTechnicians()
  
  const map: Record<string, string> = {}
  technicians?.forEach(t => {
    const name = t.name || `User ${t.user_id.slice(0, 8)}`
    map[t.user_id] = name
  })
  
  return map
}

