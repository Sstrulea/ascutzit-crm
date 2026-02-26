# Testing Strategy – Ascutzit CRM

---

## 1. Current State of Tests

### 1.1 Audit Results

| Criterion | Result |
| :--- | :--- |
| `*.test.ts` / `*.test.tsx` files | **0 found** |
| `*.spec.ts` / `*.spec.tsx` files | **0 found** |
| `__tests__/` directories | **0 found** |
| Jest / Vitest / Playwright / Cypress config | **0 found** |
| Test dependencies (`jest`, `vitest`, `@testing-library`, `cypress`, `playwright`) in `package.json` | **0 found** |
| `test` script in `package.json` | **Does not exist** |
| Estimated coverage | **0%** |

### 1.2 Conclusion

**The project has no automated tests.** There is no testing framework installed, no configurations, and no test files. All testing is done manually by the team through using the application.

This is a **critical vulnerability**: any change to the business logic (price calculation, invoicing, stage transitions, cron jobs) can introduce undetected bugs that go directly to production.

---

## 2. Critical Points to Test (Top 10)

### Priority 1 (CRITICAL – Money, data, integrity)

#### 2.1 Price Calculation (`lib/vanzari/priceCalculator.ts`)

**Why it's critical:** Calculates invoice totals. An error = incorrect invoices, financial loss.

**Functions to test:** `calculateItemTotal()`, `calculateTrayTotal()`, `calculateServiceFileTotal()`

**Given-When-Then Scenarios:**

```
Scenario 1: Simple item calculation
  GIVEN a tray_item with service.price=100, qty=2, discount_pct=0, urgent=false
  WHEN I call calculateItemTotal(item, false)
  THEN unitPrice=100, subtotal=200, itemDiscount=0, urgentDiscount=0, itemTotal=200

Scenario 2: Item calculation with discount
  GIVEN a tray_item with service.price=100, qty=3, discount_pct=10
  WHEN I call calculateItemTotal(item, false)
  THEN subtotal=300, itemDiscount=30, itemTotal=270

Scenario 3: Urgent item calculation
  GIVEN a tray_item with service.price=100, qty=1, urgent=true in notes
  WHEN I call calculateItemTotal(item, true)  // serviceFileUrgent=true
  THEN subtotal=100, urgentDiscount=10 (10%), itemTotal=90

Scenario 4: Item calculation without price (service/part/instrument null)
  GIVEN a tray_item without service, part, or instrument
  WHEN I call calculateItemTotal(item, false)
  THEN unitPrice=0, subtotal=0, itemTotal=0

Scenario 5: Full tray calculation
  GIVEN a tray with 3 items: [100 lei, 200 lei, 50 lei], service_file.urgent=false
  WHEN I call calculateTrayTotal(tray)
  THEN trayTotal=350, items.length=3

Scenario 6: Service file calculation with global discount
  GIVEN a service file with 2 trays (total 1000 lei), discountGlobal=15%
  WHEN I call calculateServiceFileTotal(serviceFileId)
  THEN totalTrays=1000, globalDiscount=150, finalTotal=850
```

---

#### 2.2 Invoicing Process (`lib/vanzari/facturare.ts`)

**Why it's critical:** Atomic process with 7 steps: validation → calculation → number generation → update → archiving → cleanup → logging. Any partial failure = inconsistent data.

**Functions to test:** `factureazaServiceFile()`, `validateForFacturare()`, `anuleazaFactura()`

```
Scenario 1: Successful invoicing
  GIVEN a service file with status != 'facturata', is_locked=false, with trays
  WHEN I call factureazaServiceFile(sfId, { metodaPlata: 'cash' }, userId)
  THEN result.success=true
    AND service_file.status='facturata'
    AND service_file.is_locked=true
    AND facturaNumber is set (format F-YYYY-NNNN)
    AND items_events exists with event_type='factura_emisa'
    AND pipeline_items for trays are deleted

Scenario 2: Invoicing on an already invoiced service file
  GIVEN a service file with status='facturata'
  WHEN I call factureazaServiceFile(sfId, data, userId)
  THEN result.success=false
    AND result.validationErrors contains 'already invoiced'

Scenario 3: Invoicing on a service file without trays
  GIVEN a service file without trays
  WHEN I call validateForFacturare(sfId)
  THEN result.valid=false

Scenario 4: Invoice cancellation without reason
  GIVEN an invoiced service file
  WHEN I call anuleazaFactura(sfId, '', userId)
  THEN result.success=false (reason is mandatory)

Scenario 5: Invoice cancellation with reason
  GIVEN an invoiced service file, is_locked=true
  WHEN I call anuleazaFactura(sfId, 'Price error', userId)
  THEN result.success=true
    AND service_file.is_locked=false
    AND service_file.status reverts to previous
```

---

