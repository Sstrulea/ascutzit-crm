# Technical Project Description: CRM for Sharpening Workshop

**Document version:** 1.0  
**Purpose:** Complete technical specification for a software developer to estimate and implement a CRM dedicated to a sharpening workshop (knives, scissors, industrial blades, professional tools).  
**Language:** English.  
**Audience:** Software developers, project managers, stakeholders.

---

## 1. Project Overview

### 1.1 Application Purpose

The application is a **Customer Relationship Management (CRM) system** tailored for a **sharpening workshop**. It covers the full lifecycle from **lead acquisition** (via Meta/Facebook) through **order intake**, **reception**, **in-shop processing** (by department and technician), **quality control**, **billing**, **delivery**, and **archiving**. The system supports multiple delivery types (courier, office pickup), callback scheduling, and detailed tracking and statistics per sales agent and technician.

### 1.2 Type of Business Served

- **Sharpening workshops / ateliers** that service:
  - Kitchen and professional knives
  - Scissors (hairdressing, tailoring, etc.)
  - Industrial blades
  - Professional and industrial tools
- Business model: B2B and B2C; orders can come from **leads** (inbound from Meta) or be created directly in **Reception**. Service is organized by **service files** (one per customer/order) containing one or more **trays**, each tray holding multiple **instruments** and **services** (e.g. sharpening type, repairs).

### 1.3 Problems Solved

- **Centralised lead and order management:** Single place for leads (from Meta), orders (service files), and physical units (trays) with clear stage progression.
- **Traceability:** Full history of stage changes, assignments, and actions (courier sent, office direct, no answer, callback, no deal) for each lead and service file.
- **Sales performance:** Statistics per sales agent (curier trimis, office direct, no deal, nu răspunde, call back) and conversion rates (e.g. order vs total calls).
- **Reception and logistics:** Clear flow from “Courier sent” / “Office direct” to “Colet neridicat” (parcel not picked up), “Colet ajuns” (parcel arrived), then to department stages (in progress, waiting, completed) and QC, then to “De facturat”, “De trimis” / “Ridic personal”, and archiving.
- **Department and technician workload:** Pipelines per department (e.g. Saloane, Horeca, Frizerii, Reparatii) with stages (New, Retur, In progress, Waiting, Completed); technicians can take trays, add services/instruments, and move trays between stages.
- **Quality control:** Dedicated QC step to validate completed trays before moving to billing and delivery; archiving of service file + trays + lead when appropriate.

---

## 2. Target Users

| Role | Description | Main Capabilities |
|------|-------------|-------------------|
| **Admin / Owner** | Full access; can delete leads/service files, manage pipelines and settings, view all data and statistics. | All features; user and role management; delete lead/service file; configuration. |
| **Sales agent (Vânzător)** | Handles leads from Meta; performs call outcomes (Curier trimis, Office direct, Nu răspunde, Call back, No deal); can create service files and set delivery. | Sales pipeline (leads, stages); lead details; actions (livrări, callback, nu răspunde, no deal); statistics (own and team). |
| **Reception (Recepție)** | Receives instruments; manages service files in reception pipeline (Curier trimis, Office direct, Colet neridicat, Colet ajuns, In progress, In așteptare, De facturat, Nu răspunde, De trimis, Ridic personal, Arhivat). | Reception pipeline; “Colet ajuns” and “Trimitere tăviță” to departments; create lead/service file from reception. |
| **Technician (Tehnician)** | Works in one or more departments; processes trays (instruments + services). | Department pipeline(s); take tray; move tray (in progress, waiting, completed); add services, instruments, comments, messages; view own dashboard. |
| **QC / Quality control** | Validates completed trays from all departments; once validated, trays can be archived with the service file. | QC pipeline / view; validate trays; link to archiving. |
| **Client (optional, future)** | May get a portal to see order status, appointments, or basic history. | Out of current scope; mentioned for future scalability. |

---

## 3. Core Functional Requirements

### A. Authentication & Roles

- **Login / Logout:** Secure login (e.g. email + password); session management; logout from all devices optional.
- **Role-based access control (RBAC):** Roles: Admin/Owner, Sales (vânzător), Reception (recepție), Technician (tehnician), QC. Permissions:
  - **Owner/Admin:** Full access; delete lead/service file; manage users, pipelines, stages.
  - **Sales:** Access to Sales pipeline and lead-related features; own statistics.
  - **Reception:** Access to Reception pipeline and service-file reception flow.
  - **Technician:** Access to assigned department pipeline(s) and tray operations.
  - **QC:** Access to QC validation and related views.
