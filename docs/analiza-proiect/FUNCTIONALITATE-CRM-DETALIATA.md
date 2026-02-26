# Funcționalitate CRM – Descriere Detaliată

Acest document descrie în detaliu cum funcționează proiectul CRM: fluxuri de date, pipeline-uri Kanban, operațiuni de vânzări, recepție, departamente și Control Calitate, bazat pe analiza codului și modelul de date.

---

## 1. Arhitectură Generală

CRM-ul este organizat în jurul **pipeline-urilor Kanban** și **tipurilor de elemente**:

- **Pipeline-uri:** Vânzări, Recepție, Saloane, Horeca, Frizerii, Reparații, Control Calitate (și opțional Curier).
- **Tipuri de elemente:** `lead`, `service_file` (Fișă de service), `tray` (Tăviță).
- **Poziționare:** Fiecare element este plasat într-un pipeline și o **etapă** prin tabela `pipeline_items` (câmpuri: `type`, `item_id`, `pipeline_id`, `stage_id`).

Etapele și pipeline-urile sunt configurate în baza de date; codul folosește **tipare de nume** (ex. "in lucru", "finalizata", "de facturat") pentru a identifica comportamentul, astfel încât redenumirile minore în BD rămân compatibile.

---

## 2. Vânzări (pipeline Vânzări)

### 2.1 Surse de Lead-uri

- **Meta (Facebook Lead Ads)**  
  - Webhook: `app/api/leads/facebook-webhook/route.ts`. La primirea unui `leadgen_id`, se apelează Graph API pentru datele complete ale lead-ului, se parsează `field_data`, se inserează o înregistrare în tabela `leads` și se adaugă în pipeline-ul Vânzări.  
  - **Clasificare după telefon:** în `lib/facebook-lead-helpers.ts`, funcția `isForeignPhone(phone)` consideră numerele ca **românești** dacă încep cu `+40`, `40` sau `0`; restul sunt "străine".  
  - Lead-urile cu număr străin sunt plasate în etapa **Leaduri Straine**; cele cu număr românesc în etapa **Leaduri**.  
  - Simulare: `app/api/leads/simulate-facebook/route.ts` (același flux: inserare lead + adăugare în pipeline conform regulilor de telefon).

- **Website**  
  - Nu există un API dedicat "formular website" în cod; lead-urile pot fi create manual din CRM.

- **Manual**  
  - Din pagina `app/(crm)/leads/[pipeline]/page.tsx`, la crearea unui lead, se folosește `createLeadWithPipeline()` din `lib/supabase/leadOperations.ts` cu `platform: 'manual'`.

### 2.2 Etape și Afișare (suprascieri)

Strategia pipeline-ului Vânzări se află în `lib/supabase/kanban/strategies/standard.ts`. **StandardPipelineStrategy** aplică **suprascieri de etapă** pentru afișare (fără a modifica întotdeauna etapa în BD), în ordinea priorității:

1. **No deal** – dacă lead-ul are `no_deal = true`, este afișat în etapa No deal.
2. **Call back** – dacă `call_back = true` și `callback_date` există, este afișat în etapa Call back (până la expirare).
3. **Nu răspunde** – dacă `nu_raspunde = true` și `nu_raspunde_callback_at` există, este afișat în etapa Nu răspunde.
4. **Avem Comandă / Comenzi Active** – pentru lead-urile cu comenzi active (fișe de service).
5. **Etapa BD** – altfel, se folosește etapa din `pipeline_items`.

După expirarea datei/orei pentru Call back sau Nu răspunde, etapa din BD este folosită pentru poziționare. Un job de expirare: `app/api/leads/expire-callbacks/route.ts` și `lib/supabase/expireCallbacks.ts` mută lead-urile în etapele corespunzătoare când timpul a trecut.

### 2.3 Operațiuni Vânzări (butoane / acțiuni)

- **Call back**  
  - Utilizatorul alege data și ora.  
  - Se setează `leads.call_back` și `leads.callback_date`.  
  - Lead-ul este mutat (în BD sau prin suprascriere) în etapa **Call back**.  
  - Informația apare în detaliile lead-ului și pe cardul lead-ului (componente: `components/leads/lead-details-panel.tsx`, `components/kanban/lead-card.tsx`; hook: `hooks/leadDetails/useLeadDetailsCheckboxes.ts`).

