# Analiză Tehnică CRM – Raport Detaliat

---

## 1. Rezumat Executiv (Descrierea Proiectului)

**Ascutzit CRM** este o platformă CRM internă (Customer Relationship Management) pentru o afacere de service/reparații instrumente profesionale (salon, horeca, frizerie). Proiectul gestionează întregul ciclu de viață al unui client – de la **lead** (cerere/comandă) la **livrare**, **recepție**, **reparație** în departamente, **control calitate** și **facturare/arhivare**.

**Scopul de business:**
- Captare automată de lead-uri din Meta (Facebook Lead Ads) și website.
- Gestionarea vânzărilor printr-un pipeline Kanban cu etape: Leaduri, Call back, Nu Răspunde, No Deal, Livrări.
- Urmărirea fișelor de service prin Recepție (colet ajuns, colet neridicat, de facturat, de trimis).
- Distribuția tăvițelor (containere cu instrumente) către departamente specializate: Saloane, Horeca, Frizerii, Reparații.
- Control Calitate (validare) al tăvițelor finalizate.
- Facturare și arhivare la finalizare.

**Utilizatori finali:**
- **Vânzători** – preiau lead-uri, sună clienți, setează call back / nu răspunde / no deal / livrare.
- **Recepție** – gestionează fișe de service, trimit tăvițe în departamente, facturează.
- **Tehnicieni** – lucrează pe tăvițe în departamente, adaugă piese și servicii, finalizează.
- **Admini / Proprietar** – configurări, catalog instrumente/servicii, statistici, backup, gestionare membri.

**Valoare principală:** Un CRM all-in-one care conectează vânzările, logistica, service-ul și facturarea într-un singur tablou Kanban, eliminând procesele pe hârtie și centralizând informația.

---

## 2. Funcții Declanșate Manual (Butoane)

### 2.1 Card Lead – Pipeline Vânzări (`components/kanban/lead-card.tsx`)

| Nume Funcție | Linie | Componentă/UI | Descriere Acțiune |
| :--- | :--- | :--- | :--- |
| `handleCardClick` | ~718 | Click pe card | Deschide panoul de detalii lead / fișă de service (comutare selecție în mod selecție) |
| `handleNoDeal` | ~292 | Buton "No Deal" pe card | Apelează `setLeadNoDeal(leadId)` → setează `no_deal=true`, șterge callback/nu_răspunde, elimină tag-uri → lead mutat în etapa No Deal |
| `handleDeliveryConfirm` | ~325 | Dialog confirmare livrare | Creează fișă de service, adaugă în Recepție (Curier Trimis/Office Direct), mută lead-ul în Vânzări, logare eveniment |
| `handleRemoveCurierTrimis` | ~450 | Buton "X" pe badge Curier Trimis | Elimină flag-ul `curier_trimis` de pe lead și tag-ul asociat |
| `handleRemoveOfficeDirect` | ~475 | Buton "X" pe badge Office Direct | Elimină flag-ul `office_direct` de pe lead și tag-ul asociat |
| `handleToggleAssignTag` | ~210 | Popover tag-uri pe card | Comută un tag pe lead (adaugă/elimină) prin `toggleLeadTag` |
| `handleCheckboxChange` | ~750 | Checkbox selecție în masă | Comută selecția lead-ului pentru operațiuni în masă |
| `handleStageSelect` | ~754 | Dropdown "Mută în etapă" | Mută lead-ul în altă etapă din pipeline (prin `onMove`) |
| `handlePinToggle` | ~785 | Buton pin pe card | Comută pin-ul pe lead (marchează ca prioritar) |
| `handleNuRaspundeToggle` | ~825 | Dropdown "Nu Răspunde" | Comută tag-ul Nu Răspunde pe lead |
| `handleNuAVenitToggle` | ~869 | Dropdown "Nu a Venit" | Comută tag-ul "Nu a Venit" pe lead; setează `colet_neridicat` |
| `handleDeassignTrayTechnician` | ~909 | Buton "X" pe tehnicianul tăviței | Dezatribuie tehnicianul de pe tăviță (resetează `technician_id`) |
| (inline) Eliminare tag Sună! | ~1527 | Buton "X" pe badge Sună! | Elimină tag-ul Sună!, actualizează `suna_acknowledged_at`, logare eveniment |

### 2.2 Tablou Kanban (`components/kanban/kanban-board.tsx`)

| Nume Funcție | Linie | Componentă/UI | Descriere Acțiune |
| :--- | :--- | :--- | :--- |
| `handleDragStart` | ~706 | Drag & Drop card | Începe operațiunea de tragere pe un card |
| `handleDragEnd` | ~710 | Plasare card pe altă etapă | Mută lead-ul/fișa în noua etapă (plasare) |
| `handleSelectAll` | ~1558 | Buton "Selectează tot" | Selectează/deselectează toate cardurile din etapă |
| `handleConfirmDelete` | ~1962 | Dialog confirmare ștergere | Șterge lead-urile selectate (în masă) |
| `handleBulkMove` | ~2026 | Dialog mutare în masă | Mută lead-urile selectate în altă etapă/pipeline |
| `handleOpenMoveDialog` | ~969 | Buton "Mută selecția" | Deschide dialogul de mutare în masă (etapă sau pipeline) |
| (inline) Setare Callback în masă | ~903 | Buton "Call back" în masă | Deschide dialogul callback pentru selecția curentă |
| (inline) Nu Răspunde în masă | ~913 | Buton "Nu Răspunde" în masă | Deschide dialogul Nu Răspunde pentru selecția curentă |
| (inline) No Deal în masă | ~923 | Buton "No Deal" în masă | Setează No Deal pe toate lead-urile selectate |
| (inline) Arhivare | ~1101-1186 | Buton "Arhivare" pe cardul Recepție | Arhivează fișă + tăvițe + lead (etapa De Trimis / Ridic Personal → Arhivat) |

### 2.3 Panou Vânzări (`components/leads/VanzariPanel.tsx`)

| Nume Funcție | Linie | Componentă/UI | Descriere Acțiune |
| :--- | :--- | :--- | :--- |
| `handleCallback` | ~30 | Buton "Call back" | Setează `call_back=true`, `callback_date` pe lead → etapa Call back |
| `handleNuRaspunde` | ~46 | Buton "Nu Răspunde" | Setează `nu_raspunde=true`, `nu_raspunde_callback_at` → etapa Nu Răspunde |
| `handleNoDeal` | ~62 | Buton "No deal" | `setLeadNoDeal(leadId)` → elimină flag-uri, tag-uri, mută în No Deal |
| `handleCurierTrimis` | ~79 | Buton "Curier Trimis" | `setLeadCurierTrimis()` → creează fișă de service, adaugă în Recepție |
| `handleOfficeDirect` | ~97 | Buton "Office Direct" | `setLeadOfficeDirect()` → creează fișă de service, adaugă în Recepție |

