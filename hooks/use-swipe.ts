'use client'

import { useState, useRef, useEffect } from 'react'

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number // Minimum distance for swipe (px)
  velocity?: number // Minimum velocity for swipe (px/ms)
}

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  velocity = 0.3,
}: UseSwipeOptions = {}) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null)
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number; time: number } | null>(null)

  const minSwipeDistance = threshold

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
      time: Date.now(),
    })
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
      time: Date.now(),
    })
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distanceX = touchStart.x - touchEnd.x
    const distanceY = touchStart.y - touchEnd.y
    const distance = Math.abs(distanceX)
    const timeDiff = touchEnd.time - touchStart.time
    const velocityValue = distance / timeDiff

    // Verifică dacă swipe-ul este orizontal (nu vertical)
    const isHorizontalSwipe = Math.abs(distanceX) > Math.abs(distanceY)

    if (isHorizontalSwipe && distance > minSwipeDistance && velocityValue > velocity) {
      if (distanceX > 0) {
        // Swipe stânga
        onSwipeRight?.()
      } else {
        // Swipe dreapta
        onSwipeLeft?.()
      }
    }

    setTouchStart(null)
    setTouchEnd(null)
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}

