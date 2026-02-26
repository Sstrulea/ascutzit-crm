# Observabilitate, Logging & Monitoring – Ascutzit CRM

---

## 1. Logging

### 1.1 Unde Sunt Scrise Log-urile

| Destinație | Mecanism | Acces |
| :--- | :--- | :--- |
| **Consola browser** (client) | `console.log/warn/error` din componentele React, hook-uri | DevTools → Console |
| **Vercel Function Logs** (server) | `console.log/warn/error` din rute API, middleware, strategii | Vercel Dashboard → Functions → Logs |
| **Supabase** (persistent) | Tabelul `items_events` (jurnal logică de business) | SQL / Supabase Table Editor |
| **Supabase** (persistent) | Tabelul `audit_log` (audit generic) | SQL / Supabase Table Editor |
| **POST /api/tracking** (parțial persistent) | Click-uri pe butoane + modificări de input (batch-uri de la client) | În dev: consolă; în prod: doar logging server-side |

**NU există**: fișiere log locale, Winston/Bunyan/Pino, servicii externe de agregare log-uri.

### 1.2 Volumul Log-urilor

~**800+ apeluri `console.log/warn/error`** identificate în 120+ fișiere:

| Tip | Număr Estimat | Zone Principale |
| :--- | :--- | :--- |
| `console.log` | ~500+ | Strategii Kanban, api-helpers (`[requireAuth]`, `[requireOwner]`), cron jobs, hook-uri de prețuri |
| `console.warn` | ~150+ | Fallback-uri RLS, coloane lipsă, tag-uri negative |
| `console.error` | ~150+ | Blocuri catch în rute API, hook-uri, operațiuni DB |

### 1.3 Niveluri de Log

**Nu există sistem de niveluri.** Toate log-urile folosesc `console.*` direct, fără filtrare:

- `console.log` = folosit atât pentru INFO cât și pentru DEBUG (amestecat)
- `console.warn` = avertismente non-critice + fallback-uri
- `console.error` = erori reale + log-uri de depanare