### 2.4 Panou Detalii Lead (`components/leads/lead-details-panel.tsx`)

| Nume Funcție | Linie | Componentă/UI | Descriere Acțiune |
| :--- | :--- | :--- | :--- |
| (inline) De Trimis | ~1382 | Buton "De Trimis" | Mută fișa din De Facturat / Nu Răspunde → etapa De Trimis în Recepție |
| (inline) Ridic Personal | ~1397 | Buton "Ridic Personal" | Mută fișa → etapa Ridic Personal în Recepție |

### 2.5 Overlay De Facturat (`components/leads/DeFacturatOverlay.tsx`)

| Nume Funcție | Linie | Componentă/UI | Descriere Acțiune |
| :--- | :--- | :--- | :--- |
| `handleFacturare` | ~428 | Buton Facturare / Facturare+AWB | Apelează `factureazaServiceFile()` → status facturat, mută fișa în Ridic Personal sau De Trimis |
| `handleNuRaspundeConfirm` | ~477 | Dialog Nu Răspunde din overlay | Setează Nu Răspunde pe fișă cu cronometru |
| `handlePinToggle` | ~538 | Buton pin | Comută pin-ul pe fișă |
| `handleRetrimiteInDepartamentSiColetAjuns` | ~559 | Buton "Retrimite în departament" | Retrimite tăvițele în departamente și marchează Colet Ajuns |
| `handlePrintFisa` | ~608 | Buton "Printare fișă" | `window.print()` → printează fișa de service |
| `handlePrintTavite` | ~612 | Buton "Printare tăvițe" | `window.print()` → printează tăvițele |
| (inline) saveBilling | ~1000 | Buton "Salvare facturare" | Salvează datele de facturare (firmă, adresă) |

### 2.6 Acțiuni Vânzări – Detalii Lead (`components/lead-details/actions/LeadVanzariActions.tsx`)

| Nume Funcție | Linie | Componentă/UI | Descriere Acțiune |
| :--- | :--- | :--- | :--- |
| `handleCallback` | ~122 | Buton callback din detalii | Setează callback pe lead cu data/ora aleasă |
| `handleSalvare` | ~171 | Buton "Salvare" | Salvează modificările din panoul de detalii |
| `handleRevenire` | ~177 | Buton "Revenire" | Revine la modificările nesalvate |

### 2.7 Secțiuni Detalii Lead (`components/lead-details/sections/`)

| Nume Funcție | Fișier | Componentă/UI | Descriere Acțiune |
| :--- | :--- | :--- | :--- |
| `handleSave` | `LeadDetailsSection.tsx:89` | Buton "Salvare" detalii | Salvează detaliile lead-ului (text) în BD |
| `handleSave` | `LeadContactInfo.tsx:193` | Buton "Salvare" contact | Salvează informațiile de contact ale lead-ului (telefon, email, adresă) |
| `handleSave` | `LeadTechnicianDetailsSection.tsx:73` | Buton "Salvare" detalii tehnician | Salvează detaliile adăugate de tehnician |

### 2.8 Prețuri – Orchestrator și Vizualizări

| Nume Funcție | Fișier | Descriere Acțiune |
| :--- | :--- | :--- |
| `handleAddInstrumentDirect` | `PreturiOrchestrator.tsx:382` | Adaugă instrument în tăviță (cu verificare departament) |
| `handleSaveEdit` | `TrayTabs.tsx:126` | Salvează editarea numelui/numărului tăviței |
| `handleAssignClick` | `TrayImagesSection.tsx:62` | Atribuie imagine tăviței |
| `handleAddInstrument` | `VanzariViewV4.tsx:1425` | Adaugă instrument în ofertă |
| `handleSave` | `VanzariViewV4.tsx:1639` | Salvează oferta (vizualizare V4) – persistă în BD |
| `handleToggleService` | `VanzariViewV4.tsx:1488` | Comută serviciu pe instrument |
| `handleAddPart` | `VanzariViewV4.tsx:1536` | Adaugă piesă la instrument |
| `handleAddTray` | `VanzariViewV4.tsx:1568` | Adaugă tăviță nouă la fișă |
| `handleRemoveTray` | `VanzariViewV4.tsx:1572` | Elimină tăvița din fișă |
| `handleFacturare` (Recepție) | `ReceptieView.tsx:493` | Facturează fișa din vizualizarea recepție |
| (inline) Trimitere tăvițe | `ReceptieView.tsx:587` | Trimite tăvițele în departamente |
| `handleSubmit` | `SplitTrayTechnicianDialog.tsx:240` | Împarte tăvița între mai mulți tehnicieni |

### 2.9 Pagina Tăviță Tehnician (`app/(crm)/tehnician/tray/[trayId]/page.tsx`)

| Nume Funcție | Linie | Descriere Acțiune |
| :--- | :--- | :--- |
| `handleImageUpload` | ~674 | Încarcă imagine tăviță în Supabase Storage |
| `handleImageDelete` | ~726 | Șterge imaginea din Storage + BD |
| `handleDownloadAllImages` | ~748 | Descarcă toate imaginile tăviței ca zip |
| `handleUrgentChange` | ~773 | Comută urgent pe tăviță |
| `handleStatusChange` | ~793 | Schimbă statusul tăviței: in_receptie → in_lucru → gata → mută etapa în dept |
| `handleAddPart` | ~954 | Adaugă piesă la tăviță |
| `handleAddService` | ~1284 | Adaugă serviciu la tăviță |
| `handleSaveEditService` | ~1431 | Salvează editarea serviciului pe tăviță |
| `handleDeleteItem` | ~1589 | Șterge element (serviciu/piesă) din tăviță |

### 2.10 Configurare Catalog (`app/(crm)/configurari/catalog/page.tsx`)

| Nume Funcție | Linie | Descriere Acțiune |
| :--- | :--- | :--- |
| `handleSaveInstrument` | ~329 | Salvează instrument nou/editat în catalog |
| `handleSaveService` | ~359 | Salvează serviciu nou/editat în catalog |
| `handleDeleteInstrument` | ~382 | Șterge instrument din catalog |
| `handleDeleteService` | ~403 | Șterge serviciu din catalog |
| `handleAddNewInstrument` | ~544 | Creează instrument nou |
| `handleAddNewService` | ~424 | Creează serviciu nou |
| `handleAssociateServices` | ~515 | Asociază servicii cu un instrument |
| `handleRemoveServiceFromInstrument` | ~593 | Dezasociază serviciu de la instrument |

