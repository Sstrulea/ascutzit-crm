# Observability, Logging & Monitoring – Ascutzit CRM

---

## 1. Logging

### 1.1 Where Logs Are Written

| Destination | Mechanism | Access |
| :--- | :--- | :--- |
| **Browser console** (client) | `console.log/warn/error` from React components, hooks | DevTools → Console |
| **Vercel Function Logs** (server) | `console.log/warn/error` from API routes, middleware, strategies | Vercel Dashboard → Functions → Logs |
| **Supabase** (persistent) | `items_events` table (business logic journal) | SQL / Supabase Table Editor |
| **Supabase** (persistent) | `audit_log` table (generic audit) | SQL / Supabase Table Editor |
| **POST /api/tracking** (partially persistent) | Button clicks + input changes (batches from client) | In dev: console; in prod: server-side logging only |

**Does NOT exist**: local log files, Winston/Bunyan/Pino, external log aggregation services.

### 1.2 Log Volume

~**800+ `console.log/warn/error` calls** identified across 120+ files:

| Type | Estimated Count | Main Areas |
| :--- | :--- | :--- |
| `console.log` | ~500+ | Kanban strategies, api-helpers (`[requireAuth]`, `[requireOwner]`), cron jobs, pricing hooks |
| `console.warn` | ~150+ | RLS fallbacks, missing columns, negative tags |
| `console.error` | ~150+ | Catch blocks in API routes, hooks, DB operations |

### 1.3 Log Levels

**No level system exists.** All logs use `console.*` directly, without filtering:

- `console.log` = used for both INFO and DEBUG (mixed)
- `console.warn` = non-critical warnings + fallbacks
- `console.error` = real errors + debugging logs

The only `dev` vs `prod` differentiation is manual:
```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('[debug]', ...)
}
```
This appears in **~10 places** (layout, kanbanCache, tracking, fetchers). The remaining ~790 logs also reach production.

### 1.4 Sensitive Data Being Logged

| File | Line | What Is Logged | Risk |
| :--- | :--- | :--- | :--- |
| `lib/supabase/api-helpers.ts` | ~45 | `console.log('[requireAuth] Session:', { userId, email })` | **MEDIUM** – user email appears in Vercel logs on every authenticated request |
| `app/api/leads/facebook-webhook/route.ts` | ~29 | `console.log('[Facebook Webhook] Verification request:', { mode, token, challenge })` | **HIGH** – `FACEBOOK_VERIFY_TOKEN` appears in logs |
| `hooks/preturi/usePreturiSaveOperations.ts` | ~834 | `console.log('[DEBUG] saveAllAndLog - About to save:', { serviceFileIdToUse, trayDetails, detailsToSave })` | **LOW** – business data (file details) in browser console |
| `lib/supabase/api-helpers.ts` | ~63-74 | `console.log('[requireOwner] Membership data:', membership)` | **LOW** – role and user ID in server logs |

---

## 2. Error Tracking

### 2.1 Integrated Monitoring Services

| Service | Status | Details |
| :--- | :--- | :--- |
| **Sentry** | **DOES NOT EXIST** | No integration. Comment in `apiErrorLog.ts`: "eventually integrate with Sentry" |
| **LogRocket** | **DOES NOT EXIST** | - |
| **Datadog** | **DOES NOT EXIST** | - |
| **New Relic** | **DOES NOT EXIST** | - |
| **Vercel Analytics** | **ACTIVE** | `<Analytics />` in `app/layout.tsx` – page views and web vitals only, **not errors** |
| **Custom Event Tracking** | **ACTIVE** | `TrackingProvider` → `POST /api/tracking` – clicks/input changes only, not errors |

### 2.2 Unexpected Error Handling

#### Client-side (React)

| Mechanism | File | Behavior |
| :--- | :--- | :--- |
| **Next.js Error Boundary** | `app/error.tsx` | Catches uncaught React errors. Shows friendly UI with "Reload page" / "Try again". Special detection: `ChunkLoadError` (stale cache), `Failed to fetch` (network). Logs with `console.error('App error:', error)`. |
| **Toast notifications** | Sonner (`toast.error(...)`, `toast({ variant: 'destructive' })`) | Every business logic handler has try/catch with error toast. User sees the message but the error is not persisted. |
| **Auto-retry** | `lib/utils/networkRetry.ts` | `fetchWithRetry()` and `withRetry()` – 3 attempts with exponential backoff (1s, 2s, 4s) for network errors only. |
| **Visibility refresh** | `hooks/useKanbanData.ts` | On `visibilitychange` + `online` → cache invalidation and data reload. |

#### Server-side (API Routes)

