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
  | 'tray_received'       // Tray received for processing
  | 'tray_passed'         // A tray was passed to you from another technician
  | 'tray_completed'      // Tray completed by technician
  | 'tray_urgent'         // Urgent tray
  | 'service_assigned'    // Service assigned to technician
  | 'message_received'    // New message in conversation
  | 'system'              // System notification

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
 * Creates a notification for a user
 * IMPORTANT: Uses API route with service role to bypass RLS
 */
export async function createNotification(params: CreateNotificationParams): Promise<{ success: boolean; error?: string; notification?: Notification }> {
  try {
    // Use API route with service role to bypass RLS
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
 * Notifies all technicians in relevant departments about new trays
 * @param trays - List of sent trays
 * @param departmentTechnicianMap - Map of department_id -> technician_ids
 */
export async function notifyTechniciansAboutNewTrays(params: {
  trays: Array<{
    id: string
    number: string
    pipelineId?: string  // Pipeline where tray was moved
    pipelineName?: string
  }>
  serviceFileId: string
  clientName?: string
}): Promise<{ success: boolean; notifiedCount: number; errors: string[] }> {
  try {
    const errors: string[] = []
    let notifiedCount = 0
    
    // 1. Extract unique pipeline_ids from trays (pipelines where they were moved)
    const pipelineIds = new Set<string>()
    
    for (const tray of params.trays) {
      if (tray.pipelineId) {
        pipelineIds.add(tray.pipelineId)
      }
    }
    
    if (pipelineIds.size === 0) {
      // If we don't have direct pipeline_ids, try to find them from database
      // (trays should be in pipeline_items after sending)
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
      console.warn('[notifyTechniciansAboutNewTrays] No pipelines found for trays')
      return { success: true, notifiedCount: 0, errors: ['No pipelines found for trays'] }
    }
    
    // 2. Get members with access to these pipelines from user_pipeline_permissions
    const { data: permissions, error: permissionsError } = await supabase
      .from('user_pipeline_permissions')
      .select('user_id, pipeline_id')
      .in('pipeline_id', Array.from(pipelineIds))
    
    if (permissionsError) {
      console.error('[notifyTechniciansAboutNewTrays] Error reading permissions:', permissionsError)
      return { success: false, notifiedCount: 0, errors: [`Permissions error: ${permissionsError.message}`] }
    }
    
    if (!permissions || permissions.length === 0) {
      console.warn('[notifyTechniciansAboutNewTrays] No users with permissions found for pipelines:', Array.from(pipelineIds))
      return { success: true, notifiedCount: 0, errors: ['No users with access to these pipelines'] }
    }
    
    // 3. Group users by pipelines and create notifications
    const userPipelineMap = new Map<string, Set<string>>() // userId -> Set<pipelineId>
    const pipelineNamesMap = new Map<string, string>() // pipelineId -> pipelineName
    
    // Get pipeline names for messages
    const { data: pipelines } = await supabase
      .from('pipelines')
      .select('id, name')
      .in('id', Array.from(pipelineIds))
    
    pipelines?.forEach((p: { id: string; name: string }) => {
      pipelineNamesMap.set(p.id, p.name)
    })
    
    // Build user -> pipeline map
    permissions.forEach((p: { user_id: string; pipeline_id: string }) => {
      if (!userPipelineMap.has(p.user_id)) {
        userPipelineMap.set(p.user_id, new Set())
      }
      userPipelineMap.get(p.user_id)!.add(p.pipeline_id)
    })
    
    // 4. Create notifications for each user
    for (const [userId, userPipelines] of userPipelineMap.entries()) {
      // Determine which trays are relevant for this user
      const relevantTrays: string[] = []
      
      for (const tray of params.trays) {
        // Check if tray is in one of user's pipelines
        let trayPipelineId = tray.pipelineId
        
        // If we don't have pipelineId directly, search it from database
        if (!trayPipelineId) {
          const { data: pipelineItem } = await supabase
            .from('pipeline_items')
            .select('pipeline_id')
            .eq('tray_id', tray.id)
            .limit(1)
            .single()
          
          trayPipelineId = pipelineItem?.pipeline_id
        }
        
        // If tray is in one of user's pipelines, include it
        if (trayPipelineId && userPipelines.has(trayPipelineId)) {
          relevantTrays.push(tray.number || tray.id)
        }
      }
      
      if (relevantTrays.length === 0) {
        console.log(`[notifyTechniciansAboutNewTrays] User ${userId} has no relevant trays`)
        continue
      }
      
      // Build message with pipeline names
      const userPipelineNames = Array.from(userPipelines)
        .map(pId => pipelineNamesMap.get(pId) || pId)
        .filter(Boolean)
        .join(', ')
      
      const result = await createNotification({
        userId,
        type: 'tray_received',
        title: '🔔 New trays for processing',
        message: `You received ${relevantTrays.length} new tray${relevantTrays.length === 1 ? '' : 's'} for processing${params.clientName ? ` from ${params.clientName}` : ''}: ${relevantTrays.join(', ')}${userPipelineNames ? ` (Pipeline: ${userPipelineNames})` : ''}`,
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
        console.log(`[notifyTechniciansAboutNewTrays] Notification created for user ${userId}: ${relevantTrays.length} trays`)
      } else {
        errors.push(`Notification error user ${userId}: ${result.error}`)
        console.error(`[notifyTechniciansAboutNewTrays] Error creating notification for ${userId}:`, result.error)
      }
    }
    
    console.log(`[notifyTechniciansAboutNewTrays] Final result: ${notifiedCount} notifications created, ${errors.length} errors`)
    return { success: true, notifiedCount, errors }
  } catch (err: any) {
    console.error('[notifyTechniciansAboutNewTrays] Exception:', err.message, err.stack)
    return { success: false, notifiedCount: 0, errors: [err.message] }
  }
}

// =============================================================================
// NOTIFY RECEPTION (RECEPTIE) ABOUT NEW MESSAGES
// =============================================================================

/**
 * Notifies all users with access to Reception pipeline about a new message in conversation.
 * Reception receives any notification regarding messages.
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
      return { notifiedCount: 0, errors: ['Reception pipeline not found'] }
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
        title: 'New message',
        message: preview ? `New message in conversation: ${preview}` : 'New message in conversation.',
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
 * Gets notifications for current user
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
 * Marks a notification as read
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
 * Marks all notifications as read for current user
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
// NOTIFICATION CACHE FOR USER (single call on load / focus)
// =============================================================================

const NOTIFICATIONS_CACHE_MS = 60 * 1000 // 1 min
let notificationsCache: { userId: string; data: Notification[]; ts: number } | null = null
let notificationsPromise: Promise<Notification[]> | null = null

/**
 * User notifications with cache and dedupe in-flight requests.
 * Used by NotificationBell to avoid 4× same request on mount/focus.
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
 * Gets count of unread notifications
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