### 2.11 Dashboard și Statistici

| Nume Funcție | Fișier | Descriere Acțiune |
| :--- | :--- | :--- |
| `handleRefresh` | `dashboard/page.tsx:200` | Reîncarcă datele dashboard-ului |
| `handleRefresh` | `statistici-apeluri/page.tsx:167` | Reîncarcă statisticile apelurilor |
| `handleBackfill` | `statistici-apeluri/page.tsx:211` | Completare retroactivă apeluri vânzări (proprietar) |
| `handleAtribuieComenzi` | `statistici-apeluri/page.tsx:227` | Atribuie comenzi vânzătorilor (proprietar) |
| `handleChangePassword` | `profile/page.tsx:165` | Schimbă parola utilizatorului |
| `handleUpdateDisplayName` | `profile/page.tsx:235` | Actualizează numele afișat |

### 2.12 Pagina Kanban Principală (`app/(crm)/leads/[pipeline]/page.tsx`)

| Nume Funcție | Linie | Descriere Acțiune |
| :--- | :--- | :--- |
| `handleLeadClick` | ~1807 | Deschide detalii lead/fișă/tăviță (cu fetch element individual) |
| `handleMove` | ~1356 | Mută lead/fișă în altă etapă (RPC `move_item_to_stage`) |
| `handleBulkMoveToStage` | ~1422 | Mutare în masă în altă etapă |
| `handleBulkMoveToPipeline` | ~1538 | Mutare în masă în alt pipeline |
| `handleBulkMoveToPipelines` | ~1261 | Mută lead-ul în mai multe pipeline-uri |
| `handleBulkMoveCurierAjunsAziToAvemComanda` | ~1520 | Mutare în masă Curier Ajuns Azi → Avem Comandă |

### 2.13 Messenger (`components/leads/lead-messenger.tsx`)

| Componentă | Linie | Descriere Acțiune |
| :--- | :--- | :--- |
| `onSubmit` (formular) | ~923 | Trimite mesaj/notă/imagine în istoricul lead-ului |
| (inline) Atașare imagine tăviță | ~1023 | Atașează imagine din galeria tăviței |
| (inline) Upload din cameră/galerie | ~979/989 | Deschide selectorul de fișiere (cameră sau galerie) |

---

## 3. Funcții Automate (Fundal)

### 3.1 Job-uri Cron (Vercel Cron – `vercel.json`)

| Nume Job | Fișier | Tip | Frecvență | Descriere |
| :--- | :--- | :--- | :--- | :--- |
| **No Deal → Arhivat** | `app/api/cron/midnight-ro/route.ts` | Vercel Cron | `0 22 * * *` (zilnic 22:00 UTC) | Mută lead-urile din etapa No Deal în Arhivat dacă au fost acolo ≥24h. Setează `no_deal=true`, logare în `items_events` |
| **Curier → Avem Comandă** | `app/api/cron/curier-to-avem-comanda/route.ts` | Vercel Cron | `0 1 * * *` (zilnic 01:00 UTC) | Mută lead-urile cu tag Curier Trimis / Office Direct atribuit > 24h din etapa curentă (ex. Curier Ajuns Azi) în Avem Comandă |
| **Colet Neridicat** | `app/api/cron/vanzari-colet-neridicat/route.ts` | Cron (manual/programat) | Zilnic la 23:59 | Găsește `service_files` cu `curier_trimis` mai vechi de 2 zile. Mută lead-urile în Colet Neridicat, setează `no_deal=true`, notifică vânzătorii |
| **Arhivare No Deal** | `app/api/cron/vanzari-archive-no-deal/route.ts` | Cron (manual/programat) | Săptămânal (Duminică 23:59) | Arhivează lead-urile No Deal mai vechi de 30 de zile: mută în `arhiva_fise_serviciu`, șterge din pipeline |
| **Reminder Follow-up** | `app/api/cron/vanzari-followup-reminder/route.ts` | Cron (manual/programat) | Zilnic la 09:00 | Găsește lead-urile cu callback care expiră în 24h, trimite reminder vânzătorilor |
| **Backup automat** | `app/api/cron/backup/route.ts` | Cron (manual/programat) | Orar/Zilnic | Backup automat prin `backupManager` (orar/zilnic/manual) |

### 3.2 Webhook-uri

| Nume | Fișier | Tip | Condiție | Descriere |
| :--- | :--- | :--- | :--- | :--- |
| **Webhook Lead Facebook** | `app/api/leads/facebook-webhook/route.ts` | Webhook (POST) | La fiecare lead nou din Facebook Ads | Primește `leadgen_id`, preia din Graph API, inserează în `leads`, clasificare telefon → Leaduri / Leaduri Străine, adaugă în pipeline-ul Vânzări |
| **Verificare Facebook** | `app/api/leads/facebook-webhook/route.ts` (GET) | Verificare webhook | La configurarea inițială | Verifică `FACEBOOK_VERIFY_TOKEN` pentru abonarea webhook |

### 3.3 Funcții Automate "La Acces" (la încărcarea pipeline-ului)

| Nume | Fișier | Condiție | Descriere |
| :--- | :--- | :--- | :--- |
| **Expirare Callback-uri** | `app/api/leads/expire-callbacks/route.ts` + `lib/supabase/expireCallbacks.ts` | La încărcarea pipeline-ului Vânzări | Mută lead-urile cu `callback_date`/`nu_raspunde_callback_at` expirate din etapele de suprascriere în etapa reală din BD |
| **Expirare Colet Neridicat** | `lib/supabase/expireColetNeridicat.ts` | La accesarea Recepției | Verifică fișele cu `curier_scheduled_at` > 36h, mută în Colet Neridicat |
| **Suprascieri etapă** | `lib/supabase/kanban/strategies/standard.ts` | La fiecare încărcare Kanban Vânzări | Calculează etapa virtuală (No Deal > Call back > Nu Răspunde > Avem Comandă > BD) fără a modifica BD |
| **Elemente virtuale Recepție** | `lib/supabase/kanban/strategies/receptie.ts` | La fiecare încărcare Kanban Recepție | Încarcă fișe cu `office_direct`/`curier_trimis` din BD chiar dacă nu au `pipeline_items`; calculează etapa din starea tăvițelor |
| **Elemente virtuale Calitate** | `lib/supabase/kanban/strategies/quality.ts` | La fiecare încărcare Kanban Calitate | Citește tăvițele din departamente (etapa Finalizată), filtrează cele nevalidate CC, afișează virtual |