Singura diferențiere `dev` vs `prod` este manuală:
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[debug]', ...)
}
```
Aceasta apare în **~10 locuri** (layout, kanbanCache, tracking, fetchers). Restul de ~790 log-uri ajung și în producție.

### 1.4 Date Sensibile în Log-uri

| Fișier | Linie | Ce Este Logat | Risc |
| :--- | :--- | :--- | :--- |
| `lib/supabase/api-helpers.ts` | ~45 | `console.log('[requireAuth] Session:', { userId, email })` | **MEDIU** – email-ul utilizatorului apare în log-urile Vercel la fiecare cerere autentificată |
| `app/api/leads/facebook-webhook/route.ts` | ~29 | `console.log('[Facebook Webhook] Verification request:', { mode, token, challenge })` | **RIDICAT** – `FACEBOOK_VERIFY_TOKEN` apare în log-uri |
| `hooks/preturi/usePreturiSaveOperations.ts` | ~834 | `console.log('[DEBUG] saveAllAndLog - About to save:', { serviceFileIdToUse, trayDetails, detailsToSave })` | **SCĂZUT** – date de business (detalii fișă) în consola browser |
| `lib/supabase/api-helpers.ts` | ~63-74 | `console.log('[requireOwner] Membership data:', membership)` | **SCĂZUT** – rol și ID utilizator în log-urile server |

---

## 2. Urmărirea Erorilor

### 2.1 Servicii de Monitorizare Integrate

| Serviciu | Status | Detalii |
| :--- | :--- | :--- |
| **Sentry** | **NU EXISTĂ** | Nicio integrare. Comentariu în `apiErrorLog.ts`: "eventually integrate with Sentry" |
| **LogRocket** | **NU EXISTĂ** | - |
| **Datadog** | **NU EXISTĂ** | - |
| **New Relic** | **NU EXISTĂ** | - |
| **Vercel Analytics** | **ACTIV** | `<Analytics />` în `app/layout.tsx` – doar vizualizări pagini și web vitals, **nu erori** |
| **Urmărire Evenimente Custom** | **ACTIV** | `TrackingProvider` → `POST /api/tracking` – doar click-uri/modificări input, nu erori |

### 2.2 Gestionarea Erorilor Neașteptate

#### Client-side (React)

| Mecanism | Fișier | Comportament |
| :--- | :--- | :--- |
| **Next.js Error Boundary** | `app/error.tsx` | Captează erorile React necaptate. Afișează UI prietenos cu "Reîncarcă pagina" / "Încearcă din nou". Detecție specială: `ChunkLoadError` (cache învechit), `Failed to fetch` (rețea). Logare cu `console.error('App error:', error)`. |
| **Notificări toast** | Sonner (`toast.error(...)`, `toast({ variant: 'destructive' })`) | Fiecare handler de logică de business are try/catch cu toast de eroare. Utilizatorul vede mesajul dar eroarea nu este persistată. |
| **Reîncercare automată** | `lib/utils/networkRetry.ts` | `fetchWithRetry()` și `withRetry()` – 3 încercări cu backoff exponențial (1s, 2s, 4s) doar pentru erori de rețea. |
| **Reîmprospătare la vizibilitate** | `hooks/useKanbanData.ts` | La `visibilitychange` + `online` → invalidare cache și reîncărcare date. |

#### Server-side (Rute API)

| Mecanism | Fișier | Comportament |
| :--- | :--- | :--- |
| **logApiError()** | `lib/utils/apiErrorLog.ts` | Helper centralizat: `console.error(\`[API ${route}]\`, message, stack)`. Folosit în ~5 rute. |
| **Try/catch generic** | Fiecare rută API | Pattern: `try { ... } catch (e) { console.error('[route]', e); return NextResponse.json({ error }, { status: 500 }) }` |
| **Timeout middleware** | `middleware.ts` | `Promise.race([getSession(), setTimeout(3s)])` – dacă Supabase este lent, nu blochează. Eșecul este ignorat silențios (`.catch(() => {})`). |
| **Gestionare erori cron** | `app/api/cron/*` | Fiecare cron returnează `{ ok: false, error: '...' }` cu status 500. Logat cu `console.error`. Fără notificări la eșec. |

### 2.3 Ce Se Întâmplă Când Apare o Eroare 500?

```
┌─────────────────────────────────────────────────────────────────┐
│  EROARE 500 PE SERVER (Rută API)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Codul ajunge în blocul catch                                 │
│     └─ console.error('[route]', error.message, error.stack)      │
│     └─ Mesajul apare DOAR în Vercel Function Logs                │
│                                                                  │
│  2. API returnează JSON { error: '...' } cu status 500           │
│                                                                  │
│  3. Frontend-ul primește eroarea                                  │
│     └─ Hook/Componentă: catch(e) → toast.error(e.message)        │
│     └─ Utilizatorul vede toast roșu: "Eroare la [acțiune]"       │
│                                                                  │
│  4. CE NU SE ÎNTÂMPLĂ:                                           │
│     ✗ Nicio notificare trimisă echipei (Slack/email/SMS)         │
│     ✗ Nu este înregistrat în Sentry/Datadog                      │
│     ✗ Niciun incident automat creat                              │
│     ✗ Nicio reîncercare automată (excepție: fetchWithRetry)      │
│     ✗ Eroarea nu este persistată într-un tabel de audit          │
│     ✗ Niciun rollback dacă operația a eșuat parțial             │
│                                                                  │
│  5. CONSECINȚĂ:                                                  │
│     → Eroarea se pierde în log-urile Vercel (retenție: 1h free / │
│       24h Pro / 3 zile Enterprise)                               │
│     → Nimeni nu știe că a apărut o eroare decât dacă             │
│       utilizatorul raportează manual                              │
│     → Patternul se repetă fără a fi detectat                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Cazuri speciale de eroare 500:**

| Scenariu | Ce Se Întâmplă | Risc |
| :--- | :--- | :--- |
| **Facturarea eșuează la pasul 5/7** (arhivare) | Fișa este deja `status=facturata` și `is_locked=true`, dar arhivarea nu s-a completat. Stare inconsistentă. | **CRITIC** – fișă blocată fără factură |
| **Cron-ul midnight-ro eșuează la lead-ul #50 din 100** | Primele 49 sunt mutate, restul rămân. Stare parțială. | **RIDICAT** – inconsistență date |
| **Webhook-ul Facebook returnează 500** | Facebook reîncearcă (de mai multe ori). Lead-ul poate fi creat ca duplicat. | **RIDICAT** – leaduri duplicate |
| **Supabase Realtime se deconectează** | Status `CHANNEL_ERROR` logat în consolă. Datele devin învechite. | **MEDIU** – date învechite afișate |

---

## 3. Performanță

### 3.1 Ce Este Monitorizat

| Mecanism | Ce Măsoară | Unde |
| :--- | :--- | :--- |
| **Vercel Analytics** (`<Analytics />`) | Web Vitals (LCP, FID, CLS), vizualizări pagini | Vercel Dashboard → Analytics |
| **Script Monitor Performanță** (`scripts/performance-monitor.js`) | TTFB per rută (7 rute predefinite), praguri: TTFB <200ms, FCP <1500ms, LCP <2500ms | Rulat manual: `npm run perf` |
| **Contor Cereri Supabase** (`dev-request-counter.ts`) | Numărul de apeluri fetch către Supabase per încărcare pagină | Doar dev: `NEXT_PUBLIC_DEBUG_SUPABASE_REQUESTS=true`, citit în consolă |

### 3.2 Ce NU Este Monitorizat

| Metrică | Status | Impact |
| :--- | :--- | :--- |
| Timp de răspuns rute API | **NU** | Necunoscut dacă `/api/vanzari/factureaza` durează 200ms sau 10s |
| Utilizare memorie server | **NU** | Vercel serverless nu expune asta direct, dar scurgerile pot cauza cold starts |
| Rata de erori | **NU** | Necunoscut dacă 1% sau 10% din cereri eșuează |
| Durată cron jobs | **NU** | Un cron care durează >10s va fi oprit de Vercel fără avertisment |
| Timp query bază de date | **NU** | Supabase Dashboard are câteva metrici, dar nu corelate cu acțiunile CRM |
| Sănătate canal Realtime | **NU** | Deconectările WebSocket sunt logate doar în consolă (`CHANNEL_ERROR`) |
| Rata de hit/miss cache | **NU** | Cache-ul in-memory (TTL 60s) nu raportează rata de hit |

### 3.3 Optimizări Existente (dar Nemonitorizate)

| Optimizare | Implementare | Problemă |
| :--- | :--- | :--- |
| Cache in-memory Kanban | `kanbanCache.ts`, `receptieCache.ts`, etc. (TTL 60s) | Fără metrici hit/miss. Necunoscut dacă cache-ul ajută sau este invalidat prea des |
| Optimizare imagini | `next.config.mjs`: AVIF/WebP, cache 30 zile, patternuri remote Supabase | Fără monitorizare a dimensiunilor servite |
| Optimizare bundle | `experimental.optimizePackageImports` (lucide, radix, date-fns, recharts) | Fără analiză regulată a dimensiunii bundle-ului |
| `fetchWithRetry` | 3 încercări, backoff exponențial, doar erori de rețea | Fără logare reîncercări (necunoscut câte reîncercări apar) |

---

## 4. Recomandări (Prioritizate)

### Prioritatea 1: Integrare Sentry (Impact: CRITIC, Efort: 1 zi)

**De ce:** Singura modalitate de a ști că ceva este defect în producție fără ca un utilizator să raporteze.

**Acțiuni:**
1. `npm install @sentry/nextjs`
2. `npx @sentry/wizard@latest -i nextjs`
3. Configurează `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
4. Adaugă `SENTRY_DSN` în `.env.local` și Vercel
5. Elimină `console.error` redundante – Sentry le captează automat

**Beneficii:** Stack trace-uri complete, alertare automată, grupare erori, context utilizator (rol, pipeline), urmărire release-uri.

---

### Prioritatea 2: Logger Structurat cu Niveluri (Impact: RIDICAT, Efort: 2-3 zile)

**De ce:** ~800 `console.*` nestructurate sunt zgomot. Nu pot fi filtrate, agregate sau alertate.

**Acțiuni:**

Creează `lib/logger.ts`:
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MIN_LEVEL: LogLevel = process.env.NODE_ENV === 'production' ? 'warn' : 'debug'

export function createLogger(module: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return
    const entry = { timestamp: new Date().toISOString(), level, module, message, ...data }
    if (level === 'error') console.error(JSON.stringify(entry))
    else if (level === 'warn') console.warn(JSON.stringify(entry))
    else console.log(JSON.stringify(entry))
  }

  return {
    debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data),
    info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
  }
}
```

Apoi migrare progresivă:
```typescript
// Înainte:
console.log('[requireAuth] Session:', session ? { userId: session.user.id, email: session.user.email } : null)

