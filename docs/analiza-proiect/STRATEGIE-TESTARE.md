# Strategie de Testare – Ascutzit CRM

---

## 1. Starea Actuală a Testelor

### 1.1 Rezultatele Auditului

| Criteriu | Rezultat |
| :--- | :--- |
| Fișiere `*.test.ts` / `*.test.tsx` | **0 găsite** |
| Fișiere `*.spec.ts` / `*.spec.tsx` | **0 găsite** |
| Directoare `__tests__/` | **0 găsite** |
| Configurare Jest / Vitest / Playwright / Cypress | **0 găsite** |
| Dependențe de test (`jest`, `vitest`, `@testing-library`, `cypress`, `playwright`) în `package.json` | **0 găsite** |
| Script `test` în `package.json` | **Nu există** |
| Acoperire estimată | **0%** |

### 1.2 Concluzie

**Proiectul nu are teste automate.** Nu există niciun framework de testare instalat, nicio configurare și niciun fișier de test. Toată testarea se face manual de către echipă prin utilizarea aplicației.

Aceasta este o **vulnerabilitate critică**: orice modificare a logicii de business (calcul prețuri, facturare, tranziții de etape, cron jobs) poate introduce bug-uri nedetectate care ajung direct în producție.

---

## 2. Puncte Critice de Testat (Top 10)

### Prioritatea 1 (CRITIC – Bani, date, integritate)

#### 2.1 Calcul Prețuri (`lib/vanzari/priceCalculator.ts`)

**De ce este critic:** Calculează totalurile facturilor. O eroare = facturi incorecte, pierdere financiară.

**Funcții de testat:** `calculateItemTotal()`, `calculateTrayTotal()`, `calculateServiceFileTotal()`

**Scenarii Given-When-Then:**

```
Scenariul 1: Calcul articol simplu
  DAT un tray_item cu service.price=100, qty=2, discount_pct=0, urgent=false
  CÂND apelez calculateItemTotal(item, false)
  ATUNCI unitPrice=100, subtotal=200, itemDiscount=0, urgentDiscount=0, itemTotal=200

Scenariul 2: Calcul articol cu discount
  DAT un tray_item cu service.price=100, qty=3, discount_pct=10
  CÂND apelez calculateItemTotal(item, false)
  ATUNCI subtotal=300, itemDiscount=30, itemTotal=270

Scenariul 3: Calcul articol urgent
  DAT un tray_item cu service.price=100, qty=1, urgent=true în note
  CÂND apelez calculateItemTotal(item, true)  // serviceFileUrgent=true
  ATUNCI subtotal=100, urgentDiscount=10 (10%), itemTotal=90

Scenariul 4: Calcul articol fără preț (service/piesa/instrument null)
  DAT un tray_item fără service, piesă sau instrument
  CÂND apelez calculateItemTotal(item, false)
  ATUNCI unitPrice=0, subtotal=0, itemTotal=0

Scenariul 5: Calcul tăviță completă
  DAT o tăviță cu 3 articole: [100 lei, 200 lei, 50 lei], service_file.urgent=false
  CÂND apelez calculateTrayTotal(tray)
  ATUNCI trayTotal=350, items.length=3

Scenariul 6: Calcul fișă de serviciu cu discount global
  DAT o fișă de serviciu cu 2 tăvițe (total 1000 lei), discountGlobal=15%
  CÂND apelez calculateServiceFileTotal(serviceFileId)
  ATUNCI totalTrays=1000, globalDiscount=150, finalTotal=850
```

---

#### 2.2 Procesul de Facturare (`lib/vanzari/facturare.ts`)

**De ce este critic:** Proces atomic cu 7 pași: validare → calcul → generare număr → actualizare → arhivare → curățare → jurnalizare. Orice eșec parțial = date inconsistente.

**Funcții de testat:** `factureazaServiceFile()`, `validateForFacturare()`, `anuleazaFactura()`

