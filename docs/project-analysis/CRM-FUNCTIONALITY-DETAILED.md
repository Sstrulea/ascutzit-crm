# CRM Functionality – Detailed Description

This document describes in detail how the CRM project works: data flows, Kanban pipelines, sales operations, reception, departments and Quality Check, based on the code analysis and the data model.

---

## 1. General Architecture

The CRM is organized around **Kanban pipelines** and **item types**:

- **Pipelines:** Sales (Vânzări), Reception (Recepție), Salons (Saloane), Horeca, Barbershops (Frizerii), Repairs (Reparații), Quality Check (and optionally Courier).
- **Item types:** `lead`, `service_file` (Service File / Fișă de service), `tray` (Tray / Tăviță).
- **Positioning:** Each item is placed in a pipeline and a **stage** via the `pipeline_items` table (fields: `type`, `item_id`, `pipeline_id`, `stage_id`).

Stages and pipelines are configured in the database; the code uses **name patterns** (e.g. "in lucru", "finalizata", "de facturat") to identify behavior, so minor renames in the DB remain compatible.

---

## 2. Sales (Vânzări pipeline)

### 2.1 Lead Sources

- **Meta (Facebook Lead Ads)**  
  - Webhook: `app/api/leads/facebook-webhook/route.ts`. Upon receiving a `leadgen_id`, the Graph API is called for the complete lead data, `field_data` is parsed, a record is inserted into the `leads` table and added to the Sales (Vânzări) pipeline.  
  - **Classification by phone:** in `lib/facebook-lead-helpers.ts`, the function `isForeignPhone(phone)` considers numbers as **Romanian** if they start with `+40`, `40` or `0`; the rest are "foreign".  
  - Leads with a foreign number are placed in the **Foreign Leads (Leaduri Straine)** stage; those with a Romanian number in the **Leads (Leaduri)** stage.  
  - Simulation: `app/api/leads/simulate-facebook/route.ts` (same flow: insert lead + add to pipeline according to phone rules).

- **Website**  
  - There is no dedicated "website form" API in the code; leads can be created manually from the CRM.

- **Manual**  
  - From the page `app/(crm)/leads/[pipeline]/page.tsx`, when creating a lead, `createLeadWithPipeline()` from `lib/supabase/leadOperations.ts` is used with `platform: 'manual'`.

### 2.2 Stages and Display (overrides)

The Sales (Vânzări) pipeline strategy is in `lib/supabase/kanban/strategies/standard.ts`. **StandardPipelineStrategy** applies **stage overrides** for display (without always modifying the stage in the DB), in priority order:

1. **No deal** – if the lead has `no_deal = true`, it is displayed in the No deal stage.
2. **Call back** – if `call_back = true` and `callback_date` exists, it is displayed in the Call back stage (until expiration).
3. **No answer (Nu răspunde)** – if `nu_raspunde = true` and `nu_raspunde_callback_at` exists, it is displayed in the No answer (Nu răspunde) stage.
4. **We Have an Order / Active Orders (Avem Comandă / Comenzi Active)** – for leads with active orders (service files).
5. **DB Stage** – otherwise, the stage from `pipeline_items` is used.

After the date/time expires for Call back or No answer (Nu răspunde), the DB stage is used for positioning. An expiration job: `app/api/leads/expire-callbacks/route.ts` and `lib/supabase/expireCallbacks.ts` moves leads to the corresponding stages when the time has passed.

### 2.3 Sales Operations (buttons / actions)

- **Call back**  
  - The user chooses the date and time.  
  - `leads.call_back` and `leads.callback_date` are set.  
  - The lead is moved (in DB or via override) to the **Call back** stage.  
  - The information appears in the lead details and on the lead card (components: `components/leads/lead-details-panel.tsx`, `components/kanban/lead-card.tsx`; hook: `hooks/leadDetails/useLeadDetailsCheckboxes.ts`).

