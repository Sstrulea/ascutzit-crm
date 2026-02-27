# STUDIU DE CAZ: Dispariția instrumentelor/tăvițelor din fișele de service

## SCOPUL STUDIULUI DE CAZ

Identificarea tuturor locurilor din cod unde se pot:
1. **Șterge tavita complet** (tray + toate items-urile)
2. **Șterge items din tavita** (tray_items)
3. **Suprascrie instrument_id în tray_items**
4. **Muta items între tavite** (ceea ce poate duce la pierderea vizuală)

## ⚠️ RISCURI CRITICE IDENTIFICATE

### 1. ȘTERGEREA COMPLETĂ A TĂVIȚEI

#### Fișier: `lib/supabase/serviceFileOperations.ts`

**Funcția: `deleteTray(trayId: string)`**
```typescript
export async function deleteTray(trayId: string): Promise<{ success: boolean; error: any }> {
  try {
    // 1. Șterge pipeline_items pentru tăviță
    await supabase.from('pipeline_items').delete().eq('type', 'tray').eq('item_id', trayId)
    
    // 2. Șterge work_sessions
    await supabase.from('work_sessions').delete().eq('tray_id', trayId)
    
    // 3. Șterge stage_history
    await supabase.from('stage_history').delete().eq('tray_id', trayId)
    
    // 4. Șterge tray_item_brands (seriale)
    const { data: trayItems } = await supabase.from('tray_items').select('id').eq('tray_id', trayId)
    if (trayItems?.length) {
      const ids = trayItems.map((ti: any) => ti.id)
      await supabase.from('tray_item_brands').delete().in('tray_item_id', ids)
      // Șterge și tray_item_brand_serials dacă există
      try {
        await supabase.from('tray_item_brand_serials').delete().in('tray_item_id', ids)
      } catch { /* ignore if table doesn't exist */ }
    }
    
    // 5. Șterge tray_items (SERVICII, PIESE, INSTRUMENTE)
    await supabase.from('tray_items').delete().eq('tray_id', trayId)
    
    // 6. Șterge imaginile
    await supabase.from('tray_images').delete().eq('tray_id', trayId)
    
    // 7. În final, șterge tăvița
    const { error } = await supabase.from('trays').delete().eq('id', trayId)
    if (error) throw error
    
    return { success: true, error: null }
  } catch (error) {
    console.error('[deleteTray] Error:', error)
    return { success: false, error }
  }
}
```

**Unde este apelată:**
- `hooks/preturi/usePreturiTrayOperations.ts` - funcția `handleDeleteTray()`
- `hooks/preturi/usePreturiTrayOperations.ts` - ștergere automată a tavitei "undefined" (fără număr) când este goală

---

**Funcția: `deleteServiceFile(serviceFileId: string)`**
```typescript
export async function deleteServiceFile(serviceFileId: string): Promise<{ success: boolean; error: any }> {
  try {
    const { data: trays, error: traysErr } = await supabase
      .from('trays')
      .select('id')
      .eq('service_file_id', serviceFileId)
    if (traysErr) throw traysErr
    const trayIds = (trays || []).map((t: any) => t.id)

    if (trayIds.length) {
      await supabase.from('pipeline_items').delete().eq('type', 'tray').in('item_id', trayIds)
      const { data: trayItems } = await supabase.from('tray_items').select('id').in('tray_id', trayIds)
      if (trayItems?.length) {
        const itemIds = trayItems.map((ti: any) => ti.id)
        await supabase.from('tray_item_brands').delete().in('tray_item_id', itemIds)
      }
      await supabase.from('tray_items').delete().in('tray_id', trayIds)
      await supabase.from('tray_images').delete().in('tray_id', trayIds)
      await supabase.from('trays').delete().in('id', trayIds)
    }

    await supabase.from('pipeline_items').delete().eq('type', 'service_file').eq('item_id', serviceFileId)
    const { error } = await supabase.from('service_files').delete().eq('id', serviceFileId)
    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}
```

**Unde este apelată:**
- NU este apelată în frontend (probabil doar în admin tools sau manual în DB)

---

### 2. ȘTERGEREA ITEMS DIN TĂVIȚĂ

#### Fișier: `lib/supabase/serviceFileOperations.ts`

