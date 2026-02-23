'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthContext } from '@/lib/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

export interface UserPreferences {
  // Customizare stage-uri
  stageOrder?: Record<string, string[]> // pipelineSlug -> ordered stage names

  // Tema și culori
  theme?: 'light' | 'dark' | 'system'
  primaryColor?: string
  textColor?: string
  backgroundColor?: string

  // Alte preferințe
  compactMode?: boolean
}

const STORAGE_KEY = 'crm_user_preferences'
const SAVE_DEBOUNCE_MS = 500

function loadFromLocalStorage(): UserPreferences {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function saveToLocalStorage(prefs: UserPreferences) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error('Error saving preferences to localStorage:', error)
  }
}

export function useUserPreferences() {
  const { user } = useAuthContext()
  const [preferences, setPreferences] = useState<UserPreferences>(loadFromLocalStorage)
  const [loading, setLoading] = useState(true)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Încarcă din Supabase când user este autentificat
  useEffect(() => {
    if (!user?.id) {
      setPreferences(loadFromLocalStorage())
      setLoading(false)
      return
    }

    let cancelled = false
    const supabase = supabaseBrowser()

    async function load() {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        console.warn('Error loading user preferences:', error)
        setPreferences(loadFromLocalStorage())
        setLoading(false)
        return
      }

      const dbPrefs = (data?.preferences as UserPreferences) || {}
      const localPrefs = loadFromLocalStorage()

      // Migrare: dacă DB e gol dar localStorage are date, folosim local și salvăm în DB
      const merged: UserPreferences =
        Object.keys(dbPrefs).length > 0
          ? dbPrefs
          : Object.keys(localPrefs).length > 0
            ? localPrefs
            : {}

      if (Object.keys(merged).length > 0) {
        setPreferences(merged)
        saveToLocalStorage(merged)
        // Salvează în DB dacă am migrat din localStorage
        if (Object.keys(dbPrefs).length === 0 && Object.keys(localPrefs).length > 0) {
          supabase.from('user_preferences').upsert(
            { user_id: user.id, preferences: merged, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          )
        }
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const persistToSupabase = useCallback(
    (prefs: UserPreferences) => {
      if (!user?.id) return

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      saveTimeoutRef.current = setTimeout(async () => {
        saveTimeoutRef.current = null
        const supabase = supabaseBrowser()
        await supabase.from('user_preferences').upsert(
          {
            user_id: user.id,
            preferences: prefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      }, SAVE_DEBOUNCE_MS)
    },
    [user?.id]
  )

  const updatePreferences = useCallback(
    (updates: Partial<UserPreferences>) => {
      setPreferences(prev => {
        const newPrefs = { ...prev, ...updates }
        saveToLocalStorage(newPrefs)
        persistToSupabase(newPrefs)
        return newPrefs
      })
    },
    [persistToSupabase]
  )

  const getStageOrder = useCallback((pipelineSlug: string, defaultStages: string[]): string[] => {
    if (!preferences.stageOrder?.[pipelineSlug]) {
      return defaultStages
    }

    const customOrder = preferences.stageOrder[pipelineSlug]
    const defaultSet = new Set(defaultStages)
    const ordered = customOrder.filter(stage => defaultSet.has(stage))
    defaultStages.forEach(stage => {
      if (!ordered.includes(stage)) {
        ordered.push(stage)
      }
    })
    return ordered
  }, [preferences.stageOrder])

  const setStageOrder = useCallback(
    (pipelineSlug: string, orderedStages: string[]) => {
      updatePreferences({
        stageOrder: {
          ...preferences.stageOrder,
          [pipelineSlug]: orderedStages,
        },
      })
    },
    [preferences.stageOrder, updatePreferences]
  )

  return {
    preferences,
    loading,
    updatePreferences,
    getStageOrder,
    setStageOrder,
  }
}
