# CRM Technical Analysis – Detailed Report

---

## 1. Executive Summary (Project Description)

**Ascutzit CRM** is an internal CRM (Customer Relationship Management) platform for a professional instrument service/repair business (salon, horeca, barbershop). The project manages the entire lifecycle of a client – from **lead** (request/order) to **delivery**, **reception**, **repair** in departments, **quality control**, and **invoicing/archiving**.

**Business purpose:**
- Automatic lead capture from Meta (Facebook Lead Ads) and website.
- Sales management through a Kanban pipeline with stages: Leads (Leaduri), Call back, Does Not Answer (Nu Răspunde), No Deal, Deliveries (Livrări).
- Tracking service files through Reception (Recepție) (parcel arrived, uncollected parcel, to invoice, to send).
- Distribution of trays (containers with instruments) to specialized departments: Salons (Saloane), Horeca, Barbershops (Frizerii), Repairs (Reparații).
- Quality Check (validation) of completed trays.
- Invoicing and archiving upon completion.

**End users:**
- **Sellers (Vânzători)** – take leads, call clients, set call back / does not answer / no deal / delivery.
- **Reception (Recepție)** – manage service files, send trays to departments, invoice.
- **Technicians (Tehnicieni)** – work on trays in departments, add parts and services, finalize.
- **Admins / Owner** – configurations, instrument/service catalog, statistics, backup, member management.

**Core value:** An all-in-one CRM that connects sales, logistics, service, and invoicing in a single Kanban dashboard, eliminating paper-based processes and centralizing information.

---

## 2. Manually Triggered Functions (Buttons)

### 2.1 Lead Card – Sales Pipeline (Vânzări) (`components/kanban/lead-card.tsx`)

| Function Name | Line | Component/UI | Action Description |
| :--- | :--- | :--- | :--- |
| `handleCardClick` | ~718 | Click on card | Opens the lead / service file details panel (toggle select in selection mode) |
| `handleNoDeal` | ~292 | "No Deal" button on card | Calls `setLeadNoDeal(leadId)` → sets `no_deal=true`, clears callback/does_not_answer, removes tags → lead moved to No Deal stage |
| `handleDeliveryConfirm` | ~325 | Delivery confirmation dialog | Creates service file, adds to Reception (Courier Sent/Office Direct), moves lead to Sales (Vânzări), logs event |
| `handleRemoveCurierTrimis` | ~450 | "X" button on Courier Sent (Curier Trimis) badge | Removes the `curier_trimis` flag from the lead and associated tag |
| `handleRemoveOfficeDirect` | ~475 | "X" button on Office Direct badge | Removes the `office_direct` flag from the lead and associated tag |
| `handleToggleAssignTag` | ~210 | Tag popover on card | Toggles a tag on the lead (add/remove) via `toggleLeadTag` |
| `handleCheckboxChange` | ~750 | Bulk selection checkbox | Toggles lead selection for bulk operations |
| `handleStageSelect` | ~754 | "Move to stage" dropdown | Moves the lead to another stage in the pipeline (via `onMove`) |
| `handlePinToggle` | ~785 | Pin button on card | Toggles pin on lead (marks as priority) |
| `handleNuRaspundeToggle` | ~825 | "Does Not Answer" (Nu Răspunde) dropdown | Toggles Does Not Answer (Nu Răspunde) tag on lead |
| `handleNuAVenitToggle` | ~869 | "Did Not Come" (Nu a Venit) dropdown | Toggles "Did Not Come" (Nu a Venit) tag on lead; sets `colet_neridicat` |
| `handleDeassignTrayTechnician` | ~909 | "X" button on tray technician | Unassigns technician from tray (resets `technician_id`) |
| (inline) Remove Call! (Sună!) tag | ~1527 | "X" button on Call! (Sună!) badge | Removes Call! (Sună!) tag, updates `suna_acknowledged_at`, logs event |

### 2.2 Kanban Board (`components/kanban/kanban-board.tsx`)

| Function Name | Line | Component/UI | Action Description |
| :--- | :--- | :--- | :--- |
| `handleDragStart` | ~706 | Drag & Drop card | Starts the drag operation on a card |
| `handleDragEnd` | ~710 | Drop card on another stage | Moves the lead/file to the new stage (drop) |
| `handleSelectAll` | ~1558 | "Select all" button | Selects/deselects all cards in the stage |
| `handleConfirmDelete` | ~1962 | Delete confirmation dialog | Deletes the selected leads (bulk) |
| `handleBulkMove` | ~2026 | Bulk move dialog | Moves selected leads to another stage/pipeline |
| `handleOpenMoveDialog` | ~969 | "Move selection" button | Opens the bulk move dialog (stage or pipeline) |
| (inline) Set Callback bulk | ~903 | Bulk "Call back" button | Opens callback dialog for the current selection |
| (inline) Does Not Answer (Nu Răspunde) bulk | ~913 | Bulk "Does Not Answer" (Nu Răspunde) button | Opens Does Not Answer (Nu Răspunde) dialog for the current selection |
| (inline) No Deal bulk | ~923 | Bulk "No Deal" button | Sets No Deal on all selected leads |
| (inline) Archive (Arhivare) | ~1101-1186 | "Archive" (Arhivare) button on Reception card | Archives file + trays + lead (stage To Send (De Trimis) / Pick Up Personally (Ridic Personal) → Archived (Arhivat)) |

### 2.3 Sales Panel (Panou Vânzări) (`components/leads/VanzariPanel.tsx`)

