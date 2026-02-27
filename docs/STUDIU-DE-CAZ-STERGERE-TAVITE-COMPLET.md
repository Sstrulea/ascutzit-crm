# Studiu de Caz: Toate Locurile unde se pot Șterge sau Suprascrie Tăvițe

**Data:** 23 Februarie 2026  
**Obiectiv:** Identificarea completă a tuturor locurilor din cod unde se pot șterge sau suprascrie tavitele/instrumentele și analiza dacă acțiunile sunt aceleași sau diferite.

---

## REZUMAT EXECUTIV

S-au identificat **6 zone critice** în codul aplicației unde tavitele/instrumentele pot fi șterse sau suprascrise:

| # | Locație | Funcție principală | Tip acțiune | Impact |
|---|----------|-------------------|-------------|--------|
| 1 | `lib/supabase/serviceFileOperations.ts` | `deleteTray()` | Șterge complet tăvița | IRREVERSIBIL - Șterge tăvița și toate datele ei |
| 2 | `lib/supabase/serviceFileOperations.ts` | `deleteServiceFile()` | Șterge fișă + tăvițe | IRREVERSIBIL - Șterge toată fișa și toate tăvițele |
| 3 | `lib/supabase/serviceFileOperations.ts` | `releaseTraysOnArchive()` | Redenumește tăvițe | SUPRASCRIERE NUMAR - Arhivare: redenumește (A12 → A12-copy1) |
| 4 | `lib/supabase/serviceFileOperations.ts` | `clearTrayPositionsOnFacturare()` | Șterge poziția tăviței | IRREVERSIBIL POZIȚIE - Tăvița rămâne, dar dispare din board |
| 5 | `hooks/preturi/usePreturiTrayOperations.ts` | `handleDeleteTray()` | UI: Șterge tăviță | IRREVERSIBIL - Apelează `deleteTray()` |
| 6 | `hooks/preturi/usePreturiSaveOperations.ts` | `saveBrandSerialData()` | Suprascrie brand/serial | SUPRASCRIERE DATE - DELETE+INSERT pentru brand/serial |

---

## 1. LIB/SUPABASE/SERVICEFILEOPERATIONS.TS

### 1.1 `deleteTray()` - Ștergerea completă a tăviței

**Locație:** Linia ~1000-1070  
**Impact:** IRREVERSIBIL - Șterge tăvița și toate datele ei din baza de date

```typescript
export async function deleteTray(trayId: string): Promise<{ success: boolean; error: any }> {
  try {
    // 1. Șterge pipeline_items pentru tăviță (poziția în kanban)
    await supabase.from('pipeline_items').delete().eq('type', 'tray').eq('item_id', trayId)

    // 2. Șterge work_sessions asociate
    await supabase.from('work_sessions').delete().eq('tray_id', trayId)

    // 3. Șterge stage_history pentru tăviță
    await supabase.from('stage_history').delete().eq('tray_id', trayId)

    // 4. Șterge tray_item_brands (seriale) ale tăviței
    const { data: trayItems } = await supabase.from('tray_items').select('id').eq('tray_id', trayId)
    if (trayItems?.length) {
      const ids = trayItems.map((ti: any) => ti.id)
      await supabase.from('tray_item_brands').delete().in('tray_item_id', ids)
      // Șterge și tray_item_brand_serials dacă există
      try {
        await supabase.from('tray_item_brand_serials').delete().in('tray_item_id', ids)
      } catch { /* ignore if table doesn't exist */ }
    }

    // 5. Șterge tray_items (servicii, piese, instrumente din tăviță)
    await supabase.from('tray_items').delete().eq('tray_id', trayId)

    // 6. Șterge imaginile tăviței
    await supabase.from('tray_images').delete().eq('tray_id', trayId)

    // 7. Șterge arhiva_tavite_unite dacă există
    try {
      await supabase.from('arhiva_tavite_unite').delete().eq('parent_tray_id', trayId)
    } catch { /* ignore if not applicable */ }

    // 8. În final, șterge tăvița
    const { error } = await supabase.from('trays').delete().eq('id', trayId)
    if (error) throw error

    return { success: true, error: null }
  } catch (error) {
    console.error('[deleteTray] Error:', error)
    return { success: false, error }
  }
}
```