- **Nu răspunde**  
  - Utilizatorul alege ora la care vrea să sune din nou.  
  - Se setează `leads.nu_raspunde` și `leads.nu_raspunde_callback_at`.  
  - Lead-ul este mutat în etapa **Nu răspunde**.  
  - Afișare: detalii lead, card lead.

- **No deal**  
  - Comanda nu a fost încheiată.  
  - În `lib/vanzari/leadOperations.ts`, `setLeadNoDeal(leadId)` setează `no_deal = true`, șterge flag-urile de callback/nu răspunde și flag-urile de livrare, și elimină toate tag-urile lead-ului.  
  - Cardul lead-ului (`components/kanban/lead-card.tsx`) ascunde butoanele de livrare și declanșatoarele pentru lead-urile No deal.

- **Tip livrare (Office Direct / Curier trimis)**  
  - Comanda a fost încheiată; se alege tipul de livrare și (pentru curier) data programată.  
  - **Curier trimis:** `setLeadCurierTrimis(leadId, scheduledDate, options)` în `lib/vanzari/leadOperations.ts`:  
    - Creează o **fișă de service** în `service_files` (`curier_trimis: true`, `curier_scheduled_at`), cu status `comanda`.  
    - Adaugă fișa de service în pipeline-ul **Recepție**, etapa **Curier Trimis**.  
    - Mută lead-ul în pipeline-ul Vânzări în etapa **Curier Trimis** (sau echivalent).  
    - Înregistrează în `vanzari_apeluri` și tag-uri (ex. Curier Trimis).  
  - **Office Direct:** `setLeadOfficeDirect(leadId, scheduledDate, options)` – analog, cu `office_direct: true` și etapa **Office Direct** în Recepție și Vânzări.  
  - Pe cardul lead-ului, butonul de livrare este afișat pentru etapele Leaduri, Leaduri Straine, Nu răspunde, Call back, Livrări; la confirmare se apelează API-urile care invocă aceste funcții.  
  - Etapele "Livrări" / "Curier Ajuns Azi" sunt tratate special (ex. pentru butonul "Avem Comandă"); helpere în `lib/supabase/kanban/constants.ts`: `isLivrariOrCurierAjunsStage`, `isLivrariOrCurierAjunsAziStage`.

### 2.4 Fișiere Cheie – Vânzări

| Domeniu               | Fișiere |
|----------------------|-------|
| API webhook / cron   | `app/api/leads/facebook-webhook/route.ts`, `app/api/leads/simulate-facebook/route.ts`, `app/api/leads/expire-callbacks/route.ts` |
| Operațiuni lead      | `lib/vanzari/leadOperations.ts`, `lib/facebook-lead-helpers.ts`, `lib/supabase/leadOperations.ts` |
| Strategie Kanban      | `lib/supabase/kanban/strategies/standard.ts` |
| UI                   | `components/kanban/lead-card.tsx`, `components/leads/lead-details-panel.tsx`, `app/(crm)/leads/[pipeline]/page.tsx` |
| Apeluri vânzări | `lib/supabase/vanzariApeluri.ts` |

---

## 3. Recepție (pipeline Recepție)

Recepția afișează **carduri de fișe de service**. Poziționarea unei fișe de service în etape depinde nu doar de `pipeline_items`, ci și de **flag-urile de pe fișa de service**, **evenimente** (`items_events`) și **starea tăvițelor** în pipeline-urile departamentelor.

### 3.1 Crearea Fișelor de Service

- **La înregistrarea comenzii (Curier Trimis / Office Direct)**  
  - La confirmarea livrării pe un lead (butonul Curier Trimis sau Office Direct), în `lib/vanzari/leadOperations.ts` se creează **o fișă de service per lead**: inserare în `service_files` (număr din secvență, `status: 'comanda'`, `curier_trimis`/`office_direct`, date programate).  
  - Fișa de service este adăugată în pipeline-ul Recepție în etapa **Curier Trimis** sau **Office Direct** (prin `moveItemToStage` / `addServiceFileToPipeline`).

