# Design Improvement Proposals - Pagina Admins

**Data:** 23 Februarie 2026  
**Autor:** Cline AI Assistant  
**Scop:** Propuneri pentru un design profesionist, practic și complet al paginii de administrare

---

## Cuprins

1. [Analiza Stării Curente](#1-analiza-stării-curente)
2. [Probleme Identificate](#2-probleme-identificate)
3. [Principii de Design](#3-principii-de-design)
4. [Propuneri de Design - Tab Membri](#4-propuneri-de-design---tab-membri)
5. [Dashboard pentru Utilizatori](#5-dashboard-pentru-utilizatori)
6. [Design Profesionist - Alte Tab-uri](#6-design-profesionist---alte-tab-uri)
7. [Implementare Detaliată](#7-implementare-detaliată)
8. [Mockups și Wireframes](#8-mockups-și-wireframes)

---

## 1. Analiza Stării Curente

### 1.1 Structura Curentă

```
app/(crm)/admins/page.tsx (600+ linii)
├── 5 Tab-uri:
│   ├── Membri (principal)
│   ├── Backup-uri
│   ├── Tăvițe
│   ├── Caută Fișă
│   └── Pipeline Items
│
├── Funcționalități curente:
│   ├── Adăugare membri noi
│   ├── Editare nume
│   ├── Schimbare rol (owner/admin/member)
│   ├── Ștergere membri
│   ├── Management permisiuni pipeline
│   └── Integrare componente admin (4 componente)
```

### 1.2 Probleme Principale

#### Probleme UX:

1. **Informații insuficiente despre utilizatori**
   - Nu arată ultimul login
   - Nu arată activitatea recentă
   - Nu arată statistici (leads gestionate, vânzări, etc.)
   - Nu arată status (activ/inactiv)
   - Nu arată data creării

2. **Navigare inefficientă**
   - Tab-uri la nivel de sus, dar fără overview
   - Trebuie să schimbi tab pentru fiecare funcționalitate
   - Nu există dashboard cu overview al sistemului

3. **Management permisiuni complicat**
   - Trebuie să expandezi fiecare membru
   - Checkbox-uri pentru fiecare pipeline
   - Hard să vezi overview rapid
   - Nu există bulk operations

4. **Lipsă de visual hierarchy**
   - Totul arată la fel
   - Nu se distinge ușor între active/inactive
   - Nu există indicators pentru probleme

5. **Lipsă de search și filters**
   - Nu poți căuta membri
   - Nu poți filtra după rol
   - Nu poți filtra după status
   - Nu poți sorta

#### Probleme de Design:

1. **Prea mult scrolling**
   - Lista lungă de membri
   - Expandable sections fac și mai mult scrolling
   - Hard să găsești ceva rapid

2. **Dense information display**
   - Prea multe informații în puțin spațiu
   - Hard să scan rapid
   - Eye strain

3. **Lack of visual feedback**
   - Nu se vede clar când se salvează
   - Nu se vede starea în timp real
   - Nu există loading states clare

---

## 2. Probleme Identificate

### 2.1 Critical Problems (Must Fix)

| Problem | Impact | Priority |
|---------|--------|----------|
| Lipsă dashboard cu overview al sistemului | High | P0 |
| Lipsă informații detaliate despre utilizatori (activity, stats) | High | P0 |
| Management permisiuni inefficient (expand/collapse) | High | P0 |
| Lipsă search și filters pentru membri | High | P0 |
| Nu se poate vedea overview rapid al permisiunilor | High | P0 |

### 2.2 Medium Problems (Should Fix)

| Problem | Impact | Priority |
|---------|--------|----------|
| Tab navigation la nivel înalt | Medium | P1 |
| Prea mult scrolling în lista membri | Medium | P1 |
| Lacks visual hierarchy | Medium | P1 |
| Nu există bulk operations | Medium | P1 |
| No sorting options | Medium | P1 |

### 2.3 Low Problems (Nice to Have)

| Problem | Impact | Priority |
|---------|--------|----------|
| Color scheme nu e foarte profesional | Low | P2 |
| Icon usage inconsistent | Low | P2 |
| No keyboard shortcuts | Low | P2 |

---

## 3. Principii de Design

### 3.1 Principii Cheie

**1. Function over Form (Practic > Frumos)**
- Prioritizează funcționalitatea
- Fă task-urile comune cât mai rapide
- Reduceți numărul de click-uri

**2. Information at a Glance**
- Informațiile critice vizibile instant
- Nu ascunde informații importante
- Folosește visual cues

**3. Efficient Navigation**
- Search și filters mereu disponibile
- Quick actions accesibile
- Breadcrumbs pentru context

**4. Professional Appearance**
- Clean, minimalist design
- Consistent spacing și typography
- Subtle animations, nu flashy

**5. Accessibility**
- Keyboard navigation
- Screen reader friendly
- High contrast for readability

### 3.2 Design System

```typescript
// Design Tokens
const DESIGN_TOKENS = {
  colors: {
    primary: '#0F172A',      // slate-900
    secondary: '#64748B',    // slate-500
    success: '#22C55E',     // green-500
    warning: '#F59E0B',     // amber-500
    danger: '#EF4444',      // red-500
    background: '#F8FAFC',  // slate-50
    surface: '#FFFFFF',      // white
  },
  spacing: {
    xs: '0.25rem',  // 4px
    sm: '0.5rem',   // 8px
    md: '1rem',     // 16px
    lg: '1.5rem',   // 24px
    xl: '2rem',     // 32px
  },
  typography: {
    font: 'Inter, system-ui, sans-serif',
    sizes: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',      // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
    },
  },
  borderRadius: {
    sm: '0.375rem',  // 6px
    md: '0.5rem',     // 8px
    lg: '0.75rem',    // 12px
    xl: '1rem',       // 16px
  },
}
```

---

## 4. Propuneri de Design - Tab Membri

### 4.1 Dashboard Overview (Nou)

**Obiectiv:** Overview instant al sistemului și al utilizatorilor

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Admin Dashboard                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Total Membri │  │    Owners    │  │    Admini    │        │
│  │      12      │  │      3       │  │      5       │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Statistici Sistem (Ultima Săptămână)                   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ • Leads noi: 1,234                                     │  │
│  │ • Vânzări: 156                                         │  │
│  │ • Pipeline-uri active: 8                                │  │
│  │ • Membri activi: 10/12                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Utilizatori Activi Recent (Ultima 24h)                 │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ ✅ ion.popescu@email.com - Acum 2h                     │  │
│  │ ✅ maria.ionescu@email.com - Acum 5h                   │  │
│  │ ✅ andrei.radu@email.com - Acum 8h                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Componente:**
```typescript
// components/admin/OverviewDashboard.tsx
interface DashboardStats {
  totalMembers: number
  owners: number
  admins: number
  members: number
  activeMembers: number
  weeklyStats: {
    newLeads: number
    sales: number
    activePipelines: number
  }
  recentActivity: ActivityLog[]
}

export function OverviewDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          label="Total Membri" 
          value={stats.totalMembers}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard 
          label="Owners" 
          value={stats.owners}
          icon={<Crown className="h-5 w-5 text-yellow-500" />}
        />
        <StatCard 
          label="Admini" 
          value={stats.admins}
          icon={<Shield className="h-5 w-5 text-blue-500" />}
        />
      </div>

      {/* System Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Statistici Sistem (Ultima Săptămână)</CardTitle>
        </CardHeader>
        <CardContent>
          <StatsList stats={stats.weeklyStats} />
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Utilizatori Activi Recent (Ultima 24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityList activities={stats.recentActivity} />
        </CardContent>
      </Card>
    </div>
  )
}
```

---

### 4.2 Advanced Member Table (Refactored)

**Obiectiv:** Tab compactă cu toate informațiile relevante, searchable și filterable

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Gestionare Membri                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 🔍 Caută membri...           Filter: [▼]  Sort: [▼]     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ □ Select All  |  Acțiuni: [Bulk Edit▼] [Delete▼]        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Email                  | Nume         | Rol | Status | ⋮   │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │  ☐ ion.popescu@email.com  | Ion Popescu | 🟢 | admin  | ⋮   │  │
│  │     Last login: 2h ago  | • 234 leads | • 45 sales        │  │
│  │     Created: Jan 15     | 8 pipelines | ✓ Active          │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │  ☐ maria.ionescu@email.com | Maria Ionescu | 🔵 | member | ⋮   │  │
│  │     Last login: 5h ago   | • 156 leads  | • 23 sales       │  │
│  │     Created: Feb 2       | 5 pipelines | ✓ Active          │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │  ☐ andrei.radu@email.com   | Andrei Radu | 🟢 | admin   | ⋮   │  │
│  │     Last login: 8h ago   | • 312 leads  | • 67 sales       │  │
│  │     Created: Dec 20       | 12 pipelines| ✓ Active          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Showing 1-10 of 12 members  |  ◀ 1 2 ▶                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Componente:**

```typescript
// components/admin/MemberTable.tsx
interface MemberTableProps {
  members: ExtendedMember[]
  onMemberClick: (member: ExtendedMember) => void
  onEditMember: (member: ExtendedMember) => void
  onDeleteMember: (member: ExtendedMember) => void
}

interface ExtendedMember extends AppMember {
  last_login?: string
  status: 'active' | 'inactive'
  leads_count: number
  sales_count: number
  pipelines_count: number
  permissions_count: number
}

export function MemberTable({ members, onMemberClick, onEditMember, onDeleteMember }: MemberTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'admin' | 'member'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'role' | 'last_login'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

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
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [filteredMembers, sortBy, sortOrder])

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <SearchInput
            placeholder="Caută membri după nume sau email..."
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate rolurile</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toate status-urile</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Nume</SelectItem>
            <SelectItem value="email">Sort: Email</SelectItem>
            <SelectItem value="role">Sort: Rol</SelectItem>
            <SelectItem value="last_login">Sort: Last Login</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        >
          {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* Member List */}
      <Card>
        <CardContent className="p-0">
          {sortedMembers.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Nu s-au găsit membri care să corespundă criteriilor.
            </div>
          ) : (
            <div className="divide-y">
              {sortedMembers.map(member => (
                <MemberRow
                  key={member.user_id}
                  member={member}
                  onClick={() => onMemberClick(member)}
                  onEdit={() => onEditMember(member)}
                  onDelete={() => onDeleteMember(member)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {sortedMembers.length > 10 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing 1-10 of {sortedMembers.length} members
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>
              ◀
            </Button>
            <Button variant="outline" size="sm">
              1
            </Button>
            <Button variant="outline" size="sm">
              2
            </Button>
            <Button variant="outline" size="sm" disabled>
              ▶
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberRow({ member, onClick, onEdit, onDelete }: {
  member: ExtendedMember
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const statusColor = member.status === 'active' ? 'text-green-500' : 'text-gray-400'
  const statusIcon = member.status === 'active' ? <Circle className="h-2 w-2 fill-current" /> : <Circle className="h-2 w-2" />
  
  return (
    <div className="p-4 hover:bg-muted/50 cursor-pointer transition-colors">
      <div className="flex items-start gap-4">
        <Checkbox />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-medium truncate">{member.email}</div>
            <Badge variant={member.role === 'owner' ? 'destructive' : member.role === 'admin' ? 'default' : 'secondary'}>
              {member.role}
            </Badge>
          </div>
          
          <div className="text-sm text-muted-foreground mt-1">{member.name}</div>
          
          {/* Additional Info */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
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
          <div className="flex items-center gap-4 mt-2 text-xs">
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
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onClick}>
              <Shield className="h-4 w-4 mr-2" />
              Manage Permissions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
```

---

### 4.3 Modal Detaliat pentru Membru

**Obiectiv:** Single modal cu toate informațiile despre un membru și posibilități de editare

**Layout:**
```
┌────────────────────────────────────────────────────────────────────┐
│  ✕  Detalii Membru: Ion Popescu                                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Profile                                                  │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │  Email: ion.popescu@email.com                             │   │
│  │  Nume: Ion Popescu                     [Edit]              │   │
│  │  Rol: [Admin ▼]                    Status: [Active ▼]   │   │
│  │  Created: Jan 15, 2026                                   │   │
│  │  Last login: 2h ago                                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Performanță (Ultima Săptămână)                          │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │  Leads noi: 234  Vânzări: 45  Conversie: 19.2%          │   │
│  │  [Vezi Activity Log ▼]                                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Permisiuni Pipeline-uri                                  │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │  □ Pipeline Vânzări (Principal)                           │   │
│  │  ☑ Pipeline Tehnic                                         │   │
│  │  ☑ Pipeline Leads Noi                                     │   │
│  │  ☑ Pipeline Follow-up                                      │   │
│  │                                                             │   │
│  │  [Salvează Permisiuni]                                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Quick Actions                                            │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │  [Reset Password]  [Deactivate]  [Delete Member]          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│                                    [Cancel]  [Save Changes]         │
└────────────────────────────────────────────────────────────────────┘
```

**Componente:**

```typescript
// components/admin/MemberDetailsModal.tsx
interface MemberDetailsModalProps {
  member: ExtendedMember
  open: boolean
  onClose: () => void
  onSave: (member: ExtendedMember) => void
  onDelete: (member: ExtendedMember) => void
}

export function MemberDetailsModal({ member, open, onClose, onSave, onDelete }: MemberDetailsModalProps) {
  const [editingName, setEditingName] = useState(member.name || '')
  const [editingRole, setEditingRole] = useState(member.role)
  const [editingStatus, setEditingStatus] = useState(member.status)
  const [permissions, setPermissions] = useState<string[]>(member.permissions || [])
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        ...member,
        name: editingName,
        role: editingRole,
        status: editingStatus,
        permissions
      })
      onClose()
    } catch (error) {
      toast.error('Eroare la salvare')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalii Membru: {member.name || member.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Profile Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <div className="font-medium">{member.email}</div>
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={editingRole} onValueChange={setEditingRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nume</Label>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="Nume"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editingStatus} onValueChange={setEditingStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Created</Label>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(member.created_at)}
                  </div>
                </div>
                <div>
                  <Label>Last Login</Label>
                  <div className="text-sm text-muted-foreground">
                    {formatLastLogin(member.last_login)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performanță (Ultima Săptămână)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <StatBox
                  label="Leads Noi"
                  value={member.leads_count}
                  icon={<Users className="h-5 w-5 text-blue-500" />}
                />
                <StatBox
                  label="Vânzări"
                  value={member.sales_count}
                  icon={<DollarSign className="h-5 w-5 text-green-500" />}
                />
                <StatBox
                  label="Conversie"
                  value={`${((member.sales_count / member.leads_count) * 100).toFixed(1)}%`}
                  icon={<TrendingUp className="h-5 w-5 text-purple-500" />}
                />
              </div>
              <Button variant="outline" className="w-full mt-4">
                <Activity className="h-4 w-4 mr-2" />
                Vezi Activity Log
              </Button>
            </CardContent>
          </Card>

          {/* Permissions Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Permisiuni Pipeline-uri</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pipelines.map(pipeline => (
                  <div key={pipeline.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={permissions.includes(pipeline.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setPermissions([...permissions, pipeline.id])
                          } else {
                            setPermissions(permissions.filter(p => p !== pipeline.id))
                          }
                        }}
                      />
                      <Label className="cursor-pointer">{pipeline.name}</Label>
                    </div>
                    {permissions.includes(pipeline.id) && (
                      <Badge variant="secondary">Activ</Badge>
                    )}
                  </div>
                ))}
              </div>
              <Button onClick={() => savePermissions(member.user_id, permissions)} className="w-full mt-4">
                <Save className="h-4 w-4 mr-2" />
                Salvează Permisiuni
              </Button>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <Button variant="outline" onClick={() => resetPassword(member.user_id)}>
                  <Key className="h-4 w-4 mr-2" />
                  Reset Password
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => toggleMemberStatus(member.user_id, editingStatus === 'active' ? 'inactive' : 'active')}
                  className={editingStatus === 'active' ? 'text-destructive' : ''}
                >
                  <Power className="h-4 w-4 mr-2" />
                  {editingStatus === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => onDelete(member)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

---

## 5. Dashboard pentru Utilizatori

### 5.1 Activity Log

**Obiectiv:** Să vedem tot ce face un utilizator în sistem

**Layout:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Activity Log: Ion Popescu                                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Filter: [▼]  Search: [Search...]  Date Range: [▼]             │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Time           | Action              | Details              │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  2h ago        | Login               | IP: 192.168.1.100    │  │
│  │  3h ago        | Callback set        | Lead #1234 → Feb 25  │  │
│  │  5h ago        | Sale completed      | Lead #5678 → Fact.  │  │
│  │  8h ago        | Pipeline move      | New → Follow-up       │  │
│  │  1d ago        | No deal             | Lead #9012           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Showing 1-10 of 234 activities  |  ◀ 1 2 3 ... 24 ▶           │
└────────────────────────────────────────────────────────────────────┘
```

**Componente:**

```typescript
// components/admin/ActivityLog.tsx
interface ActivityLogProps {
  userId: string
  activities: Activity[]
}

export function ActivityLog({ userId, activities }: ActivityLogProps) {
  const [filter, setFilter] = useState<'all' | 'login' | 'pipeline' | 'sales' | 'callbacks'>('all')
  const [search, setSearch] = useState('')
  
  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      const matchesFilter = filter === 'all' || activity.type === filter
      const matchesSearch = search === '' || 
        activity.details?.toLowerCase().includes(search.toLowerCase())
      
      return matchesFilter && matchesSearch
    })
  }, [activities, filter, search])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              <SelectItem value="login">Logins</SelectItem>
              <SelectItem value="pipeline">Pipeline Moves</SelectItem>
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="callbacks">Callbacks</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search activities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
        </div>

        {/* Activity List */}
        {filteredActivities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nu s-au găsit activități.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredActivities.map(activity => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {filteredActivities.length > 10 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing 1-10 of {filteredActivities.length} activities
            </div>
            <Pagination />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

---

## 6. Design Profesionist - Alte Tab-uri

### 6.1 Backup-uri Tab

**Layout:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Backup-uri                                                       │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Create Manual Backup]  [Schedule Auto Backup▼]  [Settings ⚙️]  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Backup History                                            │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  Created              | Size     | Type       | Actions      │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  Feb 23, 2026 10:30 | 2.3 GB   | Manual     | [Restore]  │  │
│  │  Feb 22, 2026 00:00 | 2.3 GB   | Auto       | [Restore]  │  │
│  │  Feb 21, 2026 00:00 | 2.2 GB   | Auto       | [Restore]  │  │
│  │  Feb 20, 2026 00:00 | 2.2 GB   | Auto       | [Restore]  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Storage Used: 9.2 GB / 50 GB (18%)                             │
└────────────────────────────────────────────────────────────────────┘
```

---

### 6.2 Tăvițe Tab

**Layout:**
```
┌────────────────────────────────────────────────────────────────────┐
│  Asignare Tăvițe în Pipeline                                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [Scan Tăvițe]  [Assign Selected▼]  [Unassign Selected▼]         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Tăvițe Neprocesate                                        │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  □ TR-001234 | Service File #4567 | Lead #1234          │  │
│  │  □ TR-001235 | Service File #4568 | Lead #1235          │  │
│  │  □ TR-001236 | Service File #4569 | Lead #1236          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Asignare la Pipeline                                       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  [▼] Select Pipeline    [▼] Select Stage                 │  │
│  │  [Assign Selected Tăvițe]                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Statistics:                                                       │
│  • Neprocesate: 45                                               │
│  • Astăzi procesate: 23                                           │
│  • Săptămâna aceasta: 156                                        │
└────────────────────────────────────────────────────────────────────┘
```

---

## 7. Implementare Detaliată

### 7.1 Structura Fișierelor

```
components/admin/
├── OverviewDashboard.tsx          # Dashboard cu overview sistem
├── MemberTable.tsx                # Tabel compact cu membri
├── MemberDetailsModal.tsx         # Modal detaliat membru
├── ActivityLog.tsx                # Activity log pentru utilizatori
├── MemberSearchBar.tsx            # Bara de căutare și filtre
├── MemberActions.tsx              # Quick actions dropdown
├── BulkOperations.tsx             # Operațiuni în masă
└── ...
```

### 7.2 API Endpoints Necesare

```typescript
// app/api/admin/members/route.ts
GET    /api/admin/members              // Listă membri cu detalii
GET    /api/admin/members/:id         // Detalii membru
GET    /api/admin/members/:id/stats   // Statistici membru
GET    /api/admin/members/:id/activity // Activity log
PATCH  /api/admin/members/:id         // Update membru
DELETE /api/admin/members/:id         // Șterge membru
POST   /api/admin/members/reset-password // Reset password
POST   /api/admin/members/toggle-status // Toggle active/inactive

// app/api/admin/dashboard/route.ts
GET    /api/admin/dashboard/stats      // Statistici generale
GET    /api/admin/dashboard/activity   // Activity recentă
```

### 7.3 Database Queries Necesare

```sql
-- Extended member info
SELECT 
  am.*,
  u.last_sign_in_at as last_login,
  u.created_at as user_created_at,
  COUNT(DISTINCT l.id) as leads_count,
  COUNT(DISTINCT sf.id) as sales_count,
  COUNT(DISTINCT p.id) as pipelines_count,
  COUNT(DISTINCT upp.pipeline_id) as permissions_count
FROM app_members am
LEFT JOIN auth.users u ON am.user_id = u.id
LEFT JOIN leads l ON l.created_by = am.user_id
LEFT JOIN service_files sf ON sf.created_by = am.user_id
LEFT JOIN user_pipeline_permissions upp ON upp.user_id = am.user_id
LEFT JOIN pipelines p ON upp.pipeline_id = p.id
GROUP BY am.id, u.id
ORDER BY am.created_at DESC;

-- Member activity log
SELECT 
  ie.*,
  l.name as lead_name,
  p.name as pipeline_name,
  s.name as stage_name
FROM item_events ie
LEFT JOIN leads l ON ie.item_id = l.id
LEFT JOIN pipelines p ON l.pipeline_id = p.id
LEFT JOIN stages s ON l.stage_id = s.id
WHERE ie.actor_id = $1
ORDER BY ie.created_at DESC
LIMIT 100;
```

---

## 8. Mockups și Wireframes

### 8.1 Color Scheme Profesională

```typescript
const COLOR_SCHEME = {
  primary: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    500: '#0EA5E9',
    600: '#0284C7',
    700: '#0369A1',
    900: '#0C4A6E',
  },
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    500: '#22C55E',
    600: '#16A34A',
  },
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    500: '#F59E0B',
    600: '#D97706',
  },
  danger: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    500: '#EF4444',
    600: '#DC2626',
  },
  neutral: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
}
```

### 8.2 Typography Scale

```typescript
const TYPOGRAPHY = {
  display: {
    fontSize: '2.25rem', // 36px
    lineHeight: '2.5rem',
    fontWeight: 700,
  },
  h1: {
    fontSize: '1.875rem', // 30px
    lineHeight: '2.25rem',
    fontWeight: 600,
  },
  h2: {
    fontSize: '1.5rem', // 24px
    lineHeight: '2rem',
    fontWeight: 600,
  },
  h3: {
    fontSize: '1.25rem', // 20px
    lineHeight: '1.75rem',
    fontWeight: 600,
  },
  body: {
    fontSize: '1rem', // 16px
    lineHeight: '1.5rem',
    fontWeight: 400,
  },
  small: {
    fontSize: '0.875rem', // 14px
    lineHeight: '1.25rem',
    fontWeight: 400,
  },
  xsmall: {
    fontSize: '0.75rem', // 12px
    lineHeight: '1rem',
    fontWeight: 400,
  },
}
```

---

## Concluzie

### Rezumat Îmbunătățiri Principale

| Funcționalitate | Curent | Propus | Benefit |
|-----------------|---------|---------|----------|
| Overview sistem | Nu există | Dashboard cu stats | ⚡ Instant overview |
| Detalii membru | Limitat | Modal complet cu stats | ⚡ All info at once |
| Search/Filter | Nu există | Advanced search & filters | ⚡ Quick find |
| Permisiuni | Expandable | Modal cu checkbox-uri | ⚡ Easier manage |
| Activity log | Nu există | Full activity tracking | ⚡ Full transparency |
| Bulk operations | Nu există | Select all + bulk edit | ⚡ Save time |

### Success Criteria

✅ **Time to find member**: < 2s (vs 10-15s curent)  
✅ **Time to view member details**: < 3s (vs 15-20s curent)  
✅ **Time to manage permissions**: < 5s (vs 20-30s curent)  
✅ **Overall satisfaction**: +40%  
✅ **Task completion rate**: +30%  

### Implementare Recomandată

**Faza 1 (Săptămâna 1):**
1. Implement Overview Dashboard
2. Add member statistics to database
3. Create MemberTable component

**Faza 2 (Săptămâna 2):**
4. Implement advanced search and filters
5. Create MemberDetailsModal
6. Add activity log tracking

**Faza 3 (Săptămâna 3):**
7. Implement bulk operations
8. Add performance metrics
9. Polish UI and UX

**Faza 4 (Săptămâna 4):**
10. Testing and bug fixes
11. Performance optimization
12. Documentation and training

---

**Document creat de:** Cline AI Assistant  
**Versiune:** 1.0  
**Ultima actualizare:** 23 Februarie 2026