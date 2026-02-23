'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, User, Lock, BarChart3, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/contexts/AuthContext'

const supabase = supabaseBrowser()

interface ProfileData {
  name: string | null
  email: string | null
  role: string | null
}

interface Statistics {
  ordersToday: number
  ordersWeek: number
  ordersMonth: number
  workTimeToday: number // în minute
  workTimeWeek: number // în minute
  workTimeMonth: number // în minute
  earningsToday: number // în RON
  earningsWeek: number // în RON
  earningsMonth: number // în RON
  hourlyRateToday: number // RON/oră
  hourlyRateWeek: number // RON/oră
  hourlyRateMonth: number // RON/oră
}

export default function TechnicianProfilePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [statistics, setStatistics] = useState<Statistics>({
    ordersToday: 0,
    ordersWeek: 0,
    ordersMonth: 0,
    workTimeToday: 0,
    workTimeWeek: 0,
    workTimeMonth: 0,
    earningsToday: 0,
    earningsWeek: 0,
    earningsMonth: 0,
    hourlyRateToday: 0,
    hourlyRateWeek: 0,
    hourlyRateMonth: 0,
  })

  // State pentru schimbarea parolei
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      router.push('/auth/sign-in')
      return
    }
    loadProfileData()
    loadStatistics()
  }, [user])

  const loadProfileData = async () => {
    if (!user?.id) return

    try {
      // Obține datele din app_members
      const { data: member, error: memberError } = await supabase
        .from('app_members')
        .select('name, role')
        .eq('user_id', user.id)
        .single()

      if (memberError && memberError.code !== 'PGRST116') {
        throw memberError
      }

      // Email-ul vine din auth.users, nu din app_members
      const email = user.email || null
      const name = member?.name || email?.split('@')[0] || 'Necunoscut'
      const role = member?.role || null

      setProfileData({ name, email, role })
    } catch (error: any) {
      console.error('Eroare la încărcarea profilului:', error)
      toast.error('Eroare la încărcarea datelor profilului')
    } finally {
      setLoading(false)
    }
  }

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

      // Obține toate tray_items pentru acest tehnician cu datele aferente serviciilor
      const { data: allItems, error: itemsError } = await supabase
        .from('tray_items')
        .select('id, created_at, updated_at, tray_id, technician_id, service_id')
        .eq('technician_id', user.id)

      if (itemsError) throw itemsError

      // Obține datele serviciilor pentru a calcula venituri
      const serviceIds = [...new Set((allItems || []).map(item => item.service_id).filter(Boolean))]
      let servicesMap: Record<string, { price: number }> = {}
      
      if (serviceIds.length > 0) {
        const { data: services, error: servicesError } = await supabase
          .from('services')
          .select('id, price')
          .in('id', serviceIds)
        
        if (!servicesError && services) {
          servicesMap = services.reduce((acc, svc) => {
            acc[svc.id] = { price: svc.price || 0 }
            return acc
          }, {} as Record<string, { price: number }>)
        }
      }

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

      // Calculează timpul petrecut în lucru și veniturile
      const calculateWorkTimeAndEarnings = (items: any[]) => {
        let totalMinutes = 0
        let totalEarnings = 0
        for (const item of items) {
          const created = new Date(item.created_at)
          const updated = new Date(item.updated_at || item.created_at)
          const diffMinutes = Math.max(0, (updated.getTime() - created.getTime()) / (1000 * 60))
          totalMinutes += diffMinutes
          
          // Adaugă prețul serviciului la venituri
          if (item.service_id && servicesMap[item.service_id]) {
            totalEarnings += servicesMap[item.service_id].price
          }
        }
        return { totalMinutes: Math.round(totalMinutes), totalEarnings }
      }

      const { totalMinutes: workTimeToday, totalEarnings: earningsToday } = calculateWorkTimeAndEarnings(itemsToday)
      const { totalMinutes: workTimeWeek, totalEarnings: earningsWeek } = calculateWorkTimeAndEarnings(itemsWeek)
      const { totalMinutes: workTimeMonth, totalEarnings: earningsMonth } = calculateWorkTimeAndEarnings(itemsMonth)

      // Calculează rata orară (RON/oră)
      const calculateHourlyRate = (earnings: number, minutes: number) => {
        if (minutes === 0) return 0
        const hours = minutes / 60
        return parseFloat((earnings / hours).toFixed(2))
      }

      setStatistics({
        ordersToday: itemsToday.length,
        ordersWeek: itemsWeek.length,
        ordersMonth: itemsMonth.length,
        workTimeToday,
        workTimeWeek,
        workTimeMonth,
        earningsToday: parseFloat(earningsToday.toFixed(2)),
        earningsWeek: parseFloat(earningsWeek.toFixed(2)),
        earningsMonth: parseFloat(earningsMonth.toFixed(2)),
        hourlyRateToday: calculateHourlyRate(earningsToday, workTimeToday),
        hourlyRateWeek: calculateHourlyRate(earningsWeek, workTimeWeek),
        hourlyRateMonth: calculateHourlyRate(earningsMonth, workTimeMonth),
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
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
          <h1 className="text-xl md:text-2xl font-semibold">Profil Tehnician</h1>
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
              <p className="font-medium">
                {(user?.user_metadata as any)?.display_name || 
                 (user?.user_metadata as any)?.name || 
                 (user?.user_metadata as any)?.full_name || 
                 profileData?.name || 
                 'Necunoscut'}
              </p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Email</Label>
              <p className="font-medium">{profileData?.email || 'Necunoscut'}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Rol</Label>
              <p className="font-medium capitalize">{profileData?.role || 'Necunoscut'}</p>
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

        {/* Statistici */}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Comenzi */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Comenzi</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Astăzi</span>
                    <span className="text-lg font-semibold">{statistics.ordersToday}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Săptămâna</span>
                    <span className="text-lg font-semibold">{statistics.ordersWeek}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Luna</span>
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
                    <span className="text-sm">Săptămâna</span>
                    <span className="text-lg font-semibold">
                      {formatTime(statistics.workTimeWeek)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">Luna</span>
                    <span className="text-lg font-semibold">
                      {formatTime(statistics.workTimeMonth)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Venituri */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Venituri</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <span className="text-sm">Astăzi</span>
                    <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {statistics.earningsToday.toFixed(2)} RON
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <span className="text-sm">Săptămâna</span>
                    <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {statistics.earningsWeek.toFixed(2)} RON
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <span className="text-sm">Luna</span>
                    <span className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {statistics.earningsMonth.toFixed(2)} RON
                    </span>
                  </div>
                </div>
              </div>

              {/* Rata Orară */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Rata Orară</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <span className="text-sm">Astăzi</span>
                    <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {statistics.hourlyRateToday.toFixed(2)} RON/h
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <span className="text-sm">Săptămâna</span>
                    <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {statistics.hourlyRateWeek.toFixed(2)} RON/h
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <span className="text-sm">Luna</span>
                    <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {statistics.hourlyRateMonth.toFixed(2)} RON/h
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}



