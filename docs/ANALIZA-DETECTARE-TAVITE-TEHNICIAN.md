# Analiză: Cum se depistează dacă fișa are tăvițe și dacă tăvița are tehnician

## 1. Surse de date (DB)

| Tabel / concept | Rol |
|-----------------|-----|
| **trays** | Tăvițe legate de fișă: `service_file_id`, `number`, `technician_id`, `technician2_id`, `technician3_id`. O fișă poate avea 0, 1 sau mai multe tăvițe. |
| **tray_items** | Item-uri (servicii/piese) per tăviță: `tray_id`. Folosit doar pentru „tăvița are conținut” (cel puțin un rând). |
| **pipeline_items** (type='tray') | În ce stage/pipeline e tăvița (ex. Saloane/In lucru). Folosit pentru status (in_lucru, in_asteptare, finalizare) și departament. |
| **items_events** (type='tray', event_type='quality_validated') | QC: tăvița e validată sau nu. |
| **app_members** | Cache nume tehnician: `user_id` → `name` (folosit de `getTechnicianName`). |

---

## 2. „Fișa are tăvițe” – unde și cum se calculează

### 2.1 În strategia Receptie (loadItems)

- **Lista de fișe luate în calcul:** `filteredServiceFiles` = fișe din `allServiceFiles` care:
  - sunt în pipeline (în `serviceFiles`), SAU
  - au `office_direct`, `curier_trimis`, `colet_neridicat`, SAU
  - apar în virtual items (tăvițe în departamente), SAU
  - au tag-uri de departament.
- **ID-uri folosite pentru tăvițe:** `serviceFileIdsForTotals` = `filteredServiceFiles.map(sf => sf.id)` (același set de fișe).

Apoi se fac **două tipuri** de rezultate:

**A) Numere de tăvițe afișate pe card (`trayNumbersBySf`)**

- Query: `trays` cu `service_file_id IN (sfIdsForTotals)`, select `id, number, service_file_id`.
- Pentru fiecare tăviță: se verifică dacă există **cel puțin un rând** în `tray_items` cu acel `tray_id`.
- **Regula:** se adaugă numărul tăviței la fișă **doar dacă tăvița are cel puțin un item**. Tăvițe goale nu apar în lista de numere.
- Riscuri:
  - Dacă query-ul la `trays` dă eroare (ex. 400), `trayNumbersBySf` rămâne gol.
  - Dacă `tray_items` eșuează sau e gol, `trayIdsWithItems` e gol → niciun număr de tăviță nu se adaugă (chiar dacă în `trays` există rânduri).

**B) Info completă pe fișă (`traysInfo` din `getAllTraysInfoForServiceFiles`)**

- Query: `trays` cu `service_file_id IN (serviceFileIdsForDept)` (același set de fișe), select incluzând `technician_id` (și fallback doar `technician_id` dacă full dă eroare).
- **Nu** se filtrează după `tray_items`: **toate** tăvițele fișei intră în `traysInfo.trays`.
- Deci: „fișa are tăvițe” pentru logică (mutări stage, QC, etc.) = `traysInfo.get(serviceFile.id).trays.length > 0`.
- „Fișa are numere de tăvițe de afișat” = `trayNumbersBySf.get(serviceFile.id)` ne-gol (doar tăvițe cu item-uri).

**Inconsistență posibilă:** O fișă poate avea `traysInfo.trays.length > 0` (are tăvițe în DB) dar `trayNumbersBySf` gol dacă toate tăvițele sunt goale (fără item-uri). Pe card atunci nu apare niciun număr, dar logica de stage (ex. De facturat) folosește `traysInfo`.

---

## 3. „Tăvița are tehnician” – unde și cum se calculează

### 3.1 Sursa corectă: tabelul `trays`

- Tehnicianul este la **nivel de tăviță**: `trays.technician_id`, `technician2_id`, `technician3_id`.
- **Nu** din `tray_items`: în cod, `extractTechnicianMap(trayItems)` returnează mereu **Map gol** (comentariu: „tray_items nu mai au technician_id”).

### 3.2 În strategia Receptie

**getTechnicianMapForServiceFiles(serviceFileIds)**

- Cu preload: folosește `preloaded.trays` (deja cu `technician_id`, eventual `technician2_id`, `technician3_id`).
- Fără preload: query direct la `trays`:
  - Încearcă `id, service_file_id, technician_id, technician2_id, technician3_id`.
  - La eroare (ex. 400): fallback la `id, service_file_id, technician_id` **doar**.
- Pentru fiecare fișă: se ia **primul** tehnician găsit pe oricare tăviță: `firstTrayWithTech = traysForSf.find(t => t.technician_id || t.technician2_id || t.technician3_id)`, apoi `firstTechnicianId` = unul dintre cei trei ID-uri.
- Nume: `getTechnicianName(firstTechnicianId)` din cache (`app_members`).

