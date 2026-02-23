/* Service Worker pentru notificări Web Push de la CRM */
self.addEventListener('push', function (event) {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'CRM', body: event.data.text() || 'Notificare nouă' }
  }
  const title = payload.title || 'CRM'
  const body = payload.body || 'Notificare nouă'
  const url = payload.url || '/'
  const tag = payload.tag || 'crm-notification'
  const origin = self.location?.origin || ''
  const iconUrl = (payload.icon && payload.icon.startsWith('http')) ? payload.icon : (origin ? new URL('/logo.png', origin).href : '/logo.png')
  const badgeUrl = (payload.badge && payload.badge.startsWith('http')) ? payload.badge : iconUrl
  const options = {
    body,
    tag,
    icon: iconUrl,
    badge: badgeUrl,
    data: { url, ...payload },
    requireInteraction: false,
    vibrate: [200, 100, 200],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  let url = event.notification?.data?.url || '/'
  if (url.startsWith('/')) {
    url = new URL(url, self.location.origin).href
  }
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
