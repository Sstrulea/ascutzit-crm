'use client'

import { useState, useCallback, useEffect } from 'react'

const SW_URL = '/sw-push.js'

export type PushPermissionState = 'default' | 'prompt' | 'granted' | 'denied' | 'unsupported'

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermissionState>('default')
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkPermission = useCallback(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported')
      return 'unsupported'
    }
    const p = Notification.permission as PushPermissionState
    setPermission(p)
    return p
  }, [])

  /** Verifică dacă ACEST dispozitiv are subscripție push activă (PushSubscription în SW).
   * Push-urile merg la endpoint-uri per-dispozitiv – trebuie să fim subscris pe fiecare device. */
  const checkSubscriptionStatus = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
        || await navigator.serviceWorker.getRegistration()
      if (!reg?.pushManager) {
        setHasSubscription(false)
        return
      }
      const sub = await reg.pushManager.getSubscription()
      setHasSubscription(!!sub)
    } catch {
      setHasSubscription(false)
    }
  }, [])

  useEffect(() => {
    checkPermission()
  }, [checkPermission])

  useEffect(() => {
    if (permission === 'granted') {
      checkSubscriptionStatus()
    } else {
      setHasSubscription(null)
    }
  }, [permission, checkSubscriptionStatus])

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false
    setError(null)
    setIsSubscribing(true)
    try {
      if (!('Notification' in window)) {
        setError('Browser-ul nu suportă notificări')
        setPermission('unsupported')
        return false
      }
      if (!('serviceWorker' in navigator)) {
        setError('Service Worker nu este suportat (folosește HTTPS sau localhost)')
        return false
      }
      const isSecure = typeof window !== 'undefined' && window.isSecureContext
      if (!isSecure) {
        setError('Notificările push necesită HTTPS sau localhost. Pe IP (ex. 192.168.x.x) nu funcționează.')
        return false
      }

      // getRegistration() fără arg sau cu scope '/' – mai fiabil pe mobile
      let reg = await navigator.serviceWorker.getRegistration('/')
      if (!reg) reg = await navigator.serviceWorker.getRegistration()
      if (!reg) {
        reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' })
        await reg.update()
        await new Promise<void>((resolve) => {
          if (reg?.active) return resolve()
          navigator.serviceWorker.ready.then(() => resolve())
        })
      }

      let perm = Notification.permission
      if (perm === 'default') {
        perm = await Notification.requestPermission()
      }
      setPermission(perm as PushPermissionState)
      if (perm !== 'granted') {
        setError(perm === 'denied' ? 'Notificările au fost blocate' : 'Permisiune refuzată')
        return false
      }

      const keyRes = await fetch('/api/push/vapid-public')
      if (!keyRes.ok) {
        const j = await keyRes.json().catch(() => ({}))
        setError(j?.error ?? 'Cheie push indisponibilă')
        return false
      }
      const { publicKey } = await keyRes.json()
      if (!publicKey) {
        setError('Cheie push lipsă')
        return false
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      const subRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      const result = await subRes.json()
      if (!result.success) {
        setError(result.error ?? 'Eroare la înregistrare')
        return false
      }
      await checkSubscriptionStatus()
      return true
    } catch (e: any) {
      setError(e?.message ?? 'Eroare la activare')
      return false
    } finally {
      setIsSubscribing(false)
    }
  }, [checkSubscriptionStatus])

  return { permission, hasSubscription, checkPermission, checkSubscriptionStatus, subscribe, isSubscribing, error }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i)
  return output
}