- **Password reset:** Self-service password reset (email link or secure flow).
- **Optional:** Invite users by email; assign role at creation.

### B. Customer Management (Leads & Contacts)

- **Create / Edit / Delete customer (lead):**
  - Leads are the primary “customer” entity in the sales flow; they can be created from Meta integration or manually (Sales or Reception).
  - Create: at least full name, phone (Romanian or foreign); optional company, email, address, notes (details communicated by client).
  - Edit: all contact and note fields.
  - Delete: only for Admin/Owner; soft-delete preferred with audit.
- **Customer details:** Full name, phone, email, company name, address; “details communicated by client” (free text); tags (e.g. Curier trimis, Office direct, Suna!, Retur, Urgent).
- **Work history:** Each lead has an **activity/history log**: every stage change, tag change, assignment, delivery choice, callback, “nu răspunde”, no deal, and key actions (e.g. service file created, tray sent to department) must be recorded with timestamp and actor (user) for display in lead details.
- **Search & filter:** Global search (by name, phone, email, tag, tray number, service file number) without requiring diacritics; filter by pipeline, stage, tag, date range, assigned user. List views (e.g. pipeline boards) should support filters and optional URL persistence (e.g. `?q=...`).

### C. Order Management (Service Files & Trays)

The “order” in the workshop is represented by:

- **Service file (Fișă de serviciu):** One per customer/order. Groups one or more **trays**. Created either from **Sales** (after choosing delivery: Curier trimis / Office direct) or from **Reception** (e.g. “Create lead” then create service file). Has: number, lead reference, creation date, delivery type, optional “colet ajuns” date, timestamps for reporting.
- **Tray (Tăviță):** Physical unit (e.g. one box/bag of instruments). Each tray has: number, list of **instruments** (name, quantity, serial, condition/notes), **services** (e.g. sharpening, repair) with quantity, price, discount, warranty; optional assignment to one or more **technicians**. Trays move through **department stages** (New, Retur, In progress, Waiting, Completed) and then to QC and billing/delivery.

**Functional requirements:**

- **Create new order (service file):** From lead details (Sales) or from Reception; link to lead; optionally create first tray.
- **Instrument type and data:** Per instrument (per tray): type (knife, scissors, blade, custom tool), name, quantity, serial; condition/notes; link to services (e.g. “sharpening”, “repair”).
- **Services and pricing:** Per tray item or per tray: article/service name, quantity, unit price, discount, “nereparat”, warranty; total per line and per tray; optional tax rules for invoicing.
- **Condition / notes:** At instrument and tray level; visible on cards and in details.
- **Price and totals:** Store unit price, quantity, discount; compute totals per tray and per service file for display and invoicing.
- **Estimated completion date:** Optional field at service file or tray level; can be used for “callback” or “ready for pickup” estimates.
- **Order / service file status (stage):** Service file moves through **Reception pipeline** stages, e.g.:
  - Curier trimis, Office direct → Colet neridicat (e.g. +1 day after courier send) → Colet ajuns → In lucru / In așteptare (derived from tray stages) → De facturat / Nu răspunde → De trimis / Ridic personal → Arhivat.
- **Tray status (stage):** In **department pipeline**: NOUA, Retur, In lucru, In așteptare, Finalizate; after QC and billing, trays follow service file to delivery and archiving.
- **Assign technician:** Trays can be assigned to one or more technicians (e.g. technician_id, technician2_id, technician3_id); assignment is visible on card and in details; optional “split tray” (divide instruments between technicians into separate trays).
- **Order and tray history:** Every stage change and important action (e.g. “colet ajuns”, “trimitere tăviță”, technician assignment, QC validated) must be stored and shown in **Istoric** in service file and lead details.

**Sales-specific (lead) actions affecting “order” flow:**

- **Curier trimis:** Choose date (and optionally time) for courier; integrate with courier API (e.g. FanCourier); move lead to “Curier Sent” (or equivalent) and set tag “Curier trimis” and record sales agent name; corresponding service file appears in Reception in “Curier trimis” (or “Office direct” if that path is used).
- **Office direct:** Customer will pick up at office; lead moved to “Curier Sent” (or “Office direct”) with tag and sales agent; service file in Reception in “Office direct”.
- **Nu răspunde:** Set time same day for callback; lead moves to “Nu răspunde” until that time; after expiry, auto-move to “Leaduri” with tag “Suna!” and clear callback time.
- **Call back:** Set date and time for callback; lead in “Call back” until expiry; after expiry, move to “Leaduri” with tag “Suna!” and clear callback.
- **No deal:** Lead moved to “No deal”; cards in “No deal” can be archived (e.g. daily batch) to “Arhivat”.

