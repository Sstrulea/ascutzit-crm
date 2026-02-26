# User Journey & User Experience – Ascutzit CRM

---

## 1. Main Screens / Views

Based on the code analysis, the CRM application has the following screen map:

```
┌─────────────────────────────────────────────────────────────────────┐
│  /auth/sign-in                                                       │
│  ┌────────────┐                                                      │
│  │  LOGIN     │  Username + Password → redirect to default pipeline  │
│  └────────────┘                                                      │
└───────────┬─────────────────────────────────────────────────────────┘
            │ Auth OK
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SHELL (layout.tsx)                                                  │
│  ┌──────────┐  ┌──────────────────────────────────────────────────┐ │
│  │ SIDEBAR  │  │  HEADER: SmartTraySearch + NotificationBell     │ │
│  │          │  ├──────────────────────────────────────────────────┤ │
│  │ Pipeline │  │                                                  │ │
│  │ links    │  │  CONTENT AREA (children)                        │ │
│  │          │  │                                                  │ │
│  │ Dashboard│  │  Kanban / Details / Dashboard / Admin            │ │
│  │ Admin    │  │                                                  │ │
│  │ Profile  │  │                                                  │ │
│  └──────────┘  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### List of screens identified in code

| Screen | Route | Key Components | User Role |
| :--- | :--- | :--- | :--- |
| **Login** | `/auth/sign-in` | Username → email lookup → Supabase Auth | All |
| **Kanban Pipeline** | `/leads/[pipeline]` | `kanban-board.tsx`, `lead-card.tsx` | Per permissions |
| **Lead Details** (side panel) | (slide-over on Kanban) | `lead-details-panel.tsx`, tabs (Details, Contact, Pricing, Messages) | Sales Reps (Vânzători), Reception (Recepție) |
| **To Invoice Overlay** (De Facturat) | (dialog over Kanban) | `DeFacturatOverlay.tsx` | Reception (Recepție), Admin |
| **No Answer Overlay** (Nu Răspunde) | (dialog over Kanban) | `NuRaspundeOverlay.tsx` | Reception (Recepție) |
| **Pricing Module** (Prețuri) | (tab in lead details) | `PreturiOrchestrator.tsx`, `PreturiMain.tsx`, `VanzariViewV4.tsx`, `ReceptieView.tsx` | Sales Reps (Vânzători), Reception (Recepție) |
| **Technician Tray Page** (Tăviță Tehnician) | `/tehnician/tray/[trayId]` | Image upload, services, parts, status, work sessions | Technicians (Tehnicieni) |
| **Technician Dashboard** | `/dashboard/tehnician` | Trays (Tăvițe) per technician, hours worked, completed trays | Admin, Owner |
| **Call Statistics** (Statistici Apeluri) | `/dashboard/statistici-apeluri` | Charts, backfill, attribution | Admin, Owner |
| **Instrument Catalog** | `/configurari/catalog` | CRUD instruments + services | Admin, Owner |
| **Admin / Members** | `/admins` | MemberTable, BackupManager, PipelineItemsManager | Admin, Owner |
| **Profile** (Profil) | `/profile` | Change password, display name, preferences | All |
| **Partners Pipeline** (Parteneri) | `/leads/parteneri` | Kanban with partner leads | With access |
| **Mobile Lead Details** | (full-screen sheet) | `lead-details-sheet.tsx` | All (mobile) |
| **Setup** | `/setup` | Initial permissions setup | Owner (first run) |

---

## 2. Main Scenarios (Happy Path)

### 2.1 Scenario: Sales Rep (Vânzător) processes a new lead

**Actor:** Sales Rep (Vânzător)  
**Estimated duration:** 2-5 minutes per lead

```
1. LOGIN
   └─ Sales Rep opens the CRM → /auth/sign-in
   └─ Enters username + password → Redirect to Sales pipeline (Vânzări)

2. VIEW SALES KANBAN (Kanban Vânzări)
   └─ Sees the Kanban board with stages: Leads (Leaduri), Foreign Leads (Leaduri Straine),
      Call Back, No Answer (Nu Răspunde), No Deal, Deliveries (Livrari),
      Courier Arrived Today (Curier Ajuns Azi), We Have Order (Avem Comandă), Archived (Arhivat)
   └─ A new card appears in "Leads" (Leaduri) (automatically from Facebook Ads)
   └─ The card displays: Name, Phone, Campaign, Tags, Timer