| Function Name | Line | Component/UI | Action Description |
| :--- | :--- | :--- | :--- |
| `handleCallback` | ~30 | "Call back" button | Sets `call_back=true`, `callback_date` on lead → Call back stage |
| `handleNuRaspunde` | ~46 | "Does Not Answer" (Nu Răspunde) button | Sets `nu_raspunde=true`, `nu_raspunde_callback_at` → Does Not Answer (Nu Răspunde) stage |
| `handleNoDeal` | ~62 | "No deal" button | `setLeadNoDeal(leadId)` → removes flags, tags, moves to No Deal |
| `handleCurierTrimis` | ~79 | "Courier Sent" (Curier Trimis) button | `setLeadCurierTrimis()` → creates service file, adds to Reception (Recepție) |
| `handleOfficeDirect` | ~97 | "Office Direct" button | `setLeadOfficeDirect()` → creates service file, adds to Reception (Recepție) |

### 2.4 Lead Details Panel (`components/leads/lead-details-panel.tsx`)

| Function Name | Line | Component/UI | Action Description |
| :--- | :--- | :--- | :--- |
| (inline) To Send (De Trimis) | ~1382 | "To Send" (De Trimis) button | Moves file from To Invoice (De Facturat) / Does Not Answer (Nu Răspunde) → To Send (De Trimis) stage in Reception (Recepție) |
| (inline) Pick Up Personally (Ridic Personal) | ~1397 | "Pick Up Personally" (Ridic Personal) button | Moves file → Pick Up Personally (Ridic Personal) stage in Reception (Recepție) |

### 2.5 To Invoice Overlay (De Facturat) (`components/leads/DeFacturatOverlay.tsx`)

| Function Name | Line | Component/UI | Action Description |
| :--- | :--- | :--- | :--- |
| `handleFacturare` | ~428 | Invoice / Invoice+AWB button | Calls `factureazaServiceFile()` → status invoiced, moves file to Pick Up Personally (Ridic Personal) or To Send (De Trimis) |
| `handleNuRaspundeConfirm` | ~477 | Does Not Answer (Nu Răspunde) dialog from overlay | Sets Does Not Answer (Nu Răspunde) on file with timer |
| `handlePinToggle` | ~538 | Pin button | Toggles pin on file |
| `handleRetrimiteInDepartamentSiColetAjuns` | ~559 | "Resend to department" button | Resends trays to departments and marks Parcel Arrived (Colet Ajuns) |
| `handlePrintFisa` | ~608 | "Print file" button | `window.print()` → prints the service file |
| `handlePrintTavite` | ~612 | "Print trays" button | `window.print()` → prints the trays |
| (inline) saveBilling | ~1000 | "Save billing" button | Saves billing data (company, address) |

### 2.6 Sales Actions – Lead Details (`components/lead-details/actions/LeadVanzariActions.tsx`)

| Function Name | Line | Component/UI | Action Description |
| :--- | :--- | :--- | :--- |
| `handleCallback` | ~122 | Callback button from details | Sets callback on lead with chosen date/time |
| `handleSalvare` | ~171 | "Save" button | Saves changes from the details panel |
| `handleRevenire` | ~177 | "Revert" button | Reverts unsaved changes |

### 2.7 Lead Details Sections (`components/lead-details/sections/`)

| Function Name | File | Component/UI | Action Description |
| :--- | :--- | :--- | :--- |
| `handleSave` | `LeadDetailsSection.tsx:89` | "Save" details button | Saves lead details (text) to DB |
| `handleSave` | `LeadContactInfo.tsx:193` | "Save" contact button | Saves lead contact information (phone, email, address) |
| `handleSave` | `LeadTechnicianDetailsSection.tsx:73` | "Save" technician details button | Saves details added by technician |

### 2.8 Prices (Prețuri) – Orchestrator and Views

| Function Name | File | Action Description |
| :--- | :--- | :--- |
| `handleAddInstrumentDirect` | `PreturiOrchestrator.tsx:382` | Adds instrument to tray (with department check) |
| `handleSaveEdit` | `TrayTabs.tsx:126` | Saves editing of tray name/number |
| `handleAssignClick` | `TrayImagesSection.tsx:62` | Assigns image to tray |
| `handleAddInstrument` | `VanzariViewV4.tsx:1425` | Adds instrument to quote |
| `handleSave` | `VanzariViewV4.tsx:1639` | Saves the quote (V4 view) – persists to DB |
| `handleToggleService` | `VanzariViewV4.tsx:1488` | Toggles service on instrument |
| `handleAddPart` | `VanzariViewV4.tsx:1536` | Adds part to instrument |
| `handleAddTray` | `VanzariViewV4.tsx:1568` | Adds new tray to file |
| `handleRemoveTray` | `VanzariViewV4.tsx:1572` | Removes tray from file |
| `handleFacturare` (Reception) | `ReceptieView.tsx:493` | Invoices file from the reception view |
| (inline) Send trays | `ReceptieView.tsx:587` | Sends trays to departments |
| `handleSubmit` | `SplitTrayTechnicianDialog.tsx:240` | Splits tray among multiple technicians |

### 2.9 Technician Tray Page (`app/(crm)/tehnician/tray/[trayId]/page.tsx`)

| Function Name | Line | Action Description |
| :--- | :--- | :--- |
| `handleImageUpload` | ~674 | Uploads tray image to Supabase Storage |
| `handleImageDelete` | ~726 | Deletes image from Storage + DB |
| `handleDownloadAllImages` | ~748 | Downloads all tray images as zip |
| `handleUrgentChange` | ~773 | Toggles urgent on tray |
| `handleStatusChange` | ~793 | Changes tray status: in_receptie → in_lucru → gata → moves stage in dept |
| `handleAddPart` | ~954 | Adds part to tray |
| `handleAddService` | ~1284 | Adds service to tray |
| `handleSaveEditService` | ~1431 | Saves service edit on tray |
| `handleDeleteItem` | ~1589 | Deletes item (service/part) from tray |

### 2.10 Catalog Configuration (`app/(crm)/configurari/catalog/page.tsx`)