- **No answer (Nu răspunde)**  
  - The user chooses the time they want to call again.  
  - `leads.nu_raspunde` and `leads.nu_raspunde_callback_at` are set.  
  - The lead is moved to the **No answer (Nu răspunde)** stage.  
  - Display: lead details, lead card.

- **No deal**  
  - Order not concluded.  
  - In `lib/vanzari/leadOperations.ts`, `setLeadNoDeal(leadId)` sets `no_deal = true`, clears callback/no answer flags and delivery flags, and removes all lead tags.  
  - The lead card (`components/kanban/lead-card.tsx`) hides delivery buttons and triggers for No deal leads.

- **Delivery type (Office Direct / Courier Sent (Curier trimis))**  
  - Order concluded; the delivery type and (for courier) the scheduled date are chosen.  
  - **Courier Sent (Curier trimis):** `setLeadCurierTrimis(leadId, scheduledDate, options)` in `lib/vanzari/leadOperations.ts`:  
    - Creates a **service file** in `service_files` (`curier_trimis: true`, `curier_scheduled_at`), with status `comanda`.  
    - Adds the service file to the **Reception (Recepție)** pipeline, **Courier Sent (Curier Trimis)** stage.  
    - Moves the lead in the Sales (Vânzări) pipeline to the **Courier Sent (Curier Trimis)** stage (or equivalent).  
    - Records in `vanzari_apeluri` and tags (e.g. Courier Sent).  
  - **Office Direct:** `setLeadOfficeDirect(leadId, scheduledDate, options)` – analogous, with `office_direct: true` and **Office Direct** stage in Reception (Recepție) and Sales (Vânzări).  
  - On the lead card, the delivery button is displayed for the Leads (Leaduri), Foreign Leads (Leaduri Straine), No answer (Nu răspunde), Call back, Deliveries (Livrari) stages; upon confirmation the APIs invoking these functions are called.  
  - The "Deliveries (Livrari)" / "Courier Arrived Today (Curier Ajuns Azi)" stages are treated specially (e.g. for the "We Have an Order (Avem Comandă)" button); helpers in `lib/supabase/kanban/constants.ts`: `isLivrariOrCurierAjunsStage`, `isLivrariOrCurierAjunsAziStage`.

### 2.4 Key Files – Sales (Vânzări)

| Domain               | Files |
|----------------------|-------|
| API webhook / cron   | `app/api/leads/facebook-webhook/route.ts`, `app/api/leads/simulate-facebook/route.ts`, `app/api/leads/expire-callbacks/route.ts` |
| Lead operations      | `lib/vanzari/leadOperations.ts`, `lib/facebook-lead-helpers.ts`, `lib/supabase/leadOperations.ts` |
| Kanban strategy      | `lib/supabase/kanban/strategies/standard.ts` |
| UI                   | `components/kanban/lead-card.tsx`, `components/leads/lead-details-panel.tsx`, `app/(crm)/leads/[pipeline]/page.tsx` |
| Sales calls (Apeluri vânzări) | `lib/supabase/vanzariApeluri.ts` |

---

## 3. Reception (Recepție pipeline)

The Reception (Recepție) displays **service file cards**. The positioning of a service file in stages depends not only on `pipeline_items`, but also on **flags on the service file**, **events** (`items_events`) and the **tray state** in the department pipelines.

### 3.1 Creating Service Files (Fișe de service)

- **At order registration (Courier Sent / Office Direct)**  
  - When confirming delivery on a lead (Courier Sent or Office Direct button), in `lib/vanzari/leadOperations.ts` **one service file per lead** is created: insert into `service_files` (number from sequence, `status: 'comanda'`, `curier_trimis`/`office_direct`, scheduled dates).  
  - The service file is added to the Reception (Recepție) pipeline in the **Courier Sent (Curier Trimis)** or **Office Direct** stage (via `moveItemToStage` / `addServiceFileToPipeline`).

- **From the Pricing (Prețuri) module**  
  - In `hooks/preturi/usePreturiDeliveryOperations.ts`, toggling Office Direct / Courier Sent updates `service_files` and can add the service file to the Reception (Recepție) pipeline (e.g. Office Direct stage).