3. CLICK ON CARD → LEAD DETAILS (side panel)
   └─ The details panel opens: Header (Name, Phone, Email, Tags)
   └─ Tabs: Details | Contact | Pricing (Prețuri) | Messages | History (Istoric)
   └─ Sales Rep reads the client details (auto-filled from Facebook)

4. CALL CLIENT → DECISION
   └─ Calls the client. Based on the conversation, chooses one of the actions:

   4a. CLIENT WANTS SERVICE → "Courier Sent" (Curier Trimis) or "Office Direct"
       └─ Presses the "Courier Sent" (Curier Trimis) button on card (or from details panel)
       └─ Confirmation dialog: choose Courier Date + optional Urgent/Return (Retur)
       └─ Click "Confirm" → System automatically:
          • Creates a service file (Fișă) (with sequential number)
          • Moves lead to "Courier Sent" (Curier Trimis) stage (Sales)
          • Adds the service file to Reception (Recepție) pipeline ("Courier Sent" stage)
          • Adds "Courier Sent" (Curier Trimis) tag on lead
          • Logs in history
       └─ Toast: "Courier Sent marked. Service file created."
       └─ Card visually moves to the new stage

   4b. CLIENT DOES NOT ANSWER → "No Answer" (Nu Răspunde)
       └─ Presses the ☎✕ button on card
       └─ Dialog: choose the time to call again
          (Quick options: 10 min, 15 min, 30 min, 1h, 2h, 3h, or custom)
       └─ Click "Confirm"
       └─ Card moves to "No Answer" (Nu Răspunde) stage
       └─ When the time expires, the cron adds a "Call!" (Sună!) tag (red) on card

   4c. CLIENT WANTS TO CALL LATER → "Call Back"
       └─ Presses the 📞 button on card
       └─ Dialog: choose date (Tomorrow, 3 days, Week, Month, 3 months, Calendar)
          + callback time
       └─ Click "Confirm"
       └─ Card moves to "Call Back" stage with date badge displayed
       └─ When the date expires, lead automatically returns to the original stage

   4d. CLIENT DOES NOT WANT → "No Deal"
       └─ Presses the ✕ button on card
       └─ Lead moves to "No Deal" stage
       └─ After 24h (cron midnight-ro), automatically moved to "Archived" (Arhivat)
       └─ After 30 days (cron archive), permanently archived

5. CONTINUE
   └─ Sales Rep moves to the next card in "Leads" (Leaduri)
```

---

### 2.2 Scenario: Reception (Recepție) processes a service file (Fișă)

**Actor:** Reception (Recepție)  
**Estimated duration:** 5-15 minutes per service file (Fișă)

```
1. VIEW RECEPTION KANBAN (Kanban Recepție)
   └─ Reception sees files in: Courier Sent (Curier Trimis), Office Direct,
      Uncollected Package (Colet Neridicat), Package Arrived (Colet Ajuns),
      In Progress (In lucru), On Hold (In asteptare), To Invoice (De facturat),
      No Answer (Nu Răspunde), To Send (De trimis), Pick Up In Person (Ridic Personal),
      Archived (Arhivat)
   └─ A new file appears in "Courier Sent" (Curier Trimis) (auto-created by Sales Rep)

2. CLICK ON CARD → FILE DETAILS (Detalii Fișă)
   └─ Side panel with: Header (File No., Client, Phone, Tags)
   └─ Sections: Details, Contact + Invoicing, Pricing (Prețuri) (trays), Messages