### 3.4 Supabase Realtime (Abonări WebSocket)

| Canal | Fișier | Tabel | Descriere |
| :--- | :--- | :--- | :--- |
| `global_history_{leadId}` | `components/leads/lead-history.tsx:1022` | `items_events` (INSERT) | Ascultă evenimente noi pe lead → actualizare automată istoric |
| `tray_events_{trayId}` | `components/leads/lead-history.tsx:1057` | `items_events` (INSERT, filtru tray) | Ascultă evenimente pe tăviță → actualizare istoric tăviță |
| `rt-tags-lead-panel` | `hooks/leadDetails/useLeadDetailsDataLoader.ts:357` | `tags` (toate evenimentele) | Actualizează lista de tag-uri disponibile la modificare |
| `user-notifications-{userId}` | `components/notifications/NotificationBell.tsx:136` | `push_subscriptions` / notifications | Ascultă notificări noi pentru utilizatorul curent |

### 3.5 Hook-uri useEffect cu Logică de Business

| Hook/Componentă | Fișier | Condiție | Descriere |
| :--- | :--- | :--- | :--- |
| Încărcare automată date pipeline | `hooks/useKanbanData.ts:451` | La montare + auth pregătit | Încarcă datele Kanban pentru pipeline-ul curent, setează interval de reîmprospătare |
| Reîmprospătare automată la vizibilitate | `hooks/useKanbanData.ts:799` | `document.visibilityState === 'visible'` | Reîncarcă datele Kanban când tab-ul devine vizibil |
| Reîmprospătare automată la online | `hooks/useKanbanData.ts:463` | Eveniment `navigator.onLine` | Invalidează cache-ul Kanban la reconectarea internetului |
| Încărcare date lead | `hooks/leadDetails/useLeadDetailsDataLoader.ts:162` | Când se schimbă `leadIdMemo` | Încarcă detaliile complete ale lead-ului + fișe + tăvițe + tag-uri |
| Încărcare date Prețuri | `hooks/usePreturiDataLoader.ts:93` | La montare | Încarcă instrumente, servicii, prețuri pentru modulul Prețuri |
| Încărcare flag-uri fișă de service | `hooks/usePreturiEffects.ts:440` | La montare | Încarcă flag-urile fișei (urgent, office_direct, curier_trimis) |
| Restaurare automată ciornă | `app/(crm)/leads/[pipeline]/page.tsx:292` | La montare (cu timeout) | Restaurează ciorna de creare lead din sessionStorage |
| Verificare permisiuni push | `hooks/usePushNotifications.ts:43` | La montare | Verifică permisiunile notificărilor push |
| Debounce căutare | `app/(crm)/leads/[pipeline]/page.tsx:853` | Schimbare `searchQuery` | Debounce 300ms pe căutare, apoi API căutare |

### 3.6 Rute API Automate (apelate de sistem, nu direct de utilizatori)

| Rută | Fișier | Descriere |
| :--- | :--- | :--- |
| `POST /api/leads/expire-callbacks` | `app/api/leads/expire-callbacks/route.ts` | Expirare callback/nu_răspunde (apelat la încărcarea pipeline-ului) |
| `POST /api/leads/move-to-colet-neridicat` | `app/api/leads/move-to-colet-neridicat/route.ts` | Mută fișele în Colet Neridicat (apelat de cron sau la acces) |
| `POST /api/notifications/create` | `app/api/notifications/create/route.ts` | Creează notificări (apelat din logica de business) |
| `DELETE /api/admin/delete-empty-trays` | `app/api/admin/delete-empty-trays/route.ts` | Curăță tăvițele goale (cron sau admin manual) |
| `POST /api/service-files/set-colet-ajuns` | `app/api/service-files/set-colet-ajuns/route.ts` | Marchează fișa ca "colet ajuns" |
| `POST /api/tracking/` | `app/api/tracking/route.ts` | Urmărire evenimente (logare acțiuni) |

---

## 4. Particularități și Arhitectură

### 4.1 Stack Tehnologic

| Tehnologie | Versiune | Rol |
| :--- | :--- | :--- |
| **Next.js** | 16.1.0 | Framework full-stack (App Router) |
| **React** | 19.2.3 | Randare UI |
| **TypeScript** | ^5 | Siguranță de tip |
| **Supabase** | `@supabase/supabase-js ^2.57.3` | BaaS: PostgreSQL, Auth, Realtime, Storage |
| **Tailwind CSS** | ^4.1.9 | Stilizare utility-first |
| **Radix UI** | Multiple (v1.x-2.x) | Componente UI accesibile (dialog, dropdown, popover, etc.) |
| **TanStack React Query** | ^5.90.12 | Gestionare stare server, caching |
| **Recharts** | 2.15.4 | Grafice pentru dashboard/statistici |
| **date-fns** | latest | Manipulare date |
| **Zod** | 3.25.67 | Validare schemă |
| **react-hook-form** | ^7.60.0 | Formulare |
| **web-push** | ^3.6.7 | Notificări push (VAPID) |
| **Vercel** | Țintă deployment | Hosting + Job-uri cron |
| **Lucide React** | ^0.454.0 | Iconițe |
| **sonner** | ^1.7.4 | Notificări toast |
| **vaul** | ^0.9.9 | Componentă drawer (mobil) |
| **cmdk** | 1.0.4 | Paletă de comenzi (căutare Ctrl+K) |

### 4.2 Structura Proiectului

