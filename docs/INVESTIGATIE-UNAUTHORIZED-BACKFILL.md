# Investigatie: Unauthorized la „Backfill comenzi” și rute API

## Scop

Identificarea cauzelor pentru care utilizatorul primește **Unauthorized** (401) la apăsarea butonului **Backfill comenzi** pe pagina Statistici apeluri și recomandări pentru reducerea erorilor.

---

## 1. Fluxul „Backfill comenzi”

1. **UI:** Pagina `app/(crm)/dashboard/statistici-apeluri/page.tsx` – butonul este afișat doar dacă `profile?.role === 'owner'`.
2. **Click:** `handleBackfill()` face `fetch('/api/owner/backfill-vanzari-apeluri', { method: 'POST' })`.
3. **API:** `app/api/owner/backfill-vanzari-apeluri/route.ts`:
   - Citește cookie-urile: `const cookieStore = await cookies()`
   - Creează client: `createRouteHandlerClient({ cookies: () => cookieStore })`
   - Verifică user: `supabase.auth.getUser()` → dacă `authErr || !user` → **401 Unauthorized**
   - Verifică rol: `app_members.role === 'owner'` → dacă nu → **403 Forbidden**

Deci **Unauthorized** apare **doar** când `getUser()` eșuează sau returnează `user: null` (sesiune invalidă/lipsă pe server).

---

## 2. Cauze posibile pentru 401

### 2.1 Sesiunea nu ajunge pe server (cookie-uri)

- **Middleware-ul nu rulează pentru `/api/*`** (`middleware.ts` exclude explicit rutele care încep cu `/api/`). Deci la request-uri către API **nu** se face refresh de sesiune în middleware; API-ul citește direct cookie-urile din request.
- Dacă cookie-urile de auth **nu sunt trimise** (ex: domeniu diferit, `SameSite`, `fetch` fără `credentials`), serverul nu vede niciun user → 401.
- În cod, `fetch`-urile către `/api/owner/backfill-vanzari-apeluri` și `/api/owner/atribuie-apel-manual` **nu** setează explicit `credentials: 'include'`. Pentru **same-origin** browserul trimite cookie-urile by default; pentru orice scenariu cross-origin (ex: front pe alt domeniu) trebuie `credentials: 'include'`.

### 2.2 Sesiune expirată / JWT invalid

- `getUser()` validează JWT-ul cu Supabase Auth. Dacă:
  - JWT-ul a expirat și refresh-ul a eșuat,
  - sau cookie-ul a fost șters / invalidat (ex: logout în alt tab),
  atunci `getUser()` poate returna eroare sau `user: null` → 401.

### 2.3 Inconsistență între client și server

- **Client (AuthContext):** folosește `supabase.auth.getUser()` și `app_members` → afișează butonul „Backfill comenzi” dacă `profile?.role === 'owner'`.
- **Server (API):** citește din cookie-uri și face din nou `getUser()` + `app_members`.
- Este posibil ca pe client să ai user + owner (ex: din cache / memorie), iar pe server cookie-ul să fie lipsă/expirată → butonul este vizibil, dar la click primești 401.

### 2.4 Next.js 15 + `cookies()` async

- În Next.js 15, `cookies()` din `next/headers` este **async** și trebuie apelat cu `await`.
- Ruta **backfill** folosește deja pattern-ul corect: `const cookieStore = await cookies()` și `createRouteHandlerClient({ cookies: () => cookieStore })`.
- În proiect există și rute care folosesc **direct** `createRouteHandlerClient({ cookies })` (fără `await cookies()`). Pe versiuni unde `cookies` e async, acest pattern poate citi un Promise în loc de store și poate duce la „session missing” / 401 pe unele request-uri. Rute identificate:
  - `app/api/vanzari/statistics/route.ts`
  - `app/api/vanzari/factureaza/route.ts`
  - `app/api/vanzari/anuleaza-factura/route.ts`
  - `app/api/technician-stats/route.ts` (3 apeluri)
  - `app/api/cron/vanzari-followup-reminder/route.ts`
  - `app/api/cron/vanzari-archive-no-deal/route.ts`
  - `app/api/cron/vanzari-colet-neridicat/route.ts`

---

## 3. Ce am verificat în cod

| Verificare | Rezultat |
|------------|----------|
| Backfill folosește `await cookies()` + `cookies: () => cookieStore` | Da – pattern corect |
| Fetch cu `credentials` | Nu e setat explicit (ok pentru same-origin) |
| Middleware pentru `/api` | Nu – API-urile nu beneficiază de refresh-ul de sesiune din middleware |
| Mesaj la 401 | `error: 'Unauthorized'` – afișat în toast ca „Unauthorized” |

---

## 4. Recomandări

### 4.1 Imediat (pentru Backfill și alte rute owner)

1. **Trimitere explicită de cookie-uri:** la toate `fetch`-urile către API-uri protejate (inclusiv Backfill și Atribuie apel manual) adaugă `credentials: 'include'`:
   ```ts
   fetch('/api/owner/backfill-vanzari-apeluri', { method: 'POST', credentials: 'include' })
   ```
2. **Mesaj clar în UI:** când `res.status === 401`, afișează un mesaj de tip „Sesiune expirată. Te rugăm să te reconectezi.” și eventual redirect la login, nu doar „Unauthorized”.

### 4.2 Pe termen scurt (toate rutele API cu auth)

3. **Unificare citire cookie-uri:** toate rutele care folosesc `createRouteHandlerClient({ cookies })` (fără `await cookies()`) să treacă la:
   ```ts
   const cookieStore = await cookies()
   const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
   ```
   pentru a evita probleme cu `cookies()` async în Next 15.

### 4.3 Pe termen mediu (documentat și în CODE-REVIEW)

4. **Migrare la `@supabase/ssr`:** pachetul `@supabase/auth-helpers-nextjs` este depreciat; Supabase recomandă `@supabase/ssr` și `createServerClient` cu `getAll`/`setAll` pentru cookie-uri. Migrarea reduce riscul de „Auth session missing” și 401 în API-uri.

---

## 5. Rezumat

- **Unauthorized** la Backfill vine din faptul că, în momentul request-ului, **pe server nu există user valid** (cookie lipsă/nes trimis, JWT expirat sau invalid).
- Backfill folosește deja pattern-ul corect pentru `cookies()` async; problema este cel mai probabil **sesiune expirată** sau **cookie-uri netrimise** în anumite condiții.
- Recomandări practice: `credentials: 'include'` la fetch, mesaj clar la 401, unificare `await cookies()` în toate rutele API, iar pe termen mediu migrare la `@supabase/ssr`.