- **Generic creation**  
  - `lib/supabase/serviceFileOperations.ts` – `createServiceFile()`; also used for manually creating a service file from the UI.

### 3.2 Reception Stages and Display Rules

The Reception (Recepție) strategy is in `lib/supabase/kanban/strategies/receptie.ts`. The **priority** order (overrides) for determining the stage in which the service file card appears:

1. **Archived (Arhivat)** – service files that have at least one tray with a number suffixed "-copy" (archived tray).
2. **Parcel arrived (Colet ajuns)** – service file marked "Sent" (parcel arrived): `colet_ajuns = true` or corresponding event; or all trays of the service file are already in department pipelines (New / In progress / On hold / Completed).
3. **To be sent / Pick up in person (De trimis / Ridic personal)** – events `de_trimis` or `ridic_personal` (after invoicing and client agreement).
4. **No answer (Nu răspunde)** – tag or No answer flag on the service file/lead.
5. **To be invoiced (De facturat)** – all trays of the service file are in the **Completed (Finalizată)** stage in departments **and** each tray has a **quality_validated** event in `items_events` (Quality Check validation).
6. **On hold (In asteptare)** – at least one tray is in On hold (In asteptare) or Waiting for parts (Astept piese) stage in a department; none in In progress (In lucru).
7. **In progress (In lucru)** – at least one tray is in the In progress (In lucru) stage in a department.
8. **Parcel arrived (Colet ajuns)** (fallback) – the service file has trays in departments (but not all completed/QC).
9. **Uncollected parcel (Colet neridicat)** – the service file has `colet_neridicat = true` or the period has elapsed (see below).
10. **Courier Sent / Office Direct (Curier trimis / Office direct)** – service files with `curier_trimis` or `office_direct` that don't fall into the other cases (including service files without a row in `pipeline_items` yet; they are loaded directly from `service_files`).

Service files with `office_direct` or `curier_trimis` are loaded directly from the database in the strategy, even if they don't yet have a row in `pipeline_items`, so that they appear immediately in Reception (Recepție) after creation.

### 3.3 Uncollected Parcel (Colet neridicat)

- **Condition:** After the courier has been "sent" on a chosen date (`curier_scheduled_at`), if **2 days** have passed (or 36h in some code paths), the service file is considered "uncollected parcel (colet neridicat)".
- **Implementation:**  
  - `lib/supabase/expireColetNeridicat.ts` – `runExpireColetNeridicat()`: after 36h from `curier_scheduled_at` (or 2 days from `created_at`) moves the service file to the Reception (Recepție) **Uncollected parcel (Colet neridicat)** stage and the lead to the Sales (Vânzări) **Uncollected parcel (Colet neridicat)** stage.  
  - Cron: `app/api/cron/vanzari-colet-neridicat/route.ts` – similar logic (2 days from `curier_scheduled_at`), updates `pipeline_items` and sets `no_deal` on the service file.  
  - On-demand API: `app/api/leads/move-to-colet-neridicat/route.ts`.

### 3.4 Parcel Arrived (Colet ajuns) (sending trays to departments)

- **Marking "Sent" (parcel arrived):** API `app/api/service-files/set-colet-ajuns/route.ts` sets `colet_ajuns = true` (and/or event).  
- **Actually sending the trays** to department pipelines is done from the UI (Pricing (Prețuri) module / service file details): `hooks/preturi/usePreturiTrayOperations.ts` – functions like `sendAllTraysToPipeline()`. For each tray the department is determined from the instruments; if the lead has a **Return (Retur)** tag, the tray is placed in the **Return (Retur)** stage of the department pipeline, otherwise in **New (Noua)**. After the trays are in departments, the Reception (Recepție) strategy positions the service file in **Parcel arrived (Colet ajuns)** (or In progress / On hold / To be invoiced, depending on tray state).

### 3.5 To Be Invoiced (De facturat)

