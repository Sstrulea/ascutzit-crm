'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, User, Lock, BarChart3, Clock, Loader2, Palette, Moon, Sun, Monitor, Edit2, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthContext } from '@/lib/contexts/AuthContext'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const supabase = supabaseBrowser()

interface Statistics {
  ordersToday: number
  ordersWeek: number
  ordersMonth: number
  workTimeToday: number // în minute
  workTimeWeek: number // în minute
  workTimeMonth: number // în minute
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, profile, role, loading: authLoading, isMember, refreshProfile } = useAuthContext()
  const { preferences, updatePreferences } = useUserPreferences()
  
  const [statistics, setStatistics] = useState<Statistics>({
    ordersToday: 0,
    ordersWeek: 0,
    ordersMonth: 0,
    workTimeToday: 0,
    workTimeWeek: 0,
    workTimeMonth: 0,
  })

  // State pentru schimbarea parolei
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  
  // State pentru editarea display_name
  const [editingDisplayName, setEditingDisplayName] = useState(false)
  const [displayNameValue, setDisplayNameValue] = useState("")
  const [savingDisplayName, setSavingDisplayName] = useState(false)
  
  // Aplică tema când se schimbă preferințele
  useEffect(() => {
    if (preferences.theme && typeof document !== 'undefined') {
      const root = document.documentElement
      if (preferences.theme === 'dark') {
        root.classList.add('dark')
      } else if (preferences.theme === 'light') {
        root.classList.remove('dark')
      } else {
        // system - folosește preferința sistemului
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        if (prefersDark) {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }
    }
  }, [preferences.theme])

  useEffect(() => {
    if (authLoading) return
    
    if (!user) {
      router.push('/auth/sign-in')
      return
    }
    
    // Verifică dacă profile este încărcat
    if (!profile) {
      console.warn('Profile not loaded yet, waiting...')
      return
    }
    
    // Încarcă statisticile doar pentru members (tehnicieni)
    if (isMember()) {
      loadStatistics()
    }
  }, [user, profile, authLoading, isMember, router])

  const loadStatistics = async () => {
    if (!user?.id) return

    try {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekStart = new Date(now)
      // Calculează luni (getDay() returnează 0 pentru duminică, 1 pentru luni, etc.)
      const dayOfWeek = now.getDay()
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Dacă e duminică, mergi cu 6 zile înapoi
      weekStart.setDate(now.getDate() - daysToMonday)
      weekStart.setHours(0, 0, 0, 0)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      // Obține toate tray_items pentru acest tehnician
      const { data: allItems, error: itemsError } = await supabase
        .from('tray_items')
        .select('id, created_at, updated_at, tray_id, technician_id')
        .eq('technician_id', user.id)

      if (itemsError) throw itemsError

      // Filtrează pentru zi/săptămână/lună
      const itemsToday = allItems?.filter(item => {
        const createdAt = new Date(item.created_at)
        return createdAt >= todayStart
      }) || []

      const itemsWeek = allItems?.filter(item => {
        const createdAt = new Date(item.created_at)
        return createdAt >= weekStart
      }) || []

      const itemsMonth = allItems?.filter(item => {
        const createdAt = new Date(item.created_at)
        return createdAt >= monthStart
      }) || []

      // Calculează timpul petrecut în lucru
      // Presupunem că timpul petrecut = diferența între created_at și updated_at pentru items cu status "in_lucru" sau "gata"
      const calculateWorkTime = (items: any[]) => {
        let totalMinutes = 0
        for (const item of items) {
          const created = new Date(item.created_at)
          const updated = new Date(item.updated_at || item.created_at)
          const diffMinutes = Math.max(0, (updated.getTime() - created.getTime()) / (1000 * 60))
          totalMinutes += diffMinutes
        }
        return Math.round(totalMinutes)
      }

      const workTimeToday = calculateWorkTime(itemsToday)
      const workTimeWeek = calculateWorkTime(itemsWeek)
      const workTimeMonth = calculateWorkTime(itemsMonth)

      setStatistics({
        ordersToday: itemsToday.length,
        ordersWeek: itemsWeek.length,
        ordersMonth: itemsMonth.length,
        workTimeToday,
        workTimeWeek,
        workTimeMonth,
      })
    } catch (error: any) {
      console.error('Eroare la încărcarea statisticilor:', error)
      toast.error('Eroare la încărcarea statisticilor')
    }
  }

  const handleChangePassword = async () => {
    if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
      toast.error('Parola nouă trebuie să aibă minim 6 caractere')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Parolele nu se potrivesc')
      return
    }

    setChangingPassword(true)
    try {
      // Verifică parola curentă prin reautentificare
      if (!user?.email) {
        throw new Error('Email-ul nu este disponibil')
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordForm.currentPassword,
      })

      if (signInError) {
        toast.error('Parola curentă este incorectă')
        return
      }

      // Actualizează parola
      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      })

      if (updateError) throw updateError

      toast.success('Parola a fost schimbată cu succes')
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setShowPasswordForm(false)
    } catch (error: any) {
      console.error('Eroare la schimbarea parolei:', error)
      toast.error(error.message || 'Eroare la schimbarea parolei')
    } finally {
      setChangingPassword(false)
    }
  }

  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) {
      return `${hours} h`
    }
    return `${hours} h ${mins} min`
  }

  const getDisplayName = () => {
    return (user?.user_metadata as any)?.display_name || 
           (user?.user_metadata as any)?.name || 
           (user?.user_metadata as any)?.full_name || 
           profile?.name || 
           'Necunoscut'
  }

  const handleUpdateDisplayName = async () => {
    if (!displayNameValue.trim()) {
      toast.error("Display name-ul nu poate fi gol")
      return
    }
    setSavingDisplayName(true)
    try {
      const res = await fetch("/api/profile/update-display-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayNameValue.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Error")
      toast.success("Display name actualizat")
      setEditingDisplayName(false)
      setDisplayNameValue("")
      // Reîncarcă profilul pentru a reflecta schimbările
      await refreshProfile()
    } catch (error: any) {
      toast.error(error.message || "Eroare la actualizare")
    } finally {
      setSavingDisplayName(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Nu s-au putut încărca datele profilului</p>
      </div>
    )
  }

  // Label pentru rol în română
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'Proprietar'
      case 'admin': return 'Administrator'
      case 'member': return 'Membru'
      default: return role
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20 px-4 md:px-6">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b p-4 md:p-6">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Înapoi
          </Button>
          <h1 className="text-xl md:text-2xl font-semibold">Profil</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-6 space-y-6">
        {/* Informații Cont și Profil */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informații Cont
            </CardTitle>
            <CardDescription>
              Datele tale de cont și profil
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Nume</Label>
              {editingDisplayName ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={displayNameValue}
                    onChange={(e) => setDisplayNameValue(e.target.value)}
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateDisplayName()
                      if (e.key === 'Escape') {
                        setEditingDisplayName(false)
                        setDisplayNameValue("")
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleUpdateDisplayName}
                    disabled={savingDisplayName}
                    className="shrink-0"
                  >
                    {savingDisplayName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingDisplayName(false)
                      setDisplayNameValue("")
                    }}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-medium flex-1">{getDisplayName()}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingDisplayName(true)
                      setDisplayNameValue(getDisplayName())
                    }}
                    className="shrink-0"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Email</Label>
              <p className="font-medium">{profile.email || user?.email || 'Necunoscut'}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Rol</Label>
              <p className="font-medium">{getRoleLabel(profile.role)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Schimbare Parolă */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Schimbare Parolă
            </CardTitle>
            <CardDescription>
              Actualizează parola contului tău
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showPasswordForm ? (
              <Button
                variant="outline"
                onClick={() => setShowPasswordForm(true)}
              >
                Schimbă Parola
              </Button>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="currentPassword">Parola Curentă</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                    }
                    placeholder="Introdu parola curentă"
                  />
                </div>
                <div>
                  <Label htmlFor="newPassword">Parola Nouă</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                    }
                    placeholder="Minim 6 caractere"
                  />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirmă Parola Nouă</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                    }
                    placeholder="Confirmă parola nouă"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPasswordForm(false)
                      setPasswordForm({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: '',
                      })
                    }}
                  >
                    Anulează
                  </Button>
                  <Button
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvează Parola
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistici - doar pentru members (tehnicieni) */}
        {isMember() && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Statistici
              </CardTitle>
              <CardDescription>
                Performanța ta în ultima perioadă
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Comenzi */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Comenzi</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">Astăzi</span>
                      <span className="text-lg font-semibold">{statistics.ordersToday}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">Săptămâna aceasta</span>
                      <span className="text-lg font-semibold">{statistics.ordersWeek}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">Luna aceasta</span>
                      <span className="text-lg font-semibold">{statistics.ordersMonth}</span>
                    </div>
                  </div>
                </div>

                {/* Timp Petrecut în Lucru */}
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Timp în Lucru
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">Astăzi</span>
                      <span className="text-lg font-semibold">
                        {formatTime(statistics.workTimeToday)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">Săptămâna aceasta</span>
                      <span className="text-lg font-semibold">
                        {formatTime(statistics.workTimeWeek)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">Luna aceasta</span>
                      <span className="text-lg font-semibold">
                        {formatTime(statistics.workTimeMonth)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Customizare CRM */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Customizare CRM
            </CardTitle>
            <CardDescription>
              Personalizează aspectul și comportamentul CRM-ului
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Tema */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Tema</Label>
              <Select
                value={preferences.theme || 'system'}
                onValueChange={(value: 'light' | 'dark' | 'system') => {
                  updatePreferences({ theme: value })
                  toast.success('Tema a fost actualizată')
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      <span>Luminos</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      <span>Întunecat</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      <span>Sistem</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Alege tema aplicației. "Sistem" folosește preferința sistemului tău.
              </p>
            </div>

            {/* Mod compact */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Mod compact</Label>
                <p className="text-xs text-muted-foreground">
                  Afișează mai multe informații într-un spațiu mai mic
                </p>
              </div>
              <Switch
                checked={preferences.compactMode || false}
                onCheckedChange={(checked) => {
                  updatePreferences({ compactMode: checked })
                  toast.success('Modul compact a fost actualizat')
                }}
              />
            </div>

            {/* Informații despre customizare */}
            <div className="p-3 bg-muted/50 rounded-lg border">
              <p className="text-xs text-muted-foreground">
                <strong>Notă:</strong> Pozițiile stage-urilor pot fi customizate din butonul de customizare din header-ul mobil.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}