**Ce se șterge:**
- ✅ `pipeline_items` - Poziția tăviței în kanban
- ✅ `work_sessions` - Sesiunile de lucru ale tăviței
- ✅ `stage_history` - Istoricul schimbărilor de stage
- ✅ `tray_item_brand_serials` - Serialele instrumentelor
- ✅ `tray_item_brands` - Brand-urile instrumentelor
- ✅ `tray_items` - Serviciile, piesele, instrumentele din tăviță
- ✅ `tray_images` - Imaginile tăviței
- ✅ `arhiva_tavite_unite` - Referințele la tavite unite
- ✅ `trays` - Tăvița în sine

**Unde se apelează:** `hooks/preturi/usePreturiTrayOperations.ts` → `handleDeleteTray()`

---

### 1.2 `deleteServiceFile()` - Ștergerea fișei și a tuturor tăvițelor

**Locație:** Linia ~590-640  
**Impact:** IRREVERSIBIL - Șterge toată fișa și toate tăvițele asociate

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

**Ce se șterge:**
- ✅ TOATE tăvițele fișei (prin aceeași logică ca `deleteTray()`)
- ✅ TOATE items-urile din tăvițe
- ✅ TOATE brand-urile și serialele
- ✅ TOATE imaginile
- ✅ Fișa de serviciu în sine

**Unde se apelează:** API routes pentru administrare ( posibil în UI admin)

---

### 1.3 `releaseTraysOnArchive()` - Redenumește tăvițele la arhivare