All these actions must be **tracked for statistics** (see Dashboard / Statistics).

### D. Payment Management

- **Mark as paid / unpaid:** At service file or order level (or per invoice if multiple); flag and date of payment.
- **Payment method:** Cash, card, bank transfer; store and show in history and reports.
- **Invoice generation:** Generate invoice (PDF) from service file data: customer, instruments, services, totals, payment status; optional numbering and legal header/footer. “De facturat” stage typically holds service files ready for billing; after payment and delivery they move to “De trimis” / “Ridic personal” and then archiving.

### E. Dashboard & Statistics

- **Dashboard (general):** KPIs such as: total active orders (e.g. service files not archived), completed orders (e.g. in “De trimis”/“Ridic personal” or archived), revenue overview (e.g. by period), orders by status (counts per stage).
- **Statistics – Apeluri (Sales call statistics):** Per **sales agent** (and optionally Owner/Admin as “vânzător”):
  - Counts: Curier trimis, Office direct, No deal, Nu răspunde, Call back (from recorded actions / stage moves).
  - **Conversion rate 1:** (Comandă / Total) × 100 where Total = total calls (e.g. number of moves into “No deal” or total from `vanzari_apeluri` for the period) and Comandă = moves into “Comandă” (or equivalent “order placed”) stage.
  - **Conversion rate 2:** Same formula with Total = all recorded calls in chosen period from `vanzari_apeluri`, Comandă = moves to “Comandă”.
  - Filters: by period (date range), by sales agent.
- **Technician dashboard:** For technicians: trays processed (moved to “Finalizare”), trays currently “In lucru”, optional time/revenue per period; list of technicians with activity in selected period.
- **Reception / Operations:** Optional dashboard: service files by stage (e.g. Colet neridicat, Colet ajuns, In lucru, De facturat), ageing (e.g. time since “Colet ajuns”).

### F. Notifications

- **Internal status updates:** In-app notifications or activity feed when: stage changes, assignment changes, “colet ajuns”, “trimitere tăviță” to department, QC validated, or when a technician is assigned to a tray. Optional: real-time updates (e.g. WebSocket or short polling) for pipeline boards.
- **Optional customer notifications:** Email or SMS when order is ready for pickup or when courier is sent; configurable per workshop (can be added later).

---

## 4. Non-Functional Requirements

- **Responsive design:** Usable on desktop and mobile browsers (e.g. collapsible sidebar, touch-friendly cards, modal/sheet for details on small screens).
- **Secure authentication:** Passwords hashed (e.g. bcrypt or equivalent); sessions with secure cookies or tokens; HTTPS in production.
- **Data validation:** Input validation on client and server (length, format, required fields); sanitisation to prevent XSS and injection; business rules (e.g. stage transitions, role permissions) enforced on backend.
- **Performance:** Pagination or virtualisation for long lists (e.g. pipeline columns); debounced search; limit number of results per API call; optional caching for dropdowns (e.g. pipelines, stages, users). Target: key pages (pipelines, search) usable within a few seconds on typical connections.
- **Backup and data integrity:** Regular database backups; optional point-in-time recovery; audit trail for critical actions (delete lead/service file, role change) to support compliance and debugging.

---

## 5. Technical Suggestions (Open to Developer Proposal)

- **Web application:** Browser-based; no mandatory native mobile app in first phase.
- **Frontend:** Single-page application (SPA) or server-rendered with interactivity; suggested: **React** (e.g. Next.js) or Vue/Angular; component library for UI (e.g. shadcn/ui, Tailwind); state management (e.g. React Query for server state, Context or Zustand for client state).
- **Backend:** REST API (or GraphQL if preferred); suggested: **Node.js** (Express/Fastify) or **Django** / **Laravel**; authentication (e.g. JWT or session-based); role checks on each protected endpoint.
- **Database:** **PostgreSQL** or MySQL; normalized schema for: users, roles, leads, tags, service_files, trays, tray_items (instruments + services), pipeline/stage definitions, pipeline_items (placement of lead/service_file/tray in stage), activity/history, vanzari_apeluri (or equivalent for call statistics). Consider indexes on: lead phone/name, service file number, tray number, pipeline_item (item_id, pipeline_id, stage_id), created_at for reports.
- **Integrations:** Meta (Facebook) for lead ingestion (webhook or API); FanCourier (or similar) API for courier booking and tracking; optional: email (SMTP or provider API), SMS gateway for customer notifications.
- **Hosting:** Backend and DB on a VPS or PaaS (e.g. Railway, Render, AWS); frontend can be static/SSR on same or CDN; environment variables for API keys and feature flags.