| Mechanism | File | Behavior |
| :--- | :--- | :--- |
| **logApiError()** | `lib/utils/apiErrorLog.ts` | Centralized helper: `console.error(\`[API ${route}]\`, message, stack)`. Used in ~5 routes. |
| **Generic try/catch** | Every API route | Pattern: `try { ... } catch (e) { console.error('[route]', e); return NextResponse.json({ error }, { status: 500 }) }` |
| **Middleware timeout** | `middleware.ts` | `Promise.race([getSession(), setTimeout(3s)])` – if Supabase is slow, doesn't block. Failure is silently ignored (`.catch(() => {})`). |
| **Cron error handling** | `app/api/cron/*` | Each cron returns `{ ok: false, error: '...' }` with status 500. Logged with `console.error`. No failure notifications. |

### 2.3 What Happens When a 500 Error Occurs?

```
┌─────────────────────────────────────────────────────────────────┐
│  500 ERROR ON SERVER (API Route)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Code reaches catch block                                     │
│     └─ console.error('[route]', error.message, error.stack)      │
│     └─ Message appears ONLY in Vercel Function Logs              │
│                                                                  │
│  2. API returns JSON { error: '...' } with status 500            │
│                                                                  │
│  3. Frontend receives the error                                  │
│     └─ Hook/Component: catch(e) → toast.error(e.message)         │
│     └─ User sees red toast: "Error at [action]"                  │
│                                                                  │
│  4. WHAT DOES NOT HAPPEN:                                        │
│     ✗ No notification sent to team (Slack/email/SMS)             │
│     ✗ Not recorded in Sentry/Datadog                             │
│     ✗ No automatic incident created                              │
│     ✗ No automatic retry (exception: fetchWithRetry)             │
│     ✗ Error not persisted to an audit table                      │
│     ✗ No rollback if the operation partially failed              │
│                                                                  │
│  5. CONSEQUENCE:                                                 │
│     → Error is lost in Vercel logs (retention: 1h free /         │
│       24h Pro / 3 days Enterprise)                               │
│     → Nobody knows an error occurred unless the user             │
│       reports it manually                                        │
│     → The pattern repeats without being detected                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Special 500 error cases:**

| Scenario | What Happens | Risk |
| :--- | :--- | :--- |
| **Invoicing fails at step 5/7** (archiving) | File is already `status=facturata` and `is_locked=true`, but archiving didn't complete. Inconsistent state. | **CRITICAL** – locked file without invoice |
| **Cron midnight-ro fails at lead #50 of 100** | First 49 are moved, rest remain. Partial state. | **HIGH** – data inconsistency |
| **Facebook Webhook returns 500** | Facebook retries (multiple times). Lead may be created as duplicate. | **HIGH** – duplicate leads |
| **Supabase Realtime disconnects** | `CHANNEL_ERROR` status logged in console. Data becomes stale. | **MEDIUM** – stale data displayed |

---

## 3. Performance

### 3.1 What Is Monitored

| Mechanism | What It Measures | Where |
| :--- | :--- | :--- |
| **Vercel Analytics** (`<Analytics />`) | Web Vitals (LCP, FID, CLS), page views | Vercel Dashboard → Analytics |
| **Performance Monitor Script** (`scripts/performance-monitor.js`) | TTFB per route (7 predefined routes), thresholds: TTFB <200ms, FCP <1500ms, LCP <2500ms | Run manually: `npm run perf` |
| **Supabase Request Counter** (`dev-request-counter.ts`) | Number of fetch calls to Supabase per page load | Dev only: `NEXT_PUBLIC_DEBUG_SUPABASE_REQUESTS=true`, read in console |

### 3.2 What Is NOT Monitored

| Metric | Status | Impact |
| :--- | :--- | :--- |
| API route response times | **NO** | Unknown if `/api/vanzari/factureaza` takes 200ms or 10s |
| Server memory usage | **NO** | Vercel serverless doesn't expose this directly, but leaks can cause cold starts |
| Error rate | **NO** | Unknown if 1% or 10% of requests fail |
| Cron job duration | **NO** | A cron lasting >10s will be killed by Vercel without warning |
| Database query time | **NO** | Supabase Dashboard has some metrics, but not correlated with CRM actions |
| Realtime channel health | **NO** | WebSocket disconnections logged only in console (`CHANNEL_ERROR`) |
| Cache hit/miss ratio | **NO** | The in-memory cache (TTL 60s) doesn't report hit rate |

### 3.3 Existing Optimizations (but unmonitored)

| Optimization | Implementation | Issue |
| :--- | :--- | :--- |
| In-memory Kanban cache | `kanbanCache.ts`, `receptieCache.ts`, etc. (TTL 60s) | No hit/miss metrics. Unknown if cache helps or gets invalidated too often |
| Image optimization | `next.config.mjs`: AVIF/WebP, 30-day cache, Supabase remote patterns | No monitoring of served sizes |
| Bundle optimization | `experimental.optimizePackageImports` (lucide, radix, date-fns, recharts) | No regular bundle size analysis |
| `fetchWithRetry` | 3 attempts, exponential backoff, network errors only | No retry logging (unknown how many retries occur) |

---

## 4. Recommendations (Prioritized)

### Priority 1: Sentry Integration (Impact: CRITICAL, Effort: 1 day)

**Why:** The only way to know something is broken in production without a user reporting it.

**Actions:**
1. `npm install @sentry/nextjs`
2. `npx @sentry/wizard@latest -i nextjs`
3. Configure `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
4. Add `SENTRY_DSN` to `.env.local` and Vercel
5. Remove redundant `console.error` – Sentry captures them automatically

