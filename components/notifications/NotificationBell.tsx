'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, CheckCheck, Trash2, Package, MessageSquare, AlertTriangle, Info, ExternalLink, Smartphone } from 'lucide-react'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { getNotificationsForUserCached } from '@/lib/supabase/notificationOperations'
import { getTrayDetails } from '@/lib/supabase/leadOperations'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { useAuth } from '@/lib/contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import { ro } from 'date-fns/locale'
import { toast } from 'sonner'

interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  data: Record<string, any>
  read: boolean
  created_at: string
  read_at: string | null
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'tray_received':
      return <Package className="h-4 w-4 text-blue-500" />
    case 'tray_passed':
      return <Package className="h-4 w-4 text-orange-500" />
    case 'tray_completed':
      return <Check className="h-4 w-4 text-green-500" />
    case 'tray_urgent':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />
    case 'message_received':
      return <MessageSquare className="h-4 w-4 text-purple-500" />
    default:
      return <Info className="h-4 w-4 text-gray-500" />
  }
}

export function NotificationBell() {
  const { user } = useAuth()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const { permission, hasSubscription, subscribe, checkSubscriptionStatus, isSubscribing, error } = usePushNotifications()

  const handleOpenTrayFromNotification = useCallback(async (trayId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const details = await getTrayDetails(trayId)
    if (!details?.id) {
      toast.error('Tăvița nu mai există (posibil arhivată). Conținutul a fost mutat în arhivă.')
      return
    }
    setOpen(false)
    router.push(`/tehnician/tray/${trayId}`)
  }, [router])

  // Încarcă notificările - NU include supabase în dependențe (e singleton)
  const loadNotifications = useCallback(async () => {
    if (!user?.id) return
    
    try {
      const data = await getNotificationsForUserCached(user.id)
      setNotifications(data || [])
      setUnreadCount(data?.filter(n => !n.read).length || 0)
    } catch (err: any) {
      console.error('[NotificationBell] Exception:', err.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // Încarcă la mount
  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  // Reîmprospătează statusul push când se deschide drawer-ul
  useEffect(() => {
    if (open && permission === 'granted') {
      checkSubscriptionStatus()
    }
  }, [open, permission, checkSubscriptionStatus])

  // Polling doar când tab-ul e vizibil (când e în fundal nu facem 60/min) + refetch la focus
  useEffect(() => {
    if (!user?.id || typeof document === 'undefined') return
    let interval: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (document.visibilityState === 'visible' && !interval) {
        interval = setInterval(loadNotifications, 60_000)
      }
    }
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications()
        startPolling()
      } else {
        stopPolling()
      }
    }
    startPolling()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user?.id, loadNotifications])

  // Real-time subscription - creează o singură dată când user.id se schimbă
  useEffect(() => {
    if (!user?.id) return

    const supabase = supabaseBrowser()
    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        // Adaugă notificarea nouă în listă
        setNotifications(prev => [payload.new as Notification, ...prev])
        setUnreadCount(prev => prev + 1)
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        setNotifications(prev => {
          const next = prev.map(n => n.id === payload.new.id ? payload.new as Notification : n)
          setUnreadCount(next.filter(n => !n.read).length)
          return next
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id]) // ← DOAR user?.id

  // Marchează ca citită
  const markAsRead = async (notificationId: string) => {
    try {
      const supabase = supabaseBrowser()
      await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)
      
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true, read_at: new Date().toISOString() } : n)
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err: any) {
      console.error('[NotificationBell] Error marking as read:', err.message)
    }
  }

  // Marchează toate ca citite
  const markAllAsRead = async () => {
    if (!user?.id) return
    
    try {
      const supabase = supabaseBrowser()
      await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('read', false)
      
      setNotifications(prev => 
        prev.map(n => ({ ...n, read: true, read_at: new Date().toISOString() }))
      )
      setUnreadCount(0)
    } catch (err: any) {
      console.error('[NotificationBell] Error marking all as read:', err.message)
    }
  }

  // Șterge notificare
  const deleteNotification = async (notificationId: string) => {
    try {
      const supabase = supabaseBrowser()
      await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
      
      const notification = notifications.find(n => n.id === notificationId)
      setNotifications(prev => prev.filter(n => n.id !== notificationId))
      if (notification && !notification.read) {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (err: any) {
      console.error('[NotificationBell] Error deleting notification:', err.message)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="relative p-2 hover:bg-sidebar-accent"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="end" 
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Notificări</h3>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs gap-1"
              onClick={markAllAsRead}
            >
              <CheckCheck className="h-3 w-3" />
              Citește toate
            </Button>
          )}
        </div>
        
        {/* Lista de notificări */}
        <ScrollArea className="h-[300px]">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Se încarcă...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nicio notificare</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-3 hover:bg-muted/50 transition-colors cursor-pointer group",
                    !notification.read && "bg-blue-50/50 dark:bg-blue-950/20"
                  )}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm",
                          !notification.read && "font-medium"
                        )}>
                          {notification.title}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNotification(notification.id)
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.message}
                      </p>
                      {notification.data?.tray_id && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs mt-1 text-primary"
                          onClick={(e) => handleOpenTrayFromNotification(notification.data.tray_id, e)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Vezi tăvița
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), { 
                          addSuffix: true, 
                          locale: ro 
                        })}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="shrink-0">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Notificări pe telefon */}
        <div className="p-3 border-t bg-muted/20">
          <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" />
            Notificări pe telefon
          </p>
          {permission === 'granted' && hasSubscription === true ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Active pe acest dispozitiv.</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/push/test', { method: 'POST', credentials: 'include' })
                    const data = await res.json().catch(() => ({}))
                    if (data?.success && data?.sent > 0) {
                      toast.success('Notificare de test trimisă. Verifică pe acest dispozitiv.')
                    } else if (data?.error) {
                      toast.error(data.error)
                    } else {
                      toast.info('Verifică că ai deschis aplicația pe acest dispozitiv și că primești notificări.')
                    }
                  } catch {
                    toast.error('Eroare la trimitere test')
                  }
                }}
              >
                Testează notificare
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Dacă nu primești: VAPID keys pe Vercel; pe iOS adaugă site-ul la ecranul de start.
              </p>
            </div>
          ) : permission === 'granted' && hasSubscription === false ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Permisiunea e activă, dar subscripția nu s-a salvat. Cauza frecventă: cheile VAPID lipsesc pe Vercel.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full h-8 text-xs"
                disabled={isSubscribing}
                onClick={async () => {
                  const ok = await subscribe()
                  if (ok) toast.success('Notificările pe telefon sunt active.')
                  else toast.error(error || 'Eroare la activare')
                }}
              >
                {isSubscribing ? 'Se activează...' : 'Reactivează notificări'}
              </Button>
              {error && error.includes('not configured') && (
                <div className="text-[10px] text-muted-foreground rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2 mt-1">
                  Adaugă <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> și <code>VAPID_PRIVATE_KEY</code> în Vercel → Settings → Environment Variables, apoi redeploy.
                </div>
              )}
            </div>
          ) : permission === 'unsupported' ? (
            <p className="text-xs text-muted-foreground">Nu sunt suportate în acest browser.</p>
          ) : (
            <>
              {(permission === 'denied') && (
                <p className="text-xs text-muted-foreground mb-2">Permisiune blocată. Poți încerca din nou sau activează notificările în setările browser-ului.</p>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="w-full h-8 text-xs"
                disabled={isSubscribing}
                onClick={async () => {
                  const ok = await subscribe()
                  if (ok) toast.success('Notificările pe telefon sunt active.')
                  else if (permission === 'denied') toast.info('Dacă ai blocat notificările, activează-le din setările browser-ului (pictograma lângă adresă).')
                }}
              >
                {isSubscribing ? 'Se activează...' : permission === 'denied' ? 'Cere din nou permisiunea' : 'Activează pe acest dispozitiv'}
              </Button>
              {error && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-destructive">{error}</p>
                  {error.includes('not configured') && (
                    <div className="text-xs text-muted-foreground space-y-1 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2">
                      <p className="font-medium">Adaugă cheile VAPID pe Vercel:</p>
                      <ol className="list-decimal list-inside mt-1 space-y-0.5">
                        <li>Rulează: <code className="text-[10px]">npx web-push generate-vapid-keys</code></li>
                        <li>Vercel → Project → Settings → Environment Variables</li>
                        <li>Adaugă <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> și <code>VAPID_PRIVATE_KEY</code></li>
                        <li>Redeploy aplicația</li>
                      </ol>
                    </div>
                  )}
                  {(error.includes('Service Worker') || error.includes('HTTPS') || error.includes('localhost')) && !error.includes('not configured') && (
                    <p className="text-xs text-muted-foreground">
                      Pe telefon deschide aplicația prin <strong>HTTPS</strong> (ex. domeniul tău pe internet). La adresa prin IP (192.168.x.x) push nu este disponibil.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-2 border-t bg-muted/30">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs"
              onClick={() => setOpen(false)}
            >
              Vezi toate notificările
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

