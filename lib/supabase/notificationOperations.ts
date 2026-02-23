'use client'

import { supabaseBrowser } from './supabaseClient'

const supabase = supabaseBrowser()

// =============================================================================
// TYPES
// =============================================================================

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, any>
  read: boolean
  created_at: string
  read_at?: string | null
}

export type NotificationType = 
  | 'tray_received'       // Tăviță primită pentru procesare
  | 'tray_passed'         // ți-a fost pasată o tăviță de la alt tehnician
  | 'tray_completed'      // Tăviță finalizată de tehnician
  | 'tray_urgent'         // Tăviță urgentă
  | 'service_assigned'    // Serviciu atribuit tehnicianului
  | 'message_received'    // Mesaj nou în conversație
  | 'system'              // Notificare de sistem

export interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, any>
}

// =============================================================================
// CREATE NOTIFICATION
// =============================================================================

/**
 * Creează o notificare pentru un utilizator
 * IMPORTANT: Folosește API route cu service role pentru a ocoli RLS
 */
export async function createNotification(params: CreateNotificationParams): Promise<{ success: boolean; error?: string; notification?: Notification }> {
  try {
    // Folosește API route cu service role pentru a ocoli RLS
    const response = await fetch('/api/notifications/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        data: params.data || {},
      }),
    })

    const result = await response.json()

    if (!result.success) {
      console.error('[createNotification] Error:', result.error)
      return { success: false, error: result.error }
    }

    return { success: true, notification: result.notification }
  } catch (err: any) {
    console.error('[createNotification] Exception:', err.message)
    return { success: false, error: err.message }
  }
}

// =============================================================================
// NOTIFY TECHNICIANS ABOUT NEW TRAYS
// =============================================================================

/**
 * Notifică toți tehnicienii din departamentele relevante despre tăvițele noi
 * @param trays - Lista de tăvițe trimise
 * @param departmentTechnicianMap - Map de department_id -> technician_ids
 */
