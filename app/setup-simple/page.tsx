'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle, XCircle, Zap, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function SetupSimplePage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSetup = async () => {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Sincronizează user pentru ghiorghe@tehnic.com
      const res = await fetch('/api/admin/sync-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: 'ghiorghe@tehnic.com',
          pipelineNames: ['Saloane', 'Frizerii', 'Horeca', 'Reparatii']
        })
      })

      const data = await res.json()

      if (!data.ok) {
        throw new Error(data.error || 'Eroare la sincronizare')
      }

      setSuccess(true)
      toast.success('Setup completat! Sign out și sign in pentru a vedea modificările.')

    } catch (err: any) {
      console.error('Setup error:', err)
      setError(err.message || 'Eroare necunoscută')
      toast.error(err.message || 'Eroare la setup')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Zap className="h-6 w-6 text-primary" />
            Setup Simplu - Sincronizare Utilizator
          </CardTitle>
          <CardDescription>
            Sincronizează user_id pentru ghiorghe@tehnic.com și acordă permisiuni
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!success && !error && (
            <>
              <div className="space-y-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="font-medium">Înainte de a continua:</p>
                <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                  <li>Deschide fișierul <code className="bg-muted px-1 rounded">.env.local</code></li>
                  <li>Adaugă această linie (cu cheia ta de la Supabase → Settings → API):
                    <pre className="bg-muted p-2 rounded mt-1 text-xs overflow-x-auto">
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
                    </pre>
                  </li>
                  <li>Salvează fișierul</li>
                  <li>Restart server: <code className="bg-muted px-1 rounded">Ctrl+C</code> apoi <code className="bg-muted px-1 rounded">npm run dev</code></li>
                </ol>
              </div>

              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">Ce va face acest setup:</p>
                <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Găsește user_id corect din auth.users pentru ghiorghe@tehnic.com</li>
                  <li>Șterge intrările vechi cu user_id invalid din app_members</li>
                  <li>Creează intrare nouă cu user_id corect</li>
                  <li>Acordă permisiuni pentru: Saloane, Frizerii, Horeca, Reparatii</li>
                </ul>
              </div>

              <Button
                onClick={handleSetup}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading && <Loader2 className="h-5 w-5 mr-2 animate-spin" />}
                {!loading && <Zap className="h-5 w-5 mr-2" />}
                {loading ? 'Se configurează...' : 'Sincronizează User și Acordă Permisiuni'}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Această operație este sigură și poate fi rulată de mai multe ori
              </p>
            </>
          )}

          {success && (
            <div className="text-center space-y-6 py-8">
              <CheckCircle className="h-20 w-20 text-green-500 mx-auto" />
              <div>
                <h3 className="text-2xl font-semibold text-green-600">Setup Completat!</h3>
                <p className="text-muted-foreground mt-3">
                  User sincronizat și permisiuni acordate cu succes.
                </p>
              </div>
              
              <div className="space-y-3 pt-4">
                <p className="text-sm font-medium">Următorii pași:</p>
                <ol className="text-sm text-muted-foreground space-y-2">
                  <li>1. Sign out din aplicație</li>
                  <li>2. Sign in cu: ghiorghe@tehnic.com</li>
                  <li>3. Verifică că vezi pipeline-urile: Saloane, Frizerii, Horeca, Reparatii</li>
                </ol>
              </div>

              <Link href="/admins">
                <Button size="lg" className="mt-4">
                  Mergi la Gestionare Membri
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
            </div>
          )}

          {error && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-destructive">Eroare la setup</h4>
                  <p className="text-sm text-destructive/80 mt-1">{error}</p>
                  
                  {error.includes('SUPABASE_SERVICE_ROLE_KEY') && (
                    <div className="mt-3 p-3 bg-background rounded text-xs">
                      <p className="font-medium mb-2">Cum adaugi SUPABASE_SERVICE_ROLE_KEY:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Supabase Dashboard → Settings → API</li>
                        <li>Copiază "service_role" key (secret!)</li>
                        <li>Adaugă în .env.local: SUPABASE_SERVICE_ROLE_KEY=...</li>
                        <li>Restart server (Ctrl+C apoi npm run dev)</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>
              <Button
                onClick={() => {
                  setError(null)
                  setSuccess(false)
                }}
                variant="outline"
                className="w-full"
              >
                Încearcă din nou
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}