| Function Name | Line | Action Description |
| :--- | :--- | :--- |
| `handleSaveInstrument` | ~329 | Saves new/edited instrument to catalog |
| `handleSaveService` | ~359 | Saves new/edited service to catalog |
| `handleDeleteInstrument` | ~382 | Deletes instrument from catalog |
| `handleDeleteService` | ~403 | Deletes service from catalog |
| `handleAddNewInstrument` | ~544 | Creates new instrument |
| `handleAddNewService` | ~424 | Creates new service |
| `handleAssociateServices` | ~515 | Associates services with an instrument |
| `handleRemoveServiceFromInstrument` | ~593 | Disassociates service from instrument |

### 2.11 Dashboard & Statistics

| Function Name | File | Action Description |
| :--- | :--- | :--- |
| `handleRefresh` | `dashboard/page.tsx:200` | Reloads dashboard data |
| `handleRefresh` | `statistici-apeluri/page.tsx:167` | Reloads call statistics |
| `handleBackfill` | `statistici-apeluri/page.tsx:211` | Backfills sales calls (owner) |
| `handleAtribuieComenzi` | `statistici-apeluri/page.tsx:227` | Assigns orders to sellers (owner) |
| `handleChangePassword` | `profile/page.tsx:165` | Changes user password |
| `handleUpdateDisplayName` | `profile/page.tsx:235` | Updates display name |

### 2.12 Main Kanban Page (`app/(crm)/leads/[pipeline]/page.tsx`)

| Function Name | Line | Action Description |
| :--- | :--- | :--- |
| `handleLeadClick` | ~1807 | Opens lead/file/tray details (with single item fetch) |
| `handleMove` | ~1356 | Moves lead/file to another stage (RPC `move_item_to_stage`) |
| `handleBulkMoveToStage` | ~1422 | Bulk move to another stage |
| `handleBulkMoveToPipeline` | ~1538 | Bulk move to another pipeline |
| `handleBulkMoveToPipelines` | ~1261 | Moves lead to multiple pipelines |
| `handleBulkMoveCurierAjunsAziToAvemComanda` | ~1520 | Bulk move Courier Arrived Today (Curier Ajuns Azi) → We Have Order (Avem Comandă) |

### 2.13 Messenger (`components/leads/lead-messenger.tsx`)

| Component | Line | Action Description |
| :--- | :--- | :--- |
| `onSubmit` (form) | ~923 | Sends message/note/image to lead history |
| (inline) Attach tray image | ~1023 | Attaches image from tray gallery |
| (inline) Upload from camera/gallery | ~979/989 | Opens file picker (camera or gallery) |

---

## 3. Automated Functions (Background)

### 3.1 Cron Jobs (Vercel Cron – `vercel.json`)

| Task Name | File | Type | Frequency | Description |
| :--- | :--- | :--- | :--- | :--- |
| **No Deal → Archived (Arhivat)** | `app/api/cron/midnight-ro/route.ts` | Vercel Cron | `0 22 * * *` (daily 22:00 UTC) | Moves leads from No Deal stage to Archived (Arhivat) if they have been there ≥24h. Sets `no_deal=true`, logs to `items_events` |
| **Courier → We Have Order (Avem Comandă)** | `app/api/cron/curier-to-avem-comanda/route.ts` | Vercel Cron | `0 1 * * *` (daily 01:00 UTC) | Moves leads with Courier Sent (Curier Trimis) / Office Direct tag assigned > 24h from current stage (e.g. Courier Arrived Today (Curier Ajuns Azi)) to We Have Order (Avem Comandă) |
| **Uncollected Parcel (Colet Neridicat)** | `app/api/cron/vanzari-colet-neridicat/route.ts` | Cron (manual/scheduled) | Daily at 23:59 | Finds `service_files` with `curier_trimis` older than 2 days. Moves leads to Uncollected Parcel (Colet Neridicat), sets `no_deal=true`, notifies sellers |
| **Archive No Deal** | `app/api/cron/vanzari-archive-no-deal/route.ts` | Cron (manual/scheduled) | Weekly (Sunday 23:59) | Archives No Deal leads older than 30 days: moves to `arhiva_fise_serviciu`, deletes from pipeline |
| **Follow-up Reminder** | `app/api/cron/vanzari-followup-reminder/route.ts` | Cron (manual/scheduled) | Daily at 09:00 | Finds leads with callback expiring in 24h, sends reminder to sellers |
| **Automatic backup** | `app/api/cron/backup/route.ts` | Cron (manual/scheduled) | Hourly/Daily | Automatic backup via `backupManager` (hourly/daily/manual) |

### 3.2 Webhooks

| Name | File | Type | Condition | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Facebook Lead Webhook** | `app/api/leads/facebook-webhook/route.ts` | Webhook (POST) | On each new lead from Facebook Ads | Receives `leadgen_id`, fetches from Graph API, inserts into `leads`, phone classification → Leads (Leaduri) / Foreign Leads (Leaduri Străine), adds to Sales (Vânzări) pipeline |
| **Facebook Verify** | `app/api/leads/facebook-webhook/route.ts` (GET) | Webhook verify | On initial setup | Verifies `FACEBOOK_VERIFY_TOKEN` for webhook subscription |

### 3.3 "On Access" Automated Functions (on pipeline load)

| Name | File | Condition | Description |
| :--- | :--- | :--- | :--- |
| **Expire Callbacks** | `app/api/leads/expire-callbacks/route.ts` + `lib/supabase/expireCallbacks.ts` | On Sales (Vânzări) pipeline load | Moves leads with expired `callback_date`/`nu_raspunde_callback_at` from override stages to the real stage in DB |
| **Expire Uncollected Parcel (Colet Neridicat)** | `lib/supabase/expireColetNeridicat.ts` | On Reception (Recepție) access | Checks files with `curier_scheduled_at` > 36h, moves to Uncollected Parcel (Colet Neridicat) |
| **Stage overrides** | `lib/supabase/kanban/strategies/standard.ts` | On each Sales (Vânzări) Kanban load | Calculates virtual stage (No Deal > Call back > Does Not Answer (Nu Răspunde) > We Have Order (Avem Comandă) > DB) without modifying DB |
| **Virtual items Reception (Recepție)** | `lib/supabase/kanban/strategies/receptie.ts` | On each Reception (Recepție) Kanban load | Loads files with `office_direct`/`curier_trimis` from DB even if they don't have `pipeline_items`; calculates stage from tray state |
| **Virtual items Quality** | `lib/supabase/kanban/strategies/quality.ts` | On each Quality Kanban load | Reads trays from departments (Completed (Finalizată) stage), filters those not QC validated, displays virtually |