#### 2.3 Facebook Lead Classification (`lib/facebook-lead-helpers.ts`)

**Why it's critical:** Determines whether the lead ends up in Leads or Foreign Leads. Wrong classification = lost lead.

**Functions to test:** `isForeignPhone()`, `fieldValuesToDetailsText()`, `buildLeadDetailsFromFieldData()`

```
Scenario 1: Romanian number with +40 prefix
  GIVEN phone = '+40722123456'
  WHEN I call isForeignPhone(phone)
  THEN result = false (it's Romanian)

Scenario 2: Romanian number with 0 prefix
  GIVEN phone = '0722123456'
  WHEN I call isForeignPhone(phone)
  THEN result = false

Scenario 3: Romanian number with 40 prefix (without +)
  GIVEN phone = '40722123456'
  WHEN I call isForeignPhone(phone)
  THEN result = false

Scenario 4: Foreign number (German)
  GIVEN phone = '+49170123456'
  WHEN I call isForeignPhone(phone)
  THEN result = true (it's foreign)

Scenario 5: Null / undefined / empty number
  GIVEN phone = null
  WHEN I call isForeignPhone(phone)
  THEN result = false (not considered foreign)

Scenario 6: Number with spaces
  GIVEN phone = '+40 722 123 456'
  WHEN I call isForeignPhone(phone)
  THEN result = false (spaces are removed)

Scenario 7: Parsing field_data from Facebook
  GIVEN field_data = [{ name: 'full_name', values: ['Ion Popescu'] }, { name: 'phone_number', values: ['+40722000000'] }]
  WHEN I call buildLeadDetailsFromFieldData(field_data)
  THEN result contains the combined text details
```

---

### Priority 2 (HIGH – Business logic, Kanban)

#### 2.4 Stage Pattern Matching (`lib/supabase/kanban/constants.ts`)

**Why it's critical:** Any modification to STAGE_PATTERNS affects the entire application. If a pattern no longer matches, cards disappear or appear in the wrong stage.

**Functions to test:** `matchesStagePattern()`, `findStageByPattern()`, `isLivrariOrCurierAjunsAziStage()`, `normStageName()`

```
Scenario 1: Match on "In lucru" with variants
  GIVEN stageName = 'In Lucru'
  WHEN I call matchesStagePattern(stageName, 'IN_LUCRU')
  THEN result = true

Scenario 2: Match on "În lucru" (with diacritics)
  GIVEN stageName = 'În lucru'
  WHEN I call matchesStagePattern(stageName, 'IN_LUCRU')
  THEN result = true

Scenario 3: Non-match
  GIVEN stageName = 'De facturat'
  WHEN I call matchesStagePattern(stageName, 'IN_LUCRU')
  THEN result = false

Scenario 4: findStageByPattern finds the correct stage
  GIVEN stages = [{ id: '1', name: 'Noua' }, { id: '2', name: 'In Lucru' }, { id: '3', name: 'Finalizata' }]
  WHEN I call findStageByPattern(stages, 'FINALIZARE')
  THEN result = { id: '3', name: 'Finalizata' }

Scenario 5: Livrari / Curier Ajuns Azi – equivalence
  GIVEN stageName = 'Curier Ajuns Azi'
  WHEN I call isLivrariOrCurierAjunsAziStage(stageName)
  THEN result = true

  GIVEN stageName = 'Livrari'
  WHEN I call isLivrariOrCurierAjunsAziStage(stageName)
  THEN result = true

  GIVEN stageName = 'Colet Ajuns'
  WHEN I call isLivrariOrCurierAjunsAziStage(stageName)
  THEN result = false
```

---

#### 2.5 Callback Expiration (`lib/supabase/expireCallbacks.ts`)

**Why it's critical:** Runs on-access at every Vanzari (Sales) load. Silent failure = leads permanently stuck in Call Back / Nu Raspunde (No Answer).

```
Scenario 1: Lead with expired callback → moved to Leads
  GIVEN a lead in stage "Call Back" with callback_date = now - 1 hour
  WHEN expireCallbacks() runs
  THEN the lead is moved to stage "Leads"
    AND tag "Follow Up" is added
    AND tag "Sună!" is added

Scenario 2: Lead with non-expired callback → stays in Call Back
  GIVEN a lead in stage "Call Back" with callback_date = tomorrow
  WHEN expireCallbacks() runs
  THEN the lead stays in "Call Back"

Scenario 3: Lead with expired nu_raspunde → moved
  GIVEN a lead with nu_raspunde_callback_at = now - 30 min
  WHEN expireCallbacks() runs
  THEN the lead is moved to "Leads"
```

---

### Priority 3 (MEDIUM – Cron jobs, bulk operations)

#### 2.6 Cron: No Deal → Archived (`app/api/cron/midnight-ro/route.ts`)

