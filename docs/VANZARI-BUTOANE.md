# Butoane Vânzări și VanzariViewV4

Document de referință pentru **toate** butoanele legate de pipeline-ul **Vânzări** și de **VanzariViewV4** (panoul de prețuri / fișă de serviciu). Fiecare buton are **data-button-id** și/sau **title** în cod pentru identificare rapidă (teste, documentație, debugging).

---

## 1. Pagina Leads – Toolbar Vânzări

**Fișier:** `app/(crm)/leads/[pipeline]/page.tsx`  
**Vizibil când:** `pipelineSlug === 'vanzari'` (header deasupra board-ului Kanban).

| # | Denumire în UI | data-button-id | Locație (aprox.) | Titlu / Descriere |
|---|----------------|----------------|------------------|-------------------|
| 1 | Toate | `vanzariFilterToate` | ~1914 | Filtru: toate lead-urile |
| 2 | Sunați (N) | `vanzariFilterSunati` | ~1915 | Filtru: lead-uri de sunat |
| 3 | CB (N) | `vanzariFilterCallback` | ~1916 | Filtru: Call Back |
| 4 | No deal (N) | `vanzariFilterNoDeal` | ~1917 | Filtru: No deal |
| 5 | Deal (N) | `vanzariFilterYesDeal` | ~1918 | Filtru: Yes deal |
| 6 | Curier trimis (N) | `vanzariFilterCurierTrimis` | ~1919 | Filtru: Curier ajuns azi |
| 7 | Office direct (N) | `vanzariFilterOfficeDirect` | ~1920 | Filtru: Office direct |
| 8 | Stage-uri ascunse | `vanzariToggleHiddenStages` | ~1922 | Arată/ascunde stage-uri (Avem Comandă etc.) – admin/owner |
| 9 | Filtre | `vanzariFiltersButton` | ~1940 | Deschide popover Filtre |
| 10 | De la / Până la (Activ) | `vanzariFiltersDateToggle` | ~1979 | Comută filtre după dată (De la / Până la) |
| 11 | Resetează (popover Filtre) | `vanzariFiltersResetButton` | ~1962 | Resetează filtrele din popover |
| 12 | Resetează toate filtrele | `receptieResetFiltersButton` | ~2031 | Resetează toate filtrele + search (icon X) |
| 13 | Layout | `receptieLayoutButton` | ~2090 | Customizare layout / reordonare coloane |
| 14 | Add Lead | `receptieAddLeadButton` | ~2096 | Deschide dialog creare lead |
| 15 | + Stage | `vanzariAddStageButton` | ~2103 | Adaugă stage nou – owner |
| 16 | Edit | `vanzariEditBoardButton` | ~2107 | Edit pipeline (ordine, nume) – owner |

### 1.2 Dialoage deschise din pagina Vânzări

**Dialog Creează Stage** (deschis din „+ Stage” sau din starea „nu are stage-uri”):

| # | Denumire în UI | data-button-id | Locație | Titlu |
|---|----------------|----------------|---------|-------|
| 17 | Adaugă primul stage | `vanzariCreateStageFirstButton` | ~2186 | Deschide formular creare stage (când pipeline fără stage-uri) |
| 18 | Anulează (Creează Stage) | `vanzariCreateStageCancelButton` | ~2536 | Închide dialog fără a crea stage |
| 19 | Creează Stage | `vanzariCreateStageSubmitButton` | ~2545 | Trimite formular – creează stage |

**Dialog Creează Lead** (deschis din „Add Lead” pe Vânzări):

| # | Denumire în UI | data-button-id | Locație | Titlu |
|---|----------------|----------------|---------|-------|
| 20 | Anulează (Creează Lead) | `vanzariCreateLeadCancelButton` | ~3076 | Închide dialog fără a crea lead |
| 21 | Creează lead / Adaugă | `vanzariCreateLeadSubmitButton` | ~3106 | Creează lead în pipeline |

**Dialog QC (Validare / Dont Validate)** – vizibil când se deschide din VanzariView (buton Validare QC) sau din board:

| # | Denumire în UI | data-button-id | Locație | Titlu |
|---|----------------|----------------|---------|-------|
| 22 | Închide (QC) | `vanzariQcCloseButton` | ~2421 | Închide dialog QC |
| 23 | Dont Validate | `vanzariQcDontValidateButton` | ~2429 | Refuză validarea QC |
| 24 | Validate | `vanzariQcValidateButton` | ~2437 | Confirmă validarea QC |

---

## 2. VanzariViewV4 – Panou fișă de serviciu (prețuri / tăvițe)

**Fișier:** `components/preturi/views/VanzariViewV4.tsx`  
**Vizibil când:** se deschide un lead din Vânzări sau Recepție și se afișează panoul de prețuri (tăvițe, instrumente, servicii).

### 2.1 Bară opțiuni (Urgent, Abonament, Livrare, Acțiuni)

| # | Denumire în UI | data-button-id | Locație în cod (aprox.) | Titlu |
|---|----------------|----------------|--------------------------|-------|
| 16 | Office direct | `vanzariViewOfficeDirectButton` | ~linia 1722 | Comută Office direct |
| 17 | Curier Trimis | `vanzariViewCurierTrimisButton` | ~linia 1738 | Comută Curier Trimis (poate deschide dialog dată/oră) |
| 18 | Retur | `vanzariViewReturButton` | ~linia 1761 | Comută Retur |
| 19 | Acțiuni tăviță | `vanzariViewTrayActionsDropdown` | ~linia 1783 | Dropdown: Împarte volum, Reunește, Împarte tăvița (departamente) |
| 20 | Închide | `vanzariViewCloseButton` | ~linia 1799 | Închide panoul de detalii |
| 21 | Trimite tăvițele | `vanzariViewSendTraysButton` | ~linia 1804 | Trimite tăvițele în departamente |
| 22 | Print tăvițe | `vanzariViewPrintTraysButton` | ~linia 1829 | Print tăvițe (A4) |
| 23 | Salvează | `vanzariViewSaveOptionsButton` | ~linia 1842 | Salvează opțiunile (Urgent, Retur, Office, Curier) |
| 24 | Salvează în Istoric | `vanzariViewSaveInHistoryButton` | ~linia 1861 | Salvează toate modificările în istoricul fișei |