- **Condition:** All trays of the service file are in the **Completed (Finalizată)** stage in department pipelines **and** each has the **quality_validated** event in `items_events` (Quality Check validation).  
- The calculation is done in `lib/supabase/kanban/strategies/receptie.ts` via `getAllTraysInfoForServiceFiles()`: `allFinalizare` and `allQcValidated`.  
- **Invoicing:** From the To be invoiced overlay (`components/leads/DeFacturatOverlay.tsx`) or from the Pricing (Prețuri) module, `app/api/vanzari/factureaza/route.ts` → `factureazaServiceFile()` from `lib/vanzari/facturare.ts` is called. The user chooses **Pick up in person (Ridic personal)** (client picks up at the office) or **To be sent (De trimis) (AWB)** (courier). After invoicing, the service file is moved to the **Pick up in person (Ridic personal)** or **To be sent (De trimis)** stage in Reception (Recepție). When all service files of a lead are invoiced, the lead can be moved to **Archived (Arhivat)**.

### 3.6 To Be Sent / Pick Up in Person (De trimis / Ridic personal) (client agreement + Sent button)

- The **To be sent (De trimis)** and **Pick up in person (Ridic personal)** buttons are displayed when the service file is in the **To be invoiced (De facturat)** or **No answer (Nu răspunde)** stage (e.g. in `components/leads/lead-details-panel.tsx`, `components/preturi/sections/TrayActions.tsx`, `components/preturi/views/ReceptieView.tsx`).  
- On press: the `de_trimis` or `ridic_personal` event is recorded in `items_events` and the service file is moved to the corresponding stage in Reception (Recepție). No additional invoicing is done here; invoicing is done from To be invoiced (De facturat).  
- The client agreement is the user's action before pressing the button (it is not a separate field in the code; the business flow assumes agreement before "Sent").

### 3.7 Archived (Arhivat)

- The service file card is moved to **Archived (Arhivat)** when the order has been picked up (in person or by courier). In code:  
  - Service files with a "-copy" tray are considered archived and displayed in the **Archived (Arhivat)** stage.  
  - Explicit archiving (Archive button) is available on the card for the **To be sent (De trimis)** and **Pick up in person (Ridic personal)** stages; it moves the service file (and the lead, if applicable) to the **Archived (Arhivat)** stage and may involve copying trays with a "-copy" suffix.  
- Additional logic in `app/(crm)/leads/[pipeline]/page.tsx` (e.g. "Archive all service files from To be sent and Pick up in person").

### 3.8 Key Files – Reception (Recepție)

| Domain                | Files |
|-----------------------|-------|
| Strategy              | `lib/supabase/kanban/strategies/receptie.ts` |
| Uncollected parcel (Colet neridicat) | `lib/supabase/expireColetNeridicat.ts`, `app/api/cron/vanzari-colet-neridicat/route.ts`, `app/api/leads/move-to-colet-neridicat/route.ts` |
| Parcel arrived (Colet ajuns) | `app/api/service-files/set-colet-ajuns/route.ts` |
| Invoicing / To be sent | `components/leads/DeFacturatOverlay.tsx`, `lib/vanzari/facturare.ts`, `app/api/vanzari/factureaza/route.ts` |
| Stage constants       | `lib/supabase/kanban/constants.ts` |

---

## 4. Departments (Salons, Horeca, Barbershops, Repairs)

Department pipelines contain **trays** (Tăvițe). Pipeline names are defined in `lib/supabase/kanban/constants.ts`: `DEPARTMENT_PIPELINES = ['Saloane', 'Horeca', 'Frizerii', 'Reparatii']`.

### 4.1 Stages

- **New (Noua)** – trays that have not yet been taken into work; they appear here by default when sent from Reception (Recepție) (except those with a Return (Retur) tag).  
- **Return (Retur)** – trays of leads with a **Return (Retur)** tag; when "sending trays" they are placed in the Return (Retur) stage of the department pipeline.  
- **In progress (In lucru)** – trays assigned to a technician (`trays.technician_id`, optionally `technician2_id`, `technician3_id`) and taken into work.  
- **On hold (In asteptare)** – trays moved to on hold ("On hold (In asteptare)" button in tray details).  
- **Completed (Finalizata)** – completed trays; they also appear in the **Quality Check** pipeline for validation.

