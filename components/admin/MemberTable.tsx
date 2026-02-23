"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Users, DollarSign, Layout, Clock, Calendar, Circle, MoreVertical, Edit2, Trash2, Shield, ArrowUp, ArrowDown } from "lucide-react"

type MemberRole = "owner" | "admin" | "member" | "vanzator" | "receptie" | "tehnician"

interface AppMember {
  id: string
  user_id: string
  role: MemberRole
  created_at: string
  email?: string
  name?: string
}

interface ExtendedMember extends AppMember {
  last_login?: string
  status: 'active' | 'inactive'
  leads_count: number
  sales_count: number
  pipelines_count: number
  permissions_count: number
  permissions: string[]
}

interface MemberTableProps {
  members: ExtendedMember[]
  onMemberClick: (member: ExtendedMember) => void
  onEditMember: (member: ExtendedMember) => void
  onDeleteMember: (member: ExtendedMember) => void
  onRoleChange: (member: ExtendedMember, newRole: MemberRole) => void
}

export default function MemberTable({ members, onMemberClick, onEditMember, onDeleteMember, onRoleChange }: MemberTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | MemberRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'role' | 'last_login' | 'created_at'>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])

  // Filter members
  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      const matchesSearch = 
        member.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.name?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesRole = roleFilter === 'all' || member.role === roleFilter
      const matchesStatus = statusFilter === 'all' || member.status === statusFilter
      
      return matchesSearch && matchesRole && matchesStatus
    })
  }, [members, searchQuery, roleFilter, statusFilter])

  // Sort members
  const sortedMembers = useMemo(() => {
    return [...filteredMembers].sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '')
          break
        case 'email':
          comparison = (a.email || '').localeCompare(b.email || '')
          break
        case 'role':
          comparison = a.role.localeCompare(b.role)
          break
        case 'last_login':
          comparison = (a.last_login || '').localeCompare(b.last_login || '')
          break
        case 'created_at':
          comparison = a.created_at.localeCompare(b.created_at)
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [filteredMembers, sortBy, sortOrder])

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedMembers(sortedMembers.map(m => m.user_id))
    } else {
      setSelectedMembers([])
    }
  }

  function handleSelectMember(userId: string, checked: boolean) {
    if (checked) {
      setSelectedMembers([...selectedMembers, userId])
    } else {
      setSelectedMembers(selectedMembers.filter(id => id !== userId))
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function formatLastLogin(lastLogin?: string): string {
    if (!lastLogin) return 'Niciodată'
    
    const date = new Date(lastLogin)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 5) return 'Acum câteva minute'
    if (diffMins < 60) return `Acum ${diffMins} minute`
    if (diffHours < 24) return `Acum ${diffHours} ore`
    if (diffDays === 1) return 'Ieri'
    if (diffDays < 7) return `Acum ${diffDays} zile`
    return formatDate(lastLogin)
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Caută membri după nume sau email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate rolurile</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="vanzator">Vanzator</SelectItem>
              <SelectItem value="receptie">Receptie</SelectItem>
              <SelectItem value="tehnician">Tehnician</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate status-urile</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nume</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="role">Rol</SelectItem>
              <SelectItem value="last_login">Last Login</SelectItem>
              <SelectItem value="created_at">Data Creării</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            title={sortOrder === 'asc' ? 'Sortare descrescătoare' : 'Sortare crescătoare'}
          >
            {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </Button>

          {selectedMembers.length > 0 && (
            <Badge variant="secondary" className="h-9 px-3">
              {selectedMembers.length} selectate
            </Badge>
          )}
        </div>
      </div>

      {/* Member List */}
      <Card>
        <CardContent className="p-0">
          {sortedMembers.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Nu s-au găsit membri care să corespundă criteriilor.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-4 p-4 border-b bg-muted/30">
                <Checkbox
                  checked={selectedMembers.length === sortedMembers.length && sortedMembers.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <div className="flex-1 text-sm font-medium text-muted-foreground">
                  {sortedMembers.length} membr{sortedMembers.length === 1 ? 'u' : 'i'}
                </div>
              </div>

              {/* Members */}
              <div className="divide-y">
                {sortedMembers.map(member => (
                  <MemberRow
                    key={member.user_id}
                    member={member}
                    selected={selectedMembers.includes(member.user_id)}
                    onSelect={(checked) => handleSelectMember(member.user_id, checked)}
                    onClick={() => onMemberClick(member)}
                    onEdit={() => onEditMember(member)}
                    onDelete={() => onDeleteMember(member)}
                    onRoleChange={(newRole) => onRoleChange(member, newRole)}
                    formatDate={formatDate}
                    formatLastLogin={formatLastLogin}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface MemberRowProps {
  member: ExtendedMember
  selected: boolean
  onSelect: (checked: boolean) => void
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  onRoleChange: (newRole: "owner" | "admin" | "member") => void
  formatDate: (date: string) => string
  formatLastLogin: (date?: string) => string
}

function MemberRow({ member, selected, onSelect, onClick, onEdit, onDelete, onRoleChange, formatDate, formatLastLogin }: MemberRowProps) {
  const statusColor = member.status === 'active' ? 'text-green-500' : 'text-gray-400'
  const statusIcon = member.status === 'active' ? <Circle className="h-2 w-2 fill-current" /> : <Circle className="h-2 w-2" />

  return (
    <div className="p-4 hover:bg-muted/50 cursor-pointer transition-colors">
      <div className="flex items-start gap-4">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          onClick={(e) => e.stopPropagation()}
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium truncate">{member.email}</div>
            <Badge variant={member.role === 'owner' ? 'destructive' : member.role === 'admin' ? 'default' : 'secondary'}>
              {member.role}
            </Badge>
            {member.status === 'active' && (
              <Badge variant="outline" className="text-green-500 border-green-500">
                <Circle className="h-1.5 w-1.5 fill-current mr-1" />
                Active
              </Badge>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground mt-1">{member.name || 'Fără nume'}</div>
          
          {/* Additional Info */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last login: {formatLastLogin(member.last_login)}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Created: {formatDate(member.created_at)}
            </div>
            <div className="flex items-center gap-1">
              {statusIcon}
              <span className={statusColor}>{member.status}</span>
            </div>
          </div>
          
          {/* Stats */}
          <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-blue-500" />
              {member.leads_count} leads
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-green-500" />
              {member.sales_count} sales
            </div>
            <div className="flex items-center gap-1">
              <Layout className="h-3 w-3 text-purple-500" />
              {member.pipelines_count} pipelines
            </div>
            {member.permissions_count > 0 && (
              <div className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-orange-500" />
                {member.permissions_count} permisiuni
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {member.role !== "owner" && (
            <Select
              value={member.role}
              onValueChange={(v) => onRoleChange(v as any)}
            >
              <SelectTrigger className="w-[110px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="vanzator">Vanzator</SelectItem>
                <SelectItem value="receptie">Receptie</SelectItem>
                <SelectItem value="tehnician">Tehnician</SelectItem>
              </SelectContent>
            </Select>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit() }}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick() }}>
                <Shield className="h-4 w-4 mr-2" />
                Manage Permissions
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}