### 3.4 Supabase Realtime (WebSocket Subscriptions)

| Channel | File | Table | Description |
| :--- | :--- | :--- | :--- |
| `global_history_{leadId}` | `components/leads/lead-history.tsx:1022` | `items_events` (INSERT) | Listens for new events on lead → automatic history update |
| `tray_events_{trayId}` | `components/leads/lead-history.tsx:1057` | `items_events` (INSERT, filter tray) | Listens for events on tray → tray history update |
| `rt-tags-lead-panel` | `hooks/leadDetails/useLeadDetailsDataLoader.ts:357` | `tags` (all events) | Updates the list of available tags when modified |
| `user-notifications-{userId}` | `components/notifications/NotificationBell.tsx:136` | `push_subscriptions` / notifications | Listens for new notifications for the current user |

### 3.5 useEffect Hooks with Business Logic

| Hook/Component | File | Condition | Description |
| :--- | :--- | :--- | :--- |
| Auto-load pipeline data | `hooks/useKanbanData.ts:451` | On mount + auth ready | Loads Kanban data for the current pipeline, sets refresh interval |
| Auto-refresh on visibility | `hooks/useKanbanData.ts:799` | `document.visibilityState === 'visible'` | Reloads Kanban data when the tab becomes visible |
| Auto-refresh on online | `hooks/useKanbanData.ts:463` | `navigator.onLine` event | Invalidates Kanban cache on internet reconnection |
| Load lead data | `hooks/leadDetails/useLeadDetailsDataLoader.ts:162` | When `leadIdMemo` changes | Loads complete lead details + files + trays + tags |
| Load Prices (Prețuri) data | `hooks/usePreturiDataLoader.ts:93` | On mount | Loads instruments, services, prices for the Prices (Prețuri) module |
| Load service file flags | `hooks/usePreturiEffects.ts:440` | On mount | Loads file flags (urgent, office_direct, curier_trimis) |
| Auto-restore draft | `app/(crm)/leads/[pipeline]/page.tsx:292` | On mount (with timeout) | Restores lead creation draft from sessionStorage |
| Check push permissions | `hooks/usePushNotifications.ts:43` | On mount | Checks push notification permissions |
| Search debounce | `app/(crm)/leads/[pipeline]/page.tsx:853` | `searchQuery` changes | 300ms debounce on search, then search API |

### 3.6 Automated API Routes (called by the system, not directly by users)

| Route | File | Description |
| :--- | :--- | :--- |
| `POST /api/leads/expire-callbacks` | `app/api/leads/expire-callbacks/route.ts` | Callback/does_not_answer expiration (called on pipeline load) |
| `POST /api/leads/move-to-colet-neridicat` | `app/api/leads/move-to-colet-neridicat/route.ts` | Moves files to Uncollected Parcel (Colet Neridicat) (called by cron or on-access) |
| `POST /api/notifications/create` | `app/api/notifications/create/route.ts` | Creates notifications (called from business logic) |
| `DELETE /api/admin/delete-empty-trays` | `app/api/admin/delete-empty-trays/route.ts` | Cleans up empty trays (cron or admin manual) |
| `POST /api/service-files/set-colet-ajuns` | `app/api/service-files/set-colet-ajuns/route.ts` | Marks file as "parcel arrived" (colet ajuns) |
| `POST /api/tracking/` | `app/api/tracking/route.ts` | Event tracking (action logging) |

---

## 4. Particularities and Architecture

### 4.1 Technology Stack

| Technology | Version | Role |
| :--- | :--- | :--- |
| **Next.js** | 16.1.0 | Full-stack framework (App Router) |
| **React** | 19.2.3 | UI rendering |
| **TypeScript** | ^5 | Type safety |
| **Supabase** | `@supabase/supabase-js ^2.57.3` | BaaS: PostgreSQL, Auth, Realtime, Storage |
| **Tailwind CSS** | ^4.1.9 | Utility-first styling |
| **Radix UI** | Multiple (v1.x-2.x) | Accessible UI components (dialog, dropdown, popover, etc.) |
| **TanStack React Query** | ^5.90.12 | Server state management, caching |
| **Recharts** | 2.15.4 | Charts for dashboard/statistics |
| **date-fns** | latest | Date manipulation |
| **Zod** | 3.25.67 | Schema validation |
| **react-hook-form** | ^7.60.0 | Forms |
| **web-push** | ^3.6.7 | Push notifications (VAPID) |
| **Vercel** | Deployment target | Hosting + Cron jobs |
| **Lucide React** | ^0.454.0 | Icons |
| **sonner** | ^1.7.4 | Toast notifications |
| **vaul** | ^0.9.9 | Drawer component (mobile) |
| **cmdk** | 1.0.4 | Command palette (Ctrl+K search) |

### 4.2 Project Structure