- **Din modulul Prețuri**  
  - În `hooks/preturi/usePreturiDeliveryOperations.ts`, comutarea Office Direct / Curier Trimis actualizează `service_files` și poate adăuga fișa de service în pipeline-ul Recepție (ex. etapa Office Direct).

- **Creare generică**  
  - `lib/supabase/serviceFileOperations.ts` – `createServiceFile()`; folosit și pentru crearea manuală a unei fișe de service din UI.

### 3.2 Etape Recepție și Reguli de Afișare

Strategia Recepției se află în `lib/supabase/kanban/strategies/receptie.ts`. Ordinea **priorității** (suprascieri) pentru determinarea etapei în care apare cardul fișei de service:

1. **Arhivat** – fișe de service care au cel puțin o tăviță cu un număr sufixat "-copy" (tăviță arhivată).
2. **Colet ajuns** – fișă de service marcată "Trimis" (colet ajuns): `colet_ajuns = true` sau eveniment corespunzător; sau toate tăvițele fișei de service sunt deja în pipeline-urile departamentelor (Nouă / În lucru / În așteptare / Finalizată).
3. **De trimis / Ridic personal** – evenimente `de_trimis` sau `ridic_personal` (după facturare și acordul clientului).
4. **Nu răspunde** – tag sau flag Nu răspunde pe fișa de service/lead.
5. **De facturat** – toate tăvițele fișei de service sunt în etapa **Finalizată** în departamente **și** fiecare tăviță are un eveniment **quality_validated** în `items_events` (validare Control Calitate).
6. **În așteptare** – cel puțin o tăviță este în etapa În așteptare sau Aștept piese în un departament; niciuna în În lucru.
7. **În lucru** – cel puțin o tăviță este în etapa În lucru în un departament.
8. **Colet ajuns** (fallback) – fișa de service are tăvițe în departamente (dar nu toate finalizate/CC).
9. **Colet neridicat** – fișa de service are `colet_neridicat = true` sau perioada a trecut (vezi mai jos).
10. **Curier trimis / Office direct** – fișe de service cu `curier_trimis` sau `office_direct` care nu se încadrează în celelalte cazuri (inclusiv fișe de service fără rând în `pipeline_items` încă; sunt încărcate direct din `service_files`).

Fișele de service cu `office_direct` sau `curier_trimis` sunt încărcate direct din baza de date în strategie, chiar dacă nu au încă un rând în `pipeline_items`, astfel încât apar imediat în Recepție după creare.

### 3.3 Colet Neridicat

- **Condiție:** După ce curierul a fost "trimis" la o dată aleasă (`curier_scheduled_at`), dacă au trecut **2 zile** (sau 36h în unele căi de cod), fișa de service este considerată "colet neridicat".
- **Implementare:**  
  - `lib/supabase/expireColetNeridicat.ts` – `runExpireColetNeridicat()`: după 36h de la `curier_scheduled_at` (sau 2 zile de la `created_at`) mută fișa de service în etapa **Colet neridicat** din Recepție și lead-ul în etapa **Colet neridicat** din Vânzări.  
  - Cron: `app/api/cron/vanzari-colet-neridicat/route.ts` – logică similară (2 zile de la `curier_scheduled_at`), actualizează `pipeline_items` și setează `no_deal` pe fișa de service.  
  - API la cerere: `app/api/leads/move-to-colet-neridicat/route.ts`.

### 3.4 Colet Ajuns (trimiterea tăvițelor în departamente)

- **Marcare "Trimis" (colet ajuns):** API `app/api/service-files/set-colet-ajuns/route.ts` setează `colet_ajuns = true` (și/sau eveniment).  
- **Trimiterea efectivă a tăvițelor** în pipeline-urile departamentelor se face din UI (modulul Prețuri / detalii fișă de service): `hooks/preturi/usePreturiTrayOperations.ts` – funcții precum `sendAllTraysToPipeline()`. Pentru fiecare tăviță se determină departamentul din instrumente; dacă lead-ul are tag **Retur**, tăvița este plasată în etapa **Retur** a pipeline-ului departament, altfel în **Nouă**. După ce tăvițele sunt în departamente, strategia Recepției poziționează fișa de service în **Colet ajuns** (sau În lucru / În așteptare / De facturat, în funcție de starea tăvițelor).

### 3.5 De Facturat