---

## 6. Workflow Description (Step-by-Step)

1. **Lead creation**  
   Lead is created (from Meta or manually) and appears in Sales pipeline in stage “Leaduri” (or “Leaduri străine” if phone is non-Romanian).

2. **Sales call and outcome**  
   Sales agent calls the lead and chooses one action:
   - **Curier trimis:** Selects send date (and optionally books via FanCourier); lead moves to “Curier Sent” with tag “Curier trimis” and agent name; when service file is created and linked, it appears in Reception in “Curier trimis”.
   - **Office direct:** Lead moves to “Curier Sent” (or “Office direct”) with tag and agent; service file in Reception in “Office direct”.
   - **Nu răspunde:** Agent sets callback time same day; lead moves to “Nu răspunde”; at expiry, lead auto-moves to “Leaduri” with tag “Suna!” and time is cleared.
   - **Call back:** Agent sets date and time; lead in “Call back”; at expiry, move to “Leaduri” with tag “Suna!” and clear date/time.
   - **No deal:** Lead moves to “No deal”; can be archived (e.g. daily) to “Arhivat”.

3. **Service file creation**  
   When delivery is chosen (Curier trimis / Office direct), a **service file** is created (from lead details or Reception). It is linked to the lead and appears in Reception in the corresponding stage (Curier trimis or Office direct).

4. **Reception – time-based move**  
   For “Curier trimis”: e.g. courier sent on day D at 08:00; next day (D+1) the service file is moved automatically from “Curier trimis” to **“Colet neridicat”** (parcel not yet picked up). When courier delivers to workshop (e.g. D+1 afternoon), receptie marks “Colet ajuns” and the service file moves to **“Colet ajuns”**.

5. **Sending trays to departments**  
   Reception uses “Trimitere tăviță” (send trays) to dispatch tray cards to department pipelines (e.g. Saloane, Horeca, Frizerii, Reparatii). Each tray appears in department stage “NOUA” (or “Retur” if tagged). Service file stage is derived from tray stages (e.g. if any tray “In lucru” → service file “In lucru”; if any “In așteptare” → “In așteptare”).

6. **Technician processing**  
   Technician opens department pipeline, “Preia tăviță” (takes tray) and moves it to “In lucru”, “In așteptare”, or “Finalizate”. He adds/edits instruments, services, comments, messages. When all trays of a service file are in “Finalizate”, the service file can progress to QC.

7. **Quality control**  
   QC user validates completed trays from all departments. Once validated, trays are considered ready for billing; archiving of service file + trays + lead can happen when the service file is archived.

8. **Billing and delivery**  
   Service file moves to **“De facturat”** (or remains in “Nu răspunde” if client has not agreed). After payment and invoice (PDF), service file moves to **“De trimis”** (courier) or **“Ridic personal”** (office pickup). Payment is recorded (paid/unpaid, method).

9. **Delivery and archiving**  
   When order is delivered (or marked as such), service file (and linked lead and trays) can be moved to **Arhivat** (archived). History and statistics remain available.

10. **Statistics**  
    All actions (Curier trimis, Office direct, No deal, Nu răspunde, Call back) and stage moves are recorded (e.g. in `vanzari_apeluri` and history). “Statistici Apeluri” page shows per-sales-agent counts and conversion rates (Comandă/Total × 100) for the selected period.

---

## 7. Future Scalability

- **Online appointment booking:** Customers choose a time slot for drop-off or pickup; sync with internal pipeline stages.
- **Customer login portal:** Client sees order status, history, and optional documents (e.g. invoice); requires customer accounts and auth.
- **Inventory management:** Track abrasive materials, consumables, and tools used per tray/department; low-stock alerts.
- **Multi-location support:** Multiple workshops; filter by location; optional central reporting.
- **Additional couriers:** Extend beyond FanCourier to other providers via unified “delivery provider” API.
- **Advanced reporting:** Revenue by department/technician, average turnaround time, no-answer and callback rates over time.

---

## Document Control

- This description is intended for **estimation and implementation** by a software developer.
- Technical choices (framework, database, hosting) are suggestions; the developer may propose alternatives that meet the functional and non-functional requirements above.
- Clarifications and changes should be tracked (e.g. version history or changelog) so that estimates and scope remain aligned.