```
Scenario 1: Lead in No Deal for 25h → moved to Archived
  GIVEN a lead in stage "No Deal" with entered_stage_at = now - 25h
  WHEN cron midnight-ro runs
  THEN the lead is moved to "Arhivat" AND no_deal=true AND items_events logged

Scenario 2: Lead in No Deal for 12h → stays
  GIVEN a lead in stage "No Deal" with entered_stage_at = now - 12h
  WHEN cron midnight-ro runs
  THEN the lead stays in "No Deal"

Scenario 3: Cron without CRON_SECRET → 401
  GIVEN request without Authorization header
  WHEN GET /api/cron/midnight-ro is called
  THEN response status = 401
```

#### 2.7 Service File Creation (`lib/vanzari/leadOperations.ts`)

```
Scenario 1: setLeadCurierTrimis creates service file + moves to Reception
  GIVEN a valid lead with leadId
  WHEN I call setLeadCurierTrimis(leadId, scheduledDate)
  THEN a service_file is created with curier_trimis=true
    AND pipeline_items contains the service file in Reception "Curier Trimis"
    AND the lead has tag "Curier Trimis"

Scenario 2: setLeadNoDeal clears all flags
  GIVEN a lead with call_back=true, callback_date set, tags
  WHEN I call setLeadNoDeal(leadId)
  THEN lead.no_deal=true
    AND lead.call_back=false
    AND lead.callback_date=null
    AND lead.nu_raspunde=false
    AND lead_tags is empty
```

#### 2.8 API Route Authorization (`lib/supabase/api-helpers.ts`)

```
Scenario 1: requireAuth with valid session
  GIVEN a request with valid Supabase session cookies
  WHEN requireAuth() is called
  THEN returns { user, supabase }

Scenario 2: requireAuth without session
  GIVEN a request without cookies
  WHEN requireAuth() is called
  THEN throws 401 Unauthorized

Scenario 3: requireOwner with owner role
  GIVEN an authenticated user with role='owner' in app_members
  WHEN requireOwner() is called
  THEN returns { user, admin }

Scenario 4: requireOwner with member role
  GIVEN an authenticated user with role='member'
  WHEN requireOwner() is called
  THEN throws 403 Forbidden
```

#### 2.9 Work Sessions (`lib/supabase/workSessionOperations.ts`)

```
Scenario 1: Start session – first time
  GIVEN a tray without an active session
  WHEN I call startWorkSession(trayId, techId)
  THEN a session is created with started_at=now, finished_at=null

Scenario 2: Start session – already active (idempotent)
  GIVEN a tray with an active session (finished_at=null)
  WHEN I call startWorkSession(trayId, techId)
  THEN returns the existing session ID, does not create a new one

Scenario 3: Finish session
  GIVEN a tray with an active session
  WHEN I call finishWorkSession(trayId, techId)
  THEN the session has finished_at=now
```

#### 2.10 Unified Search (`lib/supabase/unifiedSearchServer.ts`)

```
Scenario 1: Search with valid query (≥2 characters)
  GIVEN query = "Ion"
  WHEN searchUnifiedWithClient(supabase, "Ion") is called
  THEN returns array with results (leads, service files, trays)

Scenario 2: Search with query too short
  GIVEN query = "I"
  WHEN GET /api/search/unified?q=I is called
  THEN response.data = [], message contains "minimum 2 characters"
```

---

## 3. Test Configuration – Proposal

### 3.1 Recommended Framework

| Test type | Framework | Reason |
| :--- | :--- | :--- |
| **Unit** (pure functions) | **Vitest** | Fast, native ESM/TypeScript, compatible with Vite/Next.js ecosystem |
| **Integration** (API routes) | **Vitest** + `next/test` or `supertest` | Testing route handlers without a server |
| **E2E** (user flows) | **Playwright** | Cross-browser, robust, native Next.js support |

### 3.2 Installation

```bash
# Unit + Integration
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom

# E2E
npm install -D @playwright/test
npx playwright install
```

### 3.3 Vitest Configuration

Create `vitest.config.ts`:
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

### 3.4 `package.json` Scripts

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

### 3.5 Test Directory Structure

```
tests/
├── setup.ts                        # Global setup (mocks Supabase, etc.)
├── unit/
│   ├── priceCalculator.test.ts     # Priority 1 – price calculation
│   ├── isForeignPhone.test.ts      # Priority 1 – lead classification
│   ├── stagePatterns.test.ts       # Priority 2 – pattern matching
│   └── normStageName.test.ts       # Priority 2 – normalization
├── integration/
│   ├── facturare.test.ts           # Priority 1 – invoicing flow
│   ├── expireCallbacks.test.ts     # Priority 2 – callback expiration
│   ├── cronMidnightRo.test.ts     # Priority 3 – cron No Deal
│   └── apiAuth.test.ts            # Priority 3 – route authorization
└── e2e/
    ├── vanzari-flow.spec.ts        # Happy path: lead → callback → courier sent
    ├── receptie-flow.spec.ts       # Happy path: service file → trays → invoicing
    └── tehnician-flow.spec.ts      # Happy path: take in progress → finish
```