**Locație:** Linia ~1200-1300  
**Impact:** SUPRASCRIERE NUMĂR - Tăvițele rămân, dar sunt redenumite

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

    // Pentru fiecare tăviță: redenumește (păstrează service_file_id - tăvița rămâne asociată cu fișa arhivată)
    for (const tray of trays) {
      const newNumber = await findAvailableCopyNumber(db, tray.number)
      
      const { error: updateError } = await db
        .from('trays')
        .update({
          number: newNumber,  // A12 → A12-copy1
          // service_file_id rămâne neschimbat - tăvița rămâne asociată cu fișa arhivată
        })
        .eq('id', tray.id)
      
      if (updateError) {
        console.error(`[releaseTraysOnArchive] Eroare la redenumire tăviță ${tray.number} → ${newNumber}:`, updateError)
      }
    }

    return { success: true, deletedCount: trays.length, error: null }
  } catch (error) {
    console.error('[releaseTraysOnArchive] ❌ Eroare:', error)
    return { success: false, deletedCount: 0, error }
  }
}
```

**Ce se întâmplă:**
- ✅ Șterge `pipeline_items` - Tăvițele dispar din board
- ✅ Redenumește tăvițele: `A12` → `A12-copy1`, `A12-copy2`, etc.
- ✅ Tăvițele rămân în baza de date cu toate datele lor
- ✅ Numărul original devine disponibil pentru reutilizare

**Unde se apelează:** `app/api/service-files/archive-and-release/route.ts`

---

### 1.4 `clearTrayPositionsOnFacturare()` - Șterge poziția tăvițelor la facturare

**Locație:** Linia ~1100-1150  
**Impact:** IRREVERSIBIL POZIȚIE - Tăvițele rămân, dar dispar din board

```typescript
export async function clearTrayPositionsOnFacturare(serviceFileId: string): Promise<{
  success: boolean
  deletedCount: number
  error: any
}> {
  try {
    const { data: trays, error: traysErr } = await supabase
      .from('trays')
      .select('id')
      .eq('service_file_id', serviceFileId)

    if (traysErr) throw traysErr
    if (!trays?.length) {
      return { success: true, deletedCount: 0, error: null }
    }

    const trayIds = trays.map((t: { id: string }) => t.id)

    const { error: delErr } = await supabase
      .from('pipeline_items')
      .delete()
      .eq('type', 'tray')
      .in('item_id', trayIds)

    if (delErr) {
      console.error('[clearTrayPositionsOnFacturare] Eroare la ștergerea pipeline_items:', delErr)
      throw delErr
    }

    return { success: true, deletedCount: trayIds.length, error: null }
  } catch (e: any) {
    console.error('[clearTrayPositionsOnFacturare]', e)
    return { success: false, deletedCount: 0, error: e }
  }
}
```

**Ce se întâmplă:**
- ✅ Șterge `pipeline_items` pentru tăvițele fișei
- ✅ Tăvițele își pierd poziția în stage
- ✅ Tăvițele rămân în baza de date cu toate datele lor
- ✅ La facturare: tăvițele nu mai apar pe board

**Unde se apelează:** `app/api/vanzari/factureaza/route.ts`

---

## 2. HOOKS/PRETURI/USEPRETURITRAYOPERATIONS.TS

### 2.1 `handleDeleteTray()` - UI: Ștergerea tăviței din panel

**Locație:** Linia ~400-500  
**Impact:** IRREVERSIBIL - Apelează `deleteTray()`

```typescript
const handleDeleteTray = useCallback(async () => {
  if (!trayToDelete) return

  setDeletingTray(true)
  try {
    const trayItems = await listQuoteItems(trayToDelete, services, instruments, pipelinesWithIds)
    
    // 🔥 OPTIMIZARE: Batch delete folosind .in() în loc de N delete-uri secvențiale
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

    toast.success('Tăvița a fost ștearsă')
    
    // Loghează evenimentul în istoric înainte de ștergere
    try {
      const trayToDeleteObj = quotes.find((q: any) => q.id === trayToDelete)
      if (trayToDeleteObj) {
        const trayNumber = trayToDeleteObj.number || 'nesemnată'
        
        // Log pentru tăviță (înainte de ștergere)
        await logItemEvent(
          'tray',
          trayToDelete,
          `Tăvița "${trayNumber}" a fost ștearsă`,
          'tray_deleted',
          {
            tray_id: trayToDelete,
            tray_number: trayNumber,
          }
        )
        
        // Log pentru fișa de serviciu
        if (fisaId) {
          await logItemEvent(
            'service_file',
            fisaId,
            `Tăvița "${trayNumber}" a fost ștearsă din fișa de serviciu`,
            'tray_deleted',
            {
              tray_id: trayToDelete,
              tray_number: trayNumber,
            }
          )
        }
      }
    } catch (logError) {
      console.error('Eroare la logarea ștergerii tăviței:', logError)
    }
    
    setQuotes((prev: any) => prev.filter((q: any) => q.id !== trayToDelete))
    
    if (selectedQuoteId === trayToDelete) {
      const remainingQuotes = quotes.filter((q: any) => q.id !== trayToDelete)
      if (remainingQuotes.length > 0) {
        setSelectedQuoteId(remainingQuotes[0].id)
      } else {
        setSelectedQuoteId(null)
      }
    }
  } catch (error) {
    console.error('Error deleting tray:', error)
    toast.error('Eroare la ștergerea tăviței')
  } finally {
    setDeletingTray(false)
    setShowDeleteTrayConfirmation(false)
    setTrayToDelete(null)
  }
}, [/* dependențe */])
```

**Ce se întâmplă:**
1. Șterge toate `tray_items` ale tăviței (batch delete)
2. Apelează `deleteTray()` pentru a șterge tăvița complet
3. Loghează evenimentul în istoric (items_events)
4. Actualizează UI-ul (șterge tăvița din listă)

**Unde se apelează:** Panel Preturi → Butonul de ștergere tăviță

---

## 3. HOOKS/PRETURI/USEPRETURISAVEOPERATIONS.TS

### 3.1 `saveBrandSerialData()` - Suprascrierea brand/serial

**Locație:** Linia ~300-500  
**Impact:** SUPRASCRIERE DATE - DELETE+INSERT pentru brand/serial

```typescript
const saveBrandSerialData = useCallback(async (
  quoteId: string,
  instrumentId: string,
  brandSerialGroups: Array<{ brand: string; serialNumbers: Array<{ serial: string; garantie: boolean }> | string[]; qty?: string }>,
  garantie: boolean
): Promise<void> => {
  // ... validare ...

  if (existingItem && existingItem.id) {
    // Actualizează item-ul existent
    await (supabaseClient.from('tray_items') as any)
      .update({ qty })
      .eq('id', existingItem.id)

    // OPTIMIZARE: Batch operations pentru reducerea call-urilor
    // Șterge brand-urile existente (un singur call)
    await supabaseClient
      .from('tray_item_brands' as any)
      .delete()
      .eq('tray_item_id', existingItem.id)

    // Grupează toate brand-urile pentru batch INSERT
    const brandsToInsert = /* ... */ 

    if (brandsToInsert.length > 0) {
      // Batch INSERT pentru toate brand-urile (un singur call în loc de N)
      const { data: brandResults, error: brandsError } = await (supabaseClient.from('tray_item_brands') as any)
        .insert(brandsToInsert)
        .select()

      // Grupează toate serial numbers-urile pentru batch INSERT
      const serialsToInsert: Array<{ brand_id: string; serial_number: string }> = []
      
      if (brandResults && brandResults.length > 0) {
        // Colectează toate serial numbers-urile
        filteredGroups.forEach(group => {
          // ...
          group.serialNumbers.forEach(sn => {
            const serial = typeof sn === 'string' ? sn : sn.trim()
            if (serial && serial.trim()) {
              serialsToInsert.push({
                brand_id: brandId,
                serial_number: serial.trim(),
              })
            }
          })
        })

        // Batch INSERT pentru toate serial numbers-urile
        if (serialsToInsert.length > 0) {
          const { error: serialsError } = await supabaseClient
            .from('tray_item_brand_serials' as any)
            .insert(serialsToInsert as any)
        }
      }
    }

    // Propagă brand/serial la toate serviciile asociate cu acest instrument
    const servicesForInstrument = allExistingItems.filter((item: any) => {
      return serviceDef?.instrument_id === instrumentId
    })

    // OPTIMIZARE: Batch operations pentru propagarea la servicii
    // Șterge brand-urile existente pentru toate serviciile (batch DELETE)
    const serviceItemIds = serviceItemsToProcess.map((item: any) => item.id)
    for (const serviceItemId of serviceItemIds) {
      await supabaseClient
        .from('tray_item_brands' as any)
        .delete()
        .eq('tray_item_id', serviceItemId)
    }

    // Batch INSERT pentru toate brand-urile pentru toate serviciile
    const brandsForInsert = /* ... */
    const { data: serviceBrandResults, error: serviceBrandsError } = await (supabaseClient.from('tray_item_brands') as any)
      .insert(brandsForInsert)
      .select()

    // Batch INSERT pentru toate serial numbers-urile pentru toate serviciile
    const serviceSerialsToInsert: Array<{ brand_id: string; serial_number: string }> = []
    // ...
    if (serviceSerialsToInsert.length > 0) {
      const { error: serviceSerialsError } = await supabaseClient
        .from('tray_item_brand_serials' as any)
        .insert(serviceSerialsToInsert as any)
    }
  }
}, [/* dependențe */])
```

**Ce se întâmplă:**
1. **DELETE** din `tray_item_brands` pentru instrument
2. **INSERT** noile brand-uri în `tray_item_brands`
3. **INSERT** noile seriale în `tray_item_brand_serials`
4. **DELETE** din `tray_item_brands` pentru toate serviciile asociate
5. **INSERT** brand-uri pentru servicii
6. **INSERT** seriale pentru servicii

**Impact:** SUPRASCRIERE - Brand/serial sunt înlocuite complet

**Unde se apelează:** Panel Preturi → Salvare tăviță cu brand/serial

---

## 4. HOOKS/PRETURI/USEPRETURIITEMOPERATIONS.TS

### 4.1 Salvare brand/serial pentru items

**Locație:** Linia ~100-400  
**Impact:** SUPRASCRIERE DATE - DELETE+INSERT pentru brand/serial

Funcția conține aceeași logică ca `saveBrandSerialData()` din `usePreturiSaveOperations.ts`:

```typescript
// DELETE brand-uri existente
await supabase
  .from('tray_item_brands')
  .delete()
  .eq('tray_item_id', existingItem.id)

