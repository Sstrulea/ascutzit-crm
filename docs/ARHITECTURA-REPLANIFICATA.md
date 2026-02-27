# Arhitectură Replanificată - CRM

**Data:** 23 Februarie 2026  
**Scop:** Documentarea și replanificarea logicii pentru fluxul Recepție → Departamente

---

## 1. Flux General Actual

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LEAD (Client)                              │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ SERVICE FILE    │
                    │ (Fișă de      │
                    │  Serviciu)     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   TRAYS (1-N) │  ← Container pentru item-uri
                    │   Tăvițe       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ TRAY ITEMS      │  ← Instrumente, Servicii, Piese
                    │ (Item-uri)      │
                    └─────────────────┘
```

---

## 2. Statusuri Tăvițe (Trays)

| Status | Descriere | Unde se află |
|--------|------------|---------------|
| `in_receptie` | Tăvița în Recepție | Pipeline-ul Recepție |
| `in_lucru` | Tăvița în lucru | Departamente (Horeca, Saloane, etc.) |
| `gata` / `finalizare` | Tăvița finalizată | Departamente |
| `Splited` | Tăvița împărțită | Împarte tăviță |
| `2` / `3` | Tăviță parent împărțită | Arhivă logică |

---

## 3. Fluxul Recepție → Departamente

### 3.1 Pasul 1: Creare Fișă de Serviciu

```typescript
// Recepție / Vânzări creează o fișă
const serviceFile = await createServiceFile({
  lead_id: leadId,
  number: "4",  // Numărul fișei (ex: "Fisa 4")
  date: new Date().toISOString(),
  status: 'noua',
  office_direct: false,
  curier_trimis: false,
  urgent: false
})
```

**Validări:**
- ✅ Verifică dacă există deja o fișă cu același număr
- ✅ Status initial: 'noua'
- ✅ Nu are tăvițe încă

---

### 3.2 Pasul 2: Adăugare Tăvițe

```typescript
// Recepție / Vânzări adaugă tăvițe în fișă
const tray = await createTray({
  number: "10S",  // Text liber (ex: "10S", "A12", "M3")
  service_file_id: serviceFileId,
  status: 'in_receptie'
})
```

**Validări CRITICE:**
1. **Duplicat în aceeași fișă:**
   ```typescript
   // Verifică dacă există deja tăviță cu același număr în fișă
   const existing = await supabase
     .from('trays')
     .select('*')
     .eq('service_file_id', data.service_file_id)
     .eq('number', data.number)
     .maybeSingle()
   
   if (existing) {
     return { data: existing, error: null } // Returnează existentă
   }
   ```

2. **Disponibilitate globală:**
   ```typescript
   // Verifică dacă numărul e folosit de altă fișă
   const { available, existingTray } = await checkTrayAvailability("10S")
   
   if (!available) {
     // Arată eroare: "Tăvița 10S este deja folosită în Fișa 15"
     return
   }
   ```

**Număr tăviță:**
- Format text liber (ex: `10S`, `A12`, `M3`, `1`, `2`)
- Poate conține litere, cifre, simboluri
- Exemplu: `10S` = `10` (numeric) + `S` (sufix text)
- Se salvează așa cum e introdus în DB

---

### 3.3 Pasul 3: Adăugare Instrumente în Tăvițe

```typescript
// Recepție / Vânzări adaugă instrumente în tăviță
const trayItem = await createTrayItem({
  tray_id: trayId,
  instrument_id: instrumentId,  // OBLIGATORIU
  service_id: serviceId,
  part_id: partId,
  qty: 2,
  department_id: departmentId,  // Se preia din instrument
  notes: JSON.stringify({
    price: 150,
    discount_pct: 0,
    urgent: false,
    brand_groups: [
      {
        id: "brand_1",
        brand: "BrandX",
        serialNumbers: ["SN001", "SN002"],
        garantie: true
      }
    ]
  })
})
```

**Validări:**
- ✅ `instrument_id` OBLIGATORIU
- ✅ `department_id` se preia din instrument
- ✅ Cantitate (`qty`) trebuie să fie > 0
- ✅ Brand-uri și serial numbers opționale

---

### 3.4 Pasul 4: Trimite Tăvițele în Departamente

```typescript
// Dialog de confirmare
await sendTraysToDepartments({
  serviceFileId: serviceFileId,
  trayIds: [trayId1, trayId2, ...]
})
```

**Ce se întâmplă:**

1. **Creare pipeline_items pentru trays:**
   ```typescript
   // Pentru fiecare tăviță, creează înregistrări în pipeline_items
   for (const trayId of trayIds) {
     await supabase.from('pipeline_items').insert([{
       type: 'tray',
       item_id: trayId,
       pipeline_id: departmentPipelineId,  // ex: Horeca, Saloane
       stage_id: inLucruStageId,
       created_at: new Date().toISOString(),
       updated_at: new Date().toISOString()
     }])
   }
   ```

2. **Actualizare status tăvițe:**
   ```typescript
   // Opțional: Actualizează status-ul tăviței
   await updateTray(trayId, {
     status: 'in_lucru'  // sau status-ul departamentului
   })
   ```

3. **Actualizare status service file:**
   ```typescript
   // Muta fișa în "Colet Ajuns" în Recepție
   await moveItemToStage('service_file', serviceFileId, 
                       receptiePipelineId, coletAjunsStageId)
   ```

4. **Notificări:**
   ```typescript
   // Trimite notificări tehnicienilor
   await sendPushNotifications({
     technicians: assignedTechnicians,
     message: "Ai primit tăvițe noi"
   })
   ```

---

## 4. Fluxul în Departamente

### 4.1 Tehnicianul primește tăvița

```typescript
// Tehnicianul vede tăvițele în departamentul său
const traysInMyDepartment = await supabase
  .from('pipeline_items')
  .select(`
    item_id,
    stage_id,
    tray:trays!inner(
      id, number, status,
      service_file:service_files!inner(
        id, number, lead:leads!inner(full_name)
      )
    )
  `)
  .eq('pipeline_id', myDepartmentPipelineId)
  .eq('type', 'tray')
