/**
 * Event Stacking Logic
 * Groups similar events together to reduce clutter in the history timeline.
 */

import type { LeadEvent } from "../../components/leads/lead-history"

export interface StackedEvent {
  /** The representative event (usually the most recent) */
  event: LeadEvent
  /** Number of times this event type occurred */
  count: number
  /** All events in this stack (for expandable details) */
  events: LeadEvent[]
  /** Unique key for this stack */
  stackKey: string
}

/**
 * Generates a stack key for grouping similar events.
 * Events are considered similar if they have:
 * - Same event_type
 * - Same actor_id
 * - Same message content
 * - Same payload structure (for certain event types)
 */
export function generateStackKey(event: LeadEvent): string {
  const { event_type, actor_id, message, payload } = event
  
  // Normalize message: lowercase, remove extra whitespace
  const normalizedMessage = message.toLowerCase().trim().replace(/\s+/g, ' ')
  
  // For certain event types, include payload in the key
  let payloadKey = ''
  if (payload && typeof payload === 'object') {
    // For view events, include what was viewed
    if (event_type.includes('view') || event_type.includes('opened')) {
      const entityId = (payload as any)?.entity_id || (payload as any)?.item_id || ''
      payloadKey = `_${entityId}`
    }
    // For field updates, include the field name
    else if (event_type.includes('field_updated')) {
      const field = (payload as any)?.field || (payload as any)?.changes?.[0]?.field || ''
      payloadKey = `_${field}`
    }
  }
  
  return `${event_type}_${actor_id}_${normalizedMessage}${payloadKey}`
}

/**
 * Groups events into stacks based on similarity.
 * Events are grouped if they have the same stack key.
 * For true content-based stacking, we remove time window limitations
 * to maximize stacking of events with identical content.
 * 
 * @param events - The events to group
 * @param maxStackAge - Maximum time difference (in ms) to consider events for stacking (default: 24 hours for backward compatibility)
 */
export function stackEvents(
  events: LeadEvent[],
  maxStackAge: number = 24 * 60 * 60 * 1000 // 24 hours default for backward compatibility
): StackedEvent[] {
  const stacks: Map<string, StackedEvent> = new Map()

  events.forEach((event) => {
    const stackKey = generateStackKey(event)
    const existing = stacks.get(stackKey)

    if (existing) {
      // For true content-based stacking, we add to existing stack regardless of time
      // Only check time window if maxStackAge is explicitly set (for backward compatibility)
      const timeDiff = Math.abs(
        new Date(event.created_at).getTime() - 
        new Date(existing.event.created_at).getTime()
      )

      if (maxStackAge === 0 || timeDiff <= maxStackAge) {
        // Add to existing stack
        existing.count += 1
        existing.events.push(event)
        // Update representative event to most recent
        const sorted = existing.events.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        existing.event = sorted[0]
      } else {
        // Create new stack (too old, but this should rarely happen with maxStackAge = 0)
        stacks.set(stackKey, {
          event,
          count: 1,
          events: [event],
          stackKey,
        })
      }
    } else {
      // Create new stack
      stacks.set(stackKey, {
        event,
        count: 1,
        events: [event],
        stackKey,
      })
    }
  })

  // Convert to array and sort by most recent
  return Array.from(stacks.values()).sort((a, b) =>
    new Date(b.event.created_at).getTime() - new Date(a.event.created_at).getTime()
  )
}

/**
 * Determines if an event type should be stacked.
 * Some event types should never be stacked (e.g., important one-time actions).
 */
export function shouldStackEvent(eventType: string): boolean {
  const neverStackTypes = [
    'tray_item_added',
    'tray_item_updated',
    'tray_item_deleted',
    'service_sheet_save',
    'service_file_created',
    'instrument_moved',
    'tray_passed',
    'tray_created',
    'tray_stage_changed',
    'tray_moved_to_pipeline',
    'tray_items_split_to_technician',
    'tray_items_merged_to_technician',
    'tray_split_to_real',
    'lead_field_updated',
    'service_file_field_updated',
  ]

  return !neverStackTypes.includes(eventType)
}

/**
 * Enhanced stacking that only stacks eligible event types.
 * Uses 0 maxStackAge by default to maximize stacking of events with identical content.
 */
export function stackEventsSmart(
  events: LeadEvent[],
  maxStackAge: number = 0 // 0 means no time limit - maximize stacking
): StackedEvent[] {
  // Separate stackable and non-stackable events
  const stackable: LeadEvent[] = []
  const nonStackable: LeadEvent[] = []

  events.forEach((event) => {
    if (shouldStackEvent(event.event_type)) {
      stackable.push(event)
    } else {
      nonStackable.push(event)
    }
  })

  // Stack the stackable events with maximized stacking (no time limit)
  const stacked = stackEvents(stackable, maxStackAge)

  // Convert non-stackable events to stacks with count 1
  const nonStackedAsStacks: StackedEvent[] = nonStackable.map((event) => ({
    event,
    count: 1,
    events: [event],
    stackKey: `non_stack_${event.id}`,
  }))

  // Combine and sort by most recent
  return [...stacked, ...nonStackedAsStacks].sort((a, b) =>
    new Date(b.event.created_at).getTime() - new Date(a.event.created_at).getTime()
  )
}
