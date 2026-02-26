# Installation, Configuration and Launch Guide – Ascutzit CRM

Step-by-step guide for onboarding a new developer onto the project.

---

## 1. Prerequisites

### 1.1 Required Software

| Software | Minimum Version | Verification | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | v20+ (recommended v22 LTS) | `node -v` | Next.js 16 requires Node 20+ |
| **npm** | v10+ | `npm -v` | Comes with Node.js |
| **Git** | v2.30+ | `git --version` | Repository cloning |
| **Editor** | VS Code / Cursor | - | Recommended with extensions: Tailwind CSS IntelliSense, ESLint, Prettier |

### 1.2 External Services (required)

| Service | Purpose | Where to Configure |
| :--- | :--- | :--- |
| **Supabase** (cloud or local) | PostgreSQL + Auth + Realtime + Storage | [supabase.com](https://supabase.com) → create project |
| **Facebook Developer App** | Webhook Lead Ads (optional for local dev) | [developers.facebook.com](https://developers.facebook.com) |
| **Vercel** | Deployment + Cron jobs (optional for local dev) | [vercel.com](https://vercel.com) |

### 1.3 What does NOT need to be installed locally

- **No** need for Docker, Redis, local PostgreSQL – the database is on Supabase (cloud).
- **No** need for a separate web server – Next.js includes the development server.
- **No** need for local migrations – the DB schema is managed directly from the Supabase Dashboard.

---

## 2. Installation Steps

### Step 1: Clone repository

```bash
git clone <URL_REPOSITORY> ascutzit-crm
cd ascutzit-crm
```

### Step 2: Install dependencies

```bash
npm install
```

> **Note:** The project uses `npm` (there is no lockfile for yarn/pnpm, but the `clean-cache.js` script mentions `pnpm dev` – you can use either). If you prefer pnpm:
> ```bash
> pnpm install
> ```

### Step 3: Configure environment variables

Create the `.env.local` file in the project root:

```bash
cp .env.example .env.local   # if .env.example exists
# or create manually:
```

```env
# ===========================
# SUPABASE (REQUIRED)
# ===========================
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...  # Anon/public key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...       # Service role key (server-side only!)

# ===========================
# FACEBOOK LEAD ADS (OPTIONAL)
# ===========================
# Only needed if you are testing the Facebook webhook
FACEBOOK_PAGE_ACCESS_TOKEN=EAAxxxxxxxxx...
FACEBOOK_VERIFY_TOKEN=un_token_ales_de_tine

# ===========================
# PIPELINE IDS (OPTIONAL – Facebook webhook)
# ===========================
# IDs from the pipelines/stages table – needed for webhook auto-placement
DEFAULT_PIPELINE_ID=uuid-pipeline-vanzari
DEFAULT_STAGE_ID=uuid-stage-leaduri
LEADURI_STRAINA_STAGE_ID=uuid-stage-leaduri-straine

# ===========================
# CRON JOBS (OPTIONAL – production)
# ===========================
CRON_SECRET=un_secret_pentru_cron_vercel
CRON_SECRET_KEY=un_alt_secret_pentru_cron_manual

# ===========================
# WEB PUSH NOTIFICATIONS (OPTIONAL)
# ===========================
# Generate with: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BPxxxxxxxxxxx...
VAPID_PRIVATE_KEY=xxxxxxxxxxxx...

# ===========================
# APP URL (OPTIONAL – push notifications, emails)
# ===========================
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ===========================
# FACEBOOK SIMULATION (OPTIONAL – development)
# ===========================
SIMULATE_FACEBOOK_SECRET=un_secret_pentru_testare

# ===========================
# DEBUG (OPTIONAL – development)
# ===========================
NEXT_PUBLIC_DEBUG_SUPABASE_REQUESTS=false
```

**Where to find the values:**
1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. **Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (Secret! Do not expose in client!)
3. **Pipeline/Stage IDs**: after running the setup, copy the UUIDs from the `pipelines` / `stages` table in the Supabase Table Editor.

### Step 4: Database setup

The database schema must be created in Supabase. There are 2 options:

**Option A: Apply schema from SQL file**
1. Open Supabase Dashboard → **SQL Editor**.
2. Run the contents of `docs/sql data base.md` (CREATE TABLE statements).
3. Create the required RPC functions (additional migrations).

**Option B: Setup through the application**
1. Start the application (step 5).
2. Navigate to `/setup` in the browser.
3. Enter the owner's email and press Setup.
4. This synchronizes the permissions and initial configuration.

**Initial owner account setup:**
1. In Supabase Dashboard → **Authentication → Users** → create a user (email + password).
2. In **Table Editor → `app_members`** → add a row:
   ```
   user_id: <UUID of the created user>
   role: owner
   name: Your Name
   ```

### Step 5: Start development server

```bash
npm run dev
```

The application will be available at: **http://localhost:3000**

---

## 3. Useful Commands

### 3.1 Development

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start development server (accessible from LAN network via 0.0.0.0) |
| `npm run dev:turbo` | Development with Turbopack (faster) |
| `npm run dev:local` | Development on localhost only (no network access) |
| `npm run dev:network:3001` | Development on port 3001 (when 3000 is in use) |

### 3.2 Build & Production

| Command | Description |
| :--- | :--- |
| `npm run build` | Build for production |
| `npm run start` | Start production server (after build) |
| `npm run analyze` | Build with bundle analysis (ANALYZE=true) |

### 3.3 Utilities

| Command | Description |
| :--- | :--- |
| `npm run clean` | Delete Next.js cache (.next, .turbo) – run after Ctrl+C! |
| `npm run lint` | ESLint check |
| `npm run ip` | Display local IP (for phone access on the same network) |
| `npm run perf` | Local performance monitoring |
| `npm run perf:prod` | Production performance monitoring |

### 3.4 Generate VAPID Keys (Web Push)

```bash
npx web-push generate-vapid-keys
```
Copy the generated keys into `.env.local` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`).

### 3.5 Tests

The project **does not have** a testing framework configured (there is no jest, vitest, playwright, cypress in `package.json`). Testing is done manually or through simulation:

```bash
# Simulate Facebook lead (development)
curl -X POST http://localhost:3000/api/leads/simulate-facebook \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test User","phone":"+40722123456","email":"test@test.com"}'
```

---

## 4. Troubleshooting

### 4.1 Error: `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Cause:** The `.env.local` file is missing or the variables are not set.

**Solution:**
1. Verify that the `.env.local` file exists in the project root.
2. Verify that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` have values (no spaces).
3. Restart the development server (`.env` variables are read at startup).

---

### 4.2 Error: `Missing Supabase admin credentials`

**Cause:** `SUPABASE_SERVICE_ROLE_KEY` is missing. Affects server-side API routes (cron jobs, admin, billing).

**Solution:**
1. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`.
2. Copy from Supabase Dashboard → Settings → API → service_role key.

---

### 4.3 White screen or infinite redirect to `/auth/sign-in`

**Cause:** The Supabase session is not being created correctly (cookies, middleware).

**Solution:**
1. Verify that the Supabase URL and anon key are correct.
2. Verify in Supabase Dashboard → Authentication that at least one user exists.
3. Verify in Table Editor → `app_members` that the user has a row with `role` set.
4. Clear cookies from the browser (DevTools → Application → Cookies → Clear).
5. Try in a private/incognito browser.

---

### 4.4 Error: `relation "..." does not exist` (Supabase)

**Cause:** The tables have not been created in the database.

**Solution:**
1. Open Supabase → SQL Editor.
2. Run the schema from `docs/sql data base.md`.
3. Verify in Table Editor that the tables appear.

---

### 4.5 Error: `TypeError: Cannot read properties of null (reading 'id')` in Kanban

**Cause:** There are no pipelines or stages in the database.

**Solution:**
1. Create the necessary pipelines in `pipelines` (e.g.: Vânzări, Recepție, Saloane, Horeca, Frizerii, Reparatii, Quality Check).
2. Create stages for each pipeline (e.g.: Leaduri, Nu Răspunde, Call Back, No Deal, etc.).
3. Alternatively, navigate to `/setup` and run the automatic setup.

---

### 4.6 Port 3000 in use

**Cause:** Another Next.js instance or another process is using port 3000.

**Solution:**
```bash
# Windows – find the process on port 3000
netstat -ano | findstr :3000
# Then: taskkill /PID <PID> /F

# Or start on a different port
npm run dev:network:3001
```

---

### 4.7 CORS error or `allowedDevOrigins`

**Cause:** You are accessing the application from the LAN network but the IP is not in the `allowedDevOrigins` list.

**Solution:**
Add your LAN IP in `next.config.mjs`:
```javascript
allowedDevOrigins: [
  'localhost',
  '127.0.0.1',
  'YOUR_LAN_IP',  // e.g.: '192.168.1.50'
],
```
Or run `npm run ip` to find your local IP.

---

### 4.8 Slow build or corrupted cache

**Cause:** The Next.js or Turbopack cache has become corrupted.

**Solution:**
```bash
# Stop the server (Ctrl+C), then:
npm run clean
npm run dev
```

---

### 4.9 Facebook Webhook error: `401 Unauthorized` or not receiving leads

**Cause:** The Facebook variables are not set or the webhook is not configured.

**Solution:**
1. Verify `FACEBOOK_PAGE_ACCESS_TOKEN` and `FACEBOOK_VERIFY_TOKEN` in `.env.local`.
2. In Meta for Developers → Webhooks → configure the URL: `https://DOMAIN/api/leads/facebook-webhook`.
3. During verification, Facebook sends `hub.verify_token` – it must match `FACEBOOK_VERIFY_TOKEN`.
4. For local testing, use the simulation:
   ```bash
   curl -X POST http://localhost:3000/api/leads/simulate-facebook \
     -H "Content-Type: application/json" \
     -d '{"full_name":"Test","phone":"0722123456","email":"test@test.com"}'
   ```

---

### 4.10 Push Notifications not working

**Cause:** VAPID keys are not configured.

**Solution:**
1. Generate keys: `npx web-push generate-vapid-keys`.
2. Add to `.env.local`:
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=public_key
   VAPID_PRIVATE_KEY=private_key
   ```
3. Restart the server.
4. In the application, click the notification bell → enable notifications → test with the Test button.

---

### 4.11 TypeScript error on build (but works in dev)

**Cause:** Next.js 16 is configured with `typescript.ignoreBuildErrors: true` in `next.config.mjs`, so TS errors do not block the build. But if runtime errors occur:

**Solution:**
1. Run `npx tsc --noEmit` to see all TS errors.
2. Verify that types are up to date: `@types/react`, `@types/node`.
3. If the error is on an external module, add in `tsconfig.json` → `skipLibCheck: true` (already set).

---

## 5. Minimum Structure for Operation

The **minimum required** environment variables to start the project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Minimum required** DB schema (tables that must exist):
- `app_members` (with at least one owner row)
- `pipelines` (at least one pipeline)
- `stages` (at least one stage per pipeline)
- `pipeline_items` (can be empty)
- `leads`, `service_files`, `trays`, `tray_items` (can be empty)
- `tags`, `lead_tags` (can be empty)
- `items_events`, `stage_history` (can be empty)

**PostgreSQL RPC Functions** (required for business operations):
- `move_item_to_stage`
- `generate_factura_number`
- `start_work_session` / `finish_work_session`
- `search_unified`
- `get_expired_callback_leads` / `get_expired_nu_raspunde_leads`

These functions must be created in Supabase → SQL Editor. Consult the team for migration scripts.

---

## 6. Phone / Tablet Access (Development)

The application is optimized for mobile. To test on a phone on the same Wi-Fi network:

1. Start the server with network access: `npm run dev` (uses `-H 0.0.0.0` by default).
2. Find the local IP: `npm run ip`.
3. On the phone, open: `http://LOCAL_IP:3000` (e.g.: `http://192.168.1.50:3000`).
4. If it doesn't work, add the IP in `next.config.mjs` → `allowedDevOrigins`.

---

## 7. Deployment on Vercel

1. Connect the Git repo to Vercel.
2. Set the environment variables in Vercel → Settings → Environment Variables (all from section 2.3).
3. The cron jobs from `vercel.json` are activated automatically:
   - `/api/cron/midnight-ro` – daily at 22:00 UTC
   - `/api/cron/curier-to-avem-comanda` – daily at 01:00 UTC
4. Additional cron jobs (Colet Neridicat, Follow-up, Backup, Archive No Deal) must be configured externally (e.g.: cron-job.org or Vercel Pro).
5. Configure the Facebook Webhook with the production URL: `https://DOMAIN/api/leads/facebook-webhook`.

---

*Guide generated based on the analysis of the source code, configurations and dependencies of the Ascutzit CRM project.*
