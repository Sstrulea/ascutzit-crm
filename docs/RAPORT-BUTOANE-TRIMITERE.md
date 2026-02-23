# Raport Complet Butoane de Trimitere (Submit) din Proiectul CRM

**Data generării:** 23 Februarie 2026  
**Scop:** Documentarea tuturor butoanelor de tip submit/send/save din aplicație și a acțiunilor lor

---

## Rezumat Executiv

În total au fost identificate **9 componente dialog** principale care conțin butoane de trimitere, fiecare cu funcționalități distincte legate de gestionarea tăvițelor, instrumentelor și datelor de facturare în sistemul CRM.

---

## 1. CreateTrayDialog

**Fișier:** `components/preturi/dialogs/CreateTrayDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Creează Tăvița** | `onCreate()` | Creează o tăviță nouă cu numărul specificat în input |

### Detalii implementare:
```tsx
<Button onClick={onCreate} disabled={creatingTray || !newTrayNumber.trim()}>
  {creatingTray ? <Loader2 className="animate-spin" /> : "Creează Tăvița"}
</Button>
```

### Comportament:
- **Click:** Apelază funcția `onCreate` pasată ca prop
- **Validare:** Dezactivat dacă `creatingTray` este true sau dacă câmpul este gol
- **Feedback:** Afișează loader-ul și textul "Se creează..." în timpul procesării
- **Câmpuri necesare:** `newTrayNumber` (numărul tăviței)

---

## 2. EditTrayDialog

**Fișier:** `components/preturi/dialogs/EditTrayDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Salvează** | `onUpdate()` | Actualizează numărul unei tăvițe existente |

### Detalii implementare:
```tsx
<Button onClick={onUpdate} disabled={updatingTray || !editingTrayNumber.trim()}>
  {updatingTray ? <Loader2 className="animate-spin" /> : "Salvează"}
</Button>
```

### Comportament:
- **Click:** Apelază funcția `onUpdate` pasată ca prop
- **Validare:** Dezactivat dacă `updatingTray` este true sau dacă numărul este gol
- **Feedback:** Afișează loader-ul și textul "Se actualizează..." în timpul procesării
- **Câmpuri necesare:** `editingTrayNumber` (noul număr al tăviței)

---

## 3. BillingDialog

**Fișier:** `components/preturi/dialogs/BillingDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Salvează datele** | `handleSave()` | Salvează datele de facturare ale lead-ului în baza de date |
| 2 | **Tipărește** | `handlePrint()` | Deschide dialogul de print al browserului |

### Detalii implementare:
```tsx
<Button onClick={handleSave} disabled={saving || loading}>
  {saving ? <Loader2 className="animate-spin" /> : "Salvează datele"}
</Button>

<Button onClick={handlePrint} variant="outline" disabled={loading || loadingQuotes}>
  <Printer className="h-4 w-4" />
  Tipărește
</Button>
```

### Comportament "Salvează datele":
- **Click:** Actualizează record-ul din tabelul `leads` cu datele de facturare
- **Validare:** Dezactivat dacă se salvează sau se încarcă date
- **Feedback:** Toast "Datele de facturare au fost salvate" la succes
- **Câmpuri salvate:**
  - `billing_nume_prenume`
  - `billing_nume_companie`
  - `billing_cui`
  - `billing_strada`
  - `billing_oras`
  - `billing_judet`
  - `billing_cod_postal`
  - `updated_at`

### Comportament "Tipărește":
- **Click:** Apelază `window.print()` pentru a deschide dialogul de print
- **Validare:** Dezactivat dacă se încarcă date
- **Efect:** Printează previzualizarea fișei de serviciu cu datele de facturare

---

## 4. SendConfirmationDialog

**Fișier:** `components/preturi/dialogs/SendConfirmationDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Trimite Tăvițele** | `onConfirm()` | Trimite tăvițele în departamentele corespunzătoare pentru procesare |

### Detalii implementare:
```tsx
<Button onClick={onConfirm} disabled={sending}>
  {sending ? <Loader2 className="animate-spin" /> : "Trimite Tăvițele"}
</Button>
```

### Comportament:
- **Click:** Apelază funcția `onConfirm` pasată ca prop
- **Validare:** Dezactivat dacă se trimite
- **Feedback:** Afișează loader-ul și textul "Se trimit..." în timpul procesării
- **Efecte secundare:**
  - Mută instrumentele în pipeline-urile departamentelor
  - Trimite notificări tehnicienilor pentru procesare
  - Permite urmărirea progresului în fiecare departament

---

## 5. SplitTrayTechnicianDialog

**Fișier:** `components/preturi/dialogs/SplitTrayTechnicianDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Aplică împărțirea** | `handleSubmit()` | Împarte tăvița între tehnicianul curent și un tehnician țintă |

### Detalii implementare:
```tsx
<Button onClick={handleSubmit} disabled={!canSubmit}>
  {submitting ? <Loader2 className="animate-spin" /> : "Aplică împărțirea"}