**Funcția: `deleteTrayItem(trayItemId: string)`**
```typescript
export async function deleteTrayItem(trayItemId: string): Promise<{ success: boolean; error: any }> {
  try {
    const { error } = await supabase
      .from('tray_items')
      .delete()
      .eq('id', trayItemId)

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}
```

**Unde este apelată:**
- NU este apelată direct în frontend (probabil doar în admin tools sau manual în DB)

---

#### Fișier: `hooks/preturi/usePreturiTrayOperations.ts`

**Funcția: `handleDeleteTray()`**
```typescript
const handleDeleteTray = useCallback(async () => {
  if (!trayToDelete) return

  setDeletingTray(true)
  try {
    const trayItems = await listQuoteItems(trayToDelete, services, instruments, pipelinesWithIds)
    
    // 🔥 BATCH DELETE TOATE ITEMS-URILE DIN TĂVIȚĂ
    if (trayItems.length > 0) {
      const itemIds = trayItems.map((item: any) => item.id)
      const { error: deleteError } = await supabase
        .from('tray_items')
        .delete()
        .in('id', itemIds)
      
      if (deleteError) {
        console.error('Eroare la ștergerea item-urilor:', deleteError)
        toast.error('Eroare la ștergerea item-urilor din tăviță')
        return
      }
    }

    const { success, error } = await deleteTray(trayToDelete)
    
    if (error || !success) {
      toast.error('Eroare la ștergerea tăviței')
      console.error('Error deleting tray:', error)
      return
    }

    // ... actualizare UI
  } catch (error) {
    console.error('Error deleting tray:', error)
    toast.error('Eroare la ștergerea tăviței')
  } finally {
    setDeletingTray(false)
    setShowDeleteTrayConfirmation(false)
    setTrayToDelete(null)
  }
}, [...])
```

---

### 3. MUTAREA ITEMS ÎNTRE TĂVIȚE (POATE DUCE LA PIERDERE VIZUALĂ)

#### Fișier: `hooks/preturi/usePreturiTrayOperations.ts`

**Funcția: `handleMoveInstrument()`**
```typescript
const handleMoveInstrument = useCallback(async (
  trayIdOverride?: string,
  groupOverride?: { instrument: { id: string; name: string }; items: any[] } | null,
  options?: { newTrayNumber?: string }
) => {
  // ...
  
  // 🔥 BATCH UPDATE TOATE ITEMS-URILE (modifică tray_id)
  const { error } = await supabase
    .from('tray_items')
    .update({ tray_id: actualTrayId })
    .in('id', itemIds)
  
  if (error) {
    throw new Error(`Batch update failed: ${errorMsg}`)
  }
  
  // ...
}, [...])
```

**RISC:** Dacă un utilizator mută accidental un instrument dintr-o tavita în alta, instrumentul dispare din tavita inițială.

---

### 4. ȘTERGEREA AUTOMATĂ A TĂVIȚEI "UNDEFINED"

#### Fișier: `hooks/preturi/usePreturiTrayOperations.ts`

**În funcția `handleMoveInstrument()`:**
```typescript
// Verificare ștergere tăviță undefined (fără număr) - se aplică în toate pipeline-urile
const currentUndefinedTray = updatedQuotes.find((q: any) => !q.number || q.number === '')

if (currentUndefinedTray) {
  const [undefinedTrayItems, undefinedTrayImages] = await Promise.all([
    listQuoteItems(currentUndefinedTray.id, services, instruments, pipelinesWithIds),
    listTrayImages(currentUndefinedTray.id)
  ])
  
  // Dacă tăvița undefined MAI ARE items, revenim pe ea pentru a continua distribuirea
  if (undefinedTrayItems && undefinedTrayItems.length > 0) {
    // IMPORTANT: Revenim pe tăvița undefined pentru a continua distribuirea
    setSelectedQuoteId(currentUndefinedTray.id)
    setItems(undefinedTrayItems)
    // Nu ștergem tăvița, mai are items de distribuit
  } else if ((!undefinedTrayItems || undefinedTrayItems.length === 0) && (!undefinedTrayImages || undefinedTrayImages.length === 0)) {
    // Ștergem tăvița undefined DOAR dacă este goală (nu are nici items, nici imagini)
    try {
      const { success, error } = await deleteTray(currentUndefinedTray.id)
      if (success && !error) {
        // ... actualizare UI
        toast.success('Toate instrumentele au fost distribuite! Tăvița nesemnată a fost ștearsă.')
      }
    } catch (deleteError: any) {
      // Eroare la ștergerea tăviței - nu blocăm fluxul principal
    }
  }
}
```