```
app/
├── (crm)/                    # Grup rute protejate (layout cu verificare auth)
│   ├── leads/[pipeline]/     # Pagina Kanban principală (dinamică per pipeline)
│   ├── leads/parteneri/      # Pipeline parteneri
│   ├── admins/               # Gestionare membri/admin
│   ├── configurari/catalog/  # Catalog instrumente + servicii
│   ├── dashboard/            # Dashboard principal + statistici
│   ├── dashboard/tehnician/  # Dashboard tehnician
│   ├── profile/              # Profil utilizator
│   └── tehnician/            # Pagini tehnician (tăviță, dashboard, profil)
├── api/                      # Rute API (Next.js Route Handlers)
│   ├── cron/                 # 6 job-uri cron automate
│   ├── leads/                # Webhook Facebook, expirare callback-uri, simulare
│   ├── vanzari/              # Facturare, statistici, anulare factură
│   ├── admin/                # Backup, sincronizare, ștergere tăvițe goale
│   ├── push/                 # Notificări Web Push
│   ├── search/               # Căutare unificată + tăvițe
│   └── ...
├── auth/sign-in/             # Pagina de autentificare
└── setup/                    # Configurare inițială permisiuni

components/
├── kanban/                   # Tablou Kanban, card lead, card lazy
├── leads/                    # Panouri detalii, overlay-uri, messenger, istoric
├── lead-details/             # Secțiuni detalii (contact, servicii, acțiuni)
├── preturi/                  # Modulul Prețuri (vizualizări, formulare, dialoguri, secțiuni)
├── notifications/            # NotificationBell
└── ui/                       # Componente Shadcn/UI reutilizabile

hooks/
├── leadDetails/              # 8 hook-uri pentru panoul de detalii lead
├── preturi/                  # 6 hook-uri pentru modulul Prețuri
├── queries/                  # Hook-uri React Query (instrumente, servicii, pipeline-uri)
└── ...                       # useKanbanData, usePushNotifications, etc.

lib/
├── supabase/                 # Operațiuni Supabase
│   ├── kanban/               # Strategii pipeline (standard, recepție, departament, calitate)
│   │   ├── strategies/       # Strategy Pattern per pipeline
│   │   ├── cache.ts          # Mecanism de cache pentru etape/pipeline-uri
│   │   ├── fetchers.ts       # Funcții fetch centralizate
│   │   └── transformers.ts   # Transformare date brute → KanbanItem
│   ├── leadOperations.ts     # CRUD lead-uri
│   ├── serviceFileOperations.ts # CRUD fișe de service
│   ├── pipelineOperations.ts # Mutări elemente, adăugare în pipeline
│   ├── tagOperations.ts      # CRUD tag-uri
│   └── ...
├── vanzari/                  # Logică de business Vânzări
│   ├── leadOperations.ts     # setLeadNoDeal, setLeadCurierTrimis, setLeadOfficeDirect
│   ├── facturare.ts          # factureazaServiceFile
│   ├── priceCalculator.ts    # Calcul prețuri
│   └── statistics.ts         # Statistici vânzări
├── types/                    # Tipuri TypeScript (database.ts, preturi.ts)
├── history/                  # Snapshot-uri fișe, cache ciorne
├── push/                     # sendPush (Web Push)
├── contexts/                 # AuthContext (provider autentificare + roluri)
├── dataSafety/               # Manager backup, framework validare
└── tracking/                 # Urmărire evenimente + stivuire
```

**De ce este organizat astfel:**
- **App Router (Next.js 16)**: Grupuri de rute (`(crm)`) pentru layout-uri protejate prin auth.
- **Strategy Pattern** pentru pipeline-urile Kanban: fiecare pipeline (Vânzări, Recepție, Departament, Calitate) are propria strategie de încărcare a elementelor, permițând logică diferită per context.
- **Hook-uri personalizate granulare** per funcționalitate: hook-urile `leadDetails/` și `preturi/` sunt descompuse pentru reutilizabilitate și separarea preocupărilor.
- **Separare `lib/vanzari/` vs `lib/supabase/`**: logica de business (vânzări, facturare) este separată de accesul la date (operațiuni supabase).

### 4.3 Autentificare și Autorizare

- **Supabase Auth** cu `@supabase/ssr` și `@supabase/auth-helpers-nextjs`.
- **Middleware** (`middleware.ts`): interceptează toate request-urile non-API, non-statice; apelează `getSession()` cu timeout de 3s pentru reîmprospătarea cookie-urilor.
- **AuthContext** (`lib/contexts/AuthContext.tsx`): Provider React care expune `user`, `profile`, `role`, `permissions`.
- **6 roluri**: `owner`, `admin`, `member`, `vanzator`, `receptie`, `tehnician`.
- **Permisiuni per pipeline**: stocate în BD (`pipeline_permissions`); utilizatorii văd doar pipeline-urile la care au acces.
- **Redirecționare**: `app/(crm)/layout.tsx` redirecționează la `/auth/sign-in` dacă nu există utilizator.

### 4.4 Gestionarea Stării

- **React Query** (`@tanstack/react-query`): pentru date server (instrumente, servicii, pipeline-uri, tehnicieni) – hook-uri în `hooks/queries/`.
- **React `useState` + `useCallback`**: stare locală în componente și hook-uri personalizate.
- **AuthContext**: stare globală pentru autentificare/roluri.
- **Cache personalizat**: `lib/supabase/kanban/cache.ts`, `kanbanCache.ts`, `receptieCache.ts`, `vanzariCache.ts`, `departmentCache.ts` – cache in-memory cu TTL de 60s pentru datele Kanban.
- **SessionStorage**: pentru ciorna de creare lead, restaurare la navigare.
- **Stare URL**: `?q=` pentru căutare, `?lead=` / `?tray=` pentru deep linking la elemente.

### 4.5 Observații Speciale

- **Potrivire tipare pentru etape**: Codul nu se bazează pe ID-uri hardcodate pentru etape, ci pe **tipare de nume** (ex.: `['in lucru', 'in work', 'în lucru']`). Aceasta permite flexibilitate la redenumirea etapelor în BD. Definite în `lib/supabase/kanban/constants.ts`.

- **Elemente virtuale**: Control Calitate și Recepția afișează elemente care **nu există** în `pipeline_items` – sunt calculate la runtime din starea tăvițelor în departamente.

- **Suprascieri etapă**: În Vânzări, etapa afișată pe un card poate diferi de etapa din BD (ex.: un lead cu `call_back=true` apare în Call back indiferent de `pipeline_items.stage_id`).

- **RPC-uri Supabase**: `move_item_to_stage` – funcție server-side pentru mutări atomice cu logare. Apelată atât din UI cât și din job-urile cron.

- **For loop în loc de .some()**: Codul conține un tipar deliberat de folosire a buclelor `for` în loc de `.some()` / `.find()` cu comentariul "MAI SIGUR" – posibil pentru depanare sau evitarea unui bug anterior cu metodele de array.

