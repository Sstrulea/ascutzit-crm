# Studiu de caz: Tăvițe – probleme, cauze și soluții

**Data:** Februarie 2026  
**Obiectiv:** Analiză a problemelor raportate (tăvițe duplicate, QC care rămâne, tăviță fără număr, dispariție) și consolidarea soluțiilor.

---

## 1. REZUMAT PROBLEME

| Problemă | Descriere | Stare |
|----------|-----------|--------|
| **„S-a creat 2 tăvițe dar eu am doar 1”** | Pe fișă apare o singură tăviță fizică (ex. #29M), dar în sistem există două înregistrări. | Adresat prin reutilizare + cleanup + tratare 23505 |
| **„Tăvița 28S a rămas în QC”** | După validare QC din Recepție, pe card 28S rămâne cu icon mov (QC) în loc de bifă verde. | Adresat: validare QC pentru toate tăvițele cu același număr |
| **„De ce se creează o tăviță fără număr?”** | Tăviță goală (placeholder) creată automat. | Comportament intenționat; documentat |
| **„Tăvița dispare” (ex. 28S)** | După salvare/repartizare, tăvița nu mai apare sau își pierde conținutul. | Protecții în V4 save + doc TAVITA-DISPARITIE |

---

## 2. ANALIZA CAUZELOR

### 2.1 Două tăvițe create când există doar una

**Cauze posibile:**

1. **Race la crearea tăviții goale**  
   Două apeluri concurente `createTray('', service_file_id)` (ex. la „Creează fișă” + prima salvare V4, sau dublu-click). Ambele fac SELECT, nu găsesc tăviță goală, ambele inserează → două rânduri în `trays`.

2. **Lipsă constraint în DB**  
   Fără UNIQUE pe (service_file_id) pentru număr gol, baza permite mai multe tăvițe goale per fișă.

3. **Tăvițe cu număr duplicat (ex. două 28S)**  
   Istoric: înainte de verificarea „există deja tăviță cu acest număr” în `createTray`, sau diferențe de format (ex. „28S” vs „28S ”) puteau duce la două înregistrări.

**Fluxuri unde se creează tăvițe:**

| Locație | Când | Număr |
|---------|------|--------|
| `useLeadDetailsServiceFiles.ts` | La „Creează fișă nouă” | `''` (gol) |
| `vanzariViewV4Save.ts` | La salvare V4 când există instrumente dar nici o tăviță cu număr | `''` (o singură tăviță goală) |
| `usePreturiItemOperations.ts` | La adăugare serviciu „vânzare” – tăviță nouă cu nume generat | Cu nume (ex. Vânzare 1) |

---

### 2.2 Tăvița 28S rămâne în QC după validare

**Cauză:**  
Pe fișă existau **două înregistrări** cu același număr (#28S), cu ID-uri diferite. La „Validare QC (din Recepție)” se înregistra evenimentul `quality_validated` **doar pentru tăvița pe care s-a apăsat**. Cealaltă înregistrare 28S (alt UUID) rămânea fără eveniment → pe card afișa icon mov.

**Soluție implementată:**  
La validare QC din Recepție se identifică toate tăvițele din fișa curentă cu **același număr** (ex. toate 28S) și se înregistrează `quality_validated` pentru fiecare. Toate apar apoi cu bifă verde.

---

### 2.3 Tăviță fără număr – de ce există

**Scop:**  
Tăvița fără număr este un **placeholder**: permite adăugarea de instrumente/servicii înainte ca utilizatorul să dea un număr (ex. 6L, 48S).  
Crearea ei este **intenționată** în două situații:

- La **crearea fișei noi** – o tăviță goală per fișă.
- La **prima salvare din Recepție** – dacă există instrumente dar nici o tăviță cu număr în payload, se creează (sau se reutilizează) o singură tăviță goală.

Nu se creează tăvițe goale „la întâmplare”; fluxurile sunt clare și limitate.

---

### 2.4 Tăvița dispare (conținut sau întreagă)

**Cauze documentate în** `docs/TAVITA-DISPARITIE-PUNCTE-CRITICE.md`:

- **Salvare V4:** Golirea `tray_items` pentru tăvițe din payload când state-ul nu conține itemi pentru acea tăviță (ex. după repartizare); ștergerea tăvițelor „vechi” al căror număr nu e în payload.
- **Protecții adăugate:** Nu se mai golește o tăviță dacă în payload nu există itemi pentru ea dar în DB are; nu se șterge o tăviță care are `tray_items`; comparare numere cu `.toLowerCase()`.

---

## 3. SOLUȚII IMPLEMENTATE (CONSOLIDARE)

### 3.1 createTray (serviceFileOperations.ts)

- **Tăviță goală:** Înainte de INSERT se caută o tăviță existentă (același `service_file_id`, număr null/gol, status nu 2/3). Dacă există, se returnează aceea.
- **Tăviță cu număr:** Înainte de INSERT se verifică dacă există deja o tăviță cu același `service_file_id` și același `number`; dacă da, se returnează aceea.
- **Eroare 23505 (unique violation):** La inserare cu număr gol, dacă DB returnează 23505, se face din nou SELECT la tăvița goală existentă și se returnează aceea (evită race).

### 3.2 cleanupRedundantEmptyTraysForServiceFile

- Apelat în **listTraysForServiceFile** înainte de return.
- Șterge doar tăvițe cu număr gol **și** fără `tray_items` **și** fără `tray_images`.
- Păstrează **cel mult una** (cea mai veche) per fișă.

### 3.3 Validare QC din Recepție (PreturiMain.tsx)

- La „Validare QC” se determină toate tăvițele din fișa curentă cu **același număr** ca tăvița validată.
- Pentru fiecare astfel de tăviță se înregistrează `quality_validated` (și update `qc_notes`). Rezultat: pe card toate 28S (sau orice număr) apar validate.

### 3.4 vanzariViewV4Save

- Nu se golește o tăviță dacă payload-ul nu are itemi pentru ea dar tăvița din DB are itemi.
- Nu se șterge o tăviță care are `tray_items`.
- Pentru tăvițe goale se reutilizează o singură tăviță goală existentă sau se creează una.

---

## 4. SOLUȚII RECOMANDATE (OPȚIONAL / COMPLEMENTARE)

### 4.1 Constraint în DB pentru o singură tăviță goală per fișă

**Scop:** Garantie la nivel de bază de date împotriva a două tăvițe goale per fișă.

**Pas 1 – curățare duplicate (rulează o dată):**  
Script `docs/sql-unique-one-empty-tray-per-fisa.sql` – DELETE care păstrează o singură tăviță goală per `service_file_id`.

**Pas 2 – index unic (opțional):**  
Decomentează în același script:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS trays_one_empty_per_service_file
ON trays (service_file_id)
WHERE (number IS NULL OR trim(number) = '');
```

Dacă un al doilea INSERT de tăviță goală are loc, DB returnează 23505; aplicația tratează deja 23505 în `createTray` și returnează tăvița existentă.

### 4.2 Unicitate număr per fișă (normalizare)

**Risc:** Două tăvițe „28S” și „28s” (sau „28S ” cu spațiu) pot coexista dacă verificarea din `createTray` folosește match exact.

**Recomandare:** La verificarea „există deja tăviță cu acest număr” folosi normalizare: `trim()` și opțional `.toLowerCase()` atât pentru `data.number` cât și pentru valorile din DB (ex. `.ilike()` sau comparare pe `lower(trim(number))`). Astfel un singur „28S” logic per fișă.

### 4.3 Refresh board după validare QC

După validare QC din Recepție se apelează `setItemsRefreshKey` (refresh panel Preturi). Dacă board-ul Kanban (Recepție) folosește cache separat, utilizatorul poate vedea bifa verde după refresh pagină sau la reîncărcarea datelor. Opțional: la succes validare QC se poate invalida și cache-ul board-ului (dacă există funcție de refresh/invalidate) ca să apară imediat bifa verde.

---

## 5. VERIFICARE ȘI DEBUGGING

### 5.1 „Am doar o tăviță dar văd două”

1. **DB:** `SELECT id, number, service_file_id, created_at FROM trays WHERE service_file_id = '<fisa_id>' ORDER BY created_at;`  
   Verifică dacă există două rânduri cu același număr sau două goale.
2. **Cleanup:** Deschide fișa (Detalii / Recepție) – `listTraysForServiceFile` rulează `cleanupRedundantEmptyTraysForServiceFile`. După refresh, ar trebui să rămână maxim una goală.
3. **Script:** Poți rula `docs/sql-unique-one-empty-tray-per-fisa.sql` (pasul 1) pentru a șterge duplicate goale.

### 5.2 „Tăvița X rămâne în QC”

1. Verifică că ai ultima versiune a validării QC (toate tăvițele cu același număr primesc eveniment).
2. Reîncarcă board-ul / pagina; statusul QC se citește din `items_events` per `tray_id`.
3. **DB:** `SELECT item_id, event_type, created_at FROM items_events WHERE type = 'tray' AND event_type IN ('quality_validated','quality_not_validated') AND item_id IN (SELECT id FROM trays WHERE service_file_id = '<fisa_id>') ORDER BY created_at;`  
   Confirmă că toate tray_id-urile corespunzătoare numărului X au un `quality_validated` recent.

### 5.3 „Tăvița a dispărut”

1. **Istoric:** Evenimente „tray_moved_to_pipeline” / repartizare – dacă imediat după aceea s-a făcut salvare, vezi `TAVITA-DISPARITIE-PUNCTE-CRITICE.md`.
2. **Consolă:** Caută `[saveVanzariViewV4ToDb]` – mesajele de protecție (nu golesc / nu șterg) indică că nu s-a șters/golit tăvița.
3. **DB:** Verifică `trays` și `tray_items` pentru `service_file_id`; dacă tăvița există dar nu apare în UI, poate fi filtru pe pipeline/stage sau cache.

---

## 6. FIȘIERE CHEIE

| Fișier | Rol |
|--------|-----|
| `lib/supabase/serviceFileOperations.ts` | createTray (reutilizare goală, 23505), cleanupRedundantEmptyTraysForServiceFile, listTraysForServiceFile, deleteTray |
| `lib/history/vanzariViewV4Save.ts` | Salvare V4 – creare/reutilizare tăvițe, protecții la golire/ștergere |
| `hooks/leadDetails/useLeadDetailsServiceFiles.ts` | Creare fișă nouă + o tăviță goală |
| `components/preturi/core/PreturiMain.tsx` | Validare QC din Recepție pentru toate tăvițele cu același număr |
| `lib/supabase/kanban/strategies/receptie.ts` | QC per tăviță (trayQcValidatedMap), afișare pe card |
| `docs/TAVITA-DISPARITIE-PUNCTE-CRITICE.md` | Unde se șterg/suprascriu tăvițe |
| `docs/sql-delete-empty-trays.sql` | Ștergere tăvițe complet goale (admin/cron) |
| `docs/sql-unique-one-empty-tray-per-fisa.sql` | Curățare duplicate goale + index unic opțional |

---

## 7. CONCLUZIE

- **Tăvițe duplicate („2 create, am 1”):** Reduse prin reutilizare în `createTray`, cleanup la listare, tratare 23505; poți consolida cu index unic pentru tăvițe goale.
- **QC rămas pe o tăviță cu același număr:** Rezolvat prin înregistrarea validării QC pentru toate tăvițele cu acel număr din fișă.
- **Tăviță fără număr:** Comportament intenționat (placeholder); un singur placeholder per fișă este asigurat de logică și cleanup.
- **Tăvița dispare:** Mitigat prin protecțiile din V4 save și documentația din TAVITA-DISPARITIE; verificări și debugging sunt descrise mai sus.

Implementarea curentă acoperă cazurile raportate; opțiunile din secțiunea 4 (constraint DB, normalizare număr, refresh board) măresc robustețea și UX-ul fără a schimba fluxurile de business.
