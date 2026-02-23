'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useRole } from '@/lib/contexts/AuthContext'
import { toast } from 'sonner'

/**
 * Layout pentru toate rutele /configurari și /configurari/catalog.
 * Doar owner poate accesa; restul sunt redirecționați la dashboard.
 */
export default function ConfigurariLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { isOwner, loading } = useRole()

  useEffect(() => {
    if (loading) return
    if (!isOwner) {
      toast.error('Acces interzis. Doar owner poate accesa Configurări.')
      router.replace('/dashboard')
    }
  }, [loading, isOwner, router])

  // Nu afișăm conținut până nu știm rolul; evităm flash de conținut restricționat
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Se încarcă...</p>
      </div>
    )
  }

  if (!isOwner) {
    return null
  }

  return <>{children}</>
}
