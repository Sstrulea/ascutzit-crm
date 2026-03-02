# Plan de dezvoltare: Baza Clienți – date extinse și statistici

## 1. Obiective

Îmbunătățirea paginii **Baza Clienți** astfel încât să afișeze:
- **Număr de telefon** (afișat în listă)
- **Nr. de fișe** (număr fișe de serviciu per client)
- **Suma totală comenzi** (totalul tuturor comenzilor avute la noi)
- **Expand pe rând** → detalii: instrumente aduse (tip, cantitate, mod: cuier / office)

Plus: perspective de **statistician** – ce date suplimentare sunt utile și cum le afișăm.

---

## 2. Surse de date (existent)

| Ce avem nevoie        | Unde e în DB / cod                                      |
|-----------------------|---------------------------------------------------------|
| Telefon per client    | `leads.phone_number` (folosit la cheia unică, nu returnat în listă) |
| Nr. leaduri           | Deja: agregare pe `(nume, telefon)` → `leadCount`        |
| Nr. fișe              | `service_files.lead_id` → număr fișe per lead; per client = sumă pe toate leadurile clientului |
| Suma totală comenzi   | **Calculat**, nu stocat: `service_files` → `trays` → `tray_items` + prețuri (servicii, piese), discount, urgent, abonament (vezi `calculateTotalFisaSum` în `useLeadDetailsDataLoader`) |
| Instrumente + mod    | `tray_items` (instrument_id, qty) + `service_files` (office_direct, curier_trimis) pentru mod (office vs curier) |

**Mod livrare:** „cuier” = curier, „office” = office direct.  
Sursă: `service_files.office_direct`, `service_files.curier_trimis` (per fișă; o fișă poate fi livrată office sau curier).

---

## 3. Faze de implementare

### Faza 1 – Date simple în listă (API + UI)
**Scop:** telefon și nr. de fișe în același request, fără calcule grele.

- **API** `GET /api/leads/baza-clienti`:
  - Păstrăm agregarea pe client (nume + telefon normalizat).
  - Returnăm pentru fiecare client:
    - `phoneDisplay`: un telefon afișabil (ex. primul `phone_number` întâlnit, formatat fără +40).
  - Pentru **nr. fișe**:
    - Query: `service_files` cu `lead_id IN (toate id-urile de lead ale clientului)`.
    - Agregare: `fisaCount = count(service_files)` per client.
  - Implementare: în API citim toate `leads` (ca acum), construim `clientKey → { leadIds[] }`, apoi un singur query `service_files.select('lead_id').in('lead_id', allLeadIds)` și numărăm per lead; apoi per client însumăm nr. de fișe ale leadurilor lui.
- **UI:**
  - Coloană **Telefon** (ex. „0722 791 179”).
  - Coloană **Nr. fișe** (în loc sau alături de „Număr leaduri”, conform cerinței).

**Estimare:** 1–2 zile. Risc mic.

---

### Faza 2 – Suma totală comenzi
**Scop:** „Totalul sumei dacă a avut comenzi la noi” per client.

- **Provocare:** Totalul se calculează din tray_items + servicii/piese + prețuri, discount, urgent, abonament (logică în `calculateTotalFisaSum`). A rula acest calcul pentru ~1000 de clienți într-un singur request este prea greu.
- **Soluție recomandată:**
  - **Variantă A – La expand:** Nu returnăm total în listă inițială. La **expand** pe rând (sau la click „Detalii”) se apelează un endpoint de tip:
    - `GET /api/leads/baza-clienti/client-details?clientKey=...`  
    care returnează: `{ totalSum, instruments[], fisaCount? }`.
  - **Variantă B – Coloană cu încărcare lazy:** Coloana „Suma totală” afișează „—” sau un spinner; la scroll into view (sau la expand) se face request pentru acel client și se completează totalul. Refolosim același endpoint de detalii.
- **Backend endpoint** `client-details`:
  - Input: identificator client (ex. `clientKey = hash(nume+telefon)` sau trimitem `leadIds[]`).
  - Logică: pentru fiecare `lead_id` al clientului → toate `service_files` → pentru fiecare fișă rulăm aceeași logică de calcul ca în `calculateTotalFisaSum` (sau refactor comun) și însumăm.
  - Return: `{ totalSum: number, currency: 'RON' }` și opțional `instruments` (pentru Faza 3).

**Estimare:** 2–3 zile. Risc mediu (refactor logică total existentă într-un mod reutilizabil).

---

### Faza 3 – Expand: instrumente (tip, cantitate, mod)
**Scop:** La expand pe rând → secțiune cu ce instrumente a adus clientul, cantitate, mod (cuier/office).

