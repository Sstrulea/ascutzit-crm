'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  const isChunkLoad = error?.name === 'ChunkLoadError' || error?.message?.includes('ChunkLoadError') || error?.message?.includes('Failed to load chunk')
  const isFailedFetch = error?.message?.includes('Failed to fetch') || error?.message?.includes('fetch failed')

  const suggestion = isChunkLoad
    ? 'Un fișier necesar aplicației nu s-a putut încărca (cache vechi sau rețea). Reîncarcă pagina sau șterge cache-ul (.next) și repornește serverul de develop.'
    : isFailedFetch
      ? 'Conexiunea la server a eșuat (rețea, server oprit sau port blocat). Verifică că serverul de develop rulează (pnpm dev), apoi reîncarcă sau apasă „Încearcă din nou”.'
      : error?.message || 'A apărut o eroare neașteptată.'

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border bg-card p-6 text-center shadow-sm">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h1 className="text-lg font-semibold mb-2">
          {isChunkLoad ? 'Eroare la încărcare' : isFailedFetch ? 'Eroare de conexiune' : 'Ceva nu a mers bine'}
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          {suggestion}
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button onClick={() => window.location.reload()}>
            Reîncarcă pagina
          </Button>
          <Button variant="outline" onClick={reset}>
            Încearcă din nou
          </Button>
        </div>
      </div>
    </div>
  )
}