```

### 4.2 Tehnicianul actualizează status

```typescript
// Tehnicianul mută tăvița din "In Lucru" în "Așteptare"
await moveItemToStage('tray', trayId, 
                     departmentPipelineId, inAsteptareStageId)

// Actualizează status-ul în DB
await updateTray(trayId, {
  status: 'in_asteptare'
})
```

### 4.3 Tehnicianul finalizează lucrarea

```typescript
// Tehnicianul mută în "Finalizare"
await moveItemToStage('tray', trayId, 
                     departmentPipelineId, finalizareStageId)

await updateTray(trayId, {
  status: 'gata'
})

// Actualizează câmpuri de tehnician (dacă e cazul)
await appendTechnicianDetail(serviceFileId, {
  stage: 'Finalizare',
  stageLabel: 'Finalizare',
  text: 'Am terminat lucrarea. Totul e OK.'
})
```

### 4.4 Validare Quality Check (QC)

```typescript
// Admin / Owner validează tăvița
await logItemEvent('tray', trayId, 
                 'Validare QC', 
                 'quality_validated', 
                 { validated: true })

await updateTray(trayId, {
  qc_notes: 'Totul este conform'
})
```

---

## 5. Revenirea în Recepție

### 5.1 Verificare automată a fișelor

**Strategia Receptiei** verifică automat:

```typescript
// Pentru fiecare fișă, verifică status-ul tuturor tăvițelor
const serviceFiles = await getAllServiceFiles()

for (const sf of serviceFiles) {
  const trays = await listTraysForServiceFile(sf.id)
  
  const allFinalizare = trays.every(t => 
    t.status === 'gata' || t.status === 'finalizare'
  )
  
  const allQcValidated = trays.every(t => 
    t.qc_validated === true  // din items_events
  )
  
  if (allFinalizare && allQcValidated) {
    // Mută fișa în "De Facturat"
    await moveItemToStage('service_file', sf.id, 
                         receptiePipelineId, deFacturatStageId)
  }
}
```

---

## 6. Validări Propuse

### 6.1 Validare număr tăviță

```typescript
interface TrayNumberValidation {
  isValid: boolean
  error?: string
  suggestions?: string[]
}