**RISC:** Dacă tavita "undefined" are items care sunt greu de vizualizat în UI, utilizatorul poate distribui accidental toate items-urile și tavita este ștearsă automat.

---

### 5. ELIBERAREA TĂVIȚELOR LA ARHIVARE (REDENUMIRE)

#### Fișier: `lib/supabase/serviceFileOperations.ts`

**Funcția: `releaseTraysOnArchive(serviceFileId: string)`**
```typescript
export async function releaseTraysOnArchive(
  serviceFileId: string,
  supabaseClient?: SupabaseClient
): Promise<{ success: boolean; deletedCount: number; error: any }> {
  const db = supabaseClient ?? supabase
  try {
    const { data: trays, error: fetchError } = await db
      .from('trays')
      .select('id, number')
      .eq('service_file_id', serviceFileId)

    if (fetchError) throw fetchError

    if (!trays || trays.length === 0) {
      return { success: true, deletedCount: 0, error: null }
    }

    const trayIds = trays.map(t => t.id)
    
    // Scoate tăvițele din pipeline_items (nu mai apar pe board)
    const { error: pipelineError } = await db
      .from('pipeline_items')
      .delete()
      .eq('type', 'tray')
      .in('item_id', trayIds)

    // Pentru fiecare tăviță: redenumește (A12 → A12-copy1)
    for (const tray of trays) {
      const newNumber = await findAvailableCopyNumber(db, tray.number)
      
      const { error: updateError } = await db
        .from('trays')
        .update({
          number: newNumber,
          // service_file_id rămâne neschimbat
        })
        .eq('id', tray.id)
      
      if (updateError) {
        console.error(`Eroare la redenumire tăviță ${tray.number} → ${newNumber}:`, updateError)
      }
    }

    return { success: true, deletedCount: trays.length, error: null }
  } catch (error) {
    console.error('[releaseTraysOnArchive] ❌ Eroare:', error)
    return { success: false, deletedCount: 0, error }
  }
}
```

**Unde este apelată:**
- `app/api/service-files/archive-and-release/route.ts`

**RISC:** Tăvițele sunt redenumite (ex: "28S" → "28S-copy1") și scos din pipeline. Utilizatorul nu mai le poate accesa în UI.

---

### 6. CONSOLIDAREA ITEMS LA REUNIRE (MERGE)

#### Fișier: `lib/supabase/serviceFileOperations.ts`

**Funcția: `consolidateTrayItemsForTechnician(trayId: string)`**
```typescript
export async function consolidateTrayItemsForTechnician(
  trayId: string,
  _technicianId?: string
): Promise<{ data: { mergedCount: number }; error: any }> {
  try {
    const { data: rows, error: fetchErr } = await supabase
      .from('tray_items')
      .select('id, instrument_id, service_id, part_id, qty, tray_item_brands(id)')
      .eq('tray_id', trayId)

    if (fetchErr) return { data: { mergedCount: 0 }, error: fetchErr }
    if (!rows?.length) return { data: { mergedCount: 0 }, error: null }

    // Grupează după (instrument_id, service_id, part_id)
    // Ex: Cleste x2 + Cleste x3 → Cleste x5
    const hasBrands = (r: any) =>
      Array.isArray(r?.tray_item_brands) && r.tray_item_brands.length > 0

    const key = (r: any) =>
      [r.instrument_id ?? '', r.service_id ?? '', r.part_id ?? ''].join('|')

    const groups = new Map<string, typeof rows>()
    for (const r of rows) {
      const k = key(r)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(r)
    }

    let mergedCount = 0
    for (const [, group] of groups) {
      const withoutBrands = group.filter((r: any) => !hasBrands(r))
      if (withoutBrands.length < 2) continue

      const keep = withoutBrands[0]
      const toDelete = withoutBrands.slice(1)
      const totalQty = withoutBrands.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0)

      const { error: updateErr } = await supabase
        .from('tray_items')
        .update({ qty: totalQty })
        .eq('id', keep.id)
      if (updateErr) {
        console.error('[consolidateTrayItemsForTechnician] update qty:', updateErr)
        continue
      }

      // 🔥 BATCH DELETE duplicate items
      if (toDelete.length > 0) {
        const idsToDelete = toDelete.map((r: any) => r.id)
        const { error: delErr } = await supabase
          .from('tray_items')
          .delete()
          .in('id', idsToDelete)
        
        if (delErr) {
          console.error('[consolidateTrayItemsForTechnician] batch delete:', delErr)
        } else {
          mergedCount += toDelete.length
        }
      }
    }

    return { data: { mergedCount }, error: null }
  } catch (e: any) {
    console.error('[consolidateTrayItemsForTechnician]', e)
    return { data: { mergedCount: 0 }, error: e }
  }
}
```

