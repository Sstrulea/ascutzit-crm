'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Check, AlertCircle } from 'lucide-react'

export function MoveLeadsWithServiceFilesToOldStageButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; count: number; message: string } | null>(null)
  const { toast } = useToast()

  const handleMove = async () => {
    setLoading(true)
    setResult(null)
    
    try {
      const response = await fetch('/api/leads/move-with-service-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      
      const data = await response.json()
      
      if (data.success) {
        setResult({
          success: true,
          count: data.movedLeadsCount,
          message: data.message,
        })
        toast({
          title: 'Success',
          description: data.message,
          variant: 'default',
        })
      } else {
        setResult({
          success: false,
          count: 0,
          message: data.error || 'Failed to move leads',
        })
        toast({
          title: 'Error',
          description: data.error || 'Failed to move leads',
          variant: 'destructive',
        })
      }
    } catch (error: any) {
      const message = error?.message || 'An error occurred'
      setResult({
        success: false,
        count: 0,
        message,
      })
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold mb-1">Organizare Lead-uri</h3>
          <p className="text-sm text-muted-foreground">
            Mişte lead-urile cu servicii în "Lead-uri Vechi"
          </p>
        </div>

        <Button
          onClick={handleMove}
          disabled={loading}
          className="w-full sm:w-auto"
          variant={result?.success ? 'outline' : 'default'}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Se procesează...
            </>
          ) : result?.success ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Gata
            </>
          ) : (
            'Mută Lead-uri'
          )}
        </Button>

        {result && (
          <div
            className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
              result.success
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
            }`}
          >
            {result.success ? (
              <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className="font-medium">{result.message}</p>
              {result.success && result.count > 0 && (
                <p className="text-xs mt-1 opacity-90">
                  {result.count} lead-{result.count === 1 ? 'uri a fost' : 'uri au fost'} mutat-e
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

