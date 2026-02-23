"use client"

import { useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format } from "date-fns"
import type { Lead } from "@/app/(crm)/dashboard/page"
import { useRole } from "@/lib/contexts/AuthContext"
import { User, Building2, Phone, Mail, Calendar, Activity, ArrowRight, X } from "lucide-react"

interface LeadModalProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
  onStageChange: (leadId: string, newStageName: string) => void
  stages: string[]                                 
  pipelines: string[]                               
  pipelineSlug?: string                             
  onMoveToPipeline: (leadId: string, targetPipelineName: string) => void
  pipelineOptions?: { name: string; activeStages: number }[] 
}

export function LeadModal({
  lead,
  isOpen,
  onClose,
  onStageChange,
  stages,
  pipelines,
  pipelineSlug,
  onMoveToPipeline,
  pipelineOptions
}: LeadModalProps) {
  const { role } = useRole()
  const canMovePipeline = role === 'owner' || role === 'admin'

  const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, "-")

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    if (isOpen) document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, onClose])

  if (!lead) return null

  const handleStageChange = (newStageName: string) => {
    onStageChange(lead.id, newStageName)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0 shadow-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>{lead.name}</DialogTitle>
        </DialogHeader>
        
        {/* Header cu gradient */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <User className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">{lead.name}</h2>
              <p className="text-emerald-100 text-sm">Detalii lead</p>
            </div>
          </div>
        </div>
        
        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Informații de contact */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Informații de contact</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <User className="h-3 w-3" />
                    Nume
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{lead.name}</p>
                </div>

                {lead.company && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      <Building2 className="h-3 w-3" />
                      CompanIE
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{lead.company}</p>
                  </div>
                )}

                {lead.phone && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      <Phone className="h-3 w-3" />
                      Telefon
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{lead.phone}</p>
                  </div>
                )}

                {lead.email && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      <Mail className="h-3 w-3" />
                      Email
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">{lead.email}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Stage & Pipeline */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                <ArrowRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Mută Lead</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Stage curent
                  </label>
                  <div>
                    <Badge variant="secondary" className="text-sm px-3 py-1">{lead.stage}</Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Mută în Stage
                  </label>
                  <Select value={lead.stage} onValueChange={handleStageChange}>
                    <SelectTrigger className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stageName) => (
                        <SelectItem key={stageName} value={stageName}>
                          {stageName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {canMovePipeline && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Mută în alt Pipeline
                    </label>
                    <Select
                      onValueChange={(targetName: any) => {
                        if (!lead) return
                        if (targetName === pipelineSlug) return
                        onMoveToPipeline(lead.id, targetName)
                      }}
                    >
                      <SelectTrigger className="h-12 border-2 focus:border-emerald-500 focus:ring-emerald-500/20">
                        <SelectValue placeholder="Selectează pipeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {(pipelineOptions ?? pipelines.map((name) => ({ name, activeStages: 0 })))
                          .map(({ name, activeStages }) => (
                            <SelectItem
                              key={name}
                              value={name}
                              disabled={toSlug(name) === pipelineSlug || activeStages === 0}
                            >
                              {name}{activeStages === 0 ? " (fără stage-uri)" : ""}
                            </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Note & Dates */}
            {(lead.notes || lead?.createdAt || lead?.lastActivity) && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Detalii</h3>
                </div>
                
                <div className="space-y-3">
                  {lead.notes && (
                    <div className="space-y-1">
                      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Note</div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        {lead.notes}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {lead?.createdAt && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          <Calendar className="h-3 w-3" />
                          Creat
                        </div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {format(lead.createdAt, "dd MMM yyyy")}
                        </p>
                      </div>
                    )}

                    {lead?.lastActivity && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          <Activity className="h-3 w-3" />
                          Ultima activitate
                        </div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {format(lead.lastActivity, "dd MMM yyyy")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-end gap-3 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
          >
            <X className="h-4 w-4 mr-2" />
            Închide
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