// După:
const log = createLogger('auth')
log.debug('Session checked', { userId: session?.user?.id })  // fără email!
```

**Beneficii:** Log-uri structurate (JSON) parsabile de Vercel/Sentry, filtrare pe niveluri, eliminare date sensibile.

---

### Prioritatea 3: Eliminarea Logării Datelor Sensibile (Impact: RIDICAT, Efort: 1 oră)

**Acțiuni imediate:**

| Fișier | Acțiune |
| :--- | :--- |
| `api-helpers.ts:45` | Elimină `email` din `console.log('[requireAuth] Session:')` – păstrează doar `userId` |
| `api-helpers.ts:63-74` | Elimină `console.log('[requireOwner] Membership data:')` – logează doar `role` |
| `facebook-webhook/route.ts:29` | Elimină `token` din `console.log('Verification request:')` – logează doar `mode` |
| `usePreturiSaveOperations.ts:834,860,865` | Elimină console.log-urile `[DEBUG]` sau înconjoară cu `NODE_ENV === 'development'` |

---

### Prioritatea 4: Alertare la Eșec Cron Jobs (Impact: RIDICAT, Efort: 1 zi)

**De ce:** Cron-urile rulează silențios. Dacă eșuează, nimeni nu știe timp de zile.

**Acțiuni:**
1. La eșec cron → `sendPushToUser(ownerUserId, { title: 'Cron EȘUAT', body: 'midnight-ro: ...' })`
2. Sau integrare Vercel Cron monitoring (Vercel Pro) care alertează automat
3. Sau un endpoint `/api/health` care verifică "când a rulat ultima dată fiecare cron" și alertează dacă >2x interval

---

### Prioritatea 5: Monitorizare Timp de Răspuns API (Impact: MEDIU, Efort: 1 zi)

**Acțiuni:**

Creează un middleware simplu de cronometrare pentru rutele API:
```typescript
// lib/utils/apiTiming.ts
export function withTiming<T>(routeName: string, handler: () => Promise<T>): Promise<T> {
  const start = Date.now()
  return handler().finally(() => {
    const duration = Date.now() - start
    if (duration > 3000) {
      console.warn(`[SLOW API] ${routeName}: ${duration}ms`)
    }
  })
}
```

Sau integrare Vercel Speed Insights (`@vercel/speed-insights`) pentru metrici automate.

---

### Prioritatea 6: Dashboard Health-Check (Impact: MEDIU, Efort: 2-3 zile)

Creează endpoint `GET /api/health` care verifică:
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "latency_ms": 45 },
    "auth": { "status": "ok" },
    "realtime": { "status": "ok" },
    "storage": { "status": "ok" },
    "last_cron_midnight": { "status": "ok", "last_run": "2026-02-26T22:00:00Z" },
    "last_cron_curier": { "status": "warning", "last_run": "2026-02-25T01:00:00Z", "message": "Întârziat cu 24h" }
  },
  "timestamp": "2026-02-26T14:30:00Z"
}
```

Monitorizat extern (UptimeRobot, BetterUptime) cu alertare la `status !== "healthy"`.

---

## 5. Sumar Metrici Actuale

| Metrică | Valoare | Țintă Recomandată |
| :--- | :--- | :--- |
| Servicii de urmărire erori | **0** | 1 (Sentry) |
| Total console.log/warn/error | **~800** | <50 (structurate, relevante doar pentru producție) |
| Log-uri cu date sensibile | **4 instanțe** | 0 |
| Nivel de log configurabil | **Nu** | Da (debug/info/warn/error) |
| Alertare automată la eroare 500 | **Nu** | Da (Sentry + Slack/email) |
| Alertare la eșec cron | **Nu** | Da (notificare push + health check) |
| Monitorizare timp răspuns API | **Nu** | Da (>3s = avertisment) |
| Endpoint health check | **Nu** | Da (`/api/health`) |
| Logare reîncercări (câte reîncercări) | **Nu** | Da |
| Acoperire error boundary | **1** (`app/error.tsx`) | 1 per layout critic |

---

*Raport generat prin analiza codului sursă, dependențelor și patternurilor de gestionare a erorilor din proiectul Ascutzit CRM.*
