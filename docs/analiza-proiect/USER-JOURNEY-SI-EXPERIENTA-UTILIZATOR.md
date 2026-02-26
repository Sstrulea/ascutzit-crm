# User Journey și Experiență Utilizator – Ascutzit CRM

---

## 1. Ecrane Principale / Vizualizări

Pe baza analizei codului, aplicația CRM are următoarea hartă de ecrane:

```
┌─────────────────────────────────────────────────────────────────────┐
│  /auth/sign-in                                                       │
│  ┌────────────┐                                                      │
│  │  LOGIN     │  Username + Parolă → redirecționare la pipeline-ul   │
│  │            │  implicit                                            │
│  └────────────┘                                                      │
└───────────┬─────────────────────────────────────────────────────────┘
            │ Auth OK
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SHELL (layout.tsx)                                                  │
│  ┌──────────┐  ┌──────────────────────────────────────────────────┐ │
│  │ SIDEBAR  │  │  HEADER: SmartTraySearch + NotificationBell     │ │
│  │          │  ├──────────────────────────────────────────────────┤ │
│  │ Link-uri │  │                                                  │ │
│  │ pipeline │  │  ZONĂ CONȚINUT (children)                       │ │
│  │          │  │                                                  │ │
│  │ Dashboard│  │  Kanban / Detalii / Dashboard / Admin            │ │
│  │ Admin    │  │                                                  │ │
│  │ Profil   │  │                                                  │ │
│  └──────────┘  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Lista ecranelor identificate în cod

| Ecran | Rută | Componente Cheie | Rol Utilizator |
| :--- | :--- | :--- | :--- |
| **Autentificare** | `/auth/sign-in` | Căutare username → email → Supabase Auth | Toți |
| **Pipeline Kanban** | `/leads/[pipeline]` | `kanban-board.tsx`, `lead-card.tsx` | Per permisiuni |
| **Detalii Lead** (panou lateral) | (slide-over pe Kanban) | `lead-details-panel.tsx`, tab-uri (Detalii, Contact, Prețuri, Mesaje) | Vânzători, Recepție |
| **Overlay De Facturat** | (dialog peste Kanban) | `DeFacturatOverlay.tsx` | Recepție, Admin |
| **Overlay Nu Răspunde** | (dialog peste Kanban) | `NuRaspundeOverlay.tsx` | Recepție |
| **Modul Prețuri** | (tab în detalii lead) | `PreturiOrchestrator.tsx`, `PreturiMain.tsx`, `VanzariViewV4.tsx`, `ReceptieView.tsx` | Vânzători, Recepție |
| **Pagina Tăviță Tehnician** | `/tehnician/tray/[trayId]` | Upload imagini, servicii, piese, status, sesiuni de lucru | Tehnicieni |
| **Dashboard Tehnician** | `/dashboard/tehnician` | Tăvițe per tehnician, ore lucrate, tăvițe finalizate | Admin, Proprietar |
| **Statistici Apeluri** | `/dashboard/statistici-apeluri` | Grafice, completare retroactivă, atribuire | Admin, Proprietar |
| **Catalog Instrumente** | `/configurari/catalog` | CRUD instrumente + servicii | Admin, Proprietar |
| **Admin / Membri** | `/admins` | MemberTable, BackupManager, PipelineItemsManager | Admin, Proprietar |
| **Profil** | `/profile` | Schimbare parolă, nume afișat, preferințe | Toți |
| **Pipeline Parteneri** | `/leads/parteneri` | Kanban cu lead-uri parteneri | Cu acces |
| **Detalii Lead Mobil** | (sheet full-screen) | `lead-details-sheet.tsx` | Toți (mobil) |
| **Configurare** | `/setup` | Configurare inițială permisiuni | Proprietar (prima rulare) |

---

## 2. Scenarii Principale (Happy Path)

### 2.1 Scenariu: Vânzătorul procesează un lead nou

**Actor:** Vânzător  
**Durată estimată:** 2-5 minute per lead

```
1. AUTENTIFICARE
   └─ Vânzătorul deschide CRM-ul → /auth/sign-in
   └─ Introduce username + parolă → Redirecționare la pipeline-ul Vânzări