```
Scenariul 1: Facturare cu succes
  DAT o fișă de serviciu cu status != 'facturata', is_locked=false, cu tăvițe
  CÂND apelez factureazaServiceFile(sfId, { metodaPlata: 'cash' }, userId)
  ATUNCI result.success=true
    ȘI service_file.status='facturata'
    ȘI service_file.is_locked=true
    ȘI facturaNumber este setat (format F-YYYY-NNNN)
    ȘI items_events există cu event_type='factura_emisa'
    ȘI pipeline_items pentru tăvițe sunt șterse

Scenariul 2: Facturare pe o fișă deja facturată
  DAT o fișă de serviciu cu status='facturata'
  CÂND apelez factureazaServiceFile(sfId, data, userId)
  ATUNCI result.success=false
    ȘI result.validationErrors conține 'deja facturată'

Scenariul 3: Facturare pe o fișă fără tăvițe
  DAT o fișă de serviciu fără tăvițe
  CÂND apelez validateForFacturare(sfId)
  ATUNCI result.valid=false

Scenariul 4: Anulare factură fără motiv
  DAT o fișă de serviciu facturată
  CÂND apelez anuleazaFactura(sfId, '', userId)
  ATUNCI result.success=false (motivul este obligatoriu)

Scenariul 5: Anulare factură cu motiv
  DAT o fișă de serviciu facturată, is_locked=true
  CÂND apelez anuleazaFactura(sfId, 'Eroare de preț', userId)
  ATUNCI result.success=true
    ȘI service_file.is_locked=false
    ȘI service_file.status revine la starea anterioară
```

---

#### 2.3 Clasificare Lead-uri Facebook (`lib/facebook-lead-helpers.ts`)

**De ce este critic:** Determină dacă lead-ul ajunge în Leaduri sau Leaduri Străine. Clasificare greșită = lead pierdut.

**Funcții de testat:** `isForeignPhone()`, `fieldValuesToDetailsText()`, `buildLeadDetailsFromFieldData()`

```
Scenariul 1: Număr românesc cu prefix +40
  DAT phone = '+40722123456'
  CÂND apelez isForeignPhone(phone)
  ATUNCI result = false (este românesc)

Scenariul 2: Număr românesc cu prefix 0
  DAT phone = '0722123456'
  CÂND apelez isForeignPhone(phone)
  ATUNCI result = false

Scenariul 3: Număr românesc cu prefix 40 (fără +)
  DAT phone = '40722123456'
  CÂND apelez isForeignPhone(phone)
  ATUNCI result = false

Scenariul 4: Număr străin (german)
  DAT phone = '+49170123456'
  CÂND apelez isForeignPhone(phone)
  ATUNCI result = true (este străin)

Scenariul 5: Număr null / undefined / gol
  DAT phone = null
  CÂND apelez isForeignPhone(phone)
  ATUNCI result = false (nu este considerat străin)

Scenariul 6: Număr cu spații
  DAT phone = '+40 722 123 456'
  CÂND apelez isForeignPhone(phone)
  ATUNCI result = false (spațiile sunt eliminate)

Scenariul 7: Parsare field_data de la Facebook
  DAT field_data = [{ name: 'full_name', values: ['Ion Popescu'] }, { name: 'phone_number', values: ['+40722000000'] }]
  CÂND apelez buildLeadDetailsFromFieldData(field_data)
  ATUNCI rezultatul conține textul combinat al detaliilor
```

---

### Prioritatea 2 (RIDICAT – Logică de business, Kanban)

#### 2.4 Potrivire Patternuri Etape (`lib/supabase/kanban/constants.ts`)

**De ce este critic:** Orice modificare a STAGE_PATTERNS afectează întreaga aplicație. Dacă un pattern nu mai corespunde, cardurile dispar sau apar în etapa greșită.

**Funcții de testat:** `matchesStagePattern()`, `findStageByPattern()`, `isLivrariOrCurierAjunsAziStage()`, `normStageName()`