The name patterns for these stages are in `lib/supabase/kanban/constants.ts` (`STAGE_PATTERNS`: NOUA, RETUR, IN_LUCRU, IN_ASTEPTARE, FINALIZARE).

### 4.2 Sending Trays from Reception (Recepție)

- In `hooks/preturi/usePreturiTrayOperations.ts`: for each tray the department pipeline is determined from the **instruments**; if the lead has a Return (Retur) tag, the **Return (Retur)** stage is used, otherwise **New (Noua)**. `addTrayToPipeline(tray.id, departmentPipelineId, stageId)` from `lib/supabase/pipelineOperations.ts` is called; uniqueness of the tray in department pipelines is ensured (a tray does not appear in two departments).

### 4.3 Technician Assignment and Filtering

- Assignment is done in the UI (tray details, technician dashboard); it is saved in `trays.technician_id` (and optionally a second/third technician).  
- The department strategy (`lib/supabase/kanban/strategies/department.ts`) for non-admin users filters trays: the user sees trays assigned to them, unassigned trays and "split" trays (with multiple technicians).

### 4.4 "On Hold (In asteptare)" Button

- Moving the tray to the **On hold (In asteptare)** stage is done via `moveItemToStage('tray', trayId, pipelineId, inAsteptareStageId)`.  
- Used in: `hooks/leadDetails/useLeadDetailsDepartmentActions.ts`, `app/(crm)/tehnician/tray/[trayId]/page.tsx` (e.g. `handleStatusChange` updates `trays.status` and the pipeline stage).

### 4.5 Key Files – Departments

| Domain         | Files |
|----------------|-------|
| Strategy       | `lib/supabase/kanban/strategies/department.ts` |
| Sending        | `hooks/preturi/usePreturiTrayOperations.ts` |
| Stage movement | `lib/supabase/pipelineOperations.ts` |
| Technician UI  | `app/(crm)/tehnician/tray/[trayId]/page.tsx`, `app/(crm)/dashboard/tehnician/page.tsx` |
| Actions        | `hooks/leadDetails/useLeadDetailsDepartmentActions.ts`, `components/lead-details/actions/LeadDepartmentActions.tsx` |
| Status API     | `app/api/trays/check-department-status/route.ts` |

---

## 5. Quality Check

The **Quality Check** pipeline has stages corresponding to departments (Salons, Horeca, Barbershops, Repairs). **There are no duplicate items in the DB** for Quality: trays are read from the department pipelines (**Completed (Finalizată)** stage) and displayed **virtually** in Quality.

### 5.1 Loading Items

- In `lib/supabase/kanban/strategies/quality.ts`, **QualityPipelineStrategy.loadItems()**:  
  - `pipeline_items` of type `tray` are loaded from department pipelines that are in the **Completed (Finalizată)** stage.  
  - For each tray the latest QC event is checked in `items_events`: if **quality_validated** exists, the tray **no longer** appears in Quality; if **quality_not_validated** exists or the event is missing, the tray appears.  
  - Virtual Kanban items are constructed per Quality stage (mapped to department).

### 5.2 Validation / Non-validation

- From the CRM page (e.g. `app/(crm)/leads/[pipeline]/page.tsx`): actions like `handleQcValidate`, `handleQcDontValidate`.  
  - **Validation:** a **quality_validated** event is recorded in `items_events`; the tray disappears from Quality; in Reception (Recepție), when all trays of a service file are validated, the service file moves to **To be invoiced (De facturat)**.  
  - **Non-validation:** **quality_not_validated** is recorded and, in some flows, the tray is moved back to the **In progress (In lucru)** stage in the department.

### 5.3 Key Files – Quality Check