- **Condiție:** Toate tăvițele fișei de service sunt în etapa **Finalizată** în pipeline-urile departamentelor **și** fiecare are evenimentul **quality_validated** în `items_events` (validare Control Calitate).  
- Calculul se face în `lib/supabase/kanban/strategies/receptie.ts` prin `getAllTraysInfoForServiceFiles()`: `allFinalizare` și `allQcValidated`.  
- **Facturare:** Din overlay-ul De facturat (`components/leads/DeFacturatOverlay.tsx`) sau din modulul Prețuri, se apelează `app/api/vanzari/factureaza/route.ts` → `factureazaServiceFile()` din `lib/vanzari/facturare.ts`. Utilizatorul alege **Ridic personal** (clientul ridică de la sediu) sau **De trimis (AWB)** (curier). După facturare, fișa de service este mutată în etapa **Ridic personal** sau **De trimis** din Recepție. Când toate fișele de service ale unui lead sunt facturate, lead-ul poate fi mutat în **Arhivat**.

### 3.6 De Trimis / Ridic Personal (acord client + buton Trimis)

- Butoanele **De trimis** și **Ridic personal** sunt afișate când fișa de service este în etapa **De facturat** sau **Nu răspunde** (ex. în `components/leads/lead-details-panel.tsx`, `components/preturi/sections/TrayActions.tsx`, `components/preturi/views/ReceptieView.tsx`).  
- La apăsare: evenimentul `de_trimis` sau `ridic_personal` este înregistrat în `items_events` și fișa de service este mutată în etapa corespunzătoare din Recepție. Nu se face facturare adițională aici; facturarea se face din De facturat.  
- Acordul clientului este acțiunea utilizatorului înainte de apăsarea butonului (nu este un câmp separat în cod; fluxul de business presupune acordul înainte de "Trimis").

### 3.7 Arhivat

- Cardul fișei de service este mutat în **Arhivat** când comanda a fost ridicată (personal sau prin curier). În cod:  
  - Fișele de service cu o tăviță "-copy" sunt considerate arhivate și afișate în etapa **Arhivat**.  
  - Arhivarea explicită (butonul Arhivare) este disponibilă pe card pentru etapele **De trimis** și **Ridic personal**; mută fișa de service (și lead-ul, dacă este cazul) în etapa **Arhivat** și poate implica copierea tăvițelor cu sufixul "-copy".  
- Logică adițională în `app/(crm)/leads/[pipeline]/page.tsx` (ex. "Arhivează toate fișele de service din De trimis și Ridic personal").

### 3.8 Fișiere Cheie – Recepție

| Domeniu                | Fișiere |
|-----------------------|-------|
| Strategie              | `lib/supabase/kanban/strategies/receptie.ts` |
| Colet neridicat | `lib/supabase/expireColetNeridicat.ts`, `app/api/cron/vanzari-colet-neridicat/route.ts`, `app/api/leads/move-to-colet-neridicat/route.ts` |
| Colet ajuns | `app/api/service-files/set-colet-ajuns/route.ts` |
| Facturare / De trimis | `components/leads/DeFacturatOverlay.tsx`, `lib/vanzari/facturare.ts`, `app/api/vanzari/factureaza/route.ts` |
| Constante etape       | `lib/supabase/kanban/constants.ts` |

---

## 4. Departamente (Saloane, Horeca, Frizerii, Reparații)

Pipeline-urile departamentelor conțin **tăvițe**. Numele pipeline-urilor sunt definite în `lib/supabase/kanban/constants.ts`: `DEPARTMENT_PIPELINES = ['Saloane', 'Horeca', 'Frizerii', 'Reparatii']`.

### 4.1 Etape

- **Nouă** – tăvițe care nu au fost încă luate în lucru; apar aici implicit când sunt trimise din Recepție (cu excepția celor cu tag Retur).  
- **Retur** – tăvițe ale lead-urilor cu tag **Retur**; la "trimiterea tăvițelor" sunt plasate în etapa Retur a pipeline-ului departament.  
- **În lucru** – tăvițe atribuite unui tehnician (`trays.technician_id`, opțional `technician2_id`, `technician3_id`) și luate în lucru.  
- **În așteptare** – tăvițe mutate în așteptare (butonul "În așteptare" din detaliile tăviței).  
- **Finalizată** – tăvițe finalizate; apar și în pipeline-ul **Control Calitate** pentru validare.

