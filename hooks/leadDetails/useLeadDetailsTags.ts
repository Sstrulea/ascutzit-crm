/**
 * Hook pentru gestionarea tags-urilor în componenta LeadDetailsPanel
 */

import { useCallback, useMemo } from 'react'
import { toggleLeadTag } from '@/lib/supabase/tagOperations'
import type { Tag, TagColor } from '@/lib/supabase/tagOperations'
import { updateLead, logLeadEvent } from '@/lib/supabase/leadOperations'

/** Taguri atribuite automat (department, Follow Up, PINNED) — nu pot fi selectate la „Atribuie tag”. */
export const AUTO_TAG_NAMES = ['Horeca', 'Saloane', 'Frizerii', 'Reparatii', 'Follow Up', 'PINNED'] as const

/** Taguri care nu sunt afișate în lista generică de tag-uri (sunt afișate ca badge-uri dedicate: Curier Trimis, Office direct). */
export const TAGS_HIDDEN_FROM_UI = ['Follow Up', 'Frizerii', 'Horeca', 'PINNED', 'Reparatii', 'Saloane', 'Curier Trimis', 'Office direct'] as const

export function isTagHiddenFromUI(tagName: string | undefined): boolean {
  return !!tagName && TAGS_HIDDEN_FROM_UI.includes(tagName as (typeof TAGS_HIDDEN_FROM_UI)[number])
}

export function isAutoTag(tagName: string): boolean {
  return AUTO_TAG_NAMES.includes(tagName as (typeof AUTO_TAG_NAMES)[number])
}

interface UseLeadDetailsTagsProps {
  lead: {
    id: string
    tags?: Array<{ id: string }>
    [key: string]: any
  } | null
  /** Pentru carduri fișă/tăviță returnează lead_id; pentru lead returnează lead.id */
  getLeadId?: () => string | null
  allTags: Tag[]
  selectedTagIds: string[]
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>
  onTagsChange?: (leadId: string, tags: Tag[]) => void
  /** Când true (pipeline Receptie), PINNED poate fi atribuit/eliminat de receptie */
  isReceptiePipeline?: boolean
}

export function useLeadDetailsTags({
  lead,
  getLeadId,
  allTags,
  selectedTagIds,
  setSelectedTagIds,
  onTagsChange,
  isReceptiePipeline = false,
}: UseLeadDetailsTagsProps) {
  
  // Verifică dacă un tag este tag de departament
  const isDepartmentTag = useCallback((tagName: string) => {
    const departmentTags = ['Horeca', 'Saloane', 'Frizerii', 'Reparatii']
    return departmentTags.includes(tagName)
  }, [])

  // Taguri ce pot fi selectate la „Atribuie tag”: manuale + PINNED pentru Receptie
  const assignableTags = useMemo(() => {
    return allTags.filter((t) => {
      if (selectedTagIds.includes(t.id)) return false
      if (t.name === 'PINNED' && isReceptiePipeline) return true
      if (isAutoTag(t.name)) return false
      return true
    })
  }, [allTags, selectedTagIds, isReceptiePipeline])

  // Obține stilul pentru badge-ul de departament
  const getDepartmentBadgeStyle = useCallback((tagName: string) => {
    const styles: Record<string, string> = {
      'Horeca': 'bg-gradient-to-r from-orange-500 to-orange-600 border-orange-300',
      'Saloane': 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-300',
      'Frizerii': 'bg-gradient-to-r from-amber-500 to-amber-600 border-amber-300',
      'Reparatii': 'bg-gradient-to-r from-blue-500 to-blue-600 border-blue-300',
    }
    return styles[tagName] || 'bg-gradient-to-r from-gray-500 to-gray-600 border-gray-300'
  }, [])

  // Obține clasa CSS pentru tag
  const tagClass = useCallback((c: TagColor) =>
    c === "green" ? "bg-emerald-100 text-emerald-800"
    : c === "yellow" ? "bg-amber-100  text-amber-800"
    : c === "orange" ? "bg-orange-100 text-orange-800"
    : c === "blue" ? "bg-blue-100 text-blue-800"
    :                  "bg-rose-100   text-rose-800"
  , [])

  // Handler pentru toggle tag (adăugare/înlăturare) — folosește leadId real pentru lead/fișă/tăviță
  const handleToggleTag = useCallback(async (tagId: string) => {
    if (!lead) return
    const leadId = getLeadId?.() ?? lead.id
    if (!leadId) return

    const tag = allTags.find(t => t.id === tagId)
    const isRemoving = selectedTagIds.includes(tagId)

    // Previne eliminarea tag-urilor auto (department, Follow Up); Receptie poate elimina PINNED
    if (tag && isRemoving && isAutoTag(tag.name) && !(tag.name === 'PINNED' && isReceptiePipeline)) return

    // 1) server change (lead_tags folosește întotdeauna lead_id)
    await toggleLeadTag(leadId, tagId)

    // 1b) când eliminăm tag-ul "Sună!", setăm suna_acknowledged_at ca să dispară și de pe card
    if (tag && isRemoving && (tag.name === 'Suna!' || tag.name === 'Sună!')) {
      try {
        await logLeadEvent(leadId, "Tag Sună! eliminat din detalii.", "suna_tag_eliminated", { tag_name: "Suna!" })
        await updateLead(leadId, { suna_acknowledged_at: new Date().toISOString() })
      } catch (e) {
        console.warn('[useLeadDetailsTags] suna_acknowledged_at on Sună! remove:', e)
      }
    }

    // 2) compute next selection based on current state
    const nextIds = isRemoving
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId]

    // 3) local update
    setSelectedTagIds(nextIds)

    // 4) notify parent AFTER local setState (outside render)
    const nextTags = allTags.filter(t => nextIds.includes(t.id))
    onTagsChange?.(leadId, nextTags)
  }, [lead, getLeadId, allTags, selectedTagIds, setSelectedTagIds, onTagsChange, isReceptiePipeline])

  /** True dacă tag-ul poate fi înlăturat (nu e auto, sau e PINNED în Receptie) */
  const canRemoveTag = useCallback((tagName: string) => {
    if (!isAutoTag(tagName)) return true
    return tagName === 'PINNED' && isReceptiePipeline
  }, [isReceptiePipeline])

  return {
    handleToggleTag,
    canRemoveTag,
    isDepartmentTag,
    isAutoTag,
    assignableTags,
    getDepartmentBadgeStyle,
    tagClass,
  }
}