| Domain    | Files |
|-----------|-------|
| Strategy  | `lib/supabase/kanban/strategies/quality.ts` |
| Actions   | `app/(crm)/leads/[pipeline]/page.tsx` (handleQcValidate, handleQcDontValidate) |
| Constants | `lib/supabase/kanban/constants.ts` (FINALIZARE pattern, department mapping) |

---

## 6. Data Model (summary)

- **leads** – contact, source (platform, campaign, form), addresses, flags: `no_deal`, `call_back`, `callback_date`, `nu_raspunde`, `nu_raspunde_callback_at`, `curier_trimis_at`, `office_direct_at`, `claimed_by`, etc.  
- **service_files** – Service File (Fișă de service): `lead_id`, `number`, `date`, `status` (noua, in_lucru, finalizata, comanda, facturata), `office_direct`, `office_direct_at`, `curier_trimis`, `curier_scheduled_at`, `colet_neridicat`, `colet_ajuns`, `nu_raspunde_callback_at`, `urgent`, `no_deal`, etc.  
- **trays** – Tray (Tăviță): linked to a service file; `technician_id` (and optionally 2/3); `status`; `qc_notes`; etc.  
- **pipelines** – id, name, description, position, is_active.  
- **stages** – id, pipeline_id, name, position, is_active.  
- **pipeline_items** – type ('lead' | 'service_file' | 'tray'), item_id, pipeline_id, stage_id, created_at, updated_at.  
- **lead_tags** – many-to-many lead–tag relationship (e.g. Courier Sent (Curier trimis), Office Direct, Return (Retur), Call! (Sună!), department tags).  
- **vanzari_apeluri** – journal of movements/calls in the Sales (Vânzări) pipeline.  
- **items_events** – event journal per item (lead, service_file, tray): e.g. `quality_validated`, `quality_not_validated`, `colet_neridicat_auto`, `de_trimis`, `ridic_personal`.  
- **stage_history** – for trays: stage movement history (tray_id, pipeline_id, from_stage_id, to_stage_id, moved_by, moved_at).

TypeScript types are defined in `lib/types/database.ts`.

---

## 7. Connected Flows (synthesis)

1. **Lead** created (Meta webhook, simulation or manual) → insert into `leads` → added to `pipeline_items` (type `lead`, Sales (Vânzări) pipeline, Leads (Leaduri) or Foreign Leads (Leaduri Straine) stage based on phone).  
2. **Sales (Vânzări)** user confirms **Courier Sent (Curier trimis)** or **Office Direct** → a **service_files** record is created → the service file is added to **Reception (Recepție)** (Courier Sent (Curier Trimis) / Office Direct stage); the lead is moved to the corresponding stage in Sales (Vânzări).  
3. **Reception (Recepție):** the user marks "Sent" (parcel arrived) or sends the trays → the trays receive `pipeline_items` in **Departments** (New (Noua) or Return (Retur)); the service file is positioned in Parcel arrived (Colet ajuns) / In progress (In lucru) / On hold (In asteptare) depending on tray state.  
4. **Departments:** trays move New (Noua) → In progress (In lucru) → On hold (In asteptare) → Completed (Finalizată); technician assignment and Return (Retur) tag in hooks and pipeline operations.  
5. **Quality Check:** reads trays from departments (Completed (Finalizată) stage), displays virtual cards; upon **validation** `quality_validated` is written to `items_events`; Reception (Recepție) uses this to move the service file to **To be invoiced (De facturat)** when all trays are validated.  
6. **To be invoiced (De facturat)** → the user invoices (Pick up in person (Ridic personal) or To be sent (De trimis) AWB) → the service file is moved to **To be sent (De trimis)** or **Pick up in person (Ridic personal)**; upon client agreement and pressing the Sent button (if not already done at invoicing), the flow is complete. When all service files of the lead are invoiced/sent, the lead can be moved to **Archived (Arhivat)**; service files with "-copy" trays appear in the **Archived (Arhivat)** stage in Reception (Recepție).

---

*Document generated based on the code analysis of the project. Stage names and pipeline names may vary slightly in the database; the logic uses name patterns for compatibility.*