---

## 4. Implementation Plan (Prioritized)

### Phase 1 – Foundation (1-2 days)
- [ ] Install Vitest + configuration
- [ ] Mock Supabase client (`tests/setup.ts`)
- [ ] First unit tests: `calculateItemTotal()` (6 scenarios), `isForeignPhone()` (7 scenarios)
- **Estimated coverage after phase 1:** ~5% (but on the most critical functions)

### Phase 2 – Business Logic (3-5 days)
- [ ] Tests for `matchesStagePattern()`, `findStageByPattern()`, `normStageName()` (5 scenarios)
- [ ] Tests for `calculateTrayTotal()`, `calculateServiceFileTotal()` (3 scenarios)
- [ ] Tests for `validateForFacturare()` (3 scenarios)
- [ ] Tests for `requireAuth()`, `requireOwner()`, `requireAdminOrOwner()` (4 scenarios)
- **Estimated coverage:** ~15%

### Phase 3 – Integration (5-7 days)
- [ ] API route tests: `/api/cron/midnight-ro`, `/api/vanzari/factureaza`
- [ ] Tests for `expireCallbacks()`, `setLeadCurierTrimis()`, `setLeadNoDeal()`
- [ ] Tests for `startWorkSession()`, `finishWorkSession()`
- **Estimated coverage:** ~25%

### Phase 4 – E2E (5-7 days)
- [ ] Install Playwright + setup
- [ ] E2E: Login → Sales Kanban → Click lead → Callback
- [ ] E2E: Reception → Fill instruments → Invoicing
- [ ] E2E: Technician → Take in progress → Finish
- **Estimated coverage:** ~35% (with E2E)

### Long-term Target
| Interval | Coverage | Focus |
| :--- | :--- | :--- |
| Month 1 | 25% | Pure functions + critical API routes |
| Month 3 | 50% | + Hooks + Components + E2E flows |
| Month 6 | 70% | + Regression tests + Edge cases |

---

## 5. Test Examples (Ready to Copy)

### 5.1 Test: `calculateItemTotal` (Vitest)

```typescript
// tests/unit/priceCalculator.test.ts
import { describe, it, expect } from 'vitest'
import { calculateItemTotal } from '@/lib/vanzari/priceCalculator'

describe('calculateItemTotal', () => {
  it('correctly calculates a simple item without discount', () => {
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

  it('applies percentage discount correctly', () => {
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

  it('applies 10% urgent discount when both flags are active', () => {
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

  it('does not apply urgent discount if serviceFile is not urgent', () => {
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

  it('returns 0 for item without price', () => {
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
  ])('considers %s as Romanian number (false)', (phone, expected) => {
    expect(isForeignPhone(phone)).toBe(expected)
  })

  it.each([
    ['+49170123456', true],
    ['+33612345678', true],
    ['+1234567890', true],
    ['49170123456', true],
  ])('considers %s as foreign number (true)', (phone, expected) => {
    expect(isForeignPhone(phone)).toBe(expected)
  })

  it.each([
    [null, false],
    [undefined, false],
    ['', false],
    ['   ', false],
  ])('returns false for invalid input: %s', (phone, expected) => {
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
  it('matches "In Lucru" for IN_LUCRU', () => {
    expect(matchesStagePattern('In Lucru', 'IN_LUCRU')).toBe(true)
  })

  it('matches with diacritics "În lucru"', () => {
    expect(matchesStagePattern('În lucru', 'IN_LUCRU')).toBe(true)
  })

  it('does not match wrong stage', () => {
    expect(matchesStagePattern('De facturat', 'IN_LUCRU')).toBe(false)
  })

  it('matches case-insensitive', () => {
    expect(matchesStagePattern('FINALIZATA', 'FINALIZARE')).toBe(true)
  })
})

describe('findStageByPattern', () => {
  const stages = [
    { id: '1', name: 'Noua' },
    { id: '2', name: 'In Lucru' },
    { id: '3', name: 'Finalizata' },
  ]

  it('finds the correct stage', () => {
    const result = findStageByPattern(stages, 'FINALIZARE')
    expect(result).toEqual({ id: '3', name: 'Finalizata' })
  })

  it('returns undefined if not found', () => {
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
  ])('for "%s" returns %s', (name, expected) => {
    expect(isLivrariOrCurierAjunsAziStage(name)).toBe(expected)
  })
})
```

---

*Report generated through complete analysis of the source code, dependencies, and structure of the Ascutzit CRM project.*