</Button>
```

### Comportament:
- **Click:** Apelază `onConfirm` cu structura:
  ```typescript
  {
    targetTechnicianId: string,
    moves: Array<{
      trayItemId: string,
      qtyMove: number
    }>
  }
  ```
- **Validare:** Dezactivat dacă:
  - Nu este selectat tehnicianul țintă
  - Nu este selectat niciun instrument
  - Se procesează
- **Feedback:** Afișează loader-ul și textul "Se aplică..." în timpul procesării
- **Logică de împărțire:**
  - Pentru fiecare instrument selectat, calculează cantitatea de mutat
  - Mută serviciile și piesele proporțional pentru a păstra consistența
  - Dacă instrumentul are brand/serial, mută doar integral (nu permite split parțial)

---

## 6. MergeTrayTechnicianDialog

**Fișier:** `components/preturi/dialogs/MergeTrayTechnicianDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Reunește** | `handleSubmit()` | Mută integral pozițiile selectate la tehnicianul final (în aceeași tăviță) |

### Detalii implementare:
```tsx
<Button onClick={handleSubmit} disabled={!canSubmit}>
  {submitting ? <Loader2 className="animate-spin" /> : "Reunește"}
</Button>
```

### Comportament:
- **Click:** Apelază `onConfirm` cu structura:
  ```typescript
  {
    targetTechnicianId: string,
    moves: Array<{
      trayItemId: string,
      qtyMove: number
    }>
  }
  ```
- **Validare:** Dezactivat dacă:
  - Nu este selectat tehnicianul final
  - Nu sunt selectate poziții
  - Se procesează
- **Feedback:** 
  - Loader "Se reunește..." în timpul procesării
  - Toast "Toate pozițiile sunt deja la [tehnician]. Comanda este deja reunîtă." dacă totul e deja la tehnicianul țintă
- **Auto-select:** Când se alege tehnicianul final, se bifează automat toate pozițiile care nu sunt deja la el

---

## 7. MoveInstrumentDialog

**Fișier:** `components/preturi/dialogs/MoveInstrumentDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Mută Instrumentul** | `onMove()` | Mută un instrument complet (cu toate serviciile și piesele sale) într-o tăviță existentă sau nouă |

### Detalii implementare:
```tsx
<Button onClick={onMove} disabled={movingInstrument || (!targetTrayId || (targetTrayId === 'new' && !newTrayNumber.trim()))}>
  {movingInstrument ? <Loader2 className="animate-spin" /> : "Mută Instrumentul"}
</Button>
```

### Comportament:
- **Click:** Apelază funcția `onMove` pasată ca prop
- **Validare:** Dezactivat dacă:
  - Se mută instrumentul
  - Nu este selectată tăvița țintă
  - Este selectată opțiunea "new" dar numărul tăviței este gol
- **Feedback:** Afișează loader-ul și textul "Se mută..." în timpul procesării
- **Opțiuni:**
  - **Tăviță existentă:** Selectează din lista de tăvițe disponibile
  - **Tăviță nouă:** Creează o tăviță cu numărul specificat
- **Info afișat:** Arată cantitatea, numărul de servicii și de rânduri fără serviciu pentru instrument

---

## 8. SplitTrayToRealTraysDialog

**Fișier:** `components/preturi/dialogs/SplitTrayToRealTraysDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Aplică împărțirea** | `handleSubmit()` | Împarte tăvița în 2 sau 3 tăvițe reale separate, atribuindu-le tehnicieni diferiți |

### Detalii implementare:
```tsx
<Button onClick={handleSubmit} disabled={!canSubmit}>
  {submitting ? <Loader2 className="animate-spin" /> : "Aplică împărțirea"}
</Button>
```

### Comportament:
- **Click:** Apelază `onConfirm` cu structura:
  ```typescript
  {
    assignments: Array<{
      technicianId: string,
      displayName: string,
      trayItemIds?: string[],
      items?: { trayItemId: string, quantity: number }[]
    }>
  }
  ```
- **Validare:** Dezactivat dacă:
  - Nu sunt selectați tehnicienii necesari (1 pentru mod 2, 2 pentru mod 3)
  - Nu sunt atribuite toate grupurile
  - Suma cantităților nu este validă
  - Se procesează
- **Feedback:** Afișează loader-ul și textul "Se aplică..." în timpul procesării
- **Moduri de împărțire:**
  - **2 tăvițe:** Tehnician curent + 1 tehnician suplimentar
  - **3 tăvițe:** Tehnician curent + 2 tehnicieni suplimentari
- **Nomenclatură tăvițe:** Fiecare tăviță nouă primește formatul `number+username`
- **Reunire automată:** La finalizarea lucrărilor, tăvițele se reunesc automat

---

## 9. PrintTraysDialog

**Fișier:** `components/preturi/dialogs/PrintTraysDialog.tsx`

### Butoane identificate:

| # | Buton | Handler | Acțiune |
|---|-------|---------|---------|
| 1 | **Tipărește** | `handlePrint()` | Deschide dialogul de print al browserului pentru tăvițe |
| 2 | **Închide** | `onOpenChange(false)` | Închide dialogul de print |

