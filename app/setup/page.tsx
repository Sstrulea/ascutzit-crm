'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, XCircle, Zap } from 'lucide-react'
import { toast } from 'sonner'

export default function SetupPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('ghiorghe@tehnic.com')

  const handleSetup = async () => {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await fetch('/api/setup/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail })
      })

      const data = await res.json()

      if (!data.ok) {
        throw new Error(data.error || 'Eroare la setup')
      }

      if (data.needsManualSetup) {
        // Indică utilizatorului că trebuie să ruleze scripturile manual
        setError('Setup-ul automat nu este disponibil. Rulează scripturile SQL manual din supabase/migrations/')
      } else {
        setSuccess(true)
        toast.success('Setup completat cu succes!')
        
        // Reîncarcă pagina după 2 secunde
        setTimeout(() => {
          window.location.href = '/admins'
        }, 2000)
      }

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
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Zap className="h-6 w-6 text-primary" />
            Setup Automat Permisiuni
          </CardTitle>
          <CardDescription>
            Configurează sistemul de permisiuni cu un singur click
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!success && !error && (
            <>
              <div className="space-y-2">
                <Label htmlFor="userEmail">Email Tehnician</Label>
                <Input
                  id="userEmail"
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="ghiorghe@tehnic.com"
                />
                <p className="text-xs text-muted-foreground">
                  Email-ul tehnicianului pentru care se acordă permisiuni (Saloane, Frizerii, Horeca, Reparatii)
                </p>
              </div>

              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">Ce va face acest setup:</p>
                <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
                  <li>Configurează RLS policies pentru toate tabelele</li>
                  <li>Sincronizează user_id-uri cu auth.users</li>
                  <li>Acordă permisiuni pentru pipeline-uri specificate</li>
                  <li>Verifică configurarea finală</li>
                </ul>
              </div>

              <Button
                onClick={handleSetup}
                disabled={loading || !userEmail}
                className="w-full"
                size="lg"
              >
                {loading && <Loader2 className="h-5 w-5 mr-2 animate-spin" />}
                {!loading && <Zap className="h-5 w-5 mr-2" />}
                {loading ? 'Se configurează...' : 'Start Setup Automat'}
              </Button>
            </>
          )}

          {success && (
            <div className="text-center space-y-4 py-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <div>
                <h3 className="text-lg font-semibold text-green-600">Setup Completat!</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Sistemul de permisiuni a fost configurat cu succes.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Vei fi redirecționat automat la pagina de administrare...
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-destructive">Eroare la setup</h4>
                  <p className="text-sm text-destructive/80 mt-1">{error}</p>
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

          <div className="text-xs text-muted-foreground pt-4 border-t">
            <p className="font-medium mb-2">Notă:</p>
            <p>
              Asigură-te că ai adăugat <code className="bg-muted px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> în 
              fișierul <code className="bg-muted px-1 rounded">.env.local</code> pentru ca setup-ul automat să funcționeze.
            </p>
            <p className="mt-2">
              Găsești cheia în Supabase Dashboard → Settings → API → service_role key
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}