**Unde este apelată:**
- `hooks/preturi/usePreturiTrayOperations.ts` - funcția `handleSplitTrayItemsToTechnician()` la reunire (merge)

**RISC:** Dacă un item este consolidat greșit (ex: instrumente cu serial numbers), item-ul original poate fi șters.

---

### 7. ÎMPĂRȚIREA TĂVIȚELOR (SPLIT)

#### Fișier: `hooks/preturi/usePreturiTrayOperations.ts`

**Funcția: `handleSplitTrayToRealTrays()`**
```typescript
const handleSplitTrayToRealTrays = useCallback(async (params: {
  originalTrayId: string
  assignments: Array<{
    technicianId: string
    displayName: string
    trayItemIds?: string[]
    items?: { trayItemId: string; quantity: number }[]
  }>
}) => {
  // ...
  
  const { data, error } = await splitTrayToRealTrays({
    originalTrayId,
    pipelineId: pi.pipeline_id,
    assignments,
  })

  if (error) throw error
  
  // Actualizează statusul tăviței originale la '2' sau '3' (split)
  setQuotes(prev => {
    const next = [...(prev || [])]
    const orig = next.find((q: LeadQuote) => q.id === originalTrayId)
    if (orig) {
      const idx = next.findIndex((q: LeadQuote) => q.id === originalTrayId)
      if (idx >= 0) next[idx] = { ...orig, status: data.status_set as any }
    }
    return next
  })
  
  // ...
}, [...])
```

**RISC:** Tăvița originală își schimbă statusul în '2' sau '3' și dispare din UI (este exclusă din listă).

---

### 8. ȘTERGEREA BRAND-URILOR ȘI SERIAL NUMBERS LA SALVARE

#### Fișier: `hooks/preturi/usePreturiSaveOperations.ts`

**În funcția `saveBrandSerialData()`:**
```typescript
// Șterge brand-urile existente (un singur call)
await supabaseClient
  .from('tray_item_brands' as any)
  .delete()
  .eq('tray_item_id', existingItem.id)

// Grupează toate brand-urile pentru batch INSERT
const brandsToInsertMap = new Map<string, { tray_item_id: string; brand: string; garantie: boolean }>()
filteredGroups.forEach(group => {
  const brandName = group.brand?.trim()
  if (!brandName) return
  const garantie = group.garantie || false
  const key = `${brandName}::${garantie}`
  if (!brandsToInsertMap.has(key)) {
    brandsToInsertMap.set(key, {
      tray_item_id: existingItem.id,
      brand: brandName,
      garantie: garantie,
    })
  }
})

const brandsToInsert = Array.from(brandsToInsertMap.values())

// Batch INSERT pentru toate brand-urile
const { data: brandResults, error: brandsError } = await supabaseClient
  .from('tray_item_brands' as any)
  .insert(brandsToInsert)
  .select()

// Șterge și re-înserează serial numbers
const serialsToInsert: Array<{ brand_id: string; serial_number: string }> = []
// ... colectare serial numbers ...

const { error: serialsError } = await supabaseClient
  .from('tray_item_brand_serials' as any)
  .insert(serialsToInsert as any)
```

**RISC:** Dacă utilizatorul salvează fără a introduce brand-uri/serial numbers, toate datele existente sunt șterse.

