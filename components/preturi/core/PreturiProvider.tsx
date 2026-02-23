'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { usePreturiPipeline } from '@/hooks/usePreturiPipeline'
import { useRole, useAuthContext } from '@/lib/contexts/AuthContext'
import { useState, useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

interface PreturiContextValue {
  // Pipeline checks
  isVanzariPipeline: boolean
  isReparatiiPipeline: boolean
  isReceptiePipeline: boolean
  canAddTrayImages: boolean
  canViewTrayImages: boolean
  isCommercialPipeline: boolean
  canEditUrgentAndSubscription: boolean
  canAddParts: boolean
  
  // Role checks
  isVanzator: boolean
  isTechnician: boolean
  isOwner: boolean
  isAdmin: boolean
  role: string | null
}

const PreturiContext = createContext<PreturiContextValue | undefined>(undefined)

interface PreturiProviderProps {
  pipelineSlug?: string
  isDepartmentPipeline?: boolean
  children: ReactNode
}

/**
 * Provider pentru contextul Preturi
 * Oferă acces la toate restricțiile și verificările de pipeline/rol
 */
export function PreturiProvider({
  pipelineSlug,
  isDepartmentPipeline = false,
  children,
}: PreturiProviderProps) {
  const pipelineChecks = usePreturiPipeline(pipelineSlug, isDepartmentPipeline)
  const { role } = useRole()
  const { user } = useAuthContext()
  const [isTechnician, setIsTechnician] = useState(false)

  // Verifică dacă utilizatorul este în app_members (fără getUser – folosim user din context)
  useEffect(() => {
    if (!user?.id) {
      setIsTechnician(false)
      return
    }
    const supabase = supabaseBrowser()
    supabase
      .from('app_members')
      .select('id')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => setIsTechnician(!!data))
      .catch(() => setIsTechnician(false))
  }, [user?.id])

  const isVanzator = !isTechnician && (role === 'admin' || role === 'owner' || role === 'member')
  const isOwner = role === 'owner'
  const isAdmin = role === 'admin' || role === 'owner'

  const value: PreturiContextValue = {
    ...pipelineChecks,
    isVanzator,
    isTechnician,
    isOwner,
    isAdmin,
    role: role || null,
  }

  return (
    <PreturiContext.Provider value={value}>
      {children}
    </PreturiContext.Provider>
  )
}

/**
 * Hook pentru a accesa contextul Preturi
 */
export function usePreturiContext() {
  const context = useContext(PreturiContext)
  if (context === undefined) {
    throw new Error('usePreturiContext must be used within a PreturiProvider')
  }
  return context
}