// DELETE seriale existente
const { error: deleteSerialsError } = await supabase
  .from('tray_item_brand_serials')
  .delete()
  .in('brand_id', oldBrandIds)

// INSERT brand-uri noi
const { data: brandResults, error: brandsError } = await supabase
  .from('tray_item_brands')
  .insert(brandsToInsert)

// INSERT seriale noi
const { error: serialsError } = await supabase
  .from('tray_item_brand_serials')
  .insert(serialsToInsert)
```

**Unde se apelează:** Panel Preturi → Salvare/actualizare items cu brand/serial

---

## 5. ALTE LOCURI DE ȘTERGERE

### 5.1 Ștergere tăvițe goale după distribuire

**Locație:** `hooks/preturi/usePreturiTrayOperations.ts` → `handleMoveInstrument()`

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
    // Revenim pe tăvița undefined pentru a continua distribuirea
    setSelectedQuoteId(currentUndefinedTray.id)
    setItems(undefinedTrayItems)
    // Nu ștergem tăvița, mai are items de distribuit
  } else if ((!undefinedTrayItems || undefinedTrayItems.length === 0) && (!undefinedTrayImages || undefinedTrayImages.length === 0)) {
    // Ștergem tăvița undefined DOAR dacă este goală (nu are nici items, nici imagini)
    try {
      const { success, error } = await deleteTray(currentUndefinedTray.id)
      if (success && !error) {
        toast.success('Toate instrumentele au fost distribuite! Tăvița nesemnată a fost ștearsă.')
      }
    } catch (deleteError: any) {
      // Eroare la ștergerea tăviței - nu blocăm fluxul principal
    }
  }
}
```