**Probleme posibile:**

1. **Fallback doar cu `technician_id`:**  
   Când se folosește select-ul minimal (`id, service_file_id, technician_id`), `technician2_id` și `technician3_id` nu există în răspuns.  
   → Dacă tehnicianul este doar pe `technician2_id` sau `technician3_id`, **nu va fi găsit** și fișa va apărea fără tehnician.

2. **Preload eșuat:**  
   Dacă primul preload (cu technician2/3) dă eroare și fallback-ul reușește, `preloadedTraysForTotals` are doar `technician_id`. Acolo e același efect: tehnician doar pe 2 sau 3 nu apare.

3. **Cache nume:**  
   `getTechnicianName` folosește cache-ul din `app_members`. Dacă `loadTechnicianCache()` nu a fost apelat sau user_id nu e în listă, se poate returna „Necunoscut” sau lipsă.

### 3.3 În getAllTraysInfoForServiceFiles (tehnician per tăviță pe card)

- Se folosește `extractAllTechniciansMapFromTrays(allTrays)` care citește `technician_id`, `technician2_id`, `technician3_id` de pe fiecare tăviță.
- Dacă `allTrays` vine din preload cu fallback (doar `technician_id`), din nou tăvițele cu doar technician2/3 vor avea tehnician null în afișaj.

### 3.4 În fetchTrayInfoForServiceFile (client – fallback pe card)

- Query: `trays` cu `service_file_id = serviceFileId`, select **doar** `id, number, service_file_id, technician_id`.
- **Nu** se cer `technician2_id`, `technician3_id`.
- → Pe client, dacă tehnicianul e doar pe coloana 2 sau 3, **nu va apărea** pe card.

---

## 4. Rezumat probleme identificate

| # | Problemă | Unde | Efect |
|---|----------|------|--------|
| 1 | Numere tăvițe: se afișează doar tăvițe cu ≥1 item în `tray_items`. Tăvițe goale = nu apar pe card. | trayNumbersBySf (receptie) | Corect ca business (nu afișăm tăvițe goale), dar „fișa are tăvițe” pentru logică e din traysInfo, nu din trayNumbersBySf. |
| 2 | Tehnician doar pe technician2_id sau technician3_id: toate fallback-urile (select minimal) și fetch-ul client folosesc doar `technician_id`. | getTechnicianMapForServiceFiles, preload fallback, getAllTraysInfo fallback, fetchTrayInfoForServiceFile | Tehnicianul nu apare pe card / în map. |
| 3 | Erori la query (400, RLS): dacă request-ul la `trays` eșuează, maps rămân goale; nu există retry cu alt set de coloane în toate căile. | Preload, trayNumbersBySf, getTechnicianMap, getAllTraysInfo | Fișa apare fără tăvițe/tehnician. |
| 4 | Fișă în pipeline dar fără în filteredServiceFiles: imposibil (orice fișă din serviceFiles e în filteredServiceFiles). | - | Nu e bug. |
| 5 | tray_items returnat gol sau eroare: trayNumbersBySf rămâne gol pentru toate fișele, chiar dacă în `trays` există tăvițe cu item-uri. | Blocul „Numere tăvițe” (receptie) | Nu se afișează niciun număr de tăviță pe card. |

---

## 5. Recomandări

1. **Tehnician pe technician2_id / technician3_id**  
   - În **fetchTrayInfoForServiceFile**: extinde select-ul la `id, number, service_file_id, technician_id, technician2_id, technician3_id` și fallback la minimal doar la eroare; folosește același logic ca în receptie (primul non-null din cele 3).  
   - Păstrează în strategie fallback-ul minimal, dar documentează că „tehnician doar pe 2/3” poate să nu apară dacă DB nu expune coloanele.

2. **Verificare DB**  
   - Confirmă că în `trays` există coloanele `technician2_id` și `technician3_id`.  
   - Dacă nu există, elimină din toate select-urile „full” și folosește peste tot doar `technician_id`.

3. **RLS / 400**  
   - Pentru orice 400 la `trays`: verifică politicile RLS și că user-ul are SELECT pe coloanele folosite.  
   - Loghează în consolă când se folosește fallback-ul (select minimal) ca să vezi când nu se încarcă technician2/3.

4. **tray_items**  
   - Dacă „fișa are tăvițe” dar nu apare niciun număr: verifică că `tray_items` are rânduri pentru `tray_id`-urile acelei fișe și că nu există eroare la acel query.

Dacă vrei, următorul pas poate fi un patch concret: (1) extindere fetch client la technician2_id/technician3_id cu fallback la technician_id și (2) o singură funcție helper „getFirstTechnicianId(tray)” folosită peste tot (strategie + client).