Tiparele de nume pentru aceste etape sunt în `lib/supabase/kanban/constants.ts` (`STAGE_PATTERNS`: NOUA, RETUR, IN_LUCRU, IN_ASTEPTARE, FINALIZARE).

### 4.2 Trimiterea Tăvițelor din Recepție

- În `hooks/preturi/usePreturiTrayOperations.ts`: pentru fiecare tăviță se determină pipeline-ul departamentului din **instrumente**; dacă lead-ul are tag Retur, se folosește etapa **Retur**, altfel **Nouă**. Se apelează `addTrayToPipeline(tray.id, departmentPipelineId, stageId)` din `lib/supabase/pipelineOperations.ts`; se asigură unicitatea tăviței în pipeline-urile departamentelor (o tăviță nu apare în două departamente).

### 4.3 Atribuire Tehnician și Filtrare

- Atribuirea se face în UI (detalii tăviță, dashboard tehnician); se salvează în `trays.technician_id` (și opțional al doilea/al treilea tehnician).  
- Strategia departamentului (`lib/supabase/kanban/strategies/department.ts`) pentru utilizatorii non-admin filtrează tăvițele: utilizatorul vede tăvițele atribuite lui, tăvițele neatribuite și tăvițele "împărțite" (cu mai mulți tehnicieni).

### 4.4 Butonul "În Așteptare"

- Mutarea tăviței în etapa **În așteptare** se face prin `moveItemToStage('tray', trayId, pipelineId, inAsteptareStageId)`.  
- Folosit în: `hooks/leadDetails/useLeadDetailsDepartmentActions.ts`, `app/(crm)/tehnician/tray/[trayId]/page.tsx` (ex. `handleStatusChange` actualizează `trays.status` și etapa pipeline-ului).

### 4.5 Fișiere Cheie – Departamente

| Domeniu         | Fișiere |
|----------------|-------|
| Strategie       | `lib/supabase/kanban/strategies/department.ts` |
| Trimitere        | `hooks/preturi/usePreturiTrayOperations.ts` |
| Mutare etapă | `lib/supabase/pipelineOperations.ts` |
| UI Tehnician  | `app/(crm)/tehnician/tray/[trayId]/page.tsx`, `app/(crm)/dashboard/tehnician/page.tsx` |
| Acțiuni        | `hooks/leadDetails/useLeadDetailsDepartmentActions.ts`, `components/lead-details/actions/LeadDepartmentActions.tsx` |
| API Status     | `app/api/trays/check-department-status/route.ts` |

---

## 5. Control Calitate

Pipeline-ul **Control Calitate** are etape corespunzătoare departamentelor (Saloane, Horeca, Frizerii, Reparații). **Nu există elemente duplicate în BD** pentru Calitate: tăvițele sunt citite din pipeline-urile departamentelor (etapa **Finalizată**) și afișate **virtual** în Calitate.

### 5.1 Încărcarea Elementelor

- În `lib/supabase/kanban/strategies/quality.ts`, **QualityPipelineStrategy.loadItems()**:  
  - Se încarcă `pipeline_items` de tip `tray` din pipeline-urile departamentelor care sunt în etapa **Finalizată**.  
  - Pentru fiecare tăviță se verifică ultimul eveniment CC în `items_events`: dacă există **quality_validated**, tăvița **nu mai** apare în Calitate; dacă există **quality_not_validated** sau evenimentul lipsește, tăvița apare.  
  - Se construiesc elemente Kanban virtuale per etapă Calitate (mapate la departament).

### 5.2 Validare / Nevalidare

- Din pagina CRM (ex. `app/(crm)/leads/[pipeline]/page.tsx`): acțiuni precum `handleQcValidate`, `handleQcDontValidate`.  
  - **Validare:** un eveniment **quality_validated** este înregistrat în `items_events`; tăvița dispare din Calitate; în Recepție, când toate tăvițele unei fișe de service sunt validate, fișa de service trece la **De facturat**.  
  - **Nevalidare:** **quality_not_validated** este înregistrat și, în unele fluxuri, tăvița este mutată înapoi în etapa **În lucru** din departament.