2. VIZUALIZARE KANBAN VÂNZĂRI
   └─ Vede tabloul Kanban cu etapele: Leaduri, Leaduri Straine,
      Call Back, Nu Răspunde, No Deal, Livrări,
      Curier Ajuns Azi, Avem Comandă, Arhivat
   └─ Un card nou apare în "Leaduri" (automat din Facebook Ads)
   └─ Cardul afișează: Nume, Telefon, Campanie, Tag-uri, Cronometru

3. CLICK PE CARD → DETALII LEAD (panou lateral)
   └─ Se deschide panoul de detalii: Header (Nume, Telefon, Email, Tag-uri)
   └─ Tab-uri: Detalii | Contact | Prețuri | Mesaje | Istoric
   └─ Vânzătorul citește detaliile clientului (completate automat din Facebook)

4. APEL CLIENT → DECIZIE
   └─ Sună clientul. Pe baza conversației, alege una din acțiuni:

   4a. CLIENTUL VREA SERVICE → "Curier Trimis" sau "Office Direct"
       └─ Apasă butonul "Curier Trimis" pe card (sau din panoul de detalii)
       └─ Dialog confirmare: alege Data Curier + opțional Urgent/Retur
       └─ Click "Confirmă" → Sistemul automat:
          • Creează o fișă de service (cu număr secvențial)
          • Mută lead-ul în etapa "Curier Trimis" (Vânzări)
          • Adaugă fișa de service în pipeline-ul Recepție (etapa "Curier Trimis")
          • Adaugă tag-ul "Curier Trimis" pe lead
          • Logare în istoric
       └─ Toast: "Curier Trimis marcat. Fișă de service creată."
       └─ Cardul se mută vizual în noua etapă

   4b. CLIENTUL NU RĂSPUNDE → "Nu Răspunde"
       └─ Apasă butonul ☎✕ pe card
       └─ Dialog: alege ora la care să sune din nou
          (Opțiuni rapide: 10 min, 15 min, 30 min, 1h, 2h, 3h, sau personalizat)
       └─ Click "Confirmă"
       └─ Cardul se mută în etapa "Nu Răspunde"
       └─ Când timpul expiră, cron-ul adaugă tag-ul "Sună!" (roșu) pe card

   4c. CLIENTUL VREA SĂ SUNE MAI TÂRZIU → "Call Back"
       └─ Apasă butonul 📞 pe card
       └─ Dialog: alege data (Mâine, 3 zile, Săptămână, Lună, 3 luni, Calendar)
          + ora callback
       └─ Click "Confirmă"
       └─ Cardul se mută în etapa "Call Back" cu badge-ul datei afișat
       └─ Când data expiră, lead-ul revine automat la etapa originală

   4d. CLIENTUL NU VREA → "No Deal"
       └─ Apasă butonul ✕ pe card
       └─ Lead-ul se mută în etapa "No Deal"
       └─ După 24h (cron midnight-ro), mutat automat în "Arhivat"
       └─ După 30 de zile (cron archive), arhivat permanent

5. CONTINUARE
   └─ Vânzătorul trece la următorul card din "Leaduri"
```

---

### 2.2 Scenariu: Recepția procesează o fișă de service

**Actor:** Recepție  
**Durată estimată:** 5-15 minute per fișă de service

```
1. VIZUALIZARE KANBAN RECEPȚIE
   └─ Recepția vede fișele în: Curier Trimis, Office Direct,
      Colet Neridicat, Colet Ajuns,
      În Lucru, În Așteptare, De Facturat,
      Nu Răspunde, De Trimis, Ridic Personal,
      Arhivat
   └─ O fișă nouă apare în "Curier Trimis" (creată automat de Vânzător)

2. CLICK PE CARD → DETALII FIȘĂ
   └─ Panou lateral cu: Header (Nr. Fișă, Client, Telefon, Tag-uri)
   └─ Secțiuni: Detalii, Contact + Facturare, Prețuri (tăvițe), Mesaje