async function validateTrayNumber(
  trayNumber: string,
  serviceFileId: string
): Promise<TrayNumberValidation> {
  const trimmed = trayNumber.trim()
  
  // 1. Verifică dacă e gol
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Numărul tăviței este obligatoriu'
    }
  }
  
  // 2. Verifică lungimea
  if (trimmed.length > 50) {
    return {
      isValid: false,
      error: 'Numărul tăviței nu poate avea mai mult de 50 de caractere'
    }
  }
  
  // 3. Verifică duplicat în aceeași fișă
  const { data: existingInFile } = await supabase
    .from('trays')
    .select('id, number')
    .eq('service_file_id', serviceFileId)
    .eq('number', trimmed)
    .maybeSingle()
  
  if (existingInFile) {
    return {
      isValid: false,
      error: `Tăvița "${trimmed}" există deja în această fișă`
    }
  }
  
  // 4. Verifică disponibilitate globală
  const { available, existingTray } = await checkTrayAvailability(trimmed)
  
  if (!available && existingTray) {
    // Găsește fișa căreia îi aparține tăvița existentă
    const { data: sf } = await supabase
      .from('service_files')
      .select('number, lead:leads(full_name)')
      .eq('id', existingTray.service_file_id)
      .single()
    
    return {
      isValid: false,
      error: `Tăvița "${trimmed}" este deja folosită în Fișa ${sf?.number}`,
      suggestions: [
        `Poți folosi "${trimmed}-copy"`,
        `Poți alege alt număr`
      ]
    }
  }
  
  return { isValid: true }
}
```

---

## 7. Funcții Helper Propuse

### 7.1 Validare înainte de trimitere

```typescript
async function validateBeforeSendingTrays(
  serviceFileId: string
): Promise<{ canSend: boolean; errors: string[] }> {
  const errors: string[] = []
  
  // 1. Verifică dacă fișa are tăvițe
  const { data: trays } = await listTraysForServiceFile(serviceFileId)
  if (!trays || trays.length === 0) {
    errors.push('Fișa nu are tăvițe. Adaugă cel puțin o tăviță.')
    return { canSend: false, errors }
  }
  
  // 2. Verifică dacă tăvițele au instrumente
  for (const tray of trays) {
    const { data: items } = await listTrayItemsForTray(tray.id)
    const hasInstruments = items?.some(i => i.instrument_id)
    
    if (!hasInstruments) {
      errors.push(`Tăvița "${tray.number}" nu are instrumente. Adaugă instrumente înainte de a trimite.`)
    }
  }
  
  // 3. Verifică dacă tăvițele au număr
  const traysWithoutNumber = trays.filter(t => !t.number || t.number.trim() === '')
  if (traysWithoutNumber.length > 0) {
    errors.push(`Unele tăvițe nu au număr: ${traysWithoutNumber.map(t => 'Tăvița ' + t.id).join(', ')}`)
  }
  
  return {
    canSend: errors.length === 0,
    errors
  }
}
```

### 7.2 Funcție de trimis tăvițe

```typescript
async function sendTraysToDepartments(params: {
  serviceFileId: string
  trayIds: string[]
}): Promise<{ success: boolean; error?: string }> {
  // 1. Validare
  const { canSend, errors } = await validateBeforeSendingTrays(params.serviceFileId)
  if (!canSend) {
    return {
      success: false,
      error: errors.join('; ')
    }
  }
  
  // 2. Determină departamentele pentru fiecare tăviță
  const trayItems = await Promise.all(
    params.trayIds.map(async (trayId) => {
      const { data: items } = await listTrayItemsForTray(trayId)
      const departments = new Set(items?.map(i => i.department_id).filter(Boolean))
      return { trayId, departments: Array.from(departments) }
    })
  )
  
  // 3. Creează pipeline_items în departamente
  for (const { trayId, departments } of trayItems) {
    for (const departmentId of departments) {
      const department = await getDepartmentById(departmentId)
      if (!department) continue
      
      const pipeline = await getPipelineByName(department.name)
      if (!pipeline) continue
      
      const inLucruStage = pipeline.stages.find(s => 
        s.name.toLowerCase().includes('in lucru')
      )
      
      await supabase.from('pipeline_items').insert([{
        type: 'tray',
        item_id: trayId,
        pipeline_id: pipeline.id,
        stage_id: inLucruStage?.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
    }
  }
  
  // 4. Actualizează status-ul fișei în "Colet Ajuns"
  await moveItemToStage('service_file', params.serviceFileId, 
                       receptiePipelineId, coletAjunsStageId)
  
  // 5. Trimite notificări
  const technicians = await getTechniciansForTrays(params.trayIds)
  await sendPushNotifications(technicians, {
    title: 'Ai primit tăvițe noi',
    body: 'Verifică departamentul tău'
  })
  
  return { success: true }
}
```

---

## 8. Probleme Cunoscute și Soluții

### Problema 1: Numere duplicate de tăvițe

**Cauză:** Sistemul permite aceeași tăviță în fișe diferite.

**Soluție propusă:**
```typescript
// Validare globală (deja existentă în checkTrayAvailability)
const { available, existingTray } = await checkTrayAvailability("10S")
if (!available) {
  // Arată eroare cu detalii despre fișa existentă
  showNotification({
    title: 'Tăvița este deja folosită',
    message: `Tăvița "10S" există în Fișa ${existingTray.service_file.number}`,
    actions: [
      { label: 'Vezi Fișa', action: () => navigateToServiceFile(existingTray.service_file_id) }
    ]
  })
}
```

### Problema 2: Tăvițe fără instrumente trimise

**Cauză:** Nu există validare înainte de trimitere.

**Soluție:** Validare înainte de trimitere (vezi 7.1)

### Problema 3: Confuzie între numere tăvițe

**Cauză:** Numerele sunt text liber, pot fi inconsistente.

**Soluție:**
```typescript
// Standardizare numere (opțional)
function normalizeTrayNumber(input: string): string {
  const trimmed = input.trim().toUpperCase()
  
  // Exemple de normalizare:
  // "10S" → "10S"
  // "10 s" → "10S"
  // "10-s" → "10S"
  // "10 S" → "10S"
  
  return trimmed.replace(/\s*[-/]\s*/g, '').replace(/\s+/g, '')
}
```

---

## 9. Workflow Detaliat

### 9.1 Recepție

```
┌─────────────────────────────────────────────────┐
│ 1. Deschide Lead                            │
│ 2. Creează / Selectează Fișă de Serviciu   │
│ 3. Adaugă Tăviță (+ validare număr)         │
│ 4. Adaugă Instrumente în Tăviță             │
│ 5. (Opțional) Setează Urgent, Office Direct   │
│ 6. Salvează Fișa                            │
│ 7. Trimite Tăvițele → Departamente          │
└─────────────────────────────────────────────────┘
```

### 9.2 Vânzări

```
┌─────────────────────────────────────────────────┐
│ 1. Deschide Lead din Vânzări                │
│ 2. Creează / Selectează Fișă de Serviciu   │
│ 3. Adaugă Tăviță (+ validare număr)         │
│ 4. Adaugă Instrumente în Tăviță             │
│ 5. (Opțional) Setează Urgent, Office Direct   │
│ 6. Salvează Fișa                            │
│ 7. (Opțional) Trimite Tăvițele              │
└─────────────────────────────────────────────────┘
```

**Notă:** Recepția și Vânzările folosesc același panou `VanzariViewV4`.

### 9.3 Departamente Tehnice

```
┌─────────────────────────────────────────────────┐
│ 1. Vede tăvițele asignate departamentului  │
│ 2. Selectează tăviță                      │
│ 3. Muta în "In Lucru" / "Așteptare"      │
│ 4. Adaugă detalii tehnician (dacă e caz)   │
│ 5. Muta în "Finalizare"                    │
│ 6. (Automat) QC validează                   │
└─────────────────────────────────────────────────┘
```

---

## 10. Structura Datelor

### 10.1 Service File

```typescript
interface ServiceFile {
  id: string
  lead_id: string
  number: string              // Numărul fișei (ex: "4", "Fisa 4")
  date: string
  status: 'noua' | 'in_lucru' | 'finalizata' | 'comanda' | 'facturata'
  office_direct: boolean
  curier_trimis: boolean
  urgent: boolean
  // ... alte câmpuri
}
```

### 10.2 Tray

```typescript
interface Tray {
  id: string
  number: string              // Text liber (ex: "10S", "A12", "M3")
  size: string               // "S", "M", "L", "XL"
  service_file_id: string
  status: 'in_receptie' | 'in_lucru' | 'gata' | 'Splited' | '2' | '3'
  technician_id?: string
  qc_notes?: string
  // ... alte câmpuri
}
```

### 10.3 Tray Item

```typescript
interface TrayItem {
  id: string
  tray_id: string
  instrument_id: string      // OBLIGATORIU
  service_id?: string
  part_id?: string
  qty: number
  department_id?: string   // Din instrument
  notes: string             // JSON cu price, discount, brand, serial
  // ... alte câmpuri
}
```

---

## 11. Recomandări de Implementare

### 11.1 Validări Frontend

```typescript
// În componenta CreateTrayDialog
const handleCreate = async () => {
  // Validare client-side
  const { isValid, error } = await validateTrayNumber(
    newTrayNumber,
    serviceFileId
  )
  
  if (!isValid) {
    toast.error(error || 'Numărul tăviței nu este valid')
    return
  }
  
  // Creare
  const { data, error } = await createTray({
    number: newTrayNumber,
    service_file_id: serviceFileId
  })
  
  if (error) {
    toast.error('Eroare la crearea tăviței')
    return
  }
  
  toast.success('Tăviță creată cu succes')
  onOpenChange(false)
}
```

### 11.2 Validări Backend

```typescript
// În createTray (serviceFileOperations.ts)
const createTray = async (data: TrayData) => {
  // Verifică duplicat în fișă
  const { data: existing } = await supabase
    .from('trays')
    .select('*')
    .eq('service_file_id', data.service_file_id)
    .eq('number', data.number)
    .maybeSingle()
  
  if (existing) {
    return { data: existing, error: null }
  }
  
  // Verifică disponibilitate globală
  const { available } = await checkTrayAvailability(data.number)
  if (!available) {
    return {
      data: null,
      error: new Error(`Tăvița "${data.number}" este deja folosită`)
    }
  }
  
  // Creare
  const { data, error } = await supabase
    .from('trays')
    .insert([data])
    .select()
    .single()
  
  return { data, error }
}
```

### 11.3 Mesaje de Eroare Clare

```typescript
const TRAY_ERROR_MESSAGES = {
  DUPLICATE_IN_FILE: 'Tăvița "{number}" există deja în această fișă',
  DUPLICATE_GLOBAL: 'Tăvița "{number}" este deja folosită în Fișa {fileNumber}',
  EMPTY: 'Numărul tăviței este obligatoriu',
  TOO_LONG: 'Numărul tăviței nu poate avea mai mult de 50 de caractere',
  INVALID_FORMAT: 'Format invalid. Folosește litere, cifre și simboluri standard'
}

function getTrayError(type: keyof typeof TRAY_ERROR_MESSAGES, params: {
  number?: string
  fileNumber?: string
}): string {
  const template = TRAY_ERROR_MESSAGES[type]
  return template
    .replace('{number}', params.number || '')
    .replace('{fileNumber}', params.fileNumber || '')
}
```

---

## 12. Concluzie

### Rezumat Validări Critice

| Pas | Validare | Unde |
|-----|----------|-------|
| Creare Tăviță | Număr unic în fișă | `createTray` |
| Creare Tăviță | Număr disponibil global | `checkTrayAvailability` |
| Adăugare Instrument | `instrument_id` obligatoriu | `createTrayItem` |
| Trimitere Tăvițe | Tăvițe au instrumente | `validateBeforeSendingTrays` |
| Trimitere Tăvițe | Tăvițe au număr | `validateBeforeSendingTrays` |

### Proiecte Viitoare

1. **Standardizare numere tăvițe:** Să considerăm un format standard (ex: `NN[S|M|L]`)
2. **Auto-numerare:** Generare automată a numerelor de tăviță
3. **Historic complet:** Urmărirea tuturor modificărilor tăvițelor
4. **Validări avansate:** Detectare conflictelor de tipul "împărțire circulară"

---

**Notă Finală:** Această arhitectură este bazată pe analiza codului existent. Modificările propuse trebuie implementate treptat, cu teste complete pentru fiecare funcționalitate critică.