'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

const supabase = supabaseBrowser()

interface Instrument {
  id: string
  name: string
  department_id: string | null
  pipeline: string | null
  weight: number
  active: boolean
}

// ✅ Query Keys
export const instrumentKeys = {
  all: ['instruments'] as const,
  list: () => [...instrumentKeys.all, 'list'] as const,
  active: () => [...instrumentKeys.all, 'active'] as const,
  byDepartment: (deptId: string) => [...instrumentKeys.all, 'dept', deptId] as const,
}

// ✅ Fetch toate instrumentele active - CACHED 30 min
export function useInstruments() {
  return useQuery({
    queryKey: instrumentKeys.active(),
    queryFn: async (): Promise<Instrument[]> => {
      const { data, error } = await supabase
        .from('instruments')
        .select('id, name, department_id, pipeline, weight, active')
        .eq('active', true)
        .order('name')

      if (error) throw error
      return data || []
    },
    staleTime: 30 * 60 * 1000, // 30 minute
    gcTime: 60 * 60 * 1000,
  })
}

// ✅ Fetch instrumente filtrate după departament
export function useInstrumentsByDepartment(departmentId: string | null) {
  const { data: instruments } = useInstruments()
  
  if (!departmentId) return instruments || []
  return instruments?.filter(i => i.department_id === departmentId) || []
}