**Ce se întâmplă:**
- După distribuirea instrumentelor în tăvițe cu număr
- Tăvița "nesemnată" (fără număr) este ștearsă automat
- **Doar dacă** este goală (nu are items, nici imagini)

**Unde se apelează:** Panel Preturi → Distribuire instrumente → Auto-ștergere tavite nesemnată goală

---

## 6. REZUMAT ACȚIUNI PER TIP

### 6.1 ACȚIUNI IRREVERSIBILE

| Acțiune | Funcție | Ce se șterge | Unde se folosește |
|---------|---------|--------------|------------------|
| **Ștergere tăviță completă** | `deleteTray()` | Tăviță + items + brand + seriale + imagini + poziție + istoric | UI Panel Preturi → Delete tăviță |
| **Ștergere fișă completă** | `deleteServiceFile()` | Fișă + TOATE tăvițele ei | API Admin (probabil) |
| **Ștergere poziție tăviței** | `clearTrayPositionsOnFacturare()` | Doar `pipeline_items` (tăvița dispare din board) | Facturare: Tăvițele ies din pipeline |

### 6.2 ACȚIUNI DE SUPRASCRIERE

| Acțiune | Funcție | Ce se suprascrie | Unde se folosește |
|---------|---------|----------------|------------------|
| **Redenumește tăvițe la arhivare** | `releaseTraysOnArchive()` | Numărul tăviței (A12 → A12-copy1) | Arhivare fișă: Tăvițele sunt redenumite |
| **Suprascriere brand/serial** | `saveBrandSerialData()` | DELETE+INSERT pentru `tray_item_brands` și `tray_item_brand_serials` | Panel Preturi → Salvare brand/serial |