**Benefits:** Complete stack traces, automatic alerting, error grouping, user context (role, pipeline), release tracking.

---

### Priority 2: Structured Logger with Levels (Impact: HIGH, Effort: 2-3 days)

**Why:** ~800 unstructured `console.*` are noise. They can't be filtered, aggregated, or alerted on.

**Actions:**

Create `lib/logger.ts`:
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

Then progressive migration:
```typescript
// Before:
console.log('[requireAuth] Session:', session ? { userId: session.user.id, email: session.user.email } : null)

// After:
const log = createLogger('auth')
log.debug('Session checked', { userId: session?.user?.id })  // no email!
```

**Benefits:** Structured (JSON) logs parseable by Vercel/Sentry, level filtering, sensitive data elimination.

---

### Priority 3: Remove Sensitive Data Logging (Impact: HIGH, Effort: 1 hour)

**Immediate actions:**

| File | Action |
| :--- | :--- |
| `api-helpers.ts:45` | Remove `email` from `console.log('[requireAuth] Session:')` – keep only `userId` |
| `api-helpers.ts:63-74` | Remove `console.log('[requireOwner] Membership data:')` – log only `role` |
| `facebook-webhook/route.ts:29` | Remove `token` from `console.log('Verification request:')` – log only `mode` |
| `usePreturiSaveOperations.ts:834,860,865` | Remove `[DEBUG]` console.logs or wrap with `NODE_ENV === 'development'` |

---

### Priority 4: Cron Job Failure Alerting (Impact: HIGH, Effort: 1 day)

**Why:** Crons run silently. If they fail, nobody knows for days.

**Actions:**
1. On cron failure → `sendPushToUser(ownerUserId, { title: 'Cron FAILED', body: 'midnight-ro: ...' })`
2. Or integrate Vercel Cron monitoring (Vercel Pro) which alerts automatically
3. Or a `/api/health` endpoint that checks "when did each cron last run" and alerts if >2x interval

---

### Priority 5: API Response Time Monitoring (Impact: MEDIUM, Effort: 1 day)

**Actions:**

Create a simple timing middleware for API routes:
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

Or integrate Vercel Speed Insights (`@vercel/speed-insights`) for automatic metrics.

---

### Priority 6: Health-Check Dashboard (Impact: MEDIUM, Effort: 2-3 days)

Create endpoint `GET /api/health` that checks:
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "latency_ms": 45 },
    "auth": { "status": "ok" },
    "realtime": { "status": "ok" },
    "storage": { "status": "ok" },
    "last_cron_midnight": { "status": "ok", "last_run": "2026-02-26T22:00:00Z" },
    "last_cron_curier": { "status": "warning", "last_run": "2026-02-25T01:00:00Z", "message": "Overdue by 24h" }
  },
  "timestamp": "2026-02-26T14:30:00Z"
}
```

Monitored externally (UptimeRobot, BetterUptime) with alerting on `status !== "healthy"`.

---

## 5. Current Metrics Summary

| Metric | Value | Recommended Target |
| :--- | :--- | :--- |
| Error tracking services | **0** | 1 (Sentry) |
| Total console.log/warn/error | **~800** | <50 (structured, production-relevant only) |
| Logs with sensitive data | **4 instances** | 0 |
| Configurable log level | **No** | Yes (debug/info/warn/error) |
| Automatic alerting on 500 error | **No** | Yes (Sentry + Slack/email) |
| Alerting on cron failure | **No** | Yes (push notification + health check) |
| API response time monitoring | **No** | Yes (>3s = warning) |
| Health check endpoint | **No** | Yes (`/api/health`) |
| Retry logging (how many retries) | **No** | Yes |
| Error boundary coverage | **1** (`app/error.tsx`) | 1 per critical layout |

---

*Report generated through source code analysis, dependencies, and error handling patterns of the Ascutzit CRM project.*