- **Date necesare:**
  - Din `tray_items`: `instrument_id`, `qty` (și opțional service_id/part_id pentru context).
  - Din `instruments`: `name` (pentru „tip”).
  - Din `service_files`: `office_direct`, `curier_trimis` (pentru mod: Office / Curier).
  - Legătură: client → leads → service_files → trays → tray_items; fiecare item e legat de un tray → service_file → mod.
- **Endpoint:** Poate fi același `client-details` extins:
  - `GET /api/leads/baza-clienti/client-details?clientKey=...`
  - Răspuns extins: `{ totalSum, instruments: [{ instrumentName, qty, mod: 'office' | 'curier', fisaNumber?, trayNumber? }] }`.
  - Agregare: fie per fișă/tăviță („Fișa 3, Tăvița #cutie: Clopot 2 buc, Office”), fie doar listă simplă (instrument, qty, mod) cu posibilitate de grupare în UI.
- **UI:**
  - Buton/icon expand (chevron) pe fiecare rând.
  - La expand: sub-rând sau panel cu lista de instrumente (tip, cantitate, mod).
  - Opțional: grupare pe fișă sau pe mod.

**Estimare:** 1–2 zile după ce Faza 2 există. Risc mic.

---

### Faza 4 – Optimizări și date pentru statistician
**Scop:** Alte metrici utile pentru analiză și mod de afișare.

- **Date suplimentare utile (perspectivă statistician):**
  - **Data primului contact** – `min(leads.created_at)` per client.
  - **Data ultimei activități** – `max(service_files.updated_at)` sau `max(leads.updated_at)`.
  - **Valoare medie comandă** – `totalSum / nrFișe` (dacă nrFișe > 0).
  - **Segment:** „Client nou” (1 fișă) vs „Recurent” (2+ fișe).
  - **Număr total instrumente** – count(tray_items) cu instrument_id, per client (pentru volum lucrări).
- **Afișare:**
  - Filtre suplimentare: după „Recurent / Nou”, după interval „Ultima activitate”, după „Are comenzi” (totalSum > 0).
  - Export CSV/Excel: nume, telefon, nr. leaduri, nr. fișe, total sumă, no deal, data primului contact, data ultimei activități, LTV (total sumă).
  - Grafice simple (opțional): distribuție clienți no deal vs cu deal; distribuție după nr. fișe; top clienți după total sumă.

**Estimare:** 2–3 zile. Poate fi făcut incremental după Fazele 1–3.

---

## 4. Rezumat priorități

| Prioritate | Element                         | Faza  | Dependențe     |
|-----------|----------------------------------|-------|----------------|
| 1         | Telefon în listă                 | 1     | -              |
| 2         | Nr. fișe per client              | 1     | -              |
| 3         | Suma totală comenzi (la expand) | 2     | Endpoint detalii |
| 4         | Expand: instrumente + mod        | 3     | Endpoint detalii |
| 5         | Metrici statistician + export    | 4     | Fazele 1–3     |

---

## 5. Tehnice

- **Identificator client în API:** Păstrăm cheia `normalizeName(name)::normalizePhone(phone)` pentru agregare. Pentru `client-details` putem trimite fie această cheie (și refacem leadIds din cache/DB), fie lista de `leadIds` (dacă front-ul o are deja din listă).
- **Performanță:** Lista principală rămâne ușoară (telefon + nr. fișe). Totalul și instrumentele se încarcă on-demand per client (expand sau lazy).
- **Securitate:** Endpoint-ul `baza-clienti` și `client-details` rămân după autentificare; `client-details` limitat la datele clientului identificat (fără acces la alți clienți).

---

## 6. Status implementare

- [x] **Faza 1** – Telefon și Nr. fișe în API (`GET /api/leads/baza-clienti`: `phoneDisplay`, `fisaCount`, `clientKey`) și în tabel (coloane Telefon, Nr. fișe).
- [x] **Faza 2 + 3** – Endpoint `GET /api/leads/baza-clienti/client-details?clientKey=...` returnează `totalSum`, `instruments` (tip, cantitate, mod office/curier), `fisaCount`. Pe pagină: buton expand (chevron) pe rând; la expand se încarcă detaliile și se afișează Total comenzi (RON) și lista Instrumente aduse (nume × cantitate, mod Office/Curier).
- [x] **Faza 4** – Export CSV pentru lista filtrată (Nume, Telefon, Tip, Nr. leaduri, Nr. fișe). Metrici suplimentare (data primului contact, ultima activitate etc.) pot fi adăugate ulterior.

Documentul poate fi actualizat pe măsură ce se adaugă noi funcționalități (ex. metrici Faza 4 complete, grafice).
