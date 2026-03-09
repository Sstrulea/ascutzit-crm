# Ascutzit CRM - Descriere Proiect

## 1. Prezentare Generală

**Ascutzit CRM** este o aplicație web de tip Customer Relationship Management construită pentru a gestiona fluxul de lucru al unei afaceri de reparații și service. Sistemul integrează gestionarea lead-urilor, vânzări, recepție, tehnicieni și raportare într-o singură platformă unificată.

---

## 2. Tech Stack

### Frontend
- **Framework**: Next.js 15.5.9 (App Router)
- **UI Library**: React 19.2.3
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS 4.x
- **Component Library**: Radix UI (dialog, dropdown, select, tabs, etc.)
- **Form Management**: React Hook Form + Zod validation
- **State Management**: TanStack Query v5 (React Query)
- **Charts**: Recharts 2.x
- **Icons**: Lucide React

### Backend & Database
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **API**: Next.js API Routes (Route Handlers)
- **Push Notifications**: Web Push API

### Development Tools
- **Package Manager**: npm / pnpm
- **Build Tool**: Next.js cu Turbopack (opțional)
- **Linting**: ESLint

---

## 3. Arhitectura Aplicației

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   Next.js App Router                 │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │   Pages     │  │ Components  │  │   Hooks     │  │    │
│  │  │  (app/*)    │  │(components) │  │  (hooks)    │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  │                       │                             │    │
│  │              ┌────────┴────────┐                    │    │
│  │              │   AuthContext   │                    │    │
│  │              │  + React Query  │                    │    │
│  │              └────────┬────────┘                    │    │
│  └───────────────────────┼─────────────────────────────┘    │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────┐
│                     API LAYER                                 │
│  ┌───────────────────────────────────────────────────────┐   │
│  │              Next.js API Routes (app/api/*)            │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│  │  │  Admin  │ │  Leads  │ │ Vanzari │ │  Cron   │      │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│  └───────────────────────────┬───────────────────────────┘   │
│                              │                                │
└──────────────────────────────┼────────────────────────────────┘
                               │
┌──────────────────────────────┼────────────────────────────────┐
│                       DATA LAYER                               │
│  ┌───────────────────────────────────────────────────────┐    │
│  │              Supabase Operations (lib/supabase/*)      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │    │
│  │  │    Leads     │  │   Service    │  │   Kanban    │  │    │
│  │  │  Operations  │  │    Files     │  │   Cache     │  │    │
│  │  └──────────────┘  └──────────────┘  └─────────────┘  │    │
│  └───────────────────────────┬───────────────────────────┘    │
│                              │                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │                    Supabase                            │    │
│  │              PostgreSQL + Auth + Storage               │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Principale

### 4.1 Sistem de Autentificare și Autorizare

**Roluri de utilizator:**
- `owner` - Acces complet la toate funcționalitățile
- `admin` - Gestionare utilizatori și setări sistem
- `member` - Membru cu acces general
- `vanzator` - Rol pentru echipa de vânzări
- `receptie` - Rol pentru recepție
- `tehnician` - Rol pentru tehnicienii de service

**Funcționalități:**
- Autentificare prin Supabase Auth
- Permisiuni bazate pe pipeline-uri
- Middleware pentru protecția rutelor
- Context React pentru starea de autentificare

### 4.2 Gestionare Lead-uri (Kanban)

**Structură:**
- **Pipelines**: Fluxuri de lucru distincte (ex: Vânzări, Recepție, Tehnician)
- **Stages**: Etape în cadrul fiecărui pipeline
- **Leads**: Lead-uri individuale cu informații complete

**Informații Lead:**
- Date de contact (nume, email, telefon, adresă)
- Date livrare (oraș, județ, stradă)
- Date facturare (companie, CUI, adresă fiscală)
- Metadate Facebook (campaign, adset, form)
- Status flags: `no_deal`, `call_back`, `nu_raspunde`

### 4.3 Modul Vânzări

**Funcționalități:**
- Gestionare lead-uri în pipeline de vânzări
- Facturare și anulări
- Statistici vânzări
- Integrare cu curier
- Arhivare automată (cron jobs)

### 4.4 Modul Tehnician

**Componente:**
- Dashboard tehnician
- Gestionare tăvițe (trays)
- Fișe de service
- Statistici și comisioane
- Înregistrare sesiuni de lucru

### 4.5 Modul Recepție

**Funcționalități:**
- Recepție echipamente
- Gestionare draft-uri
- Atribuire către tehnicieni

### 4.6 Modul Admin

**Gestionare:**
- Membri echipă
- Backup-uri bază de date
- Rapoarte financiare
- Sincronizare utilizatori
- Setări sistem

---

## 5. Structura Directoarelor

```
app/
├── (crm)/                    # Rute autentificate CRM
│   ├── admins/              # Pagină administrare
│   ├── configurari/         # Setări și catalog
│   ├── dashboard/           # Dashboard-uri
│   │   ├── baza-clienti/   # Baza de clienți
│   │   ├── statistici-*/   # Statistici diverse
│   │   └── tehnician/      # Dashboard tehnician
│   ├── leads/               # Gestionare lead-uri
│   │   └── [pipeline]/     # Vizualizare pipeline dinamic
│   ├── profile/             # Profil utilizator
│   ├── search/              # Căutare globală
│   └── tehnician/           # Module tehnician
│       ├── dashboard/
│       ├── profile/
│       └── tray/[trayId]/
├── api/                     # API Routes
│   ├── admin/              # Endpoint-uri admin
│   ├── auth/               # Autentificare
│   ├── cron/               # Cron jobs
│   ├── leads/              # Operații lead-uri
│   ├── notifications/      # Push notifications
│   ├── pipelines/          # Gestionare pipeline-uri
│   ├── vanzari/            # Operații vânzări
│   └── ...
├── auth/                   # Pagini autentificare
└── setup/                  # Setup inițial

components/
├── admin/                  # Componente admin
├── auth/                   # Componente autentificare
├── configurari/           # Componente configurări
├── dashboard/             # Componente dashboard
├── kanban/                # Componente Kanban
├── layout/                # Layout (sidebar, header)
├── lead-details/          # Detalii lead
├── leads/                 # Liste lead-uri
├── tehnician/             # Componente tehnician
├── trays/                 # Componente tăvițe
├── ui/                    # Componente UI de bază
└── vanzari/               # Componente vânzări

lib/
├── contexts/              # React Contexts
├── supabase/              # Operațiuni Supabase
│   ├── kanban/           # Logică Kanban
│   └── *.ts              # Diverse operațiuni
├── types/                 # TypeScript types
├── utils/                 # Utilități
├── vanzari/               # Logică vânzări
└── tracking/              # Tracking evenimente
```

---

## 6. API Endpoints Principale

### Autentificare și Utilizatori
- `POST /api/auth/username-to-email` - Conversie username la email
- `GET /api/admin/members` - Lista membri
- `POST /api/admin/members/add` - Adăugare membru
- `POST /api/admin/members/reset-password` - Resetare parolă

### Lead-uri
- `GET/POST /api/leads/baza-clienti` - Baza de clienți
- `POST /api/leads/facebook-webhook` - Webhook Facebook leads
- `POST /api/leads/expire-callbacks` - Expirare callback-uri
- `POST /api/leads/move-to-colet-neridicat` - Mutare în colet neridicat

### Pipeline-uri
- `GET /api/pipelines` - Lista pipeline-uri
- `POST /api/pipelines/update-stages` - Actualizare etape

### Vânzări
- `POST /api/vanzari/factureaza` - Facturare
- `POST /api/vanzari/anuleaza-factura` - Anulare factură
- `GET /api/vanzari/statistics` - Statistici vânzări

### Cron Jobs
- `GET /api/cron/backup` - Backup automat
- `GET /api/cron/midnight-ro` - Task-uri de miezul nopții
- `GET /api/cron/vanzari-archive-no-deal` - Arhivare no-deal
- `GET /api/cron/vanzari-followup-reminder` - Reminder-uri follow-up

---

## 7. Modele de Date Principale

### Pipeline
```typescript
interface Pipeline {
  id: string
  name: string
  description: string | null
  position: number
  is_active: boolean
  created_at: string
  updated_at: string
}
```

### Stage
```typescript
interface Stage {
  id: string
  pipeline_id: string
  name: string
  position: number
  is_active: boolean
  created_at: string
  updated_at: string
}
```

### Lead
```typescript
interface Lead {
  id: string
  // Facebook metadata
  ad_id, ad_name, adset_id, campaign_id, form_id...
  // Contact info
  full_name, email, phone_number
  // Address
  city, judet, strada, address, zip, country
  // Billing
  billing_nume_prenume, billing_nume_companie, billing_cui...
  // Status
  no_deal, call_back, callback_date, nu_raspunde
  // Assignment
  claimed_by
  // Timestamps
  created_at, updated_at
}
```

### LeadPipeline
```typescript
interface LeadPipeline {
  id: string
  lead_id: string
  pipeline_id: string
  stage_id: string
  assigned_at: string
  updated_at: string
  notes: string | null
}
```

---

## 8. Integrări Externe

### Facebook Lead Ads
- Webhook pentru primire automată lead-uri
- Parsare și stocare în baza de date
- Câmpuri mapate: nume, email, telefon, oraș, etc.

### Push Notifications
- Abonare utilizatori la notificări
- Trimite notificări pentru evenimente importante
- Configurare VAPID keys

### Export/Import
- Export date în format JSON (backup)
- Export schema bază de date
- Import din backup

---

## 9. Securitate

- **Autentificare**: Supabase Auth cu sesiuni securizate
- **Autorizare**: Middleware pentru protecția rutelor
- **Validare**: Zod schemas pentru toate input-urile
- **Backup**: Backup-uri automate zilnice

---

## 10. Performanță

### Optimizări Implementate
- **Caching**: React Query pentru cache date
- **Kanban Cache**: Cache specific pentru date Kanban
- **Lazy Loading**: Componente încărcate lazy
- **Code Splitting**: Împărțire automată pe route

### Monitorizare
- Scripturi de monitorizare performanță
- Contor request-uri Supabase (dev mode)

---

## 11. Deployment

Aplicația este configurată pentru deployment pe Vercel:
- Analytics integrate (@vercel/analytics)
- Suport pentru environment variables
- Scripturi pentru build și start

---

## 12. Concluzie

Ascutzit CRM este o aplicație enterprise-grade pentru gestionarea unui business de service și reparații. Arhitectura modulară permite extinderea ușoară, iar integrarea cu Supabase oferă o bază solidă pentru scalabilitate. Sistemul de roluri și permisiuni asigură securitatea datelor, iar interfața modernă oferă o experiență de utilizare plăcută.
