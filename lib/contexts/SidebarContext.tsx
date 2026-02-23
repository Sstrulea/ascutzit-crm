'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const SIDEBAR_COLLAPSED_KEY = 'crm-sidebar-collapsed'

export const SIDEBAR_WIDTH_EXPANDED = 200  // w-50
export const SIDEBAR_WIDTH_COLLAPSED = 56  // w-14

type SidebarContextValue = {
  collapsed: boolean
  setCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void
  sidebarWidth: number
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored === null) return true
    return stored === 'true'
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    } catch {}
  }, [collapsed])

  const setCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState(value)
  }, [])

  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, sidebarWidth }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    return {
      collapsed: true,
      setCollapsed: () => {},
      sidebarWidth: SIDEBAR_WIDTH_COLLAPSED,
    }
  }
  return ctx
}