---

## 🎯 CAUZE PROBABILE PENTRU DISPARIȚIA INSTRUMENTULUI "28S"

### CAUZA 1: ȘTERGEREA ACCIDENTALĂ A TĂVIȚEI

**Scenariu:**
1. Utilizatorul are tavita "28S" cu instrumente
2. Utilizatorul apasă butonul "Șterge tavita" (fără să vadă un confirm dialog sau confirm dialog este neclar)
3. Funcția `handleDeleteTray()` din `hooks/preturi/usePreturiTrayOperations.ts` este apelată
4. TOATE items-urile (inclusiv instrumentele) sunt șterse din `tray_items`
5. Tavita "28S" este ștearsă din `trays`

**Probabilitate:** MARE dacă există un buton de ștergere ușor accesibil

---

### CAUZA 2: MUTAREA ACCIDENTALĂ A INSTRUMENTULUI ÎN ALTĂ TĂVIȚĂ

**Scenariu:**
1. Utilizatorul are tavita "28S" cu instrument "Cleste"
2. Utilizatorul accesează funcția "Mută instrument" (din meniu sau din dialog)
3. Selectează accidental o altă tavita sau creează una nouă
4. Funcția `handleMoveInstrument()` din `hooks/preturi/usePreturiTrayOperations.ts` actualizează `tray_id` pentru TOATE items-urile instrumentului
5. Instrumentul dispare din tavita "28S" și apare în altă tavita

**Probabilitate:** MEDIE dacă există funcționalitate de mutare instrumente

---

### CAUZA 3: ȘTERGEREA AUTOMATĂ A TĂVIȚEI "UNDEFINED"

**Scenariu:**
1. Utilizatorul creează o tavita "28S" fără număr (tavita "undefined")
2. Utilizatorul distribuie toate instrumentele în alte tavite
3. Funcția `handleMoveInstrument()` verifică dacă tavita "undefined" este goală
4. Dacă este goală, tavita este ștearsă automat

**Probabilitate:** MICĂ dacă tavita "28S" are un număr clar

---

### CAUZA 4: CONSOLIDARE ITEMS LA REUNIRE (MERGE)

**Scenariu:**
1. Utilizatorul face un "split" al tavitei "28S" pentru mai mulți tehnicieni
2. Utilizatorul face "merge" (reunire) a tavitei înapoi
3. Funcția `consolidateTrayItemsForTechnician()` grupează items-urile duplicate
4. Items-urile duplicate sunt șterse

**Probabilitate:** MICĂ dacă nu există funcționalitate de split/merge

---

### CAUZA 5: ARHIVAREA FIȘEI DE SERVICE

**Scenariu:**
1. Fișa de service cu tavita "28S" este arhivată
2. Funcția `releaseTraysOnArchive()` redenumește tavita "28S" în "28S-copy1"
3. Tavita este scoasă din pipeline (nu mai apare în UI)
4. Utilizatorul nu mai găsește tavita "28S" în UI

**Probabilitate:** MICĂ dacă fișa nu este arhivată

---

### CAUZA 6: SALVARE CU BRAND/SERIAL NUMBERS GOL

**Scenariu:**
1. Utilizatorul are tavita "28S" cu instrumente care au brand-uri și serial numbers
2. Utilizatorul editează instrumentul și șterge brand-urile/serial numbers din formular
3. Utilizatorul salvează
4. Funcția `saveBrandSerialData()` șterge TOATE brand-urile și serial numbers existente
5. Instrumentul pierde brand-urile și serial numbers

**Probabilitate:** MEDIE dacă există funcționalitate de editare brand/serial

---

## 🔍 RECOMANDĂRI PENTRU INVESTIGARE

### 1. VERIFICĂ ISTORICUL DE ȘTERGERI

```sql
-- Verifică dacă tavita "28S" a fost ștearsă
SELECT * FROM trays 
WHERE number LIKE '%28S%' 
ORDER BY updated_at DESC 
LIMIT 10;

-- Verifică tray_items pentru tavita "28S"
SELECT ti.*, t.number as tray_number 
FROM tray_items ti
JOIN trays t ON ti.tray_id = t.id
WHERE t.number LIKE '%28S%'
ORDER BY ti.updated_at DESC
LIMIT 20;

-- Verifică items_events pentru ștergerea tavitei
SELECT * FROM items_events 
WHERE type = 'tray' 
AND event_type = 'tray_deleted'
AND message LIKE '%28S%'
ORDER BY created_at DESC
LIMIT 10;
```

