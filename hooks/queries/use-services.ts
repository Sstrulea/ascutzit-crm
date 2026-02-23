'use client'

import { useQuery } from '@tanstack/react-query'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

const supabase = supabaseBrowser()

interface Service {
  id: string
  name: string
  price: number
  instrument_id: string | null
  department_id: string | null
  active: boolean
  estimated_time?: number
}

// ✅ Query Keys
export const serviceKeys = {
  all: ['services'] as const,
  list: () => [...serviceKeys.all, 'list'] as const,
  active: () => [...serviceKeys.all, 'active'] as const,
  byInstrument: (instrumentId: string) => [...serviceKeys.all, 'instrument', instrumentId] as const,
}

// ✅ Fetch toate serviciile active - CACHED 15 min
export function useServices() {
  return useQuery({
    queryKey: serviceKeys.active(),
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, price, instrument_id, department_id, active, estimated_time')
        .eq('active', true)
        .order('name')

      if (error) throw error
      return data || []
    },
    staleTime: 15 * 60 * 1000, // 15 minute
    gcTime: 30 * 60 * 1000,
  })
}

// ✅ Servicii filtrate după instrument
export function useServicesByInstrument(instrumentId: string | null) {
  const { data: services } = useServices()
  
  if (!instrumentId) return services || []
  return services?.filter(s => s.instrument_id === instrumentId || !s.instrument_id) || []
}