```
Scenariul 1: Potrivire pe "In lucru" cu variante
  DAT stageName = 'In Lucru'
  CÂND apelez matchesStagePattern(stageName, 'IN_LUCRU')
  ATUNCI result = true

Scenariul 2: Potrivire pe "În lucru" (cu diacritice)
  DAT stageName = 'În lucru'
  CÂND apelez matchesStagePattern(stageName, 'IN_LUCRU')
  ATUNCI result = true

Scenariul 3: Non-potrivire
  DAT stageName = 'De facturat'
  CÂND apelez matchesStagePattern(stageName, 'IN_LUCRU')
  ATUNCI result = false

Scenariul 4: findStageByPattern găsește etapa corectă
  DAT stages = [{ id: '1', name: 'Noua' }, { id: '2', name: 'In Lucru' }, { id: '3', name: 'Finalizata' }]
  CÂND apelez findStageByPattern(stages, 'FINALIZARE')
  ATUNCI result = { id: '3', name: 'Finalizata' }

Scenariul 5: Livrari / Curier Ajuns Azi – echivalență
  DAT stageName = 'Curier Ajuns Azi'
  CÂND apelez isLivrariOrCurierAjunsAziStage(stageName)
  ATUNCI result = true

  DAT stageName = 'Livrari'
  CÂND apelez isLivrariOrCurierAjunsAziStage(stageName)
  ATUNCI result = true

  DAT stageName = 'Colet Ajuns'
  CÂND apelez isLivrariOrCurierAjunsAziStage(stageName)
  ATUNCI result = false
```

---

#### 2.5 Expirare Callback-uri (`lib/supabase/expireCallbacks.ts`)

**De ce este critic:** Rulează la accesare la fiecare încărcare Vânzări. Eșec silențios = leaduri blocate permanent în Call Back / Nu Răspunde.

```
Scenariul 1: Lead cu callback expirat → mutat în Leaduri
  DAT un lead în etapa "Call Back" cu callback_date = acum - 1 oră
  CÂND expireCallbacks() rulează
  ATUNCI lead-ul este mutat în etapa "Leaduri"
    ȘI tag-ul "Follow Up" este adăugat
    ȘI tag-ul "Sună!" este adăugat

Scenariul 2: Lead cu callback neexpirat → rămâne în Call Back
  DAT un lead în etapa "Call Back" cu callback_date = mâine
  CÂND expireCallbacks() rulează
  ATUNCI lead-ul rămâne în "Call Back"

Scenariul 3: Lead cu nu_raspunde expirat → mutat
  DAT un lead cu nu_raspunde_callback_at = acum - 30 min
  CÂND expireCallbacks() rulează
  ATUNCI lead-ul este mutat în "Leaduri"
```

---

### Prioritatea 3 (MEDIU – Cron jobs, operații în masă)

#### 2.6 Cron: No Deal → Arhivat (`app/api/cron/midnight-ro/route.ts`)

```
Scenariul 1: Lead în No Deal de 25h → mutat în Arhivat
  DAT un lead în etapa "No Deal" cu entered_stage_at = acum - 25h
  CÂND cron-ul midnight-ro rulează
  ATUNCI lead-ul este mutat în "Arhivat" ȘI no_deal=true ȘI items_events jurnalizat

Scenariul 2: Lead în No Deal de 12h → rămâne
  DAT un lead în etapa "No Deal" cu entered_stage_at = acum - 12h
  CÂND cron-ul midnight-ro rulează
  ATUNCI lead-ul rămâne în "No Deal"

Scenariul 3: Cron fără CRON_SECRET → 401
  DAT cerere fără header Authorization
  CÂND GET /api/cron/midnight-ro este apelat
  ATUNCI răspunsul are status = 401
```

#### 2.7 Creare Fișă de Serviciu (`lib/vanzari/leadOperations.ts`)

```
Scenariul 1: setLeadCurierTrimis creează fișă de serviciu + mută în Recepție
  DAT un lead valid cu leadId
  CÂND apelez setLeadCurierTrimis(leadId, scheduledDate)
  ATUNCI o service_file este creată cu curier_trimis=true
    ȘI pipeline_items conține fișa de serviciu în Recepție "Curier Trimis"
    ȘI lead-ul are tag-ul "Curier Trimis"

Scenariul 2: setLeadNoDeal șterge toate flag-urile
  DAT un lead cu call_back=true, callback_date setat, tag-uri
  CÂND apelez setLeadNoDeal(leadId)
  ATUNCI lead.no_deal=true
    ȘI lead.call_back=false
    ȘI lead.callback_date=null
    ȘI lead.nu_raspunde=false
    ȘI lead_tags este gol
```