3. FILL IN PRICING (Pricing Tab / Prețuri)
   └─ Select/create tray (Tăviță) (#1, #2, etc.)
   └─ Add instruments: search in catalog → select → added with price
   └─ Add services per instrument: toggle available services
   └─ Add brands + serial numbers + warranty per instrument
   └─ Optional: add spare parts (piese de schimb)
   └─ Optional: set discount per item or global

4. SAVE AND SEND TRAYS (Tăvițe)
   └─ Press "Save" → data persists in DB
   └─ Mark "Package Arrived" (Colet Ajuns) (client brought the instruments)
   └─ Press "Send trays to departments" (Trimite tăvițe în departamente)
      └─ System automatically determines the department from instruments
         (Salons / Horeca / Barbershops / Repairs)
      └─ If lead has Return (Retur) tag → tray goes to "Return" (Retur) stage
      └─ Otherwise → "New" (Noua) stage
   └─ Toast: "Trays have been sent to departments"
   └─ File automatically moves to "Package Arrived" (Colet Ajuns) / "In Progress" (In lucru)

5. WAITING FOR TECHNICIANS
   └─ File automatically moves through stages:
      • "In Progress" (In lucru) – at least one tray is taken by a technician
      • "On Hold" (In asteptare) – tray put on hold
      • "To Invoice" (De facturat) – all trays completed + QC validated

6. INVOICING (To Invoice Overlay / Overlay De Facturat)
   └─ Click on "To Invoice" (De facturat) card → overlay opens
   └─ Sees: tray list, calculated total, global discount, invoicing data
   └─ Fills in invoicing data (company, tax ID / CUI, address) if missing
   └─ Chooses: "Pick Up In Person" (Ridic personal) (client comes to office) or
              "To Send (AWB)" (De trimis) (sent by courier)
   └─ System: calculates final total, generates invoice number, archives,
      moves file to the chosen stage
   └─ Toast: "File invoiced. Card moved to To Send."

7. ARCHIVING
   └─ When client picks up / courier collects → Reception presses "Archive" (Arhivează)
   └─ File + lead → Archived (Arhivat) stage
```

---

### 2.3 Scenario: Technician works on a tray (Tăviță)

**Actor:** Technician (Tehnician)  
**Estimated duration:** 15 min – several hours per tray (Tăviță)

```
1. VIEW DEPARTMENT KANBAN (e.g.: Salons / Saloane)
   └─ Technician sees trays: New (Noua), Return (Retur), In Progress (In lucru),
      On Hold (In asteptare), Completed (Finalizata)
   └─ Sees only trays assigned to them + unassigned ones (automatic filtering)

2. CLICK ON TRAY → DETAILS / OR TRAY PAGE
   └─ Option 1: Side panel with instruments, services, notes
   └─ Option 2: Dedicated page /tehnician/tray/[id]

3. TAKE IN PROGRESS
   └─ Presses "Take in progress" (Ia în lucru) → tray moves to "In Progress" (In lucru)
   └─ Work timer starts automatically (RPC start_work_session)
   └─ Tray disappears from "New" (Noua) and appears in "In Progress" (In lucru)

4. WORK ON TRAY
   └─ Adds executed services (from catalog)
   └─ Adds used parts (from parts catalog)
   └─ Uploads images (camera/gallery) → Supabase Storage
   └─ Adds QC notes / observations
   └─ Optional: puts tray "On Hold" (In asteptare) (button) if waiting for parts

5. COMPLETION
   └─ Presses "Completed" (Finalizat) → timer stops (finish_work_session)
   └─ Tray moves to "Completed" (Finalizată)
   └─ Automatically appears in Quality Check for validation

6. QUALITY CHECK (Another user or the same one)
   └─ Quality Pipeline: sees trays from Completed (Finalizată) (virtual cards)
   └─ Checks the quality of the work
   └─ "Validate" → items_events: quality_validated → tray disappears from QC
   └─ "Reject" → tray moves back to "In Progress" (In lucru) in department
```

---

## 3. Interface States

### 3.1 Global states

| State | Implementation | Where it appears |
| :--- | :--- | :--- |
| **Auth Loading** | `if (authLoading) return null` | CRM Layout – blank screen until session verification |
| **Unauthenticated** | `if (!user) return null` + redirect `/auth/sign-in` | Layout – automatic redirect |
| **Kanban Loading** | `<KanbanBoardSkeleton />` + `loading` state from `useKanbanData` | Board displays card skeletons (pulsating) |
| **Kanban Empty** | `"No leads exist"` centered text per stage | Empty stage in board |
| **Kanban Error** | `toast.error(...)` + retry on `visibilitychange` | Toast notification + auto-retry |
| **Details Panel Loading** | `<Loader2 className="animate-spin" />` | Side panel – spinner on open |
| **Dashboard Inactive** | `DASHBOARD_MAIN_ACTIVE = false` → placeholder with "Under Development" image | Main dashboard |

### 3.2 States per action

| Action | Loading | Success | Error |
| :--- | :--- | :--- | :--- |
| **Callback set** | Button disabled + Loader2 spinner | Green toast: "Callback scheduled successfully" | Red toast: "Error scheduling callback" |
| **No Answer** (Nu Răspunde) | Button disabled + spinner | Card moves to stage | Destructive toast: "Could not set" |
| **No Deal** | Button disabled | Toast: "Lead marked as No Deal" | Toast: "Error marking No Deal" |
| **Courier Sent** (Curier Trimis) | Button disabled + spinner | Toast: "Courier Sent marked. Service file created." | Toast: "Error marking Courier Sent" |
| **Invoicing** (Facturare) | `facturareLoading=true`, buttons disabled | Toast: "File invoiced. Card moved to..." + auto-close overlay | Destructive toast: "Invoicing error" with detailed message |
| **Send trays** (Trimitere tăvițe) | Button disabled + spinner | Toast: "Trays have been sent" | Toast: "Could not send" |
| **Image upload** | Spinner on upload button | Image appears in gallery | Toast: "Upload error" |
| **Archiving** (Arhivare) | Button disabled | Toast: "File has been archived" + card disappears | Toast: "Archiving error" |
| **Drag & Drop Move** | Semi-transparent card in motion | Card moves fluidly to new stage | AlertDialog confirmation if stage is restricted |
| **Bulk Move** | Dialog with spinner | Toast: "N cards moved" | Toast: "Move error" |
| **Delete lead** | AlertDialog confirmation → spinner | Card disappears from board | Toast: error |

### 3.3 Application response to failure

- **Optimistic updates**: Cards move visually immediately (optimistic), then confirmed from DB. On failure → revert + error toast.
- **Toast notifications**: Every action has `toast.success(...)` for success and `toast({ variant: 'destructive', ... })` for error.
- **Auto-retry**: On connection loss (`offline` → `online`), Kanban cache is automatically invalidated and data reloads.
- **Visibility refresh**: When returning to tab (`visibilitychange`), the board reloads automatically (avoids stale data).
- **Idempotency**: Archiving checks if the file is already archived (`archived_at`) and returns success without error.
- **Graceful degradation**: If a DB column is missing (e.g.: `colet_neridicat`), the Reception (Recepție) strategy falls back without crashing.

---

## 4. Identified Friction Points

### 4.1 HIGH Friction – Lead details panel complexity

**Problem:** The lead details panel (`lead-details-panel.tsx`) tries to serve **all roles** (Sales Rep / Vânzător, Reception / Recepție, Technician / Tehnician, Admin) and **all pipelines** (Sales / Vânzări, Reception / Recepție, Departments, QC). This results in:
- ~20 conditional props (`isVanzariPipeline`, `isReceptiePipeline`, `isDepartmentPipeline`, etc.)
- 5+ tabs that appear/disappear conditionally
- Different buttons per stage (Call Back, No Answer / Nu Răspunde, To Send / De trimis, Pick Up In Person / Ridic personal, Archive / Arhivare...)
- Header with ~30 props (LeadDetailsHeader) – checkboxes, tags, pin, urgency escalation

**Impact on user:** The panel looks different depending on context, but the monolithic code makes it difficult to add role-specific features without affecting the others. A new developer needs to understand all combinations.

**UX Suggestion:** Dedicated components per role/pipeline would reduce confusion. E.g.: `VanzariDetailsPanel`, `ReceptieDetailsPanel`, `DepartmentDetailsPanel`.

---

### 4.2 HIGH Friction – Invoicing flow requires many manual actions

**Problem:** To invoice a service file (Fișă), reception needs to go through ~8 steps:
1. Fill in instruments on trays (Tăvițe) (click add instrument → search → select → repeat)
2. Add services per instrument (toggles)
3. Add brands + serial numbers per instrument
4. Save
5. Send trays to departments
6. Wait for technician completion + QC
7. Click "Invoice" (Facturare) → fill in invoicing data → choose delivery method
8. Manual archiving after pickup

**Impact on user:** Many repetitive steps (click → search → select per instrument, per service) can be tedious for service files with 10+ instruments.

**UX Suggestion:**
- Barcode scan → automatic instrument addition
- Service file templates (e.g.: "Salon Package 10 scissors") with predefined instruments
- Auto-invoicing when all conditions are met (optional checkbox)

---

### 4.3 MEDIUM Friction – Multiple dialogs for Call Back / No Answer (Nu Răspunde)

**Problem:** Setting a callback requires:
1. Click button on card → opens dialog
2. Choose type (Quick time / Quick date / Custom)
3. If custom: select date from calendar + time from dropdown
4. Click "Confirm"

The "No Answer" (Nu Răspunde) flow is similar but with time selection.

**Impact on user:** For a sales rep making 50+ calls/day, every extra click counts. Quick time options (10 min, 15 min, 30 min, 1h) are well thought out, but the full dialog opens every time.

**UX Suggestion:** Quick actions directly on card (without dialog): a hover/long-press on the callback button could display a mini-dropdown with quick options, similar to a context menu.

---

### 4.4 MEDIUM Friction – Lack of visual feedback for automatic processes

**Problem:** Automatic processes (cron: Uncollected Package / Colet Neridicat after 2 days, No Deal → Archived after 24h, "Call!" / Sună! tag) have no direct feedback. The sales rep discovers that a lead was automatically moved only when opening the pipeline.

**Impact on user:** Confusion: "Where did my lead go?" when the cron moved it to another stage.

**UX Suggestion:** Push/in-app notifications when a lead owned by the user is automatically moved by cron (e.g.: "Lead X was moved to Uncollected Package – courier expired for 2 days").

---

### 4.5 MEDIUM Friction – Desktop vs mobile duplication

**Problem:** The mobile experience (`lead-details-sheet.tsx`, 3000 lines) duplicates desktop logic (`lead-details-panel.tsx`, 1500 lines). Features can be slightly different between the two (sync bugs).

**Impact on user:** On phone, some features may be missing or work differently than on desktop.

**UX Suggestion:** Responsive design with the same components (shared hook, different UI), not separate components per platform.

---

### 4.6 LOW Friction – Login with username (not email)

**Problem:** The login system accepts **username**, not email directly. On submit, it makes an API request (`/api/auth/username-to-email`) to convert the username to email, then authenticates with Supabase Auth using the email.

**Impact on user:** An extra invisible step (lookup latency), but UX is simplified (username is easier to remember than email).

**Note:** This is actually a **positive UX point** – internal users prefer short usernames.

---

### 4.7 LOW Friction – Strict stage validations

**Problem:** Certain stages are restricted for Drag & Drop:
- Cannot drag a card to "In Progress" (In lucru), "On Hold" (In asteptare) (only the explicit button)
- Cannot drag to "To Invoice" (De facturat) (requires QC validated on all trays)
- AlertDialog confirmation when moving to critical stages

**Impact on user:** Frustration if they don't understand why they can't move a card. The error message exists but is subtle.

**UX Suggestion:** Tooltip on the restricted zone: "Trays must be validated in Quality Check before moving to To Invoice (De facturat)".

---

## 5. Summary – User Journey per Role

### Sales Rep (Vânzător) (most active user)
```
Login → Sales Kanban (Vânzări) → Click lead → Phone call →
  ├── No answer → "No Answer" (Nu Răspunde) (timer) → "Call!" (Sună!) tag auto → Re-call
  ├── Call later → "Call Back" (date/time) → Automatic return
  ├── Does not want → "No Deal" → Auto-archived (24h)
  └── Order → "Courier Sent" (Curier Trimis) / "Office Direct" → File created → Reception
```

### Reception (Recepție) (second most active)
```
Reception Kanban (Recepție) → Click Courier Sent file (Curier Trimis) → Pricing tab (Prețuri) →
  Fill in instruments + services → Save → Send trays to departments →
  Wait for technicians → Quality Check validation →
  To Invoice (De Facturat) → Invoicing Overlay → Pick Up In Person / To Send →
  Archive
```

### Technician (Tehnician) (most focused on a single tray)
```
Department Kanban → Click "New" (Noua) tray →
  "Take in progress" (Ia în lucru) (timer starts) →
  Add services + parts + images →
  "Completed" (Finalizat) (timer stops) →
  Quality Check → Validate / Reject
```

### Admin / Owner (management)
```
Dashboard → Call Statistics (Statistici Apeluri) → Backfill / Attribution →
  Admin → Members (Membri) → Create accounts / Roles / Permissions →
  Catalog → Instruments + Services →
  Backup → Download
```

---

*Report generated through analysis of UI components, handlers, states, and business flows from the Ascutzit CRM project source code.*
