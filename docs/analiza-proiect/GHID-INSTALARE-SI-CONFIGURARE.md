# Ghid de Instalare, Configurare și Lansare – Ascutzit CRM

Ghid pas cu pas pentru integrarea unui dezvoltator nou în proiect.

---

## 1. Cerințe Preliminare

### 1.1 Software Necesar

| Software | Versiune Minimă | Verificare | Note |
| :--- | :--- | :--- | :--- |
| **Node.js** | v20+ (recomandat v22 LTS) | `node -v` | Next.js 16 necesită Node 20+ |
| **npm** | v10+ | `npm -v` | Vine cu Node.js |
| **Git** | v2.30+ | `git --version` | Clonarea repository-ului |
| **Editor** | VS Code / Cursor | - | Recomandat cu extensii: Tailwind CSS IntelliSense, ESLint, Prettier |

### 1.2 Servicii Externe (necesare)

| Serviciu | Scop | Unde se Configurează |
| :--- | :--- | :--- |
| **Supabase** (cloud sau local) | PostgreSQL + Auth + Realtime + Storage | [supabase.com](https://supabase.com) → creează proiect |
| **Facebook Developer App** | Webhook Lead Ads (opțional pentru dev local) | [developers.facebook.com](https://developers.facebook.com) |
| **Vercel** | Deployment + Cron jobs (opțional pentru dev local) | [vercel.com](https://vercel.com) |

### 1.3 Ce NU trebuie instalat local

- **Nu** este nevoie de Docker, Redis, PostgreSQL local – baza de date este pe Supabase (cloud).
- **Nu** este nevoie de un server web separat – Next.js include serverul de dezvoltare.
- **Nu** este nevoie de migrări locale – schema DB este gestionată direct din Supabase Dashboard.

---

## 2. Pași de Instalare

### Pasul 1: Clonează repository-ul

```bash
git clone <URL_REPOSITORY> ascutzit-crm
cd ascutzit-crm
```

### Pasul 2: Instalează dependențele

```bash
npm install
```

> **Notă:** Proiectul folosește `npm` (nu există lockfile pentru yarn/pnpm, dar scriptul `clean-cache.js` menționează `pnpm dev` – poți folosi oricare). Dacă preferi pnpm:
> ```bash
> pnpm install
> ```

### Pasul 3: Configurează variabilele de mediu

Creează fișierul `.env.local` în rădăcina proiectului:

```bash
cp .env.example .env.local   # dacă .env.example există
# sau creează manual:
```

```env
# ===========================
# SUPABASE (OBLIGATORIU)
# ===========================
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...  # Cheie Anon/publică
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...       # Cheie service role (doar server-side!)

# ===========================
# FACEBOOK LEAD ADS (OPȚIONAL)
# ===========================
# Necesar doar dacă testezi webhook-ul Facebook
FACEBOOK_PAGE_ACCESS_TOKEN=EAAxxxxxxxxx...
FACEBOOK_VERIFY_TOKEN=un_token_ales_de_tine

# ===========================
# PIPELINE IDS (OPȚIONAL – webhook Facebook)
# ===========================
# ID-uri din tabelul pipelines/stages – necesare pentru plasarea automată din webhook
DEFAULT_PIPELINE_ID=uuid-pipeline-vanzari
DEFAULT_STAGE_ID=uuid-stage-leaduri
LEADURI_STRAINA_STAGE_ID=uuid-stage-leaduri-straine

# ===========================
# CRON JOBS (OPȚIONAL – producție)
# ===========================
CRON_SECRET=un_secret_pentru_cron_vercel
CRON_SECRET_KEY=un_alt_secret_pentru_cron_manual

# ===========================
# NOTIFICĂRI WEB PUSH (OPȚIONAL)
# ===========================
# Generează cu: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BPxxxxxxxxxxx...
VAPID_PRIVATE_KEY=xxxxxxxxxxxx...

# ===========================
# URL APLICAȚIE (OPȚIONAL – notificări push, emailuri)
# ===========================
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ===========================
# SIMULARE FACEBOOK (OPȚIONAL – dezvoltare)
# ===========================
SIMULATE_FACEBOOK_SECRET=un_secret_pentru_testare

# ===========================
# DEBUG (OPȚIONAL – dezvoltare)
# ===========================
NEXT_PUBLIC_DEBUG_SUPABASE_REQUESTS=false
```

**Unde găsești valorile:**
1. Deschide [Supabase Dashboard](https://supabase.com/dashboard) → proiectul tău.
2. **Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL` = URL Proiect
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = cheie anon/publică
   - `SUPABASE_SERVICE_ROLE_KEY` = cheie service_role (Secret! Nu expune în client!)
3. **Pipeline/Stage IDs**: după rularea setup-ului, copiază UUID-urile din tabelul `pipelines` / `stages` în Supabase Table Editor.

### Pasul 4: Configurarea bazei de date

Schema bazei de date trebuie creată în Supabase. Există 2 opțiuni:

**Opțiunea A: Aplică schema din fișier SQL**
1. Deschide Supabase Dashboard → **SQL Editor**.
2. Rulează conținutul din `docs/sql data base.md` (instrucțiuni CREATE TABLE).
3. Creează funcțiile RPC necesare (migrări adiționale).

**Opțiunea B: Setup prin aplicație**
1. Pornește aplicația (pasul 5).
2. Navighează la `/setup` în browser.
3. Introdu email-ul proprietarului și apasă Setup.
4. Aceasta sincronizează permisiunile și configurația inițială.

**Configurarea contului inițial de proprietar:**
1. În Supabase Dashboard → **Authentication → Users** → creează un utilizator (email + parolă).
2. În **Table Editor → `app_members`** → adaugă un rând:
   ```
   user_id: <UUID-ul utilizatorului creat>
   role: owner
   name: Numele Tău
   ```

### Pasul 5: Pornește serverul de dezvoltare

```bash
npm run dev
```

Aplicația va fi disponibilă la: **http://localhost:3000**

---

## 3. Comenzi Utile

### 3.1 Dezvoltare

| Comandă | Descriere |
| :--- | :--- |
| `npm run dev` | Pornește serverul de dezvoltare (accesibil din rețeaua LAN prin 0.0.0.0) |
| `npm run dev:turbo` | Dezvoltare cu Turbopack (mai rapid) |
| `npm run dev:local` | Dezvoltare doar pe localhost (fără acces din rețea) |
| `npm run dev:network:3001` | Dezvoltare pe portul 3001 (când 3000 este ocupat) |

### 3.2 Build & Producție

| Comandă | Descriere |
| :--- | :--- |
| `npm run build` | Build pentru producție |
| `npm run start` | Pornește serverul de producție (după build) |
| `npm run analyze` | Build cu analiză de bundle (ANALYZE=true) |

### 3.3 Utilitare

| Comandă | Descriere |
| :--- | :--- |
| `npm run clean` | Șterge cache-ul Next.js (.next, .turbo) – rulează după Ctrl+C! |
| `npm run lint` | Verificare ESLint |
| `npm run ip` | Afișează IP-ul local (pentru acces de pe telefon în aceeași rețea) |
| `npm run perf` | Monitorizare performanță locală |
| `npm run perf:prod` | Monitorizare performanță producție |

### 3.4 Generare Chei VAPID (Web Push)

```bash
npx web-push generate-vapid-keys
```
Copiază cheile generate în `.env.local` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`).

### 3.5 Teste

Proiectul **nu are** un framework de testare configurat (nu există jest, vitest, playwright, cypress în `package.json`). Testarea se face manual sau prin simulare:

```bash
# Simulare lead Facebook (dezvoltare)
curl -X POST http://localhost:3000/api/leads/simulate-facebook \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test User","phone":"+40722123456","email":"test@test.com"}'
```

---

## 4. Depanare

### 4.1 Eroare: `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Cauză:** Fișierul `.env.local` lipsește sau variabilele nu sunt setate.

**Soluție:**
1. Verifică dacă fișierul `.env.local` există în rădăcina proiectului.
2. Verifică dacă `NEXT_PUBLIC_SUPABASE_URL` și `NEXT_PUBLIC_SUPABASE_ANON_KEY` au valori (fără spații).
3. Repornește serverul de dezvoltare (variabilele `.env` sunt citite la pornire).

---

### 4.2 Eroare: `Missing Supabase admin credentials`

**Cauză:** `SUPABASE_SERVICE_ROLE_KEY` lipsește. Afectează rutele API server-side (cron jobs, admin, facturare).

**Soluție:**
1. Adaugă `SUPABASE_SERVICE_ROLE_KEY` în `.env.local`.
2. Copiază din Supabase Dashboard → Settings → API → cheie service_role.

---

### 4.3 Ecran alb sau redirect infinit la `/auth/sign-in`

**Cauză:** Sesiunea Supabase nu se creează corect (cookies, middleware).

**Soluție:**
1. Verifică dacă URL-ul Supabase și cheia anon sunt corecte.
2. Verifică în Supabase Dashboard → Authentication că există cel puțin un utilizator.
3. Verifică în Table Editor → `app_members` că utilizatorul are un rând cu `role` setat.
4. Șterge cookie-urile din browser (DevTools → Application → Cookies → Clear).
5. Încearcă într-un browser privat/incognito.

---

### 4.4 Eroare: `relation "..." does not exist` (Supabase)

**Cauză:** Tabelele nu au fost create în baza de date.

**Soluție:**
1. Deschide Supabase → SQL Editor.
2. Rulează schema din `docs/sql data base.md`.
3. Verifică în Table Editor că tabelele apar.

---

### 4.5 Eroare: `TypeError: Cannot read properties of null (reading 'id')` în Kanban

**Cauză:** Nu există pipeline-uri sau etape în baza de date.

**Soluție:**
1. Creează pipeline-urile necesare în `pipelines` (ex.: Vânzări, Recepție, Saloane, Horeca, Frizerii, Reparatii, Quality Check).
2. Creează etape pentru fiecare pipeline (ex.: Leaduri, Nu Răspunde, Call Back, No Deal, etc.).
3. Alternativ, navighează la `/setup` și rulează setup-ul automat.

---

### 4.6 Portul 3000 este ocupat

**Cauză:** O altă instanță Next.js sau un alt proces folosește portul 3000.

**Soluție:**
```bash
# Windows – găsește procesul pe portul 3000
netstat -ano | findstr :3000
# Apoi: taskkill /PID <PID> /F

# Sau pornește pe un alt port
npm run dev:network:3001
```

---

### 4.7 Eroare CORS sau `allowedDevOrigins`

**Cauză:** Accesezi aplicația din rețeaua LAN dar IP-ul nu este în lista `allowedDevOrigins`.

**Soluție:**
Adaugă IP-ul tău LAN în `next.config.mjs`:
```javascript
allowedDevOrigins: [
  'localhost',
  '127.0.0.1',
  'YOUR_LAN_IP',  // ex.: '192.168.1.50'
],
```
Sau rulează `npm run ip` pentru a afla IP-ul tău local.

---

### 4.8 Build lent sau cache corupt

**Cauză:** Cache-ul Next.js sau Turbopack s-a corupt.

**Soluție:**
```bash
# Oprește serverul (Ctrl+C), apoi:
npm run clean
npm run dev
```

---

### 4.9 Eroare Webhook Facebook: `401 Unauthorized` sau nu primește lead-uri

**Cauză:** Variabilele Facebook nu sunt setate sau webhook-ul nu este configurat.

**Soluție:**
1. Verifică `FACEBOOK_PAGE_ACCESS_TOKEN` și `FACEBOOK_VERIFY_TOKEN` în `.env.local`.
2. În Meta for Developers → Webhooks → configurează URL-ul: `https://DOMENIU/api/leads/facebook-webhook`.
3. La verificare, Facebook trimite `hub.verify_token` – trebuie să corespundă cu `FACEBOOK_VERIFY_TOKEN`.
4. Pentru testare locală, folosește simularea:
   ```bash
   curl -X POST http://localhost:3000/api/leads/simulate-facebook \
     -H "Content-Type: application/json" \
     -d '{"full_name":"Test","phone":"0722123456","email":"test@test.com"}'
   ```

---

### 4.10 Notificările Push nu funcționează

**Cauză:** Cheile VAPID nu sunt configurate.

**Soluție:**
1. Generează cheile: `npx web-push generate-vapid-keys`.
2. Adaugă în `.env.local`:
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=cheie_publica
   VAPID_PRIVATE_KEY=cheie_privata
   ```
3. Repornește serverul.
4. În aplicație, apasă pe clopotul de notificări → activează notificările → testează cu butonul Test.

---

### 4.11 Eroare TypeScript la build (dar funcționează în dev)

**Cauză:** Next.js 16 este configurat cu `typescript.ignoreBuildErrors: true` în `next.config.mjs`, deci erorile TS nu blochează build-ul. Dar dacă apar erori la runtime:

**Soluție:**
1. Rulează `npx tsc --noEmit` pentru a vedea toate erorile TS.
2. Verifică dacă tipurile sunt la zi: `@types/react`, `@types/node`.
3. Dacă eroarea este pe un modul extern, adaugă în `tsconfig.json` → `skipLibCheck: true` (deja setat).

---

## 5. Structură Minimă pentru Funcționare

Variabilele de mediu **minim necesare** pentru a porni proiectul:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Schema DB **minim necesară** (tabele care trebuie să existe):
- `app_members` (cu cel puțin un rând de proprietar)
- `pipelines` (cel puțin un pipeline)
- `stages` (cel puțin o etapă per pipeline)
- `pipeline_items` (poate fi gol)
- `leads`, `service_files`, `trays`, `tray_items` (pot fi goale)
- `tags`, `lead_tags` (pot fi goale)
- `items_events`, `stage_history` (pot fi goale)

**Funcții RPC PostgreSQL** (necesare pentru operațiuni de business):
- `move_item_to_stage`
- `generate_factura_number`
- `start_work_session` / `finish_work_session`
- `search_unified`
- `get_expired_callback_leads` / `get_expired_nu_raspunde_leads`

Aceste funcții trebuie create în Supabase → SQL Editor. Consultă echipa pentru scripturile de migrare.

---

## 6. Acces de pe Telefon / Tabletă (Dezvoltare)

Aplicația este optimizată pentru mobil. Pentru a testa pe un telefon în aceeași rețea Wi-Fi:

1. Pornește serverul cu acces din rețea: `npm run dev` (folosește `-H 0.0.0.0` implicit).
2. Găsește IP-ul local: `npm run ip`.
3. Pe telefon, deschide: `http://IP_LOCAL:3000` (ex.: `http://192.168.1.50:3000`).
4. Dacă nu funcționează, adaugă IP-ul în `next.config.mjs` → `allowedDevOrigins`.

---

## 7. Deployment pe Vercel

1. Conectează repository-ul Git la Vercel.
2. Setează variabilele de mediu în Vercel → Settings → Environment Variables (toate din secțiunea 2.3).
3. Cron job-urile din `vercel.json` sunt activate automat:
   - `/api/cron/midnight-ro` – zilnic la 22:00 UTC
   - `/api/cron/curier-to-avem-comanda` – zilnic la 01:00 UTC
4. Cron job-urile adiționale (Colet Neridicat, Follow-up, Backup, Arhivare No Deal) trebuie configurate extern (ex.: cron-job.org sau Vercel Pro).
5. Configurează Webhook-ul Facebook cu URL-ul de producție: `https://DOMENIU/api/leads/facebook-webhook`.

---

*Ghid generat pe baza analizei codului sursă, configurărilor și dependențelor proiectului Ascutzit CRM.*
