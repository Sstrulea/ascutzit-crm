# Componente Mobile pentru CRM Kanban

Acest director conține componentele pentru layout-ul responsive mobil al board-ului Kanban, inspirat de Kommo.

## Structura Componentelor

### 1. `mobile-board-layout.tsx`
**Componenta principală** care orchestrează întregul layout mobil.

**Funcționalități:**
- Header compact cu selector pipeline și acțiuni
- Tabs orizontale scrollabile pentru stage-uri
- Listă verticală de carduri lead pentru stage-ul curent
- Bottom sheet pentru detalii lead
- Bottom sheet pentru mutare între stage-uri
- Buton flotant "+" pentru adăugare lead
- Suport pentru swipe gestures (stânga/dreapta pentru schimbarea stage-urilor)

**Props:**
```typescript
interface MobileBoardLayoutProps {
  leads: KanbanLead[]
  stages: string[]
  currentPipelineName: string
  pipelines: string[]
  onPipelineChange: (pipeline: string) => void
  onLeadMove: (leadId: string, newStage: string) => void
  onLeadClick?: (lead: KanbanLead) => void
  onAddLead?: () => void
  sidebarContent?: React.ReactNode
  onSearchClick?: () => void
  onFilterClick?: () => void
}
```

### 2. `mobile-board-header.tsx`
**Header compact** pentru layout-ul mobil.

**Conține:**
- Selector pipeline (dropdown)
- Buton căutare
- Buton filtre
- Buton meniu (deschide sidebar-ul ca drawer)

### 3. `stage-tabs.tsx`
**Tabs orizontale scrollabile** pentru stage-uri.

**Caracteristici:**
- Scroll orizontal pentru stage-uri multiple
- Badge cu numărul de lead-uri per stage
- Highlight pentru stage-ul activ
- Minimum touch target de 44px

### 4. `lead-card-mobile.tsx`
**Card de lead optimizat pentru mobil**.

**Conține:**
- Nume lead (bold)
- Email și telefon cu iconuri
- Vârstă lead (timp în stage)
- Tag-uri (primele 3 + counter pentru rest)
- Menu kebab (⋮) pentru acțiuni rapide
- Minimum touch target de 120px înălțime

**Acțiuni disponibile:**
- Tap pe card → deschide detalii
- Menu kebab → Mută, Editează, Arhivează

### 5. `lead-details-sheet.tsx`
**Bottom sheet** cu detalii complete ale lead-ului.

**Tab-uri:**
- **Info**: Contact, tag-uri, tehnician, sursă
- **Activitate**: Istoric mutări și evenimente
- **Fișe & Tăvițe**: Fișe de serviciu și tăvițe asociate

**Acțiuni:**
- Buton "Mută lead"
- Buton "Editează"

## Hook-uri

### `use-swipe.ts`
Hook pentru detectarea swipe gestures.

**Opțiuni:**
- `onSwipeLeft`: Callback pentru swipe stânga
- `onSwipeRight`: Callback pentru swipe dreapta
- `threshold`: Distanță minimă pentru swipe (default: 50px)
- `velocity`: Viteză minimă pentru swipe (default: 0.3 px/ms)

## Breakpoints Responsive

Layout-ul se schimbă automat la **768px** (breakpoint `md` din Tailwind):

- **< 768px**: Layout mobil (MobileBoardLayout)
- **≥ 768px**: Layout desktop (KanbanBoard clasic)

## Integrare

Layout-ul mobil este integrat automat în `app/(crm)/leads/[pipeline]/page.tsx`:

```typescript
{isMobile ? (
  <MobileBoardLayout ... />
) : (
  <KanbanBoard ... />
)}
```

## UX Features

1. **Swipe gestures**: Swipe stânga/dreapta pentru schimbarea stage-urilor
2. **Touch targets**: Toate elementele interactive au minimum 44px
3. **Bottom sheets**: Detalii și acțiuni în bottom sheets (mai ușor de accesat cu degetul)
4. **Header fix**: Header-ul rămâne fix la scroll
5. **Tabs scrollabile**: Stage-urile sunt scrollabile orizontal dacă nu încap pe ecran
6. **Floating action button**: Buton "+" flotant pentru adăugare rapidă

## Stiluri

Toate componentele folosesc:
- **Tailwind CSS** pentru styling
- **shadcn/ui** pentru componente UI de bază
- **Lucide React** pentru iconuri
- **date-fns** pentru formatarea datelor

## Dependențe

- `@/components/ui/*` - Componente UI de bază
- `@/lib/types/database` - Tipuri TypeScript
- `@/hooks/use-swipe` - Hook pentru swipe gestures
- `date-fns` - Formatare date
- `lucide-react` - Iconuri

