'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

const supabase = supabaseBrowser()

interface Department {
  id: string
  name: string
}

// ✅ Query Keys
export const departmentKeys = {
  all: ['departments'] as const,
  list: () => [...departmentKeys.all, 'list'] as const,
}

// ✅ Fetch toate departamentele - CACHED 1 oră (se schimbă foarte rar)
export function useDepartments() {
  return useQuery({
    queryKey: departmentKeys.list(),
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .order('name')

      if (error) throw error
      return data || []
    },
    staleTime: 60 * 60 * 1000, // 1 oră
    gcTime: 2 * 60 * 60 * 1000, // 2 ore în cache
  })
}

// ✅ Hook pentru a obține departament by ID din cache
export function useDepartmentById(id: string | null) {
  const { data: departments } = useDepartments()
  return departments?.find(d => d.id === id) || null
}

