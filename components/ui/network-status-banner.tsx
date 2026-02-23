'use client'

import { useState, useEffect } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'

/**
 * Banner discret care afișează starea conexiunii:
 * - Offline: "Conexiune întreruptă. Datele se vor reîncărca la reconectare."
 * - Tocmai reconectat: "Reconectat. Reîncărcare date…" (dispare după câteva secunde)
 */
export function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [recentlyReconnected, setRecentlyReconnected] = useState(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const handleOnline = () => {
      setIsOnline(true)
      setRecentlyReconnected(true)
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => setRecentlyReconnected(false), 4000)
    }
    const handleOffline = () => {
      setIsOnline(false)
      setRecentlyReconnected(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  if (isOnline && !recentlyReconnected) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200"
      style={{
        backgroundColor: isOnline ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))',
        color: isOnline ? 'hsl(var(--chart-2-foreground))' : 'hsl(var(--destructive-foreground))',
      }}
    >
      {isOnline ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Reconectat. Reîncărcare date…</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Conexiune întreruptă. Datele se vor reîncărca la reconectare.</span>
        </>
      )}
    </div>
  )
}