---

### 2. VERIFICĂ ISTORICUL DE MUTARE

```sql
-- Verifică dacă instrumentele au fost mutate
SELECT * FROM items_events 
WHERE type = 'tray'
AND event_type = 'instrument_moved'
AND message LIKE '%28S%'
ORDER BY created_at DESC
LIMIT 10;

-- Verifică tray_items cu instrument_id și updated_at recent
SELECT ti.*, t.number as tray_number, i.name as instrument_name
FROM tray_items ti
JOIN trays t ON ti.tray_id = t.id
JOIN instruments i ON ti.instrument_id = i.id
WHERE ti.updated_at > NOW() - INTERVAL '7 days'
ORDER BY ti.updated_at DESC
LIMIT 20;
```

---

### 3. VERIFICĂ ARHIVA

```sql
-- Verifică dacă tavita "28S" a fost redenumită la arhivare
SELECT * FROM arhiva_fise_serviciu 
WHERE istoric::text LIKE '%28S%'
ORDER BY created_at DESC
LIMIT 10;

-- Verifică dacă tavita "28S-copy*" există în trays
SELECT * FROM trays 
WHERE number LIKE '28S-copy%'
ORDER BY created_at DESC
LIMIT 10;
```

---

### 4. VERIFICĂ PIPELINE_ITEMS

```sql
-- Verifică dacă tavita "28S" mai este în pipeline
SELECT pi.*, t.number as tray_number
FROM pipeline_items pi
JOIN trays t ON pi.item_id = t.id
WHERE pi.type = 'tray'
AND t.number LIKE '%28S%'
ORDER BY pi.updated_at DESC
LIMIT 10;
```

---

## 🛡️ RECOMANDĂRI PENTRU PREVENIRE

### 1. ADĂUGĂ CONFIRMARE LA ȘTERGEREA TĂVIȚEI

```typescript
// În hooks/preturi/usePreturiTrayOperations.ts
const handleDeleteTray = useCallback(async () => {
  if (!trayToDelete) return

  // 🔒 ADĂUGĂ CONFIRMARE CU LISTA ITEMS-URILOR
  const trayItems = await listQuoteItems(trayToDelete, services, instruments, pipelinesWithIds)
  const itemsSummary = trayItems.map(item => 
    `${item.item_type === 'service' ? 'Serviciu' : item.item_type === 'part' ? 'Piesă' : 'Instrument'}: ${item.name_snapshot} (x${item.qty})`
  ).join('\n')

  const confirmMessage = `Ești sigur că vrei să ștergi tavita "${selectedQuote?.number}"?\n\nSe vor șterge următoarele items:\n${itemsSummary}\n\nAceastă acțiune este IRREVERSIBILĂ!`

  if (!confirm(confirmMessage)) {
    return
  }

  // ... continuă cu ștergerea
}, [...])
```

---

### 2. ADĂUGĂ CONFIRMARE LA MUTAREA INSTRUMENTELOR

```typescript
// În hooks/preturi/usePreturiTrayOperations.ts
const handleMoveInstrument = useCallback(async (
  trayIdOverride?: string,
  groupOverride?: { instrument: { id: string; name: string }; items: any[] } | null,
  options?: { newTrayNumber?: string }
) => {
  // ...

  // 🔒 ADĂUGĂ CONFIRMARE ÎNAINTE DE MUTARE
  const instrumentName = groupToUse.instrument?.name || 'Instrument'
  const itemsCount = itemIds.length
  const targetTrayName = actualTrayId === 'new' ? newNum : actualTrayId

  const confirmMessage = `Ești sigur că vrei să muți "${instrumentName}" (${itemsCount} item${itemsCount !== 1 ? 'e' : ''}) în tavita "${targetTrayName}"?`

  if (!confirm(confirmMessage)) {
    return
  }

  // ... continuă cu mutarea
}, [...])
```

---

### 3. ADĂUGĂ LOGGING DETALIAT LA ȘTERGERE

