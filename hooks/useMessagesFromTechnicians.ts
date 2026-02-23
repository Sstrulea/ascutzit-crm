import { useState, useEffect, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface TechnicianMessage {
  id: string
  conversation_id: string
  sender_id: string
  sender_name?: string
  content: string
  message_type: string
  created_at: string
  lead_id?: string
  lead_name?: string
  service_file_id?: string
  service_file_number?: string
  tray_id?: string
  tray_number?: string
}

interface UseMessagesFromTechniciansOptions {
  enabled?: boolean
  limit?: number
  onlyUnread?: boolean
}

export function useMessagesFromTechnicians(
  options: UseMessagesFromTechniciansOptions = {}
) {
  const { enabled = true, limit = 50, onlyUnread = false } = options
  const [messages, setMessages] = useState<TechnicianMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = supabaseBrowser()
  let channel: RealtimeChannel | null = null

  // Încarcă mesajele inițiale
  const loadMessages = useCallback(async () => {
    if (!enabled) return
    
    try {
      setLoading(true)
      setError(null)

      // Query pentru a obține mesajele cel mai recent trimise
      let query = supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          message_type,
          created_at,
          conversations:conversation_id (
            lead_id,
            tray_id,
            service_file_id,
            leads:lead_id (
              name
            ),
            service_files:service_file_id (
              number
            ),
            trays:tray_id (
              number
            )
          )
        `)
        .eq('message_type', 'technician') // Doar mesaje de la tehnicieni
        .order('created_at', { ascending: false })
        .limit(limit)

      const { data, error: queryError } = await query

      if (queryError) throw queryError

      // Transformă datele pentru a include lead_id, tray_id, și servicefile info
      const transformedMessages: TechnicianMessage[] = (data || []).map((msg: any) => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        sender_name: msg.sender_id?.slice(0, 8) || 'Tehnician',  // Fallback: primii 8 caractere din UUID
        content: msg.content,
        message_type: msg.message_type,
        created_at: msg.created_at,
        lead_id: msg.conversations?.lead_id,
        lead_name: msg.conversations?.leads?.name || undefined,
        service_file_id: msg.conversations?.service_file_id,
        service_file_number: msg.conversations?.service_files?.number ? `#${msg.conversations.service_files.number}` : undefined,
        tray_id: msg.conversations?.tray_id,
        tray_number: msg.conversations?.trays?.number ? `#${msg.conversations.trays.number}` : undefined,
      }))

      // Revers ordinea (cele mai recente în față)
      setMessages(transformedMessages.reverse())
    } catch (err) {
      console.error('Error loading messages:', err)
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [enabled, supabase, limit])

  // Subscribe la mesajele noi în timp real
  useEffect(() => {
    if (!enabled) return

    loadMessages()

    // Subscribe la mesajele noi
    channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `message_type=eq.technician`,
        },
        (payload) => {
          // Adaugă mesajul nou la început
          const newMessage: TechnicianMessage = {
            id: payload.new.id,
            conversation_id: payload.new.conversation_id,
            sender_id: payload.new.sender_id,
            content: payload.new.content,
            message_type: payload.new.message_type,
            created_at: payload.new.created_at,
          }
          
          setMessages((prev) => [newMessage, ...prev])
        }
      )
      .subscribe()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [enabled, loadMessages, supabase])

  return { messages, loading, error, refresh: loadMessages }
}