export async function notifyTechniciansAboutNewTrays(params: {
  trays: Array<{
    id: string
    number: string
    size: string
    pipelineId?: string  // Pipeline-ul în care a fost mutată tăvița
    pipelineName?: string
  }>
  serviceFileId: string
  clientName?: string
}): Promise<{ success: boolean; notifiedCount: number; errors: string[] }> {
  try {
    const errors: string[] = []
    let notifiedCount = 0
    
    // 1. Extrage pipeline_id-urile unice din tăvițe (pipeline-urile în care au fost mutate)
    const pipelineIds = new Set<string>()
    
    for (const tray of params.trays) {
      if (tray.pipelineId) {
        pipelineIds.add(tray.pipelineId)
      }
    }
    
    if (pipelineIds.size === 0) {
      // Dacă nu avem pipeline_id-uri directe, încercăm să le găsim din database
      // (tăvițele ar trebui să fie în pipeline_items după trimitere)
      for (const tray of params.trays) {
        const { data: pipelineItem } = await supabase
          .from('pipeline_items')
          .select('pipeline_id')
          .eq('tray_id', tray.id)
          .limit(1)
          .single()
        
        if (pipelineItem?.pipeline_id) {
          pipelineIds.add(pipelineItem.pipeline_id)
        }
      }
    }
    
    if (pipelineIds.size === 0) {
      console.warn('[notifyTechniciansAboutNewTrays] Nu s-au găsit pipeline-uri pentru tăvițe')
      return { success: true, notifiedCount: 0, errors: ['Nu s-au găsit pipeline-uri pentru tăvițe'] }
    }
    
    // 2. Obține membrii cu acces la aceste pipeline-uri din user_pipeline_permissions
    const { data: permissions, error: permissionsError } = await supabase
      .from('user_pipeline_permissions')
      .select('user_id, pipeline_id')
      .in('pipeline_id', Array.from(pipelineIds))
    
    if (permissionsError) {
      console.error('[notifyTechniciansAboutNewTrays] Eroare la citirea permisiunilor:', permissionsError)
      return { success: false, notifiedCount: 0, errors: [`Eroare permisiuni: ${permissionsError.message}`] }
    }
    
    if (!permissions || permissions.length === 0) {
      console.warn('[notifyTechniciansAboutNewTrays] Nu s-au găsit utilizatori cu permisiuni pentru pipeline-uri:', Array.from(pipelineIds))
      return { success: true, notifiedCount: 0, errors: ['Nu s-au găsit utilizatori cu acces la aceste pipeline-uri'] }
    }
    
    // 3. Grupează utilizatorii după pipeline-uri și creează notificări
    const userPipelineMap = new Map<string, Set<string>>() // userId -> Set<pipelineId>
    const pipelineNamesMap = new Map<string, string>() // pipelineId -> pipelineName
    
    // Obține numele pipeline-urilor pentru mesaje
    const { data: pipelines } = await supabase
      .from('pipelines')
      .select('id, name')
      .in('id', Array.from(pipelineIds))
    
    pipelines?.forEach(p => {
      pipelineNamesMap.set(p.id, p.name)
    })
    
    // Construiește map-ul utilizator -> pipeline-uri
    permissions.forEach(p => {
      if (!userPipelineMap.has(p.user_id)) {
        userPipelineMap.set(p.user_id, new Set())
      }
      userPipelineMap.get(p.user_id)!.add(p.pipeline_id)
    })
    
    // 4. Creează notificări pentru fiecare utilizator
    for (const [userId, userPipelines] of userPipelineMap.entries()) {
      // Determină ce tăvițe sunt relevante pentru acest utilizator
      const relevantTrays: string[] = []
      
      for (const tray of params.trays) {
        // Verifică dacă tăvița este în unul din pipeline-urile utilizatorului
        let trayPipelineId = tray.pipelineId
        
        // Dacă nu avem pipelineId direct, îl căutăm din database
        if (!trayPipelineId) {
          const { data: pipelineItem } = await supabase
            .from('pipeline_items')
            .select('pipeline_id')
            .eq('tray_id', tray.id)
            .limit(1)
            .single()
          
          trayPipelineId = pipelineItem?.pipeline_id
        }
        
        // Dacă tăvița este în unul din pipeline-urile utilizatorului, o includem
        if (trayPipelineId && userPipelines.has(trayPipelineId)) {
          relevantTrays.push(tray.number || tray.id)
        }
      }
      
      if (relevantTrays.length === 0) {
        console.log(`[notifyTechniciansAboutNewTrays] Utilizator ${userId} nu are tăvițe relevante`)
        continue
      }
      
      // Construiește mesajul cu numele pipeline-urilor
      const userPipelineNames = Array.from(userPipelines)
        .map(pId => pipelineNamesMap.get(pId) || pId)
        .filter(Boolean)
        .join(', ')
      
      const result = await createNotification({
        userId,
        type: 'tray_received',
        title: '🔔 Tăvițe noi pentru procesare',
        message: `Ai primit ${relevantTrays.length} tăviț${relevantTrays.length === 1 ? 'ă' : 'e'} noi pentru procesare${params.clientName ? ` de la ${params.clientName}` : ''}: ${relevantTrays.join(', ')}${userPipelineNames ? ` (Pipeline: ${userPipelineNames})` : ''}`,
        data: {
          trayNumbers: relevantTrays,
          serviceFileId: params.serviceFileId,
          clientName: params.clientName,
          pipelineIds: Array.from(userPipelines),
          receivedAt: new Date().toISOString(),
        }
      })
      
      if (result.success) {
        notifiedCount++
        console.log(`[notifyTechniciansAboutNewTrays] Notificare creată pentru user ${userId}: ${relevantTrays.length} tăvițe`)
      } else {
        errors.push(`Eroare notificare user ${userId}: ${result.error}`)
        console.error(`[notifyTechniciansAboutNewTrays] Eroare la crearea notificării pentru ${userId}:`, result.error)
      }
    }
    
    console.log(`[notifyTechniciansAboutNewTrays] Rezultat final: ${notifiedCount} notificări create, ${errors.length} erori`)
    return { success: true, notifiedCount, errors }
  } catch (err: any) {
    console.error('[notifyTechniciansAboutNewTrays] Exception:', err.message, err.stack)
    return { success: false, notifiedCount: 0, errors: [err.message] }
  }
}

// =============================================================================
// NOTIFY RECEPTIE (RECEPTION) ABOUT NEW MESSAGES
// =============================================================================

/**
 * Notifică toți utilizatorii cu acces la pipeline-ul Receptie despre un mesaj nou în conversație.
 * Receptia primește orice notificare referitoare la mesaje.
 */
