# Descrierea dashboard-urilor CRM – Ce avem nevoie și de ce

**Versiune:** 1.0  
**Scop:** Specificație pentru cele patru dashboard-uri principale: Apeluri, Tehnicieni, Analiză financiară, Baza de clienți.  
**Public:** Product owner, dezvoltatori, stakeholderi.

---

## 1. Dashboard Apeluri (Statistici apeluri)

### Ce este
Un dashboard dedicat **echipei de vânzări** și **managementului** pentru a vedea rezultatele apelurilor: câte apeluri s-au făcut, cu ce rezultat (comandă, curier trimis, office direct, no deal, nu răspunde, call back) și care este rata de conversie la comandă.

### De ce avem nevoie
- **Evaluare performanță vânzări:** Să știm cine convertește cel mai bine și cine are nevoie de suport sau training.
- **Planificare resurse:** Numărul de apeluri și rezultate pe zi/săptămână/lună ajută la alocarea orelor și a target-urilor.
- **Transparență:** Admin/Owner văd cifrele pe echipă și per agent; fiecare vânzător poate vedea propriile statistici.
- **Îmbunătățire continuă:** Rate de „nu răspunde” sau „call back” ridicate indică nevoia de scripturi, orar de apeluri sau recalibrare a bazei de lead-uri.

### Ce ar trebui să conțină (nevoi)

| Element | Descriere | De ce |
|--------|------------|--------|
| **Filtru perioadă** | Zi, săptămână, lună (și opțional interval custom) | Comparații între perioade și raportare lunară. |
| **Tabel/grid per vânzător** | Total apeluri, Comandă, Curier trimis, Office direct, No deal, Call back, Nu răspunde, (opțional) Nr. fișe create | Vedere pe agent și pe tip de rezultat. |
| **Rata de conversie** | Comandă / Total × 100 (per agent și la nivel echipă) | KPI principal: cât din apeluri devin comenzi. |
| **Detalii pe agent** | Expandabil: listă lead-uri cu rezultat și dată (sau link la lead) | Audit, verificare și corectare atribuiri. |
| **Comparație între agenți** | Ordonare după total, conversie sau comandă | Gamification și identificare best practices. |
| **Acces restricționat** | Doar Admin/Owner/Vânzător; vânzătorul vede doar propriile date (sau și echipa, dacă se dorește) | Confidențialitate și focus pe propriul progres. |

### Stare actuală (referință)
- Există deja pagina **Statistici apeluri** (`/dashboard/statistici-apeluri`) cu: perioadă (zi/săptămână/lună), vânzători, total/comandă/curier/office/no deal/callback/nu răspunde, nr. fișe, conversie, detalii expandabile pe lead-uri. Poate fi extins cu grafice (evolutie zilnică/lună) și export.

---

## 2. Dashboard Tehnicieni

### Ce este
Un dashboard pentru **tehnicieni** și **management** care arată: câte tăvițe au fost preluate/finalizate, timpul petrecut pe tăvițe (sesiuni de lucru), volum pe departament și pe instrument, și opțional venit sau productivitate.

### De ce avem nevoie
- **Echilibrarea sarcinilor:** Să vedem cine are multe tăvițe „în lucru” și cine poate prelua mai mult.
- **Timp de execuție:** Sesiunile de lucru (start/stop) oferă timp real petrecut pe tăviță; util pentru estimări și tarife.
- **Performanță pe departament:** Saloane, Horeca, Frizerii, Reparatii – unde este volumul mare și unde există blocaje.
- **Recunoaștere și corectare:** Tehnicianul își vede propria activitate; managerul poate identifica overload sau subutilizare.

### Ce ar trebui să conțină (nevoi)

| Element | Descriere | De ce |
|--------|------------|--------|
| **Filtru perioadă** | Lună (sau săptămână/zi) | Raportare lunară și comparații. |
| **Listă tehnicieni** | Cu activitate în perioada selectată | Cine a lucrat și cât. |
| **Tăvițe finalizate** | Nr. tăvițe mutate în „Finalizate” (per tehnician și per departament) | Producție efectivă. |
| **Tăvițe în lucru** | Nr. tăvițe curent „In lucru” (per tehnician) | Work in progress și capacitate. |
| **Timp petrecut** | Sesiuni de lucru: total ore/minute pe tăviță sau per tehnician | Cost timp și estimări viitoare. |
| **Detalii pe tehnician** | Expandabil: tăvițe lucrate, instrumente, servicii, eventual sumă (dacă e calculabil) | Transparență și dispute. |
| **Vizualizare pe departament** | Saloane, Horeca, Frizerii, Reparatii – volume și timp | Alocare resurse și bottleneck-uri. |
| **Acces** | Tehnician: propriul dashboard; Admin/Owner: toți tehnicienii | Rol-based visibility. |

### Stare actuală (referință)
- Există **Dashboard tehnician** (`/dashboard/tehnician`) cu: selectare lună, listă tehnicieni, tăvițe finalizate/în lucru, timp în lucru, sesiuni de lucru (start/stop), detalii pe tăviță și instrument. Poate fi completat cu grafice (evolutie zilnică, comparativ între luni) și sumă venit per tehnician dacă există prețuri.

---

## 3. Dashboard Analiză financiară

### Ce este
Un dashboard pentru **management și admin** care centralizează datele financiare: venituri pe perioadă, pe departament, pe tip serviciu, facturare vs. încasări, și evoluție în timp.