### Detalii implementare:
```tsx
<Button onClick={handlePrint} variant="secondary">
  <Printer className="h-4 w-4" />
  Tipărește
</Button>

<Button variant="secondary" onClick={() => onOpenChange(false)}>
  Închide
</Button>
```

### Comportament "Tipărește":
- **Click:** Aplică logica complexă de print:
  1. Clonează secțiunea de print din dialog
  2. Creează un element root în body
  3. Adaugă clase CSS pentru stiluri de print
  4. Apelază `window.print()`
  5. Curăță DOM-ul după print
- **Validare:** Verifică dacă conținutul este încărcat înainte de print
- **Feedback:** Toast "Conținutul pentru print nu e încărcat" dacă conținutul nu este gata
- **Direct Print:** Dacă prop-ul `directPrint` este true, print-ul se declanșează automat la încărcare

### Comportament "Închide":
- **Click:** Închide dialogul prin `onOpenChange(false)`
- **Feedback:** Fără feedback vizual

---

## Analiza Similarităților

### Butoane cu ACEEAȘI funcționalitate:

#### 1. **"Salvează" / "Save"**
- **EditTrayDialog:** Salvează numărul tăviței
- **BillingDialog:** Salvează datele de facturare
- **Diferențe:** Target diferit (tray vs. billing data)

#### 2. **"Aplică împărțirea"**
- **SplitTrayTechnicianDialog:** Împarte către tehnician (cantitate parțială)
- **SplitTrayToRealTraysDialog:** Împarte în tăvițe reale separate
- **Diferențe:** 
  - SplitTrayTechnician: split cantitativ, păstrează în aceeași tăviță
  - SplitTrayToRealTrays: creează tăvițe separate cu numere distincte

#### 3. **"Trimite" / "Send"**
- **SendConfirmationDialog:** Trimite în departamente
- **Diferențe:** Nu există alt buton similar în sistemul analizat

### Butoane cu LOGICĂ similară dar IMPLEMENTARE diferită:

| Funcționalitate | Dialog | Buton | Implementare |
|-----------------|--------|-------|--------------|
| Creare | CreateTrayDialog | Creează Tăvița | Creează entitate nouă |
| Editare | EditTrayDialog | Salvează | Update entitate existentă |
| Mutare | MoveInstrumentDialog | Mută Instrumentul | Transfer între tăvițe |
| Merge | MergeTrayTechnicianDialog | Reunește | Consolidare la un tehnician |
| Split (tehnician) | SplitTrayTechnicianDialog | Aplică împărțirea | Împărțire cantitativă |
| Split (tăvițe) | SplitTrayToRealTraysDialog | Aplică împărțirea | Creare tăvițe separate |

---

## Modele Comune de Implementare

### 1. Pattern de Validare și Feedback

Toate butoanele urmează același pattern:

```tsx
<Button 
  onClick={handler}
  disabled={loading || !isValid}
>
  {loading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" />
      Se procesează...
    </>
  ) : (
    <>
      <Icon className="h-4 w-4" />
      Nume Buton
    </>
  )}
</Button>
```

### 2. Prop-uri comune pentru butoane

| Prop | Tip | Descriere |
|------|-----|-----------|
| `disabled` | boolean | Dezactivează butonul în timpul procesării |
| `onClick` | function | Handler-ul pentru acțiune |
| `className` | string | Clase CSS pentru stilizare |
| `variant` | string | Varianta de stil (default, ghost, outline, etc.) |

### 3. Stări comune

Toate butoanele gestionează cel puțin 2 stări:
- **Idle:** Butoanele sunt active și clickabile
- **Loading:** Butoanele sunt dezactivate și afișează un spinner

---

## Concluzii

1. **Total butoane de trimitere:** 9 butoane principale în 8 componente
2. **Categorii funcționale:**
   - CRUD (Create/Read/Update/Delete) pentru tăvițe și instrumente
   - Operațiuni complexe (split, merge, move)
   - Operațiuni de afișare (print)
   - Operațiuni de business (facturare, trimitere în departamente)

3. **Consistență:** Toate butoanele urmează aceleași standarde de UX:
   - Validare înainte de submit
   - Feedback vizual în timpul procesării
   - Mesaje de confirmare/succes

4. **Diferențiere:** Deși unele butoane au text similar ("Aplică împărțirea"), funcționalitățile lor sunt distincte și complementare.

---

## Recomandări

1. **Standardizare:** Consider crearea unui componentă reutilizabilă `SubmitButton` care să encapsuleze pattern-ul comun de validare + loading.

2. **Nomenclatură:** Pentru evitarea confuziei, butoanele "Aplică împărțirea" ar putea fi redenumite mai explicit:
   - SplitTrayTechnicianDialog → "Împarte Cantitativ"
   - SplitTrayToRealTraysDialog → "Împarte în Tăvițe"

3. **Testare:** Aceste butoane ar trebui să fie testate automat pentru a verifica:
   - Validarea corectă înainte de submit
   - Feedback-ul utilizatorului în timpul procesării
   - Tratarea erorilor