export async function notifyReceptionAboutNewMessage(params: {
  conversationId: string
  leadId?: string
  serviceFileId?: string
  messagePreview: string
  senderId: string
}): Promise<{ notifiedCount: number; errors: string[] }> {
  const errors: string[] = []
  let notifiedCount = 0
  try {
    const { data: receptiePipeline } = await supabase
      .from('pipelines')
      .select('id')
      .ilike('name', '%receptie%')
      .limit(1)
      .maybeSingle()

    if (!receptiePipeline?.id) {
      return { notifiedCount: 0, errors: ['Pipeline Receptie negăsit'] }
    }

    const { data: permissions, error: permErr } = await supabase
      .from('user_pipeline_permissions')
      .select('user_id')
      .eq('pipeline_id', receptiePipeline.id)

    if (permErr || !permissions?.length) {
      return { notifiedCount: 0, errors: permErr ? [permErr.message] : [] }
    }

    const receptionUserIds = [...new Set((permissions as { user_id: string }[]).map(p => p.user_id))]
    const preview = params.messagePreview.length > 80 ? params.messagePreview.slice(0, 77) + '...' : params.messagePreview

    for (const userId of receptionUserIds) {
      if (userId === params.senderId) continue
      const result = await createNotification({
        userId,
        type: 'message_received',
        title: 'Mesaj nou',
        message: preview ? `Mesaj nou în conversație: ${preview}` : 'Mesaj nou în conversație.',
        data: {
          conversation_id: params.conversationId,
          lead_id: params.leadId,
          service_file_id: params.serviceFileId,
          sender_id: params.senderId,
        },
      })
      if (result.success) notifiedCount++
      else if (result.error) errors.push(result.error)
    }
    return { notifiedCount, errors }
  } catch (err: any) {
    console.error('[notifyReceptionAboutNewMessage] Exception:', err.message)
    return { notifiedCount, errors: [err.message] }
  }
}

// =============================================================================
// GET USER NOTIFICATIONS
// =============================================================================

/**
 * Obține notificările pentru utilizatorul curent
 */
export async function getUserNotifications(params?: {
  unreadOnly?: boolean
  limit?: number
}): Promise<{ notifications: Notification[]; error?: string }> {
  try {
    
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (params?.unreadOnly) {
      query = query.eq('read', false)
    }
    
    if (params?.limit) {
      query = query.limit(params.limit)
    }
    
    const { data, error } = await query
    
    if (error) {
      return { notifications: [], error: error.message }
    }
    
    return { notifications: data || [] }
  } catch (err: any) {
    return { notifications: [], error: err.message }
  }
}

// =============================================================================
// MARK NOTIFICATION AS READ
// =============================================================================

/**
 * Marchează o notificare ca citită
 */
export async function markNotificationAsRead(notificationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Marchează toate notificările ca citite pentru utilizatorul curent
 */
export async function markAllNotificationsAsRead(): Promise<{ success: boolean; error?: string }> {
  try {
    
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('read', false)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// =============================================================================
// CACHE NOTIFICĂRI PENTRU USER (un singur call la load / focus)
// =============================================================================

const NOTIFICATIONS_CACHE_MS = 60 * 1000 // 1 min
let notificationsCache: { userId: string; data: Notification[]; ts: number } | null = null
let notificationsPromise: Promise<Notification[]> | null = null

/**
 * Notificări pentru user cu cache și dedupe request în zbor.
 * Folosit de NotificationBell pentru a evita 4× același request la mount/focus.
 */
export async function getNotificationsForUserCached(userId: string): Promise<Notification[]> {
  const now = Date.now()
  if (notificationsCache && notificationsCache.userId === userId && now - notificationsCache.ts < NOTIFICATIONS_CACHE_MS) {
    return notificationsCache.data
  }
  if (notificationsPromise) return notificationsPromise
  const supabaseClient = supabaseBrowser()
  notificationsPromise = (async () => {
    const { data, error } = await supabaseClient
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return []
    const out = (data || []) as Notification[]
    notificationsCache = { userId, data: out, ts: Date.now() }
    return out
  })()
  const out = await notificationsPromise
  notificationsPromise = null
  return out
}

export function invalidateNotificationsCache() {
  notificationsCache = null
  notificationsPromise = null
}

// =============================================================================
// GET UNREAD COUNT
// =============================================================================

/**
 * Obține numărul de notificări necitite
 */
export async function getUnreadNotificationCount(): Promise<{ count: number; error?: string }> {
  try {
    
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
    
    if (error) {
      return { count: 0, error: error.message }
    }
    
    return { count: count || 0 }
  } catch (err: any) {
    return { count: 0, error: err.message }
  }
}

