'use client'

import { ReactNode } from 'react'
import { usePreturiPipeline } from '@/hooks/usePreturiPipeline'
import { useRole, useAuthContext } from '@/lib/contexts/AuthContext'
import { useState, useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

interface PipelineRestrictionsProps {
  pipelineSlug?: string
  isDepartmentPipeline?: boolean
  children: (restrictions: {
    isVanzariPipeline: boolean
    isReparatiiPipeline: boolean
    isReceptiePipeline: boolean
    canAddTrayImages: boolean
    canViewTrayImages: boolean
    isCommercialPipeline: boolean
    canEditUrgentAndSubscription: boolean
    canAddParts: boolean
    isVanzator: boolean
    isTechnician: boolean
    isOwner: boolean
    isAdmin: boolean
  }) => ReactNode
}

/**
 * Componentă pentru gestionarea restricțiilor bazate pe pipeline și rol
 * Oferă acces la toate restricțiile printr-un render prop pattern
 */
export function PipelineRestrictions({
  pipelineSlug,
  isDepartmentPipeline = false,
  children,
}: PipelineRestrictionsProps) {
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

  return (
    <>
      {children({
        ...pipelineChecks,
        isVanzator,
        isTechnician,
        isOwner,
        isAdmin,
      })}
    </>
  )
}

/**
 * Componentă wrapper pentru a afișa conținut doar dacă o restricție este îndeplinită
 */
interface RestrictionGateProps {
  pipelineSlug?: string
  isDepartmentPipeline?: boolean
  allow?: {
    isVanzariPipeline?: boolean
    isReparatiiPipeline?: boolean
    isReceptiePipeline?: boolean
    canAddTrayImages?: boolean
    canViewTrayImages?: boolean
    isCommercialPipeline?: boolean
    canEditUrgentAndSubscription?: boolean
    canAddParts?: boolean
    isVanzator?: boolean
    isTechnician?: boolean
    isOwner?: boolean
    isAdmin?: boolean
  }
  children: ReactNode
}

export function RestrictionGate({
  pipelineSlug,
  isDepartmentPipeline,
  allow,
  children,
}: RestrictionGateProps) {
  return (
    <PipelineRestrictions pipelineSlug={pipelineSlug} isDepartmentPipeline={isDepartmentPipeline}>
      {(restrictions) => {
        if (!allow) return <>{children}</>

        // Verifică dacă toate restricțiile cerute sunt îndeplinite
        const allAllowed = Object.entries(allow).every(([key, value]) => {
          if (value === undefined) return true
          return restrictions[key as keyof typeof restrictions] === value
        })

        if (allAllowed) {
          return <>{children}</>
        }

        return null
      }}
    </PipelineRestrictions>
  )
}



