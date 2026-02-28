# Investigare: tăvițe create fără număr

## Scop

Identificarea tuturor căilor din cod care creează tăvițe „goale” (fără număr) și a condițiilor care pot duce la tăvițe duplicate sau nedorite.

---

## Puncte unice de creare (createTray)

Toate inserările în `trays` trec prin `lib/supabase/serviceFileOperations.ts` → `createTray()`. Nu există insert direct în `trays` în restul codului.

---

## Căi care creează tăvițe cu număr gol

### 1. Creare fișă nouă (un singur loc intenționat)

| Fișier | Linie | Apel | Când |
|--------|--------|------|------|
| `hooks/leadDetails/useLeadDetailsServiceFiles.ts` | 119 | `createTray({ number: '', service_file_id: data.id, status: 'in_receptie' })` | Imediat după ce utilizatorul creează o fișă de serviciu nouă. Intenționat: o tăviță „undefined” per fișă nouă. |

**Risc:** Dacă în același timp se deschide fișa în Recepție/Vânzări și rulează calea 2, se pot crea două tăvițe goale (race între acest apel și cel din Orchestrator).

---

### 2. Recepție / Vânzări – „nu există tăvițe”

| Fișier | Linie | Apel | Când |
|--------|--------|------|------|
| `components/preturi/core/PreturiOrchestrator.tsx` | 461 | `createQuoteForLead(leadId, '', fisaId)` → `createTray({ number: name \|\| '', ... })` | `useEffect` când: `!loading`, `quotesArray.length === 0`, pipeline Recepție sau Vânzări, există `fisaId` și `leadId`. |

**Problema:** Nu se verifică mai întâi în DB dacă există deja tăvițe pentru fișă. `quotes` vin din state-ul părinte (din data loader). Dacă utilizatorul tocmai a creat fișa, tăvița din calea 1 poate fi deja în DB, dar `quotes` încă nu s-au reîncărcat → state-ul e `[]` → se mai creează o tăviță goală.

**Remediu:** Înainte de `createQuoteForLead(..., '', fisaId)`, apelați `listTraysForServiceFile(fisaId)`. Dacă rezultatul are elemente → folosiți-le (`setQuotes`, `setSelectedQuoteId`). Creați o tăviță nouă doar dacă lista e goală.

---

### 3. Salvare view V4 (Recepție) – tăviță implicită

| Fișier | Linii | Apel | Când |
|--------|--------|------|------|
| `lib/history/vanzariViewV4Save.ts` | 129–134, 243, 259 | Dacă `traysToUse` e gol dar există instrumente/servicii/piese → `[{ id: '__default__', number: '' }]`. Apoi pentru fiecare `LocalTray` cu `number === ''` se caută o tăviță goală existentă; dacă nu există, se apelează `createTray({ number: '', ... })`. | La salvare din view-ul Recepție când există conținut dar nu există tăvițe în payload; sau când payload-ul conține explicit o tăviță cu număr gol. |

**Problema:** Căutarea tăviții goale se face cu `.eq('number', '')`. Dacă în DB există o tăviță goală cu `number = NULL` (legacy sau alt path), nu e găsită → se creează încă una.

**Remediu:** La căutarea tăviții goale existente, tratați și `number IS NULL` (ex. `.or('number.eq.,number.is.null')` sau select + filtrare în cod).

---

### 4. Tăviță de vânzare (cu nume)

| Fișier | Linie | Apel | Când |
|--------|--------|------|------|
| `hooks/preturi/usePreturiItemOperations.ts` | 134 | `createTray({ service_file_id: fisaId, number: newTrayName })` | La adăugare serviciu din catalogul de vânzări când nu există tăviță de vânzare; `newTrayName` = `generateVanzareTrayName(...)` – nu e gol. |

**Risc:** Nu creează tăvițe fără număr; numele e generat.

---

### 5. createQuoteForLead (helper)

| Fișier | Linie | Apel | Când |
|--------|--------|------|------|
| `lib/utils/preturi-helpers.ts` | 72, 77 | `number: name \|\| ''`, apoi `createTray(trayData)` | Apelat din: Orchestrator cu `name: ''` (cazul 2), usePreturiTrayOperations cu număr introdus de user, usePreturiBusiness. Tăviță fără număr doar când se pasează `name: ''` sau `undefined`. |

---

## Reutilizare și curățare în createTray / listare

- **createTray** (serviceFileOperations.ts):
  - Pentru `number` gol: face SELECT la tăvițele fișei, găsește una cu `number == null` sau `trim(number) === ''`, o returnează (nu inserează).
  - La eroare 23505 (unique violation) pentru tăviță goală: reface SELECT și returnează tăvița existentă.
- **listTraysForServiceFile:** apelează `cleanupRedundantEmptyTraysForServiceFile` înainte de return; păstrează cel mult o tăviță goală per fișă (șterge pe cele fără itemi și fără imagini).

Dacă în DB nu există constraint UNIQUE pe `(service_file_id, number)` sau echivalent, două apeluri concurente `createTray({ number: '', ... })` pot ambele să treacă de SELECT și să insereze → două tăvițe goale. Constraint-ul + tratarea 23505 reduc riscul; totuși, evitarea creării în două locuri (fișă nouă + Orchestrator) rămâne importantă.

---

## Rezumat cauze pentru tăvițe fără număr / duplicate

1. **Două surse care creează tăvița goală:** la creare fișă (useLeadDetailsServiceFiles) și la deschidere în Recepție/Vânzări când `quotes.length === 0` (PreturiOrchestrator), fără a verifica mai întâi DB → posibile duplicate sau stare incorectă.
2. **V4 save:** căutare doar după `number = ''` → tăvițe cu `number IS NULL` nu sunt găsite → se poate crea o tăviță goală în plus.
3. **Race:** între createTray din creare fișă și createTray din Orchestrator (sau din V4 save), dacă SELECT-ul din createTray nu vede încă rândul celuilalt.

---

## Măsuri implementate / recomandate

1. **PreturiOrchestrator:** Înainte de a crea tăvița „undefined”, apelați `listTraysForServiceFile(fisaId)`. Dacă există tăvițe, folosiți-le; creați o tăviță nouă doar dacă lista e goală.
2. **vanzariViewV4Save:** La căutarea tăviții goale existente, includeți și rândurile cu `number IS NULL` (nu doar `number = ''`).
3. **Opțional (DB):** Constraint UNIQUE pe `(service_file_id, COALESCE(NULLIF(trim(number), ''), '<empty>'))` sau similar, pentru a permite o singură tăviță „goală” per fișă la nivel de DB.

Documentul acesta poate fi actualizat după aplicarea remediilor și eventual după introducerea constraint-ului în DB.
