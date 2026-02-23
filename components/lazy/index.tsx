'use client'

import React from 'react'
import dynamic from 'next/dynamic'

// ✅ Lazy loading pentru componente grele
// Acestea se încarcă doar când sunt folosite, reducând bundle-ul inițial

// Componente Kanban - încărcate doar pe pagini CRM
export const LazyKanbanBoard = dynamic(
  () => import('@/components/kanban/kanban-board').then(mod => ({ default: mod.KanbanBoard })),
  { 
    loading: () => <div className="animate-pulse h-96 bg-muted rounded-lg" />,
    ssr: false, // Nu e nevoie de SSR pentru board interactiv
  }
)

// Lead Details Panel - încărcat la click pe lead
export const LazyLeadDetailsPanel = dynamic(
  () => import('@/components/leads/lead-details-panel').then(mod => ({ default: mod.LeadDetailsPanel })),
  { 
    loading: () => <div className="animate-pulse h-full bg-muted rounded-lg" />,
  }
)

// Preturi component - foarte greu, lazy load obligatoriu
export const LazyPreturi = dynamic(
  () => import('@/components/preturi/core/PreturiMain').then(mod => ({ default: mod.default })),
  { 
    loading: () => (
      <div className="animate-pulse space-y-4 p-4">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-48 bg-muted rounded" />
        <div className="h-32 bg-muted rounded" />
      </div>
    ),
    ssr: false,
  }
)

// Print View - încărcat doar la print
export const LazyPrintView = dynamic(
  () => import('@/components/print/print-view').then(mod => ({ default: mod.PrintView })),
  { ssr: false }
)

// Dashboard Charts - încărcat doar pe dashboard
export const LazyDashboardCharts = dynamic(
  () => import('@/components/dashboard/dashboard-charts').then(mod => ({ default: mod.DashboardCharts })),
  { 
    loading: () => <div className="animate-pulse h-64 bg-muted rounded-lg" />,
    ssr: false,
  }
)

// Mobile components - încărcate doar pe mobile
export const LazyMobileBoardLayout = dynamic(
  () => import('@/components/mobile/mobile-board-layout').then(mod => ({ default: mod.MobileBoardLayout })),
  { ssr: false }
)

export const LazyLeadDetailsSheet = dynamic(
  () => import('@/components/mobile/lead-details-sheet').then(mod => ({ default: mod.LeadDetailsSheet })),
  { ssr: false }
)