```
app/
├── (crm)/                    # Protected route group (layout with auth check)
│   ├── leads/[pipeline]/     # Main Kanban page (dynamic per pipeline)
│   ├── leads/parteneri/      # Partners pipeline
│   ├── admins/               # Member/admin management
│   ├── configurari/catalog/  # Instrument + service catalog
│   ├── dashboard/            # Main dashboard + statistics
│   ├── dashboard/tehnician/  # Technician dashboard
│   ├── profile/              # User profile
│   └── tehnician/            # Technician pages (tray, dashboard, profile)
├── api/                      # API Routes (Next.js Route Handlers)
│   ├── cron/                 # 6 automated cron jobs
│   ├── leads/                # Facebook webhook, expire callbacks, simulation
│   ├── vanzari/              # Invoicing, statistics, invoice cancellation
│   ├── admin/                # Backup, sync, delete empty trays
│   ├── push/                 # Web Push notifications
│   ├── search/               # Unified search + trays
│   └── ...
├── auth/sign-in/             # Login page
└── setup/                    # Initial permissions setup

components/
├── kanban/                   # Kanban board, lead card, lazy card
├── leads/                    # Details panels, overlays, messenger, history
├── lead-details/             # Detail sections (contact, services, actions)
├── preturi/                  # Prices (Prețuri) module (views, forms, dialogs, sections)
├── notifications/            # NotificationBell
└── ui/                       # Reusable Shadcn/UI components

hooks/
├── leadDetails/              # 8 hooks for the lead details panel
├── preturi/                  # 6 hooks for the Prices (Prețuri) module
├── queries/                  # React Query hooks (instruments, services, pipelines)
└── ...                       # useKanbanData, usePushNotifications, etc.

lib/
├── supabase/                 # Supabase operations
│   ├── kanban/               # Pipeline strategies (standard, reception, department, quality)
│   │   ├── strategies/       # Strategy Pattern per pipeline
│   │   ├── cache.ts          # Cache mechanism for stages/pipelines
│   │   ├── fetchers.ts       # Centralized fetch functions
│   │   └── transformers.ts   # Raw data → KanbanItem transformation
│   ├── leadOperations.ts     # Lead CRUD
│   ├── serviceFileOperations.ts # Service file CRUD
│   ├── pipelineOperations.ts # Item moves, adding to pipeline
│   ├── tagOperations.ts      # Tag CRUD
│   └── ...
├── vanzari/                  # Sales (Vânzări) business logic
│   ├── leadOperations.ts     # setLeadNoDeal, setLeadCurierTrimis, setLeadOfficeDirect
│   ├── facturare.ts          # factureazaServiceFile
│   ├── priceCalculator.ts    # Price calculation
│   └── statistics.ts         # Sales statistics
├── types/                    # TypeScript types (database.ts, preturi.ts)
├── history/                  # File snapshots, draft cache
├── push/                     # sendPush (Web Push)
├── contexts/                 # AuthContext (authentication + roles provider)
├── dataSafety/               # Backup manager, validation framework
└── tracking/                 # Event tracking + stacking
```

**Why it is organized this way:**
- **App Router (Next.js 16)**: Route groups (`(crm)`) for auth-protected layouts.
- **Strategy Pattern** for Kanban pipelines: each pipeline (Sales (Vânzări), Reception (Recepție), Department, Quality) has its own item loading strategy, allowing different logic per context.
- **Granular custom hooks** per functionality: the `leadDetails/` and `preturi/` hooks are decomposed for reusability and separation of concerns.
- **Separation of `lib/vanzari/` vs `lib/supabase/`**: business logic (sales, invoicing) is separated from data access (supabase operations).

### 4.3 Authentication and Authorization

- **Supabase Auth** with `@supabase/ssr` and `@supabase/auth-helpers-nextjs`.
- **Middleware** (`middleware.ts`): intercepts all non-API, non-static requests; calls `getSession()` with 3s timeout for cookie refresh.
- **AuthContext** (`lib/contexts/AuthContext.tsx`): React provider that exposes `user`, `profile`, `role`, `permissions`.
- **6 roles**: `owner`, `admin`, `member`, `vanzator`, `receptie`, `tehnician`.
- **Per-pipeline permissions**: stored in DB (`pipeline_permissions`); users only see pipelines they have access to.
- **Redirect**: `app/(crm)/layout.tsx` redirects to `/auth/sign-in` if no user exists.

### 4.4 State Management

- **React Query** (`@tanstack/react-query`): for server data (instruments, services, pipelines, technicians) – hooks in `hooks/queries/`.
- **React `useState` + `useCallback`**: local state in components and custom hooks.
- **AuthContext**: global state for authentication/roles.
- **Custom cache**: `lib/supabase/kanban/cache.ts`, `kanbanCache.ts`, `receptieCache.ts`, `vanzariCache.ts`, `departmentCache.ts` – in-memory cache with 60s TTL for Kanban data.
- **SessionStorage**: for lead creation draft, restore on navigation.
- **URL state**: `?q=` for search, `?lead=` / `?tray=` for deep linking to items.

### 4.5 Special Observations

- **Pattern matching for stages**: The code does not rely on hardcoded IDs for stages, but rather on **name patterns** (e.g.: `['in lucru', 'in work', 'în lucru']`). This allows flexibility when renaming stages in the DB. Defined in `lib/supabase/kanban/constants.ts`.

- **Virtual items**: Quality Check and Reception (Recepție) display items that **do not exist** in `pipeline_items` – they are calculated at runtime from the tray state in departments.

- **Stage overrides**: In Sales (Vânzări), the stage displayed on a card can differ from the stage in the DB (e.g.: a lead with `call_back=true` appears in Call back regardless of `pipeline_items.stage_id`).

- **Supabase RPCs**: `move_item_to_stage` – server-side function for atomic moves with logging. Called from both UI and cron jobs.

- **For loop instead of .some()**: The code contains a deliberate pattern of using `for` loops instead of `.some()` / `.find()` with a comment "MAI SIGUR" (SAFER) – possibly for debugging or avoiding a previous bug with array methods.

