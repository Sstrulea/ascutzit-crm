/**
 * Componentă pentru secțiunea de tags
 */

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tag, Plus, ChevronDown, X } from "lucide-react"
import type { Tag as TagType, TagColor } from '@/lib/supabase/tagOperations'

interface LeadTagsSectionProps {
  allTags: TagType[]
  selectedTagIds: string[]
  assignableTags: TagType[]
  onToggleTag: (tagId: string) => void
  tagClass: (color: TagColor) => string
  isDepartmentTag: (tagName: string) => boolean
  getDepartmentBadgeStyle: (tagName: string) => string
  /** Taguri care pot fi înlăturate (ex: nu sunt auto); dacă nu e dat, toate selectate pot fi înlăturate */
  canRemoveTag?: (tagName: string) => boolean
}

export function LeadTagsSection({
  allTags,
  selectedTagIds,
  assignableTags,
  onToggleTag,
  tagClass,
  isDepartmentTag,
  getDepartmentBadgeStyle,
  canRemoveTag = () => true,
}: LeadTagsSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-2">
          <Tag className="h-3.5 w-3.5" />
          Tags
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={assignableTags.length === 0}
            >
              <Plus className="h-3 w-3" />
              Atribuie tag
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            {assignableTags.map((tag) => (
              <DropdownMenuItem
                key={tag.id}
                onSelect={(e) => {
                  e.preventDefault()
                  onToggleTag(tag.id)
                }}
              >
                <span className={tagClass(tag.color) + " px-2 py-0.5 rounded text-xs font-medium"}>
                  {tag.name}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {allTags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id)
          const isDeptTag = isDepartmentTag(tag.name)
          const showRemove = isSelected && canRemoveTag(tag.name)
          
          return (
            <Badge
              key={tag.id}
              variant={isSelected ? "default" : "outline"}
              className={`
                cursor-pointer transition-all hover:scale-105 inline-flex items-center gap-1
                ${isSelected 
                  ? isDeptTag 
                    ? getDepartmentBadgeStyle(tag.name) + " text-white border-white/30"
                    : tagClass(tag.color)
                  : "bg-background hover:bg-muted"
                }
                ${isDeptTag ? "font-semibold" : ""}
              `}
              onClick={() => onToggleTag(tag.id)}
            >
              {tag.name}
              {showRemove && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onToggleTag(tag.id) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleTag(tag.id) } }}
                  className="ml-0.5 rounded hover:bg-black/20 p-0.5 focus:outline-none focus:ring-1"
                  title="Elimină tag"
                  aria-label={`Elimină ${tag.name}`}
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}


