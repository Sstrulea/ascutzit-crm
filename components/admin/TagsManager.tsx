'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Loader2, Tag as TagIcon, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  listTags,
  createTag,
  deleteTag,
  updateTag,
  getTagColorClassWithBorder,
  type Tag,
  type TagColor,
  type TagItemType,
} from '@/lib/supabase/tagOperations'

const COLOR_OPTIONS: TagColor[] = [
  'green',
  'yellow',
  'red',
  'orange',
  'blue',
  'pink',
  'slate',
  'gray',
  'violet',
  'purple',
  'rose',
]

export function TagsManager() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<TagColor>('blue')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingColor, setEditingColor] = useState<TagColor>('blue')
  const [editingItemTypes, setEditingItemTypes] = useState<TagItemType[]>([])
  const [newItemTypes, setNewItemTypes] = useState<TagItemType[]>([])

  const ITEM_TYPE_OPTIONS: { value: TagItemType; label: string }[] = [
    { value: 'lead', label: 'Lead' },
    { value: 'service_file', label: 'Fișă' },
    { value: 'tray', label: 'Tăviță' },
  ]

  useEffect(() => {
    void loadTags()
  }, [])

  async function loadTags() {
    setLoading(true)
    try {
      const data = await listTags()
      setTags(data)
    } catch (err: any) {
      console.error('[TagsManager] Eroare la încărcare tags:', err)
      toast.error(err?.message || 'Eroare la încărcare tag-uri')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const created = await createTag(name, newColor, newItemTypes.length ? newItemTypes : null)
      setTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      setNewItemTypes([])
      toast.success('Tag creat')
    } catch (err: any) {
      console.error('[TagsManager] Eroare la creare tag:', err)
      toast.error(err?.message || 'Eroare la creare tag')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(tag: Tag) {
    setEditingTagId(tag.id)
    setEditingName(tag.name)
    setEditingColor(tag.color)
    setEditingItemTypes(tag.item_types ?? [])
  }

  function formatItemTypes(types: TagItemType[] | null | undefined): string {
    if (!types || types.length === 0) return 'Toate'
    return types.map((t) => ITEM_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t).join(', ')
  }

  async function handleSaveEdit() {
    if (!editingTagId) return
    const name = editingName.trim()
    if (!name) {
      toast.error('Numele nu poate fi gol')
      return
    }
    setSaving(true)
    try {
      const updated = await updateTag(editingTagId, { name, color: editingColor, item_types: editingItemTypes.length ? editingItemTypes : null })
      setTags((prev) =>
        prev
          .map((t) => (t.id === updated.id ? updated : t))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setEditingTagId(null)
      toast.success('Tag actualizat')
    } catch (err: any) {
      console.error('[TagsManager] Eroare la actualizare tag:', err)
      toast.error(err?.message || 'Eroare la actualizare tag')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(tag: Tag) {
    if (!confirm(`Ștergi tag-ul "${tag.name}"?`)) return
    setSaving(true)
    try {
      await deleteTag(tag.id)
      setTags((prev) => prev.filter((t) => t.id !== tag.id))
      toast.success('Tag șters')
    } catch (err: any) {
      console.error('[TagsManager] Eroare la ștergere tag:', err)
      toast.error(err?.message || 'Eroare la ștergere tag')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TagIcon className="h-4 w-4" />
            Administrare tag-uri lead
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Creează și editează tag-uri. Poți restricționa un tag doar la Lead, doar la Fișă, doar la Tăviță sau la toate (lăsând neselectate = Toate).
          </p>

          <form onSubmit={handleAddTag} className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Nume tag (ex: VIP, Recurent)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-9 max-w-xs"
            />
            <Select value={newColor} onValueChange={(v) => setNewColor(v as TagColor)}>
              <SelectTrigger size="sm">
                <SelectValue placeholder="Culoare" />
              </SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${getTagColorClassWithBorder(c)}`} />
                      <span className="text-xs capitalize">{c}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Disponibil pentru:</span>
              {ITEM_TYPE_OPTIONS.map((opt) => {
                const checked = newItemTypes.includes(opt.value)
                return (
                  <label key={opt.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) setNewItemTypes((prev) => [...prev, opt.value].sort())
                        else setNewItemTypes((prev) => prev.filter((t) => t !== opt.value))
                      }}
                      className="rounded border-input"
                    />
                    {opt.label}
                  </label>
                )
              })}
              {newItemTypes.length === 0 && <span className="text-xs text-muted-foreground">(Toate)</span>}
            </div>
            <Button type="submit" size="sm" disabled={saving || !newName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Adaugă tag
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Tag-uri existente</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nu există tag-uri definite încă.</p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) =>
                editingTagId === tag.id ? (
                  <div
                    key={tag.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 bg-muted/40"
                  >
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-8 max-w-xs"
                    />
                    <Select
                      value={editingColor}
                      onValueChange={(v) => setEditingColor(v as TagColor)}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLOR_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c}>
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-3 w-3 rounded-full ${getTagColorClassWithBorder(c)}`}
                              />
                              <span className="text-xs capitalize">{c}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 flex-wrap">
                      {ITEM_TYPE_OPTIONS.map((opt) => {
                        const checked = editingItemTypes.includes(opt.value)
                        return (
                          <label key={opt.value} className="flex items-center gap-1 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) setEditingItemTypes((prev) => [...prev, opt.value].sort())
                                else setEditingItemTypes((prev) => prev.filter((t) => t !== opt.value))
                              }}
                              className="rounded border-input"
                            />
                            {opt.label}
                          </label>
                        )
                      })}
                      {editingItemTypes.length === 0 && <span className="text-xs text-muted-foreground">Toate</span>}
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingTagId(null)}
                        disabled={saving}
                      >
                        Anulează
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={saving || !editingName.trim()}
                      >
                        Salvează
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={tag.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <Badge
                      variant="outline"
                      className={getTagColorClassWithBorder(tag.color) + ' border'}
                    >
                      {tag.name}
                    </Badge>
                    <span className="text-xs text-muted-foreground">({tag.color})</span>
                    <span className="text-xs text-muted-foreground">· {formatItemTypes(tag.item_types)}</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(tag)}
                        disabled={saving}
                      >
                        Editează
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(tag)}
                        disabled={saving}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Șterge
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default TagsManager