3. COMPLETARE PREȚURI (Tab Prețuri)
   └─ Selectează/creează tăviță (#1, #2, etc.)
   └─ Adaugă instrumente: caută în catalog → selectează → adăugat cu preț
   └─ Adaugă servicii per instrument: comută serviciile disponibile
   └─ Adaugă mărci + numere de serie + garanție per instrument
   └─ Opțional: adaugă piese de schimb
   └─ Opțional: setează discount per element sau global

4. SALVARE ȘI TRIMITERE TĂVIȚE
   └─ Apasă "Salvare" → datele persistă în BD
   └─ Marchează "Colet Ajuns" (clientul a adus instrumentele)
   └─ Apasă "Trimite tăvițe în departamente"
      └─ Sistemul determină automat departamentul din instrumente
         (Saloane / Horeca / Frizerii / Reparații)
      └─ Dacă lead-ul are tag Retur → tăvița merge în etapa "Retur"
      └─ Altfel → etapa "Nouă"
   └─ Toast: "Tăvițele au fost trimise în departamente"
   └─ Fișa se mută automat în "Colet Ajuns" / "În Lucru"

5. AȘTEPTARE TEHNICIENI
   └─ Fișa se mută automat prin etape:
      • "În Lucru" – cel puțin o tăviță este luată de un tehnician
      • "În Așteptare" – tăviță pusă în așteptare
      • "De Facturat" – toate tăvițele finalizate + CC validate

6. FACTURARE (Overlay De Facturat)
   └─ Click pe cardul "De Facturat" → se deschide overlay-ul
   └─ Vede: lista tăvițelor, total calculat, discount global, date facturare
   └─ Completează datele de facturare (firmă, CUI, adresă) dacă lipsesc
   └─ Alege: "Ridic Personal" (clientul vine la sediu) sau
            "De Trimis (AWB)" (trimis prin curier)
   └─ Sistemul: calculează totalul final, generează număr factură, arhivează,
      mută fișa în etapa aleasă
   └─ Toast: "Fișa facturată. Cardul mutat în De Trimis."

7. ARHIVARE
   └─ Când clientul ridică / curierul colectează → Recepția apasă "Arhivează"
   └─ Fișă + lead → etapa Arhivat
```

---

### 2.3 Scenariu: Tehnicianul lucrează pe o tăviță

**Actor:** Tehnician  
**Durată estimată:** 15 min – câteva ore per tăviță

```
1. VIZUALIZARE KANBAN DEPARTAMENT (ex.: Saloane)
   └─ Tehnicianul vede tăvițele: Nouă, Retur, În Lucru,
      În Așteptare, Finalizată
   └─ Vede doar tăvițele atribuite lui + cele neatribuite (filtrare automată)

2. CLICK PE TĂVIȚĂ → DETALII / SAU PAGINA TĂVIȚĂ
   └─ Opțiunea 1: Panou lateral cu instrumente, servicii, note
   └─ Opțiunea 2: Pagină dedicată /tehnician/tray/[id]

3. IA ÎN LUCRU
   └─ Apasă "Ia în lucru" → tăvița trece în "În Lucru"
   └─ Cronometrul de lucru pornește automat (RPC start_work_session)
   └─ Tăvița dispare din "Nouă" și apare în "În Lucru"

4. LUCRU PE TĂVIȚĂ
   └─ Adaugă serviciile executate (din catalog)
   └─ Adaugă piesele folosite (din catalogul de piese)
   └─ Încarcă imagini (cameră/galerie) → Supabase Storage
   └─ Adaugă note CC / observații
   └─ Opțional: pune tăvița "În Așteptare" (buton) dacă așteaptă piese

5. FINALIZARE
   └─ Apasă "Finalizat" → cronometrul se oprește (finish_work_session)
   └─ Tăvița trece în "Finalizată"
   └─ Apare automat în Control Calitate pentru validare

6. CONTROL CALITATE (Alt utilizator sau același)
   └─ Pipeline Calitate: vede tăvițele din Finalizată (carduri virtuale)
   └─ Verifică calitatea lucrării
   └─ "Validare" → items_events: quality_validated → tăvița dispare din CC
   └─ "Respingere" → tăvița se mută înapoi în "În Lucru" din departament
```

---

## 3. Stări ale Interfeței

### 3.1 Stări globale

| Stare | Implementare | Unde apare |
| :--- | :--- | :--- |
| **Încărcare Auth** | `if (authLoading) return null` | Layout CRM – ecran gol până la verificarea sesiunii |
| **Neautentificat** | `if (!user) return null` + redirecționare `/auth/sign-in` | Layout – redirecționare automată |
| **Încărcare Kanban** | `<KanbanBoardSkeleton />` + stare `loading` din `useKanbanData` | Tabloul afișează schelete de carduri (pulsatile) |
| **Kanban Gol** | Text centrat `"Nu există lead-uri"` per etapă | Etapă goală în tablou |
| **Eroare Kanban** | `toast.error(...)` + reîncercare la `visibilitychange` | Notificare toast + reîncercare automată |
| **Încărcare Panou Detalii** | `<Loader2 className="animate-spin" />` | Panou lateral – spinner la deschidere |
| **Dashboard Inactiv** | `DASHBOARD_MAIN_ACTIVE = false` → placeholder cu imagine "În Dezvoltare" | Dashboard principal |

### 3.2 Stări per acțiune

| Acțiune | Încărcare | Succes | Eroare |
| :--- | :--- | :--- | :--- |
| **Setare Callback** | Buton dezactivat + spinner Loader2 | Toast verde: "Callback programat cu succes" | Toast roșu: "Eroare la programarea callback-ului" |
| **Nu Răspunde** | Buton dezactivat + spinner | Cardul se mută în etapă | Toast distructiv: "Nu s-a putut seta" |
| **No Deal** | Buton dezactivat | Toast: "Lead-ul marcat ca No Deal" | Toast: "Eroare la marcarea No Deal" |
| **Curier Trimis** | Buton dezactivat + spinner | Toast: "Curier Trimis marcat. Fișă de service creată." | Toast: "Eroare la marcarea Curier Trimis" |
| **Facturare** | `facturareLoading=true`, butoane dezactivate | Toast: "Fișa facturată. Cardul mutat în..." + închidere automată overlay | Toast distructiv: "Eroare de facturare" cu mesaj detaliat |
| **Trimitere tăvițe** | Buton dezactivat + spinner | Toast: "Tăvițele au fost trimise" | Toast: "Nu s-au putut trimite" |
| **Upload imagine** | Spinner pe butonul de upload | Imaginea apare în galerie | Toast: "Eroare la upload" |
| **Arhivare** | Buton dezactivat | Toast: "Fișa a fost arhivată" + cardul dispare | Toast: "Eroare la arhivare" |
| **Mutare Drag & Drop** | Card semi-transparent în mișcare | Cardul se mută fluid în noua etapă | AlertDialog confirmare dacă etapa este restricționată |
| **Mutare în Masă** | Dialog cu spinner | Toast: "N carduri mutate" | Toast: "Eroare la mutare" |
| **Ștergere lead** | AlertDialog confirmare → spinner | Cardul dispare din tablou | Toast: eroare |

### 3.3 Răspunsul aplicației la eșec

- **Actualizări optimiste**: Cardurile se mută vizual imediat (optimist), apoi sunt confirmate din BD. La eșec → revenire + toast eroare.
- **Notificări toast**: Fiecare acțiune are `toast.success(...)` pentru succes și `toast({ variant: 'destructive', ... })` pentru eroare.
- **Reîncercare automată**: La pierderea conexiunii (`offline` → `online`), cache-ul Kanban este invalidat automat și datele se reîncarcă.
- **Reîmprospătare la vizibilitate**: La revenirea în tab (`visibilitychange`), tabloul se reîncarcă automat (evită date învechite).
- **Idempotență**: Arhivarea verifică dacă fișa este deja arhivată (`archived_at`) și returnează succes fără eroare.
- **Degradare grațioasă**: Dacă o coloană BD lipsește (ex.: `colet_neridicat`), strategia Recepției face fallback fără a crăpa.

---

## 4. Puncte de Fricțiune Identificate

### 4.1 Fricțiune MARE – Complexitatea panoului de detalii lead

**Problemă:** Panoul de detalii lead (`lead-details-panel.tsx`) încearcă să servească **toate rolurile** (Vânzător, Recepție, Tehnician, Admin) și **toate pipeline-urile** (Vânzări, Recepție, Departamente, CC). Aceasta rezultă în:
- ~20 props condiționale (`isVanzariPipeline`, `isReceptiePipeline`, `isDepartmentPipeline`, etc.)
- 5+ tab-uri care apar/dispar condiționat
- Butoane diferite per etapă (Call Back, Nu Răspunde, De Trimis, Ridic Personal, Arhivare...)
- Header cu ~30 props (LeadDetailsHeader) – checkbox-uri, tag-uri, pin, escalare urgență

**Impact asupra utilizatorului:** Panoul arată diferit în funcție de context, dar codul monolitic face dificilă adăugarea funcționalităților specifice rolului fără a le afecta pe celelalte. Un dezvoltator nou trebuie să înțeleagă toate combinațiile.

**Sugestie UX:** Componente dedicate per rol/pipeline ar reduce confuzia. Ex.: `VanzariDetailsPanel`, `ReceptieDetailsPanel`, `DepartmentDetailsPanel`.

---

### 4.2 Fricțiune MARE – Fluxul de facturare necesită multe acțiuni manuale

**Problemă:** Pentru a factura o fișă de service, recepția trebuie să parcurgă ~8 pași:
1. Completare instrumente pe tăvițe (click adaugă instrument → caută → selectează → repetă)
2. Adăugare servicii per instrument (comutări)
3. Adăugare mărci + numere de serie per instrument
4. Salvare
5. Trimitere tăvițe în departamente
6. Așteptare finalizare tehnician + CC
7. Click "Facturare" → completare date facturare → alegere metodă livrare
8. Arhivare manuală după ridicare

**Impact asupra utilizatorului:** Mulți pași repetitivi (click → caută → selectează per instrument, per serviciu) pot fi obositoare pentru fișe de service cu 10+ instrumente.

**Sugestie UX:**
- Scanare cod de bare → adăugare automată instrument
- Șabloane fișe de service (ex.: "Pachet Salon 10 foarfece") cu instrumente predefinite
- Auto-facturare când toate condițiile sunt îndeplinite (checkbox opțional)

---

### 4.3 Fricțiune MEDIE – Dialoguri multiple pentru Call Back / Nu Răspunde

**Problemă:** Setarea unui callback necesită:
1. Click buton pe card → se deschide dialog
2. Alegere tip (Timp rapid / Dată rapidă / Personalizat)
3. Dacă personalizat: selectare dată din calendar + oră din dropdown
4. Click "Confirmă"

Fluxul "Nu Răspunde" este similar dar cu selecție de oră.

**Impact asupra utilizatorului:** Pentru un vânzător care face 50+ apeluri/zi, fiecare click suplimentar contează. Opțiunile de timp rapid (10 min, 15 min, 30 min, 1h) sunt bine gândite, dar dialogul complet se deschide de fiecare dată.

**Sugestie UX:** Acțiuni rapide direct pe card (fără dialog): un hover/long-press pe butonul de callback ar putea afișa un mini-dropdown cu opțiuni rapide, similar unui meniu contextual.

---

### 4.4 Fricțiune MEDIE – Lipsa feedback-ului vizual pentru procesele automate

**Problemă:** Procesele automate (cron: Colet Neridicat după 2 zile, No Deal → Arhivat după 24h, tag "Sună!") nu au feedback direct. Vânzătorul descoperă că un lead a fost mutat automat doar când deschide pipeline-ul.

**Impact asupra utilizatorului:** Confuzie: "Unde a dispărut lead-ul meu?" când cron-ul l-a mutat în altă etapă.

**Sugestie UX:** Notificări push/in-app când un lead deținut de utilizator este mutat automat de cron (ex.: "Lead-ul X a fost mutat în Colet Neridicat – curierul a expirat de 2 zile").

---

### 4.5 Fricțiune MEDIE – Duplicare desktop vs mobil

**Problemă:** Experiența pe mobil (`lead-details-sheet.tsx`, 3000 linii) duplică logica de pe desktop (`lead-details-panel.tsx`, 1500 linii). Funcționalitățile pot fi ușor diferite între cele două (bug-uri de sincronizare).

**Impact asupra utilizatorului:** Pe telefon, unele funcționalități pot lipsi sau funcționa diferit față de desktop.

**Sugestie UX:** Design responsiv cu aceleași componente (hook partajat, UI diferit), nu componente separate per platformă.

---

### 4.6 Fricțiune MICĂ – Autentificare cu username (nu email)

**Problemă:** Sistemul de autentificare acceptă **username**, nu email direct. La trimitere, face un request API (`/api/auth/username-to-email`) pentru a converti username-ul în email, apoi se autentifică cu Supabase Auth folosind email-ul.

**Impact asupra utilizatorului:** Un pas suplimentar invizibil (latență lookup), dar UX-ul este simplificat (username-ul este mai ușor de reținut decât email-ul).

**Notă:** Acesta este de fapt un **punct UX pozitiv** – utilizatorii interni preferă username-uri scurte.

---

### 4.7 Fricțiune MICĂ – Validări stricte pe etape

**Problemă:** Anumite etape sunt restricționate pentru Drag & Drop:
- Nu se poate trage un card în "În Lucru", "În Așteptare" (doar butonul explicit)
- Nu se poate trage în "De Facturat" (necesită CC validat pe toate tăvițele)
- AlertDialog confirmare la mutarea în etape critice

**Impact asupra utilizatorului:** Frustrare dacă nu înțeleg de ce nu pot muta un card. Mesajul de eroare există dar este subtil.

**Sugestie UX:** Tooltip pe zona restricționată: "Tăvițele trebuie validate în Control Calitate înainte de mutarea în De Facturat".

---

## 5. Rezumat – User Journey per Rol

### Vânzător (cel mai activ utilizator)
```
Autentificare → Kanban Vânzări → Click lead → Apel telefonic →
  ├── Nu răspunde → "Nu Răspunde" (cronometru) → tag "Sună!" auto → Re-apel
  ├── Sună mai târziu → "Call Back" (dată/oră) → Revenire automată
  ├── Nu dorește → "No Deal" → Arhivat automat (24h)
  └── Comandă → "Curier Trimis" / "Office Direct" → Fișă creată → Recepție
```

### Recepție (al doilea cel mai activ)
```
Kanban Recepție → Click fișă Curier Trimis → Tab Prețuri →
  Completare instrumente + servicii → Salvare → Trimitere tăvițe în departamente →
  Așteptare tehnicieni → Validare Control Calitate →
  De Facturat → Overlay Facturare → Ridic Personal / De Trimis →
  Arhivare
```

### Tehnician (cel mai concentrat pe o singură tăviță)
```
Kanban Departament → Click tăviță "Nouă" →
  "Ia în lucru" (cronometru pornește) →
  Adăugare servicii + piese + imagini →
  "Finalizat" (cronometru oprește) →
  Control Calitate → Validare / Respingere
```

### Admin / Proprietar (management)
```
Dashboard → Statistici Apeluri → Completare retroactivă / Atribuire →
  Admin → Membri → Creare conturi / Roluri / Permisiuni →
  Catalog → Instrumente + Servicii →
  Backup → Descărcare
```

---

*Raport generat prin analiza componentelor UI, handler-elor, stărilor și fluxurilor de business din codul sursă al proiectului Ascutzit CRM.*
