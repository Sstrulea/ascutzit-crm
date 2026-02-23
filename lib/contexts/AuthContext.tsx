'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'

// ===========================
// TYPES
// ===========================

export type UserRole = 'owner' | 'admin' | 'member'

export interface UserProfile {
  user_id: string
  name: string | null
  email: string | null
  role: UserRole
  created_at?: string
  updated_at?: string
}

export interface AuthContextType {
  // Core data
  user: User | null
  profile: UserProfile | null
  role: UserRole | null
  permissions: string[] // Pipeline IDs user has access to
  
  // Loading states
  loading: boolean
  error: string | null
  
  // Methods
  hasAccess: (pipelineId: string) => boolean
  canManageUsers: () => boolean
  canManagePipelines: () => boolean
  isOwner: () => boolean
  isAdmin: () => boolean
  isMember: () => boolean
  refreshProfile: () => Promise<void>
}

// ===========================
// CONTEXT
// ===========================

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ===========================
// PROVIDER
// ===========================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = supabaseBrowser()
  
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // ===========================
  // LOAD USER & PROFILE
  // ===========================
  
  const loadUserAndProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const supabase = supabaseBrowser()
      
      // 1. Get authenticated user
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      
      if (authError) {
        console.warn('Auth error:', authError)
        setUser(null)
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }
      
      if (!authUser) {
        setUser(null)
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }
      
      setUser(authUser)
      
      // 2. Get profile from app_members
      const { data: profileData, error: profileError } = await supabase
        .from('app_members')
        .select('user_id, name, role, created_at, updated_at')
        .eq('user_id', authUser.id)
        .maybeSingle()
      
      if (profileError) {
        console.error('Error loading profile from app_members:', profileError)
        // Nu setăm error, lăsăm profile null pentru a permite navigarea
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }
      
      if (!profileData) {
        console.warn('User not found in app_members, user_id:', authUser.id)
        // Nu setăm error, lăsăm profile null
        setProfile(null)
        setPermissions([])
        setLoading(false)
        return
      }
      
      setProfile(profileData as UserProfile)
      
      // 3. Load permissions (only for members)
      if (profileData.role === 'member') {
        await loadPermissions(authUser.id)
      } else {
        // Owners and admins have access to all pipelines
        setPermissions([]) // Empty means "all access" for owner/admin
      }
      
      setLoading(false)
      
    } catch (err: any) {
      console.error('Error in loadUserAndProfile:', err)
      setError(err.message || 'Unknown error')
      setLoading(false)
    }
  }, []) // ← FĂRĂ supabase - e singleton
  
  // ===========================
  // LOAD PERMISSIONS
  // ===========================
  
  const loadPermissions = async (userId: string) => {
    try {
      const supabase = supabaseBrowser()
      const { data, error } = await supabase
        .from('user_pipeline_permissions')
        .select('pipeline_id')
        .eq('user_id', userId)
      
      if (error) {
        console.error('Error loading permissions:', error)
        return
      }
      
      const pipelineIds = (data || []).map(p => p.pipeline_id)
      setPermissions(pipelineIds)
    } catch (err) {
      console.error('Error in loadPermissions:', err)
    }
  }
  
  // ===========================
  // INIT & AUTH STATE LISTENER
  // ===========================
  
  useEffect(() => {
    // Initial load
    loadUserAndProfile()
    
    // Listen to auth state changes (Faza 6: nu re-apela la TOKEN_REFRESHED – profile/permissions nu se schimbă)
    const supabase = supabaseBrowser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        // Doar actualizează user din session, fără getUser() + app_members + permissions
        setUser(session?.user ?? null)
        return
      }
      if (session?.user) {
        loadUserAndProfile()
      } else {
        setUser(null)
        setProfile(null)
        setPermissions([])
        setLoading(false)
      }
    })
    
    return () => {
      subscription.unsubscribe()
    }
  }, [loadUserAndProfile]) // ← FĂRĂ supabase - e singleton
  
  // ===========================
  // PERMISSION CHECKS
  // ===========================
  
  const hasAccess = useCallback((pipelineId: string): boolean => {
    if (!profile) return false
    
    // Owners and admins have access to all pipelines
    if (profile.role === 'owner' || profile.role === 'admin') {
      return true
    }
    
    // Members need explicit permission
    return permissions.includes(pipelineId)
  }, [profile, permissions])
  
  const canManageUsers = useCallback((): boolean => {
    return profile?.role === 'owner'
  }, [profile])
  
  const canManagePipelines = useCallback((): boolean => {
    return profile?.role === 'owner'
  }, [profile])
  
  const isOwner = useCallback((): boolean => {
    return profile?.role === 'owner'
  }, [profile])
  
  const isAdmin = useCallback((): boolean => {
    return profile?.role === 'admin'
  }, [profile])
  
  const isMember = useCallback((): boolean => {
    return profile?.role === 'member'
  }, [profile])
  
  const refreshProfile = useCallback(async () => {
    await loadUserAndProfile()
  }, [loadUserAndProfile])
  
  // ===========================
  // CONTEXT VALUE
  // ===========================
  
  const value: AuthContextType = {
    user,
    profile,
    role: profile?.role || null,
    permissions,
    loading,
    error,
    hasAccess,
    canManageUsers,
    canManagePipelines,
    isOwner,
    isAdmin,
    isMember,
    refreshProfile,
  }
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ===========================
// HOOKS
// ===========================

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuthContext must be used within AuthProvider')
  }
  return context
}

// Convenience hooks
export function useUser() {
  const { user } = useAuthContext()
  return user
}

export function useProfile() {
  const { profile } = useAuthContext()
  return profile
}

/**
 * useRole hook - provides role information with loading state
 * This is the single source of truth for role data.
 * 
 * @returns {object} Role state object
 * - role: 'owner' | 'admin' | 'member' | null
 * - isOwner: boolean
 * - isAdmin: boolean  
 * - isMember: boolean
 * - loading: boolean - true while auth/profile is loading
 * - error: string | null - error message if any
 */
export function useRole() {
  const { role, isOwner, isAdmin, isMember, loading, error } = useAuthContext()
  return { 
    role, 
    isOwner: isOwner(), 
    isAdmin: isAdmin(), 
    isMember: isMember(),
    loading,
    error
  }
}

/**
 * useAuth hook - provides basic auth state
 * This is the single source of truth for user authentication.
 * 
 * @returns {object} Auth state object
 * - user: User | null - Supabase user object
 * - loading: boolean - true while auth is loading
 */
export function useAuth() {
  const { user, loading } = useAuthContext()
  return { user, loading }
}

export function usePermissions() {
  const { hasAccess, canManageUsers, canManagePipelines, permissions } = useAuthContext()
  return { hasAccess, canManageUsers, canManagePipelines, permissions }
}