### 2.2 Secțiune Tăvițe (SummaryTable)

| # | Denumire în UI | data-button-id | Locație | Titlu |
|---|----------------|----------------|---------|-------|
| 25 | Validare QC | `vanzariViewValidateQcButton` | ~667 (pe tag tăviță) | Validare QC (admin) – icon FileCheck |
| 26 | Editează nr. tăviței | `vanzariViewEditTrayButton` | ~681 (pe tag tăviță) | Deschide popover editare număr tăviță |
| 27 | Anulează (editare tăviță) | `vanzariViewTrayEditCancelButton` | ~705 | Anulează editarea numărului tăviței |
| 28 | Salvează (editare tăviță) | `vanzariViewTrayEditSaveButton` | ~708 | Salvează numărul tăviței |
| 29 | Șterge tăvița | `vanzariViewRemoveTrayButton` | ~715 | Șterge tăvița din listă |
| 30 | Adaugă tăvițe | `vanzariViewAddTraysButton` | ~735 și ~764 | Adaugă tăvițe (nr. din input) |

### 2.3 Card instrument (InstrumentCard)

| # | Denumire în UI | data-button-id | Titlu |
|---|----------------|----------------|-------|
| 31 | Scade cantitate instrument | `vanzariViewInstrumentQtyMinus` | Scade cantitatea cu 1 |
| 32 | Crește cantitate instrument | `vanzariViewInstrumentQtyPlus` | Crește cantitatea cu 1 |
| 33 | Șterge instrument | `vanzariViewRemoveInstrumentButton` | Șterge instrumentul din listă |
| 34 | Scade cantitate piesă | `vanzariViewPartQtyMinus` | Scade cantitatea piesei cu 1 |
| 35 | Crește cantitate piesă | `vanzariViewPartQtyPlus` | Crește cantitatea piesei cu 1 |
| 36 | Șterge piesă | `vanzariViewRemovePartButton` | Șterge piesa din listă |
| 37 | Adaugă (piesă) | `vanzariViewAddPartButton` | Adaugă piesă (nume + preț din câmpuri) |

### 2.4 Selector serie (S/N) – serviciu și piesă

În tabelul de instrumente/servicii/piese, coloana „Serie” are dropdown-uri pentru selectare multiplă S/N.

| # | Denumire în UI | data-button-id | Locație | Titlu |
|---|----------------|----------------|---------|-------|
| 38 | Serie serviciu (S/N) | `vanzariViewServiceSerialNumbersTrigger` | ~880 | Deschide popover S/N pentru serviciu |
| 39 | Serie piesă (S/N) | `vanzariViewPartSerialNumbersTrigger` | ~1084 | Deschide popover S/N pentru piesă |

### 2.5 Selector instrument + Adaugă instrument

| # | Denumire în UI | data-button-id | Titlu |
|---|----------------|----------------|-------|
| 40 | Caută instrument (combobox) | `vanzariViewInstrumentCombobox` | Caută și selectează instrument de adăugat |
| 41 | Adaugă instrument | `vanzariViewAddInstrumentButton` | Adaugă instrumentul selectat cu cantitatea din câmp |

### 2.6 Dialog Curier Trimis

| # | Denumire în UI | data-button-id | Titlu |
|---|----------------|----------------|-------|
| 42 | Selectează data (calendar) | `vanzariViewCurierDatePickerButton` | Deschide calendar pentru data Curier Trimis |
| 43 | Anulează (dialog Curier) | `vanzariViewCurierDialogCancelButton` | Închide fără a seta Curier Trimis |
| 44 | Confirmă (dialog Curier) | `vanzariViewCurierDialogConfirmButton` | Setează Curier Trimis cu data/ora selectate |

### 2.7 Bară fixă mobil (telefon)

| # | Denumire în UI | data-button-id | Titlu |
|---|----------------|----------------|-------|
| 45 | Închide (mobil) | `vanzariViewMobileCloseButton` | Închide panoul |
| 46 | Trimite tăvițele (mobil) | `vanzariViewMobileSendTraysButton` | Trimite tăvițele |
| 47 | Print (mobil) | `vanzariViewMobilePrintButton` | Print tăvițe |
| 48 | Salvează (mobil) | `vanzariViewMobileSaveOptionsButton` | Salvează opțiunile |
| 49 | Salvează în Istoric (mobil) | `vanzariViewMobileSaveInHistoryButton` | Salvează în Istoric |

---

## Cum găsești un buton în cod

- **Pagina Vânzări (toolbar):** caută în `app/(crm)/leads/[pipeline]/page.tsx` după `data-button-id` sau după textul din coloana „Denumire în UI”.
- **VanzariViewV4:** caută în `components/preturi/views/VanzariViewV4.tsx` după `data-button-id` sau după `logBtn('vanzariView...')` / titlul din coloana „Titlu”.

## Identificare în teste / DevTools

- Selector exemplu: `[data-button-id="vanzariViewSendTraysButton"]`
- Titlurile sunt setate cu atributul HTML `title` pentru tooltip și pentru identificare.