- **Critical environment variables**:
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase connection
  - `SUPABASE_SERVICE_ROLE_KEY` – Supabase admin access (server-side only)
  - `FACEBOOK_PAGE_ACCESS_TOKEN` / `FACEBOOK_VERIFY_TOKEN` – Meta integration
  - `DEFAULT_PIPELINE_ID` / `DEFAULT_STAGE_ID` / `LEADURI_STRAINA_STAGE_ID` – Pipeline/stage IDs for Facebook webhook
  - `CRON_SECRET` / `CRON_SECRET_KEY` – Cron jobs authentication
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` – Web Push notifications
  - `SIMULATE_FACEBOOK_SECRET` – Secret for webhook simulation (dev)

- **Web Push Notifications**: Complete implementation with `web-push` VAPID, browser subscription, `NotificationBell` component, subscription saved in Supabase.

- **Aggressive caching**: Kanban strategies use in-memory cache with short TTL (60s) + invalidation on `visibilitychange` and `online` events.

- **Realtime subscriptions**: Supabase Realtime on `items_events` and `tags` for live history and tag updates.

- **Print**: Print functionality for service files and trays (CSS print media queries + `window.print()`).

- **Mobile support**: `use-mobile.ts` hook detects breakpoint, adaptive components (`MobileItemsView`, `MobileItemCard`, `MobileBrandSerialSection`), `use-swipe.ts` for touch gestures.

---

## 5. Supplementary Details (Secondary Analysis)

This section covers subsystems, API routes, business modules, and database tables that were not detailed in the previous sections.

### 5.1 Complete Invoicing System (`lib/vanzari/facturare.ts`)

The invoicing flow is complex and atomic:

1. **Precondition validation** – `validateForFacturare(serviceFileId)` verifies that the file exists, is not already invoiced, has trays, etc.
2. **Final total calculation** – `calculateServiceFileTotal(serviceFileId)` via `lib/vanzari/priceCalculator.ts`:
   - Per item calculation: `unitPrice × quantity`, per-item discount (%), urgent markup (+30% if `isUrgent`).
   - Per tray calculation: subtotal, total item discounts, total urgent discounts.
   - Per file calculation: tray totals, global discount (%), final total.
   - Types: `ItemTotalCalculation`, `TrayTotalCalculation`, `ServiceFileTotalCalculation`.
3. **Invoice number generation** – RPC `generate_factura_number` (PostgreSQL function that generates a sequential number).
4. **Update service_file** – status → `facturata`, `is_locked → true`, `factura_number`, `factura_date`, `total_final`, `metoda_plata`.
5. **Archiving** – RPC `archive_service_file` → saves snapshot to `arhiva_fise_serviciu`.
6. **Clean up trays from pipeline** – RPC `clear_tray_positions_after_facturare` → removes trays from department `pipeline_items`.
7. **Logging** – inserts `items_events` with invoicing details.

**Invoice cancellation** (`anuleazaFactura`): admin/owner only, requires mandatory reason, unlocks file, resets status, logs.

### 5.2 Technician Work Sessions System (`lib/supabase/workSessionOperations.ts`)

- **`startWorkSession(trayId, technicianId)`** – RPC `start_work_session`: starts timer; if an active session already exists, returns its ID.
- **`finishWorkSession(trayId, technicianId)`** – RPC `finish_work_session`: stops timer, saves `finished_at`.
- **`getWorkSessionMinutesForRange(technicianId, start, end)`** – RPC `get_technician_work_minutes`: returns minutes worked in an interval.
- Table `technician_work_sessions`: `id, tray_id, technician_id, started_at, finished_at, notes`.
- API `PATCH /api/work-sessions/[id]`: only owner can modify `started_at`/`finished_at` (manual correction).

### 5.3 Technician Dashboard (`lib/supabase/tehnicianDashboard.ts` – ~2100 lines)

Extended dashboard module with:
- **Tray aggregation per technician**: New (Noua), In Progress (In Lucru), On Hold (In Asteptare), Completed (Finalizată), To Send (De Trimis), Pick Up Personally (Ridic Personal).
- **Stage IDs cache** with `tehnicianDashboardStageIdsCache.ts` (single-flight pattern to avoid duplicate requests).
- **Bulk fetch** via `tehnicianDashboardBulk.ts` – RPC `get_technician_dashboard_bulk` (a single DB call instead of N calls per technician).
- **Proportional estimated time** (`lib/utils/estimatedTimeCalculator.ts`): calculates the percentage of instruments assigned to the technician from the tray total, then proportional estimated time.
- **Hours worked** from `technician_work_sessions`, parsed with `lib/utils/service-time.ts`.

### 5.4 Advanced Sales Statistics (`lib/vanzari/advancedStatistics.ts`)

API: `GET /api/vanzari/statistics` (permissions: vanzator/admin/owner).

Calculated statistics:
- **Time to Close**: average/median/min/max time from lead to invoice; distribution by intervals (< 7 days, 7-14, 15-30, > 30).
- **Top Sellers**: seller ranking with total invoices, revenue, average per invoice, conversion rate.
- **Discount Analysis**: total discount granted, average %, distribution by types (item/urgent/global), top discounters.
- **Payment Methods**: cash/card distribution (count, total, percentage).

### 5.5 Technician Statistics (`lib/supabase/technicianStatisticsService.ts`)

Class `TechnicianStatisticsService` with 5 min TTL cache:
- Total/average work time
- Earnings (earnings per part/service)
- Trays processed (with split tray details)
- Waiting time per tray
- Efficiency metrics

### 5.6 Main Dashboard (`lib/supabase/dashboardOperations.ts`)

Aggregated metrics by interval (day/week/month/3 months/6 months/year):
- `totalLeads`, `totalRevenue`, `urgentLeads`, `newLeadsToday`
- `leadsByPipeline`, `leadsByStage`, `revenueByPipeline`, `revenueByStage`
- `leadsOverTime`, `topTechnicians`, `tagDistribution`, `conversionRate`
- Calculating `trayStageTimeStats` (time in each stage per tray).

**Note**: The main dashboard is currently **disabled** (`DASHBOARD_MAIN_ACTIVE = false`) – users are directed to the Technician Dashboard or Call Statistics.

### 5.7 Unified Search System

- **`GET /api/search/unified?q=...`** → `lib/supabase/unifiedSearchServer.ts` → RPC `search_unified`:
  - Searches in parallel: leads, service files, trays.
  - Returns `{ type, id, title, subtitle, pipelineSlug, openId }`.
  - Query limit: 200 characters, minimum 2 characters.
- **`GET /api/search/trays?q=...`** → `lib/supabase/traySearchServer.ts` → `searchTraysGloballyWithClient`:
  - Searches trays by: tray number, serial numbers, brands.

### 5.8 Notification System

#### Web Push (VAPID)
- **`lib/push/sendPush.ts`** – `sendPushToUser(userId, payload)`: sends push notification to all user's subscriptions via `web-push` VAPID.
- **`POST /api/push/subscribe`** – saves the browser subscription (endpoint, p256dh, auth) to `push_subscriptions`, upsert on endpoint.
- **`POST /api/push/test`** – sends a test notification to the current user.
- **`GET /api/push/vapid-public`** – returns the public VAPID key.
- **`GET /api/push/status`** – checks if push is configured.
- **`GET /api/push/config-check`** – full VAPID configuration check.

#### In-App Notifications
- **`lib/supabase/notificationOperations.ts`** – Notification CRUD:
  - 7 types: `tray_received`, `tray_passed`, `tray_completed`, `tray_urgent`, `service_assigned`, `message_received`, `system`.
  - `createNotification(params)` – creation via API route with service role (bypasses RLS).
  - `getNotifications(userId)`, `markAsRead(id)`, `markAllAsRead(userId)`, `getUnreadCount(userId)`, `deleteNotification(id)`.
- **`components/notifications/NotificationBell.tsx`** – UI component: bell icon with badge count, dropdown with notification list, subscribe/unsubscribe push.

### 5.9 Tracking System (`lib/tracking/`)

- **`eventTracker.ts`** – Global event tracking through **event delegation** at the document level:
  - Automatic tracking of button/link clicks (detects `data-button-id`, `name`, `aria-label`, text, etc.).
  - Tracking input changes (input, textarea, select, checkbox, etc.) with `old value → new value`.
  - Batches sent to `POST /api/tracking` (supports `{ batch: true, events: [...] }`).
- **`eventStacker.ts`** – Grouping similar events for history (compact display).
- **`POST /api/tracking`** – Receives and logs events; in development displays in console.

### 5.10 Backup and Validation System (`lib/dataSafety/`)

#### Backup Manager (`backupManager.ts`)
- Class `BackupManager` with:
  - `createBackup(type: 'hourly' | 'daily' | 'manual')` – complete export of all DB tables (limit 10,000 rows/table).
  - Saved to disk in `backups/database/` with metadata (timestamp, tables, size, checksum).
  - Retention: hourly 24h, daily 7 days; automatic cleanup.
  - API: `POST /api/cron/backup` (automatic trigger) + `POST /api/admin/backup` (manual).
  - UI: `components/admin/BackupManager.tsx` (manager with download).

#### Validation Framework (`validationFramework.ts`)
- **3 validation layers** with Zod:
  - **Layer 1: Client** – Zod schemas for: `leadSchema`, `stageChangeSchema`, `serviceFileSchema`, `callbackSchema`, `messageSchema`.
  - **Layer 2: Edge/API** – validation middleware in route handlers.
  - **Layer 3: Server** – validation via Supabase RLS/triggers.

### 5.11 Service File Archiving System (`lib/supabase/serviceFileArchiveServer.ts`)

API: `POST /api/service-files/archive-and-release` – archiving + tray release in a single request (reduces 6-8 calls to 1):

1. File existence check + idempotency (if already archived, continues with the rest of the flow).
2. `archiveServiceFileToDbServer` – saves snapshot to `arhiva_fise_serviciu` with: tray stage history, items_events, tray items.
3. `syncLeadUrgentReturTagsFromActiveServiceFiles` – syncs the lead's tags (Urgent, Return (Retur)) based on remaining active files.
4. `releaseTraysOnArchiveServer` – RPC `release_trays_on_archive`: releases trays from departments.
5. `moveItemsToArhivarePipelineServer` – moves file, lead, and trays to the Archived (Arhivat) stages in Reception (Recepție) / Sales (Vânzări).

### 5.12 Service File History Snapshot (`lib/history/serviceFileSnapshot.ts`)

When pressing "Save to History" (Salvează în Istoric), a **complete snapshot** of the file is created:
- Client types: Urgent, Subscription (Abonament), No Subscription (Fără Abonament), Office Direct, Courier Sent (Curier Trimis), Return (Retur).
- Instrument lines: tray number, instrument name, serial numbers, quantity, discount, warranty (garanție), price, total.
- Service lines: name, price, quantity, discount, total.
- Promotion lines: name, price, quantity, total.
- Tray info: number, count.
- Totals: subtotal, global discount, final total.
- Saved as a record in DB for later viewing.

### 5.13 Tray Image Management (`lib/supabase/imageOperations.ts`)

- **Supabase Storage**: bucket `tray_images`.
- `uploadTrayImage(trayId, file)` – uploads to `tray_images/{trayId}/{timestamp}.{ext}`, returns public URL.
- `deleteTrayImage(filePath)` – deletes from Storage.
- `listTrayImages(trayId)` – queries `tray_images` table + Storage URLs.
- `saveTrayImageRecord(trayId, url, filename, filePath)` – inserts into `tray_images` table.
- `deleteTrayImageRecord(imageId)` – soft deletes from `tray_images`.

### 5.14 Pipeline Permissions (`lib/supabase/pipelinePermissions.ts`)

- `grantPipelineAccess(userId, pipelineId)` – inserts into `user_pipeline_permissions` (ignores duplicates).
- `revokePipelineAccess(userId, pipelineId)` – deletes from `user_pipeline_permissions`.
- `getUserPipelinePermissions(userId)` – RPC `get_user_pipeline_permissions`.
- Used from the Admin page (`app/(crm)/admins/page.tsx`).

### 5.15 Admin Page (`app/(crm)/admins/page.tsx`)

Central administration page with dynamic (lazy-loaded) components:
- **OverviewDashboard** – general statistics (leads, files, trays).
- **MemberTable + MemberDetailsModal** – member management: create accounts, reset passwords, assign roles, pipeline permissions.
- **BackupManager** – create/download backups.
- **TrayPipelineAssigner** – manual tray-to-pipeline assignment.
- **TrayFileFinder** – tray and service file search.
- **PipelineItemsManager** – direct `pipeline_items` management.
- **MoveLeadsWithServiceFilesToOldStageButton** – admin tool for correcting stages.
- **User creation**: default password `Welcome123`, available roles: owner, admin, member, vanzator, receptie, tehnician.

### 5.16 Split Tray / Merge Tray (`lib/supabase/serviceFileOperations.ts`)

- **Split tray** – RPC `split_tray_to_real_trays`: splits a tray among multiple technicians, creating separate trays with distributed instruments.
- **Merge split trays** – RPC `merge_split_trays_if_all_finalized`: when all split trays are completed, consolidates them back.
- **Consolidate tray items** – RPC `consolidate_tray_items`: consolidates duplicate items in a tray.
- UI: `components/preturi/dialogs/SplitTrayTechnicianDialog.tsx`.

### 5.17 Identified PostgreSQL RPC Functions

| RPC Function | Description |
| :--- | :--- |
| `move_item_to_stage` | Atomic item (lead/file/tray) move to another stage + stage_history logging |
| `generate_factura_number` | Sequential invoice number generation |
| `archive_service_file` | Service file snapshot archiving |
| `clear_tray_positions_after_facturare` | Clean up trays from pipeline after invoicing |
| `release_trays_on_archive` | Release trays from departments on archiving |
| `start_work_session` | Start technician work session (idempotent) |
| `finish_work_session` | Stop work session |
| `get_technician_work_minutes` | Minutes worked in an interval |
| `get_technician_dashboard_bulk` | Technician dashboard data in a single call |
| `get_expired_callback_leads` | Leads with expired callback |
| `get_expired_nu_raspunde_leads` | Leads with expired does not answer (nu_raspunde) |
| `get_user_pipeline_permissions` | Pipeline permissions per user |
| `get_pipeline_options` | Available pipeline options |
| `get_dashboard_stats` | Aggregated dashboard statistics |
| `get_vanzari_apeluri_counts_by_month` | Sales call counts per month |
| `search_unified` | Unified lead/file/tray search |
| `split_tray_to_real_trays` | Split tray among technicians |
| `merge_split_trays_if_all_finalized` | Merge finalized split trays |
| `consolidate_tray_items` | Consolidate duplicate items |
| `increment_seller_statistic` | Increment seller statistic |
| `update_pipeline_and_reorder_stages` | Update pipeline + reorder stages |

### 5.18 Supplementary Tables from Data Model

| Table | Description |
| :--- | :--- |
| `user_profiles` | User profile: user_id, name, email, role, created_at |
| `user_pipeline_permissions` | Pipeline permissions per user |
| `push_subscriptions` | Web Push subscriptions: endpoint, p256dh, auth, user_agent |
| `notifications` | In-app notifications: type, title, message, data, read, read_at |
| `technician_work_sessions` | Work sessions: tray_id, technician_id, started_at, finished_at |
| `tray_images` | Tray images: tray_id, url, filename, file_path |
| `tray_items` | Tray items: instrument_id, service_id, quantity, price, discount, tray_id |
| `instruments` | Instrument catalog: name, department, price, etc. |
| `services` | Service catalog: name, price, estimated_time |
| `instrument_services` | Instrument–service association (many-to-many) |
| `parts` | Parts: name, price, quantity |
| `tags` | Available tags: name, color |
| `arhiva_fise_serviciu` | Invoiced file archive: complete snapshot at time of invoicing |
| `vanzari_apeluri` | Sales calls/moves journal: lead_id, seller_id, action, etc. |
| `tracking_events` | UI tracking events (optional) |
| `seller_statistics` | Aggregated statistics per seller |

### 5.19 Supplementary API Route – "Call!" (Sună!) Tag (`GET /api/vanzari/add-suna-tag`)

Background process that can run as a cron (recommended: every hour):
1. Calls RPC `get_expired_callback_leads` → leads from Call Back with expired callback.
2. Calls RPC `get_expired_nu_raspunde_leads` → leads from Does Not Answer (Nu Răspunde) with expired time.
3. Adds "Call!" (Sună!) tag (red) to all found leads → visual signal on the card that a call is needed.

### 5.20 Messenger and Communication (`components/leads/lead-messenger.tsx`)

Internal messaging system on leads:
- Text messages, notes, and images.
- Camera/gallery support on mobile.
- Attach images from the tray gallery.
- Chronological history with stacking (grouping similar events via `lib/tracking/eventStacker.ts`).
- Lead history with Supabase Realtime (live update on INSERT to `items_events`).

### 5.21 The `DASHBOARD_MAIN_ACTIVE` Flag

The main dashboard (`app/(crm)/dashboard/page.tsx`) is disabled via the constant `DASHBOARD_MAIN_ACTIVE = false`. It displays an "In development" placeholder. Users are directed to:
- **Technician Dashboard** (`app/(crm)/dashboard/tehnician/page.tsx`) – active, with per-technician statistics.
- **Call Statistics** (`app/(crm)/dashboard/statistici-apeluri/page.tsx`) – active, with sales statistics.

### 5.22 Partners (Parteneri) (`app/(crm)/leads/parteneri/page.tsx`)

Separate pipeline for partners. Functionality similar to the main Kanban but with:
- Specific filtering on partner stages.
- Lead details modal with partner context.
- Role-based redirect if the user does not have access.

---

*Report supplement – complete secondary analysis of the Ascutzit CRM project.*
