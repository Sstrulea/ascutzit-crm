'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // ✅ Stale time: 5 minute - date considerate fresh
            staleTime: 5 * 60 * 1000,
            // ✅ Cache time: 30 minute - păstrează în cache
            gcTime: 30 * 60 * 1000,
            // ✅ Nu refetch automat la focus (economie requests)
            refetchOnWindowFocus: false,
            // ✅ Retry de 2 ori pentru erori de rețea
            retry: 2,
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
          mutations: {
            // ✅ Retry pentru mutații
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