#### 2.8 Autorizare Rute API (`lib/supabase/api-helpers.ts`)

```
Scenariul 1: requireAuth cu sesiune validă
  DAT o cerere cu cookie-uri de sesiune Supabase valide
  CÂND requireAuth() este apelat
  ATUNCI returnează { user, supabase }

Scenariul 2: requireAuth fără sesiune
  DAT o cerere fără cookie-uri
  CÂND requireAuth() este apelat
  ATUNCI aruncă 401 Unauthorized

Scenariul 3: requireOwner cu rol de proprietar
  DAT un utilizator autentificat cu role='owner' în app_members
  CÂND requireOwner() este apelat
  ATUNCI returnează { user, admin }

Scenariul 4: requireOwner cu rol de membru
  DAT un utilizator autentificat cu role='member'
  CÂND requireOwner() este apelat
  ATUNCI aruncă 403 Forbidden
```

#### 2.9 Sesiuni de Lucru (`lib/supabase/workSessionOperations.ts`)

```
Scenariul 1: Începere sesiune – prima dată
  DAT o tăviță fără sesiune activă
  CÂND apelez startWorkSession(trayId, techId)
  ATUNCI o sesiune este creată cu started_at=acum, finished_at=null

Scenariul 2: Începere sesiune – deja activă (idempotent)
  DAT o tăviță cu o sesiune activă (finished_at=null)
  CÂND apelez startWorkSession(trayId, techId)
  ATUNCI returnează ID-ul sesiunii existente, nu creează una nouă

Scenariul 3: Finalizare sesiune
  DAT o tăviță cu o sesiune activă
  CÂND apelez finishWorkSession(trayId, techId)
  ATUNCI sesiunea are finished_at=acum
```

#### 2.10 Căutare Unificată (`lib/supabase/unifiedSearchServer.ts`)

```
Scenariul 1: Căutare cu query valid (≥2 caractere)
  DAT query = "Ion"
  CÂND searchUnifiedWithClient(supabase, "Ion") este apelat
  ATUNCI returnează array cu rezultate (leaduri, fișe de serviciu, tăvițe)

Scenariul 2: Căutare cu query prea scurt
  DAT query = "I"
  CÂND GET /api/search/unified?q=I este apelat
  ATUNCI response.data = [], mesajul conține "minim 2 caractere"
```

---

## 3. Configurare Teste – Propunere

### 3.1 Framework Recomandat

| Tip test | Framework | Motiv |
| :--- | :--- | :--- |
| **Unitar** (funcții pure) | **Vitest** | Rapid, suport nativ ESM/TypeScript, compatibil cu ecosistemul Vite/Next.js |
| **Integrare** (rute API) | **Vitest** + `next/test` sau `supertest` | Testarea handler-elor de rute fără server |
| **E2E** (fluxuri utilizator) | **Playwright** | Cross-browser, robust, suport nativ Next.js |

### 3.2 Instalare

```bash
# Unitar + Integrare
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom

# E2E
npm install -D @playwright/test
npx playwright install
```

### 3.3 Configurare Vitest

Creează `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**', 'hooks/**', 'components/**'],
      exclude: ['**/*.d.ts', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

### 3.4 Scripturi `package.json`

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### 3.5 Structură Director Teste

```
tests/
├── setup.ts                        # Setup global (mock-uri Supabase, etc.)
├── unit/
│   ├── priceCalculator.test.ts     # Prioritatea 1 – calcul prețuri
│   ├── isForeignPhone.test.ts      # Prioritatea 1 – clasificare leaduri
│   ├── stagePatterns.test.ts       # Prioritatea 2 – potrivire patternuri
│   └── normStageName.test.ts       # Prioritatea 2 – normalizare
├── integration/
│   ├── facturare.test.ts           # Prioritatea 1 – flux de facturare
│   ├── expireCallbacks.test.ts     # Prioritatea 2 – expirare callback-uri
│   ├── cronMidnightRo.test.ts     # Prioritatea 3 – cron No Deal
│   └── apiAuth.test.ts            # Prioritatea 3 – autorizare rute
└── e2e/
    ├── vanzari-flow.spec.ts        # Flux fericit: lead → callback → curier trimis
    ├── receptie-flow.spec.ts       # Flux fericit: fișă de serviciu → tăvițe → facturare
    └── tehnician-flow.spec.ts      # Flux fericit: preluare în lucru → finalizare