### 5.3 Fișiere Cheie – Control Calitate

| Domeniu    | Fișiere |
|-----------|-------|
| Strategie  | `lib/supabase/kanban/strategies/quality.ts` |
| Acțiuni   | `app/(crm)/leads/[pipeline]/page.tsx` (handleQcValidate, handleQcDontValidate) |
| Constante | `lib/supabase/kanban/constants.ts` (pattern FINALIZARE, mapare departamente) |

---

## 6. Model de Date (rezumat)

- **leads** – contact, sursă (platformă, campanie, formular), adrese, flag-uri: `no_deal`, `call_back`, `callback_date`, `nu_raspunde`, `nu_raspunde_callback_at`, `curier_trimis_at`, `office_direct_at`, `claimed_by`, etc.  
- **service_files** – Fișă de service: `lead_id`, `number`, `date`, `status` (noua, in_lucru, finalizata, comanda, facturata), `office_direct`, `office_direct_at`, `curier_trimis`, `curier_scheduled_at`, `colet_neridicat`, `colet_ajuns`, `nu_raspunde_callback_at`, `urgent`, `no_deal`, etc.  
- **trays** – Tăviță: legată de o fișă de service; `technician_id` (și opțional 2/3); `status`; `qc_notes`; etc.  
- **pipelines** – id, name, description, position, is_active.  
- **stages** – id, pipeline_id, name, position, is_active.  
- **pipeline_items** – type ('lead' | 'service_file' | 'tray'), item_id, pipeline_id, stage_id, created_at, updated_at.  
- **lead_tags** – relație many-to-many lead–tag (ex. Curier trimis, Office Direct, Retur, Sună!, tag-uri departamente).  
- **vanzari_apeluri** – jurnal de mișcări/apeluri în pipeline-ul Vânzări.  
- **items_events** – jurnal de evenimente per element (lead, service_file, tray): ex. `quality_validated`, `quality_not_validated`, `colet_neridicat_auto`, `de_trimis`, `ridic_personal`.  
- **stage_history** – pentru tăvițe: istoric mișcări etape (tray_id, pipeline_id, from_stage_id, to_stage_id, moved_by, moved_at).

Tipurile TypeScript sunt definite în `lib/types/database.ts`.

---

## 7. Fluxuri Conectate (sinteză)

1. **Lead** creat (webhook Meta, simulare sau manual) → inserare în `leads` → adăugat în `pipeline_items` (type `lead`, pipeline Vânzări, etapa Leaduri sau Leaduri Straine în funcție de telefon).  
2. Utilizatorul **Vânzări** confirmă **Curier trimis** sau **Office Direct** → se creează o înregistrare **service_files** → fișa de service este adăugată în **Recepție** (etapa Curier Trimis / Office Direct); lead-ul este mutat în etapa corespunzătoare din Vânzări.  
3. **Recepție:** utilizatorul marchează "Trimis" (colet ajuns) sau trimite tăvițele → tăvițele primesc `pipeline_items` în **Departamente** (Nouă sau Retur); fișa de service este poziționată în Colet ajuns / În lucru / În așteptare în funcție de starea tăvițelor.  
4. **Departamente:** tăvițele se mișcă Nouă → În lucru → În așteptare → Finalizată; atribuire tehnician și tag Retur în hook-uri și operațiuni pipeline.  
5. **Control Calitate:** citește tăvițele din departamente (etapa Finalizată), afișează carduri virtuale; la **validare** `quality_validated` este scris în `items_events`; Recepția folosește aceasta pentru a muta fișa de service la **De facturat** când toate tăvițele sunt validate.  
6. **De facturat** → utilizatorul facturează (Ridic personal sau De trimis AWB) → fișa de service este mutată în **De trimis** sau **Ridic personal**; la acordul clientului și apăsarea butonului Trimis (dacă nu s-a făcut deja la facturare), fluxul este complet. Când toate fișele de service ale lead-ului sunt facturate/trimise, lead-ul poate fi mutat în **Arhivat**; fișele de service cu tăvițe "-copy" apar în etapa **Arhivat** din Recepție.

---

*Document generat pe baza analizei codului proiectului. Numele etapelor și pipeline-urilor pot varia ușor în baza de date; logica folosește tipare de nume pentru compatibilitate.*