- **Variabile de mediu critice**:
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Conexiune Supabase
  - `SUPABASE_SERVICE_ROLE_KEY` – Acces admin Supabase (doar server-side)
  - `FACEBOOK_PAGE_ACCESS_TOKEN` / `FACEBOOK_VERIFY_TOKEN` – Integrare Meta
  - `DEFAULT_PIPELINE_ID` / `DEFAULT_STAGE_ID` / `LEADURI_STRAINA_STAGE_ID` – ID-uri Pipeline/Etapă pentru webhook Facebook
  - `CRON_SECRET` / `CRON_SECRET_KEY` – Autentificare job-uri cron
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` – Notificări Web Push
  - `SIMULATE_FACEBOOK_SECRET` – Secret pentru simulare webhook (dev)

- **Notificări Web Push**: Implementare completă cu VAPID `web-push`, abonare browser, componentă `NotificationBell`, abonare salvată în Supabase.

- **Caching agresiv**: Strategiile Kanban folosesc cache in-memory cu TTL scurt (60s) + invalidare la evenimentele `visibilitychange` și `online`.

- **Abonări Realtime**: Supabase Realtime pe `items_events` și `tags` pentru actualizări live ale istoricului și tag-urilor.

- **Print**: Funcționalitate de printare pentru fișe de service și tăvițe (CSS print media queries + `window.print()`).

- **Suport mobil**: Hook `use-mobile.ts` detectează breakpoint, componente adaptive (`MobileItemsView`, `MobileItemCard`, `MobileBrandSerialSection`), `use-swipe.ts` pentru gesturi tactile.

---

## 5. Detalii Suplimentare (Analiză Secundară)

Această secțiune acoperă subsisteme, rute API, module de business și tabele de bază de date care nu au fost detaliate în secțiunile anterioare.

### 5.1 Sistem Complet de Facturare (`lib/vanzari/facturare.ts`)

Fluxul de facturare este complex și atomic:

1. **Validare precondiții** – `validateForFacturare(serviceFileId)` verifică că fișa există, nu este deja facturată, are tăvițe, etc.
2. **Calcul total final** – `calculateServiceFileTotal(serviceFileId)` prin `lib/vanzari/priceCalculator.ts`:
   - Calcul per element: `prețUnitar × cantitate`, discount per element (%), markup urgent (+30% dacă `isUrgent`).
   - Calcul per tăviță: subtotal, total discounturi elemente, total discounturi urgență.
   - Calcul per fișă: totaluri tăvițe, discount global (%), total final.
   - Tipuri: `ItemTotalCalculation`, `TrayTotalCalculation`, `ServiceFileTotalCalculation`.
3. **Generare număr factură** – RPC `generate_factura_number` (funcție PostgreSQL care generează un număr secvențial).
4. **Actualizare service_file** – status → `facturata`, `is_locked → true`, `factura_number`, `factura_date`, `total_final`, `metoda_plata`.
5. **Arhivare** – RPC `archive_service_file` → salvează snapshot în `arhiva_fise_serviciu`.
6. **Curățare tăvițe din pipeline** – RPC `clear_tray_positions_after_facturare` → elimină tăvițele din `pipeline_items` departamentelor.
7. **Logare** – inserează `items_events` cu detaliile facturării.

**Anulare factură** (`anuleazaFactura`): doar admin/proprietar, necesită motiv obligatoriu, deblochează fișa, resetează statutul, logare.

### 5.2 Sistem Sesiuni de Lucru Tehnicieni (`lib/supabase/workSessionOperations.ts`)

- **`startWorkSession(trayId, technicianId)`** – RPC `start_work_session`: pornește cronometrul; dacă o sesiune activă există deja, returnează ID-ul acesteia.
- **`finishWorkSession(trayId, technicianId)`** – RPC `finish_work_session`: oprește cronometrul, salvează `finished_at`.
- **`getWorkSessionMinutesForRange(technicianId, start, end)`** – RPC `get_technician_work_minutes`: returnează minutele lucrate într-un interval.
- Tabel `technician_work_sessions`: `id, tray_id, technician_id, started_at, finished_at, notes`.
- API `PATCH /api/work-sessions/[id]`: doar proprietarul poate modifica `started_at`/`finished_at` (corecție manuală).

### 5.3 Dashboard Tehnician (`lib/supabase/tehnicianDashboard.ts` – ~2100 linii)

Modul dashboard extins cu:
- **Agregare tăvițe per tehnician**: Nouă, În Lucru, În Așteptare, Finalizată, De Trimis, Ridic Personal.
- **Cache ID-uri etape** cu `tehnicianDashboardStageIdsCache.ts` (tipar single-flight pentru evitarea cererilor duplicate).
- **Fetch în masă** prin `tehnicianDashboardBulk.ts` – RPC `get_technician_dashboard_bulk` (un singur apel BD în loc de N apeluri per tehnician).
- **Timp estimat proporțional** (`lib/utils/estimatedTimeCalculator.ts`): calculează procentul de instrumente atribuite tehnicianului din totalul tăviței, apoi timpul estimat proporțional.
- **Ore lucrate** din `technician_work_sessions`, parsate cu `lib/utils/service-time.ts`.

### 5.4 Statistici Avansate Vânzări (`lib/vanzari/advancedStatistics.ts`)

API: `GET /api/vanzari/statistics` (permisiuni: vanzator/admin/owner).

Statistici calculate:
- **Timp până la Închidere**: medie/mediană/min/max timp de la lead la factură; distribuție pe intervale (< 7 zile, 7-14, 15-30, > 30).
- **Top Vânzători**: clasament vânzători cu total facturi, venituri, medie per factură, rată de conversie.
- **Analiză Discounturi**: total discount acordat, medie %, distribuție pe tipuri (element/urgent/global), top ofertanți de discounturi.
- **Metode de Plată**: distribuție numerar/card (număr, total, procent).

### 5.5 Statistici Tehnicieni (`lib/supabase/technicianStatisticsService.ts`)

Clasa `TechnicianStatisticsService` cu cache TTL 5 min:
- Timp total/mediu de lucru
- Câștiguri (câștiguri per piesă/serviciu)
- Tăvițe procesate (cu detalii tăvițe împărțite)
- Timp de așteptare per tăviță
- Metrici de eficiență

### 5.6 Dashboard Principal (`lib/supabase/dashboardOperations.ts`)

Metrici agregate pe interval (zi/săptămână/lună/3 luni/6 luni/an):
- `totalLeads`, `totalRevenue`, `urgentLeads`, `newLeadsToday`
- `leadsByPipeline`, `leadsByStage`, `revenueByPipeline`, `revenueByStage`
- `leadsOverTime`, `topTechnicians`, `tagDistribution`, `conversionRate`
- Calcularea `trayStageTimeStats` (timp în fiecare etapă per tăviță).

**Notă**: Dashboard-ul principal este în prezent **dezactivat** (`DASHBOARD_MAIN_ACTIVE = false`) – utilizatorii sunt direcționați către Dashboard-ul Tehnicianului sau Statisticile Apelurilor.

### 5.7 Sistem de Căutare Unificată

- **`GET /api/search/unified?q=...`** → `lib/supabase/unifiedSearchServer.ts` → RPC `search_unified`:
  - Caută în paralel: lead-uri, fișe de service, tăvițe.
  - Returnează `{ type, id, title, subtitle, pipelineSlug, openId }`.
  - Limită query: 200 caractere, minim 2 caractere.
- **`GET /api/search/trays?q=...`** → `lib/supabase/traySearchServer.ts` → `searchTraysGloballyWithClient`:
  - Caută tăvițe după: număr tăviță, numere de serie, mărci.

### 5.8 Sistem de Notificări

#### Web Push (VAPID)
- **`lib/push/sendPush.ts`** – `sendPushToUser(userId, payload)`: trimite notificare push la toate abonările utilizatorului prin VAPID `web-push`.
- **`POST /api/push/subscribe`** – salvează abonarea browser-ului (endpoint, p256dh, auth) în `push_subscriptions`, upsert pe endpoint.
- **`POST /api/push/test`** – trimite o notificare de test utilizatorului curent.
- **`GET /api/push/vapid-public`** – returnează cheia publică VAPID.
- **`GET /api/push/status`** – verifică dacă push-ul este configurat.
- **`GET /api/push/config-check`** – verificare completă configurare VAPID.

#### Notificări In-App
- **`lib/supabase/notificationOperations.ts`** – CRUD Notificări:
  - 7 tipuri: `tray_received`, `tray_passed`, `tray_completed`, `tray_urgent`, `service_assigned`, `message_received`, `system`.
  - `createNotification(params)` – creare prin rută API cu service role (ocolește RLS).
  - `getNotifications(userId)`, `markAsRead(id)`, `markAllAsRead(userId)`, `getUnreadCount(userId)`, `deleteNotification(id)`.
- **`components/notifications/NotificationBell.tsx`** – Componentă UI: iconită clopoțel cu badge număr, dropdown cu lista notificărilor, abonare/dezabonare push.

### 5.9 Sistem de Urmărire (`lib/tracking/`)

- **`eventTracker.ts`** – Urmărire globală evenimente prin **delegare evenimente** la nivel de document:
  - Urmărire automată click-uri buton/link (detectează `data-button-id`, `name`, `aria-label`, text, etc.).
  - Urmărire modificări input (input, textarea, select, checkbox, etc.) cu `valoare veche → valoare nouă`.
  - Loturi trimise la `POST /api/tracking` (suportă `{ batch: true, events: [...] }`).
- **`eventStacker.ts`** – Grupare evenimente similare pentru istoric (afișare compactă).
- **`POST /api/tracking`** – Primește și logare evenimente; în dezvoltare afișează în consolă.

### 5.10 Sistem Backup și Validare (`lib/dataSafety/`)

#### Manager Backup (`backupManager.ts`)
- Clasa `BackupManager` cu:
  - `createBackup(type: 'hourly' | 'daily' | 'manual')` – export complet al tuturor tabelelor BD (limită 10.000 rânduri/tabel).
  - Salvat pe disc în `backups/database/` cu metadate (timestamp, tabele, dimensiune, checksum).
  - Retenție: orar 24h, zilnic 7 zile; curățare automată.
  - API: `POST /api/cron/backup` (declanșare automată) + `POST /api/admin/backup` (manual).
  - UI: `components/admin/BackupManager.tsx` (manager cu descărcare).

#### Framework Validare (`validationFramework.ts`)
- **3 straturi de validare** cu Zod:
  - **Stratul 1: Client** – Scheme Zod pentru: `leadSchema`, `stageChangeSchema`, `serviceFileSchema`, `callbackSchema`, `messageSchema`.
  - **Stratul 2: Edge/API** – Middleware de validare în handler-ele de rute.
  - **Stratul 3: Server** – Validare prin Supabase RLS/trigger-e.

### 5.11 Sistem Arhivare Fișe de Service (`lib/supabase/serviceFileArchiveServer.ts`)

API: `POST /api/service-files/archive-and-release` – arhivare + eliberare tăvițe într-un singur request (reduce 6-8 apeluri la 1):

1. Verificare existență fișă + idempotență (dacă este deja arhivată, continuă cu restul fluxului).
2. `archiveServiceFileToDbServer` – salvează snapshot în `arhiva_fise_serviciu` cu: istoric etape tăvițe, items_events, elemente tăviță.
3. `syncLeadUrgentReturTagsFromActiveServiceFiles` – sincronizează tag-urile lead-ului (Urgent, Retur) pe baza fișelor active rămase.
4. `releaseTraysOnArchiveServer` – RPC `release_trays_on_archive`: eliberează tăvițele din departamente.
5. `moveItemsToArhivarePipelineServer` – mută fișa, lead-ul și tăvițele în etapele Arhivat din Recepție / Vânzări.

### 5.12 Snapshot Istoric Fișă de Service (`lib/history/serviceFileSnapshot.ts`)

La apăsarea "Salvează în Istoric", se creează un **snapshot complet** al fișei:
- Tipuri client: Urgent, Abonament, Fără Abonament, Office Direct, Curier Trimis, Retur.
- Linii instrumente: număr tăviță, nume instrument, numere de serie, cantitate, discount, garanție, preț, total.
- Linii servicii: nume, preț, cantitate, discount, total.
- Linii promoții: nume, preț, cantitate, total.
- Info tăviță: număr, număr elemente.
- Totaluri: subtotal, discount global, total final.
- Salvat ca înregistrare în BD pentru vizualizare ulterioară.

### 5.13 Gestionare Imagini Tăvițe (`lib/supabase/imageOperations.ts`)

- **Supabase Storage**: bucket `tray_images`.
- `uploadTrayImage(trayId, file)` – încarcă în `tray_images/{trayId}/{timestamp}.{ext}`, returnează URL public.
- `deleteTrayImage(filePath)` – șterge din Storage.
- `listTrayImages(trayId)` – interoghează tabela `tray_images` + URL-uri Storage.
- `saveTrayImageRecord(trayId, url, filename, filePath)` – inserează în tabela `tray_images`.
- `deleteTrayImageRecord(imageId)` – ștergere soft din `tray_images`.

### 5.14 Permisiuni Pipeline (`lib/supabase/pipelinePermissions.ts`)

- `grantPipelineAccess(userId, pipelineId)` – inserează în `user_pipeline_permissions` (ignoră duplicatele).
- `revokePipelineAccess(userId, pipelineId)` – șterge din `user_pipeline_permissions`.
- `getUserPipelinePermissions(userId)` – RPC `get_user_pipeline_permissions`.
- Folosit din pagina Admin (`app/(crm)/admins/page.tsx`).

### 5.15 Pagina Admin (`app/(crm)/admins/page.tsx`)

Pagină centrală de administrare cu componente dinamice (încărcare lazy):
- **OverviewDashboard** – statistici generale (lead-uri, fișe, tăvițe).
- **MemberTable + MemberDetailsModal** – gestionare membri: creare conturi, resetare parole, atribuire roluri, permisiuni pipeline.
- **BackupManager** – creare/descărcare backup-uri.
- **TrayPipelineAssigner** – atribuire manuală tăviță-la-pipeline.
- **TrayFileFinder** – căutare tăvițe și fișe de service.
- **PipelineItemsManager** – gestionare directă `pipeline_items`.
- **MoveLeadsWithServiceFilesToOldStageButton** – instrument admin pentru corectarea etapelor.
- **Creare utilizator**: parolă implicită `Welcome123`, roluri disponibile: owner, admin, member, vanzator, receptie, tehnician.

### 5.16 Împărțire Tăviță / Unificare Tăviță (`lib/supabase/serviceFileOperations.ts`)

- **Împărțire tăviță** – RPC `split_tray_to_real_trays`: împarte o tăviță între mai mulți tehnicieni, creând tăvițe separate cu instrumente distribuite.
- **Unificare tăvițe împărțite** – RPC `merge_split_trays_if_all_finalized`: când toate tăvițele împărțite sunt finalizate, le consolidează înapoi.
- **Consolidare elemente tăviță** – RPC `consolidate_tray_items`: consolidează elementele duplicate dintr-o tăviță.
- UI: `components/preturi/dialogs/SplitTrayTechnicianDialog.tsx`.

### 5.17 Funcții RPC PostgreSQL Identificate

| Funcție RPC | Descriere |
| :--- | :--- |
| `move_item_to_stage` | Mutare atomică element (lead/fișă/tăviță) în altă etapă + logare stage_history |
| `generate_factura_number` | Generare secvențială număr factură |
| `archive_service_file` | Arhivare snapshot fișă de service |
| `clear_tray_positions_after_facturare` | Curățare tăvițe din pipeline după facturare |
| `release_trays_on_archive` | Eliberare tăvițe din departamente la arhivare |
| `start_work_session` | Pornire sesiune lucru tehnician (idempotent) |
| `finish_work_session` | Oprire sesiune lucru |
| `get_technician_work_minutes` | Minute lucrate într-un interval |
| `get_technician_dashboard_bulk` | Date dashboard tehnician într-un singur apel |
| `get_expired_callback_leads` | Lead-uri cu callback expirat |
| `get_expired_nu_raspunde_leads` | Lead-uri cu nu_răspunde expirat |
| `get_user_pipeline_permissions` | Permisiuni pipeline per utilizator |
| `get_pipeline_options` | Opțiuni pipeline disponibile |
| `get_dashboard_stats` | Statistici agregate dashboard |
| `get_vanzari_apeluri_counts_by_month` | Numărări apeluri vânzări pe lună |
| `search_unified` | Căutare unificată lead/fișă/tăviță |
| `split_tray_to_real_trays` | Împărțire tăviță între tehnicieni |
| `merge_split_trays_if_all_finalized` | Unificare tăvițe finalizate împărțite |
| `consolidate_tray_items` | Consolidare elemente duplicate |
| `increment_seller_statistic` | Incrementare statistică vânzător |
| `update_pipeline_and_reorder_stages` | Actualizare pipeline + reordonare etape |

### 5.18 Tabele Suplimentare din Modelul de Date

| Tabel | Descriere |
| :--- | :--- |
| `user_profiles` | Profil utilizator: user_id, name, email, role, created_at |
| `user_pipeline_permissions` | Permisiuni pipeline per utilizator |
| `push_subscriptions` | Abonări Web Push: endpoint, p256dh, auth, user_agent |
| `notifications` | Notificări in-app: type, title, message, data, read, read_at |
| `technician_work_sessions` | Sesiuni de lucru: tray_id, technician_id, started_at, finished_at |
| `tray_images` | Imagini tăvițe: tray_id, url, filename, file_path |
| `tray_items` | Elemente tăvițe: instrument_id, service_id, quantity, price, discount, tray_id |
| `instruments` | Catalog instrumente: name, department, price, etc. |
| `services` | Catalog servicii: name, price, estimated_time |
| `instrument_services` | Asociere instrument–serviciu (many-to-many) |
| `parts` | Piese: name, price, quantity |
| `tags` | Tag-uri disponibile: name, color |
| `arhiva_fise_serviciu` | Arhivă fișe facturate: snapshot complet la momentul facturării |
| `vanzari_apeluri` | Jurnal apeluri/mișcări vânzări: lead_id, seller_id, action, etc. |
| `tracking_events` | Evenimente urmărire UI (opțional) |
| `seller_statistics` | Statistici agregate per vânzător |

### 5.19 Rută API Suplimentară – Tag "Sună!" (`GET /api/vanzari/add-suna-tag`)

Proces de fundal care poate rula ca un cron (recomandat: în fiecare oră):
1. Apelează RPC `get_expired_callback_leads` → lead-uri din Call Back cu callback expirat.
2. Apelează RPC `get_expired_nu_raspunde_leads` → lead-uri din Nu Răspunde cu timp expirat.
3. Adaugă tag-ul "Sună!" (roșu) pe toate lead-urile găsite → semnal vizual pe card că este necesar un apel.

### 5.20 Messenger și Comunicare (`components/leads/lead-messenger.tsx`)

Sistem de mesagerie internă pe lead-uri:
- Mesaje text, note și imagini.
- Suport cameră/galerie pe mobil.
- Atașare imagini din galeria tăviței.
- Istoric cronologic cu stivuire (grupare evenimente similare prin `lib/tracking/eventStacker.ts`).
- Istoric lead cu Supabase Realtime (actualizare live la INSERT în `items_events`).

### 5.21 Flag-ul `DASHBOARD_MAIN_ACTIVE`

Dashboard-ul principal (`app/(crm)/dashboard/page.tsx`) este dezactivat prin constanta `DASHBOARD_MAIN_ACTIVE = false`. Afișează un placeholder "În dezvoltare". Utilizatorii sunt direcționați către:
- **Dashboard Tehnician** (`app/(crm)/dashboard/tehnician/page.tsx`) – activ, cu statistici per tehnician.
- **Statistici Apeluri** (`app/(crm)/dashboard/statistici-apeluri/page.tsx`) – activ, cu statistici vânzări.

### 5.22 Parteneri (`app/(crm)/leads/parteneri/page.tsx`)

Pipeline separat pentru parteneri. Funcționalitate similară cu Kanban-ul principal dar cu:
- Filtrare specifică pe etapele partenerilor.
- Modal detalii lead cu context partener.
- Redirecționare bazată pe rol dacă utilizatorul nu are acces.

---

*Supliment raport – analiză secundară completă a proiectului Ascutzit CRM.*