```typescript
// În lib/supabase/serviceFileOperations.ts
export async function deleteTray(trayId: string): Promise<{ success: boolean; error: any }> {
  try {
    // 🔒 LOGHEAZĂ DETALII ÎNAINTE DE ȘTERGERE
    const { data: trayBeforeDelete } = await supabase
      .from('trays')
      .select('id, number, service_file_id')
      .eq('id', trayId)
      .single()

    const { data: itemsBeforeDelete } = await supabase
      .from('tray_items')
      .select('id, instrument_id, service_id, part_id, qty')
      .eq('tray_id', trayId)

    console.log('[deleteTray] BEFORE DELETE:', {
      tray: trayBeforeDelete,
      items: itemsBeforeDelete,
      timestamp: new Date().toISOString(),
      user: authUser?.id ?? 'unknown',
    })

    // ... continuă cu ștergerea

    // 🔒 LOGHEAZĂ DUPĂ ȘTERGERE
    console.log('[deleteTray] AFTER DELETE:', {
      trayId,
      success: true,
      timestamp: new Date().toISOString(),
      user: authUser?.id ?? 'unknown',
    })

    return { success: true, error: null }
  } catch (error) {
    console.error('[deleteTray] Error:', error)
    return { success: false, error }
  }
}
```

---

### 4. ADĂUGĂ VALIDARE ÎNAINTE DE ȘTERGEREA BRAND-URILOR

```typescript
// În hooks/preturi/usePreturiSaveOperations.ts
const saveBrandSerialData = useCallback(async (
  quoteId: string,
  instrumentId: string,
  brandSerialGroups: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }> | string[]; qty?: string }>,
  garantie: boolean
): Promise<void> => {
  // ...

  // 🔒 VERIFICĂ DACĂ UTILIZATORUL VREI SĂ ȘTERGĂ BRAND-URILE EXISTENTE
  const { data: existingBrands } = await supabaseClient
    .from('tray_item_brands')
    .select('id, brand, garantie')
    .eq('tray_item_id', existingItem.id)

  const hasExistingBrands = existingBrands && existingBrands.length > 0
  const hasNewBrands = filteredGroups.length > 0

  if (hasExistingBrands && !hasNewBrands) {
    const confirmMessage = `Instrumentul "${instrument.name}" are ${existingBrands.length} brand${existingBrands.length !== 1 ? 'uri' : ''} existente.\n\nEști sigur că vrei să ștergi TOATE brand-urile și serial numbers?`

    if (!confirm(confirmMessage)) {
      return // Nu salvăm dacă utilizatorul nu confirmă
    }
  }

  // ... continuă cu salvarea
}, [...])
```

---

### 5. ADĂUGĂ RESTAURARE DIN ARHIVĂ

```typescript
// În lib/supabase/serviceFileOperations.ts
export async function restoreTrayFromArchive(
  trayId: string
): Promise<{ success: boolean; error: any }> {
  try {
    // Găsește tavita în arhivă
    const { data: archivedTray } = await supabase
      .from('trays')
      .select('*')
      .eq('id', trayId)
      .single()

    if (!archivedTray) {
      return { success: false, error: new Error('Tavita nu a fost găsită în arhivă') }
    }

    // Restabilește numărul original (elimină sufixul "-copyN")
    const originalNumber = archivedTray.number.replace(/-copy\d+$/, '')

    // Verifică dacă numărul original este disponibil
    const { available } = await checkTrayAvailability(originalNumber)

    if (!available) {
      return { 
        success: false, 
        error: new Error(`Numărul "${originalNumber}" nu este disponibil pentru restaurare`) 
      }
    }

    // Restabilește numărul
    const { error } = await supabase
      .from('trays')
      .update({ number: originalNumber })
      .eq('id', trayId)

    if (error) throw error

    // Adaugă tavita înapoi în pipeline
    const { data: serviceFile } = await getServiceFile(archivedTray.service_file_id)
    if (serviceFile) {
      // ... adaugă în pipeline
    }

    return { success: true, error: null }
  } catch (error) {
    console.error('[restoreTrayFromArchive] Error:', error)
    return { success: false, error }
  }
}
```

---

## 📊 REZUMAT