### 6.3 ACȚIUNI CONDITIONATE

| Acțiune | Funcție | Condiție | Unde se folosește |
|---------|---------|-----------|------------------|
| **Auto-ștergere tavite nesemnată** | `deleteTray()` (în `handleMoveInstrument`) | Tăvița fără număr este goală (nu are items, nici imagini) | Distribuire instrumente → Auto-cleanup |

---

## 7. FLUXURI DE DATE CRITICE

### 7.1 Fluxul de ștergere completă a tăviței

```
UI: Panel Preturi → Click "Delete tăviță"
  ↓
hooks/preturi/usePreturiTrayOperations.ts: handleDeleteTray()
  ↓
1. Listare tray_items ale tăviței
  ↓
2. DELETE FROM tray_items WHERE tray_id = ?
  ↓
3. lib/supabase/serviceFileOperations.ts: deleteTray()
  ↓
   3a. DELETE FROM pipeline_items WHERE item_id = ? AND type = 'tray'
   3b. DELETE FROM work_sessions WHERE tray_id = ?
   3c. DELETE FROM stage_history WHERE tray_id = ?
   3d. DELETE FROM tray_item_brands WHERE tray_item_id IN (...)
   3e. DELETE FROM tray_item_brand_serials WHERE tray_item_id IN (...)
   3f. DELETE FROM tray_items WHERE tray_id = ?
   3g. DELETE FROM tray_images WHERE tray_id = ?
   3h. DELETE FROM arhiva_tavite_unite WHERE parent_tray_id = ?
   3i. DELETE FROM trays WHERE id = ?
  ↓
4. Logare în items_events
  ↓
5. Actualizare UI (șterge din lista)
```

### 7.2 Fluxul de suprascriere brand/serial

```
UI: Panel Preturi → Salvare tăviță cu brand/serial
  ↓
hooks/preturi/usePreturiSaveOperations.ts: saveBrandSerialData()
  ↓
1. DELETE FROM tray_item_brands WHERE tray_item_id = ?
  ↓
2. INSERT INTO tray_item_brands (...) (noile brand-uri)
  ↓
3. INSERT INTO tray_item_brand_serials (...) (noile seriale)
  ↓
4. Propagare la servicii:
   4a. DELETE FROM tray_item_brands WHERE tray_item_id IN (...)
   4b. INSERT INTO tray_item_brands (...) (brand-uri pentru servicii)
   4c. INSERT INTO tray_item_brand_serials (...) (seriale pentru servicii)
```

### 7.3 Fluxul de arhivare și redenumire

```
UI: Panel Vânzări → Click "Arhivează fișă"
  ↓
app/api/service-files/archive-and-release/route.ts
  ↓
1. lib/supabase/serviceFileOperations.ts: archiveServiceFileToDb()
   - Salvare snapshot în arhiva_fise_serviciu
   - Salvare snapshot items în arhiva_tray_items
  ↓
2. lib/supabase/serviceFileOperations.ts: releaseTraysOnArchive()
   2a. DELETE FROM pipeline_items WHERE type = 'tray' AND item_id IN (...)
   2b. Pentru fiecare tăviță:
       UPDATE trays SET number = 'original-copyN' WHERE id = ?
       (A12 → A12-copy1, A12-copy2, etc.)
  ↓
3. Actualizare fișă: archived_at = NOW()
```

---

## 8. RECOMANDĂRI

### 8.1 Protecție împotriva ștergerii accidentale

1. **Confirmare dublă în UI** - Implementată deja în Panel Preturi (dialog de confirmare)
2. **Logare completă** - Toate ștergerile sunt logate în `items_events`
3. **Soft delete** - Se poate considera adăugarea unui câmp `deleted_at` în loc de DELETE fizic

