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
      const created = await createTag(name, newColor)
      setTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
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
      const updated = await updateTag(editingTagId, { name, color: editingColor })
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
            Creează și editează tag-uri personalizate care pot fi atribuite lead-urilor (ex.: Urgent,
            Recurent, VIP, etc.).
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