```

---

## 4. Plan de Implementare (Prioritizat)

### Faza 1 – Fundația (1-2 zile)
- [ ] Instalare Vitest + configurare
- [ ] Mock client Supabase (`tests/setup.ts`)
- [ ] Primele teste unitare: `calculateItemTotal()` (6 scenarii), `isForeignPhone()` (7 scenarii)
- **Acoperire estimată după faza 1:** ~5% (dar pe cele mai critice funcții)

### Faza 2 – Logica de Business (3-5 zile)
- [ ] Teste pentru `matchesStagePattern()`, `findStageByPattern()`, `normStageName()` (5 scenarii)
- [ ] Teste pentru `calculateTrayTotal()`, `calculateServiceFileTotal()` (3 scenarii)
- [ ] Teste pentru `validateForFacturare()` (3 scenarii)
- [ ] Teste pentru `requireAuth()`, `requireOwner()`, `requireAdminOrOwner()` (4 scenarii)
- **Acoperire estimată:** ~15%

### Faza 3 – Integrare (5-7 zile)
- [ ] Teste rute API: `/api/cron/midnight-ro`, `/api/vanzari/factureaza`
- [ ] Teste pentru `expireCallbacks()`, `setLeadCurierTrimis()`, `setLeadNoDeal()`
- [ ] Teste pentru `startWorkSession()`, `finishWorkSession()`
- **Acoperire estimată:** ~25%

### Faza 4 – E2E (5-7 zile)
- [ ] Instalare Playwright + setup
- [ ] E2E: Login → Kanban Vânzări → Click lead → Callback
- [ ] E2E: Recepție → Completare instrumente → Facturare
- [ ] E2E: Tehnician → Preluare în lucru → Finalizare
- **Acoperire estimată:** ~35% (cu E2E)

### Țintă pe Termen Lung
| Interval | Acoperire | Focus |
| :--- | :--- | :--- |
| Luna 1 | 25% | Funcții pure + rute API critice |
| Luna 3 | 50% | + Hook-uri + Componente + fluxuri E2E |
| Luna 6 | 70% | + Teste de regresie + Cazuri limită |

---

## 5. Exemple de Teste (Gata de Copiat)

### 5.1 Test: `calculateItemTotal` (Vitest)

```typescript
// tests/unit/priceCalculator.test.ts
import { describe, it, expect } from 'vitest'
import { calculateItemTotal } from '@/lib/vanzari/priceCalculator'

