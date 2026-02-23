'use client'

import { useEffect, useRef } from 'react'
import { initEventTracking, setTrackingHandler, type TrackingEvent } from '@/lib/tracking/eventTracker'

type TrackingProviderProps = {
  /** Handler custom – primește toate evenimentele. Implicit: console în dev */
  onEvent?: (event: TrackingEvent) => void
  /** Trimite evenimentele la un API endpoint (ex: /api/tracking) */
  sendToApi?: string | false
}

const defaultHandler = (event: TrackingEvent) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Tracking]', event)
  }
}

const BATCH_INTERVAL_MS = 5000
const BATCH_MAX_SIZE = 15

export function TrackingProvider({ onEvent, sendToApi }: TrackingProviderProps) {
  const bufferRef = useRef<TrackingEvent[]>([])
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const flush = () => {
      if (bufferRef.current.length === 0 || !sendToApi) return
      const batch = [...bufferRef.current]
      bufferRef.current = []
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      fetch(sendToApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: true, events: batch }),
      }).catch(() => {})
    }

    const scheduleFlush = () => {
      if (flushTimeoutRef.current) return
      flushTimeoutRef.current = setTimeout(flush, BATCH_INTERVAL_MS)
    }

    const handler: (e: TrackingEvent) => void = (event) => {
      onEvent?.(event)
      defaultHandler(event)
      if (sendToApi) {
        bufferRef.current.push(event)
        if (bufferRef.current.length >= BATCH_MAX_SIZE) {
          flush()
        } else {
          scheduleFlush()
        }
      }
    }

    setTrackingHandler(handler)
    const cleanup = initEventTracking()
    return () => {
      setTrackingHandler(null)
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
      }
      flush()
      cleanup?.()
    }
  }, [onEvent, sendToApi])

  return null
}
