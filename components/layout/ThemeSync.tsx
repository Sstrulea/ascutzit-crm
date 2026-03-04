'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useAuthContext } from '@/lib/contexts/AuthContext'
import { useUserPreferences } from '@/hooks/useUserPreferences'

/**
 * Sincronizează tema din user_preferences (DB) cu next-themes la încărcare.
 * Când utilizatorul este autentificat și preferințele sunt încărcate, aplică tema salvată.
 */
export function ThemeSync() {
  const { user } = useAuthContext()
  const { preferences, loading } = useUserPreferences()
  const { setTheme } = useTheme()

  useEffect(() => {
    if (!user?.id || loading) return
    const theme = preferences?.theme
    if (theme && ['light', 'dark', 'system'].includes(theme)) {
      setTheme(theme)
    }
  }, [user?.id, loading, preferences?.theme, setTheme])

  return null
}