describe('calculateItemTotal', () => {
  it('calculează corect un articol simplu fără discount', () => {
    const item = {
      service_id: 'svc1',
      service: { price: 100 },
      qty: 2,
      notes: '{}'
    }
    const result = calculateItemTotal(item, false)
    expect(result.unitPrice).toBe(100)
    expect(result.subtotal).toBe(200)
    expect(result.itemDiscount).toBe(0)
    expect(result.urgentDiscount).toBe(0)
    expect(result.itemTotal).toBe(200)
  })

  it('aplică corect discountul procentual', () => {
    const item = {
      service_id: 'svc1',
      service: { price: 100 },
      qty: 3,
      notes: JSON.stringify({ discount_pct: 10 })
    }
    const result = calculateItemTotal(item, false)
    expect(result.subtotal).toBe(300)
    expect(result.itemDiscount).toBe(30)
    expect(result.itemTotal).toBe(270)
  })

  it('aplică discountul urgent de 10% când ambele flag-uri sunt active', () => {
    const item = {
      service_id: 'svc1',
      service: { price: 100 },
      qty: 1,
      notes: JSON.stringify({ urgent: true })
    }
    const result = calculateItemTotal(item, true)
    expect(result.urgentDiscount).toBe(10)
    expect(result.itemTotal).toBe(90)
  })

  it('nu aplică discount urgent dacă fișa de serviciu nu este urgentă', () => {
    const item = {
      service_id: 'svc1',
      service: { price: 100 },
      qty: 1,
      notes: JSON.stringify({ urgent: true })
    }
    const result = calculateItemTotal(item, false)
    expect(result.urgentDiscount).toBe(0)
    expect(result.itemTotal).toBe(100)
  })

  it('returnează 0 pentru articol fără preț', () => {
    const item = { qty: 1, notes: '{}' }
    const result = calculateItemTotal(item, false)
    expect(result.unitPrice).toBe(0)
    expect(result.itemTotal).toBe(0)
  })
})
```

### 5.2 Test: `isForeignPhone` (Vitest)

```typescript
// tests/unit/isForeignPhone.test.ts
import { describe, it, expect } from 'vitest'
import { isForeignPhone } from '@/lib/facebook-lead-helpers'

describe('isForeignPhone', () => {
  it.each([
    ['+40722123456', false],
    ['40722123456', false],
    ['0722123456', false],
    ['+40 722 123 456', false],
  ])('consideră %s ca număr românesc (false)', (phone, expected) => {
    expect(isForeignPhone(phone)).toBe(expected)
  })

  it.each([
    ['+49170123456', true],
    ['+33612345678', true],
    ['+1234567890', true],
    ['49170123456', true],
  ])('consideră %s ca număr străin (true)', (phone, expected) => {
    expect(isForeignPhone(phone)).toBe(expected)
  })

  it.each([
    [null, false],
    [undefined, false],
    ['', false],
    ['   ', false],
  ])('returnează false pentru input invalid: %s', (phone, expected) => {
    expect(isForeignPhone(phone as any)).toBe(expected)
  })
})
```

### 5.3 Test: `matchesStagePattern` (Vitest)

```typescript
// tests/unit/stagePatterns.test.ts
import { describe, it, expect } from 'vitest'
import { matchesStagePattern, findStageByPattern, isLivrariOrCurierAjunsAziStage } from '@/lib/supabase/kanban/constants'

describe('matchesStagePattern', () => {
  it('potrivește "In Lucru" pentru IN_LUCRU', () => {
    expect(matchesStagePattern('In Lucru', 'IN_LUCRU')).toBe(true)
  })

  it('potrivește cu diacritice "În lucru"', () => {
    expect(matchesStagePattern('În lucru', 'IN_LUCRU')).toBe(true)
  })

  it('nu potrivește etapa greșită', () => {
    expect(matchesStagePattern('De facturat', 'IN_LUCRU')).toBe(false)
  })

  it('potrivește case-insensitive', () => {
    expect(matchesStagePattern('FINALIZATA', 'FINALIZARE')).toBe(true)
  })
})

describe('findStageByPattern', () => {
  const stages = [
    { id: '1', name: 'Noua' },
    { id: '2', name: 'In Lucru' },
    { id: '3', name: 'Finalizata' },
  ]

  it('găsește etapa corectă', () => {
    const result = findStageByPattern(stages, 'FINALIZARE')
    expect(result).toEqual({ id: '3', name: 'Finalizata' })
  })

  it('returnează undefined dacă nu găsește', () => {
    const result = findStageByPattern(stages, 'ARHIVAT')
    expect(result).toBeUndefined()
  })
})

describe('isLivrariOrCurierAjunsAziStage', () => {
  it.each([
    ['Livrari', true],
    ['Curier Ajuns Azi', true],
    ['LIVRARI', true],
    ['Colet Ajuns', false],
    ['In Lucru', false],
  ])('pentru "%s" returnează %s', (name, expected) => {
    expect(isLivrariOrCurierAjunsAziStage(name)).toBe(expected)
  })
})
```

---

*Raport generat prin analiza completă a codului sursă, dependențelor și structurii proiectului Ascutzit CRM.*