### De ce avem nevoie
- **Vedere pe venituri:** Cât s-a facturat și cât s-a încasat (cash, card, transfer), pe lună/trimestru/an.
- **Rentabilitate pe departament:** Saloane, Horeca, Frizerii, Reparatii – care aduce cel mai mult venit și unde sunt costurile.
- **Predictii și bugete:** Evoluția lunară și sezonalitate pentru planificare.
- **Conformitate și raportare:** Pregătire date pentru contabilitate sau rapoarte pentru investitori/owner.

### Ce ar trebui să conțină (nevoi)

| Element | Descriere | De ce |
|--------|------------|--------|
| **Filtru perioadă** | Lună, trimestru, an (și opțional interval custom) | Rapoarte lunare/anuale și comparații. |
| **Rezumat venituri** | Total facturat, total încasat, diferență (de încasat) în perioada selectată | Cash flow și creanțe. |
| **Venituri pe departament** | Sumă facturată/încasată per pipeline (Saloane, Horeca, Frizerii, Reparatii) | Unde generează atelierul bani. |
| **Venituri pe tip** | Servicii vs. piese (sau pe categorii de servicii) | Mix-ul de produs și focus comercial. |
| **Evoluție în timp** | Grafic linie sau bară: venit lunar (sau săptămânal) | Trend și sezonalitate. |
| **Stare facturare** | Nr. fișe „De facturat”, facturate, încasate (opțional: vârstă creanțe) | Operațional: ce trebuie facturat/încasat. |
| **Export** | CSV/Excel pentru perioadă selectată (sume, per departament, per client) | Contabilitate și arhivare. |
| **Acces** | Doar Admin/Owner (sau rol dedicat „Financiar”) | Date sensibile. |

### Stare actuală (referință)
- În aplicație există logică de facturare, totaluri pe fișă/tăviță și stage „De facturat”. Un dashboard dedicat **Analiză financiară** poate fi nou sau parțial implementat; acest document definește cerințele clare pentru implementare sau extindere.

---

## 4. Dashboard Baza de clienți

### Ce este
Un dashboard care oferă o **vedere de ansamblu asupra bazei de clienți**: câți lead-uri/clienți existenți, cum sunt clasificați (client cu comandă, no deal, nu răspunde, call back, lead nou) și opțional valoare totală sau istoric per client.

### De ce avem nevoie
- **Dimensiune baza:** Câți contacte avem și cum sunt distribuiți pe stări (client vs. lead vs. no deal etc.).
- **Reactivare:** Lead-uri „call back” sau „nu răspunde” pot fi reapelate; identificare ușoară pentru campanii.
- **Loyalty și recurență:** Clienți cu mai multe fișe sau sumă mare – segmentare pentru oferte sau comunicare diferențiată.
- **Calitate date:** Verificare duplicate, lead-uri fără telefon/email, curățare baza.

### Ce ar trebui să conțină (nevoi)

| Element | Descriere | De ce |
|--------|------------|--------|
| **Agregare pe tip** | Nr. total; nr. clienți (cu cel puțin o comandă/fișă); nr. no deal; nu răspunde; call back; lead (fără rezultat încă) | Vedere rapidă a mix-ului bazei. |
| **Listă/raport clienți** | Grupare după nume (sau telefon) cu: nr. lead-uri, tip dominant, nr. fișe, sumă totală (opțional) | Identificare clienți recurenți și lead-uri duplicate. |
| **Filtre** | După tip (client / no deal / nu răspunde / call back / lead), perioadă ultimei activități | Segmentare pentru apeluri sau email. |
| **Detalii per client** | Expandabil: fișe, tăvițe, sumă, ultima activitate | Context rapid fără a deschide fiecare lead. |
| **Export** | Listă clienți/lead-uri cu tip și (opțional) contact – pentru campanii sau curățare | Integrare cu tool-uri externe sau CRM. |
| **Acces** | Admin/Owner și eventual Vânzări/Recepție (în funcție de politică) | Confidențialitate și GDPR. |

### Stare actuală (referință)
- Există pagina **Baza clienți** (`/dashboard/baza-clienti`) cu: total/clienți/no deal/nu răspunde/call back/lead, listă agregate pe nume, tip, detalii expandabile (sumă, instrumente, nr. fișe). Poate fi extins cu filtre avansate, perioadă și export.

---

## Rezumat pe dashboard

| Dashboard | Utilizatori principali | Scop principal | Acces |
|----------|------------------------|----------------|--------|
| **Apeluri** | Vânzări, Admin | Performanță apeluri și conversie la comandă | Vânzător (propriu), Admin (echipă) |
| **Tehnicieni** | Tehnicieni, Admin | Producție, timp pe tăviță, volum pe departament | Tehnician (propriu), Admin (toți) |
| **Analiză financiară** | Admin, Owner | Venituri, facturare, încasări, trend | Doar Admin/Owner (sau Financiar) |
| **Baza de clienți** | Vânzări, Recepție, Admin | Dimensiune și calitate baza, segmentare, reactivare | Admin, eventual Vânzări/Recepție |

---

## Următorii pași (sugestii)

1. **Apeluri:** Păstrare/extindere Statistici apeluri – grafice evoluție, export, eventual target conversie per agent.
2. **Tehnicieni:** Păstrare/extindere Dashboard tehnician – grafice lunare, venit per tehnician dacă e cazul.
3. **Analiză financiară:** Definire surse date (facturi, plăți, stage-uri) și implementare pagină nouă conform tabelului de mai sus.
4. **Baza de clienți:** Extindere Baza clienți – filtre perioadă, export, opțional segmentare „clienți recurenți” / „lead-uri de recontactat”.

Documentul poate fi actualizat la cerințe noi (metrici suplimentare, permisiuni, export-uri).
