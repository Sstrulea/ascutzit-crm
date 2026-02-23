'use client'

import { useEffect } from 'react'
import { usePipelinesCache } from '@/hooks/usePipelinesCache'

/**
 * Layout dashboard: preîncarcă pipelines când accesezi /dashboard/*.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { getPipelines } = usePipelinesCache()

  useEffect(() => {
    getPipelines().catch(() => {})
  }, [getPipelines])

  return <>{children}</>
}