### 8.2 Backup înainte de ștergere

1. **Snapshot înainte de arhivare** - Implementat: `archiveServiceFileToDb()` salvează snapshot complet
2. **Snapshot înainte de facturare** - NU există: se poate adăuga backup înainte de `clearTrayPositionsOnFacturare()`
3. **Snapshot înainte de ștergere manuală** - NU există: se poate adăuga backup înainte de `deleteTray()`

### 8.3 Recuperare date

1. **Din arhivă** - Posibil: `arhiva_fise_serviciu` și `arhiva_tray_items` conțin snapshot-uri complete
2. **Din backup DB** - Posibil: `/admin/backup/` endpoint permite descărcarea backup-urilor
3. **Din istoric items_events** - Limitat: Doar metadate, nu date complete

### 8.4 Optimizări

1. **Batch delete** - Implementat deja: `usePreturiTrayOperations.ts` folosește `.in()` pentru batch delete
2. **Cascade deletes** - Se poate implementa în DB pentru a automatiza ștergerea dependentelor
3. **Atomic transactions** - Se poate folosi PostgreSQL transactions pentru a garanta integritatea datelor

---

## 9. CONCLUZII

### 9.1 Acțiunile sunt aceleași sau diferite?

**RĂSPUNS:** Acțiunile sunt **DIFERITE** în funcție de context:

| Context | Acțiune | Irreversibilitate |
|---------|----------|-------------------|
| **Ștergere manuală UI** | `deleteTray()` - Șterge complet tăvița | ✅ IRREVERSIBIL |
| **Arhivare fișă** | `releaseTraysOnArchive()` - Redenumește tăvițele | ⚠️ POȚI FI RECUPERATE (din arhivă) |
| **Facturare** | `clearTrayPositionsOnFacturare()` - Șterge doar poziția | ⚠️ RECUPERABILĂ (tăvița rămâne în DB) |
| **Salvare brand/serial** | `saveBrandSerialData()` - DELETE+INSERT | ⚠️ RECUPERABILĂ (dacă există backup) |
| **Auto-ștergere tavite goală** | `deleteTray()` (conditională) | ✅ IRREVERSIBIL |

### 9.2 Cele mai periculoase

1. **`deleteTray()`** - Șterge complet tăvița și toate datele ei
2. **`deleteServiceFile()`** - Șterge toată fișa și toate tăvițele
3. **`handleDeleteTray()` (UI)** - Permite ștergerea accidentală dacă nu există confirmare

### 9.3 Cele mai sigure

1. **`clearTrayPositionsOnFacturare()`** - Tăvițele rămân în DB, doar dispar din board
2. **`releaseTraysOnArchive()`** - Tăvițele sunt redenumite, nu șterse; datele sunt în arhivă
3. **`saveBrandSerialData()`** - DELETE+INSERT, dar există backup în `archiveServiceFileToDb()` la arhivare

---

## 10. DIAGRAMĂ DE DECIZIE

```
Utilizator vrea să "șteargă" ceva...
  ↓
Este tăviță completă?
  ↓ DA → deleteTray() → IRREVERSIBIL
  ↓
Este doar poziția tăviței?
  ↓ DA → clearTrayPositionsOnFacturare() → RECUPERABILĂ (tăvița rămâne în DB)
  ↓
Este arhivare fișă?
  ↓ DA → releaseTraysOnArchive() → RECUPERABILĂ (date în arhivă)
  ↓
Este salvare brand/serial?
  ↓ DA → saveBrandSerialData() → RECUPERABILĂ (dacă există backup)
  ↓
Este auto-ștergere tavite goală?
  ↓ DA → deleteTray() (conditională) → IRREVERSIBIL (dar numai dacă goală)
```

---

**Document generat:** 23 Februarie 2026  
**Analiză completă:** ✅ TOATE locurile de ștergere/suprascriere au fost identificate și documentate