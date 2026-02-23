/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                           PRETURI - SYSTEM OVERVIEW                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  Acest modul gestionează toată logica pentru fișele de serviciu și tăvițe.   ║
 * ║                                                                              ║
 * ║  📁 STRUCTURA FOLDERELOR:                                                    ║
 * ║  ─────────────────────────────────────────────────────────────────────────── ║
 * ║                                                                              ║
 * ║  preturi/                                                                    ║
 * ║  │                                                                           ║
 * ║  ├── 📁 core/          ← Componente principale și orchestrare               ║
 * ║  │   ├── PreturiMain.tsx        - Entry point (folosit în lead-details)     ║
 * ║  │   ├── PreturiOrchestrator.tsx - Decide ce view să afișeze               ║
 * ║  │   └── PreturiProvider.tsx    - Context provider                          ║
 * ║  │                                                                           ║
 * ║  ├── 📁 views/         ← View-uri pentru fiecare pipeline                   ║
 * ║  │   ├── ReceptieView.tsx   - Pipeline: Recepție                            ║
 * ║  │   ├── VanzariView.tsx    - Pipeline: Vânzări                             ║
 * ║  │   ├── DepartmentView.tsx - Pipelines: Saloane/Frizerii/Reparații/Horeca  ║
 * ║  │   └── CurierView.tsx     - Pipeline: Curier                              ║
 * ║  │                                                                           ║
 * ║  ├── 📁 forms/         ← Formulare pentru adăugare elemente                 ║
 * ║  │   ├── AddInstrumentForm.tsx - Adaugă instrument                          ║
 * ║  │   ├── AddServiceForm.tsx    - Adaugă serviciu                            ║
 * ║  │   └── AddPartForm.tsx       - Adaugă piesă (doar Reparații)              ║
 * ║  │                                                                           ║
 * ║  ├── 📁 dialogs/       ← Dialog-uri modale                                  ║
 * ║  │   ├── CreateTrayDialog.tsx     - Creare tăviță nouă                      ║
 * ║  │   ├── EditTrayDialog.tsx       - Editare tăviță                          ║
 * ║  │   └── MoveInstrumentDialog.tsx - Mutare instrument între tăvițe          ║
 * ║  │                                                                           ║
 * ║  ├── 📁 sections/      ← Secțiuni reutilizabile                             ║
 * ║  │   ├── ItemsTable.tsx         - Tabel cu servicii/piese                   ║
 * ║  │   ├── TotalsSection.tsx      - Totaluri (subtotal, discount, total)      ║
 * ║  │   ├── TrayActions.tsx        - Acțiuni tăviță (urgent, abonament)        ║
 * ║  │   ├── TrayDetailsSection.tsx - Detalii client/comandă                    ║
 * ║  │   ├── TrayImagesSection.tsx  - Galerie imagini                           ║
 * ║  │   └── TrayTabs.tsx           - Tab-uri selectare tăviță                  ║
 * ║  │                                                                           ║
 * ║  └── 📁 utils/         ← Utilități                                          ║
 * ║      ├── ClientDetails.tsx        - Afișare info client                     ║
 * ║      ├── PipelineRestrictions.tsx - Restricții pipeline                     ║
 * ║      └── PrintViewData.tsx        - Date pentru printare                    ║
 * ║                                                                              ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  🔄 FLUX DE DATE:                                                            ║
 * ║  ─────────────────────────────────────────────────────────────────────────── ║
 * ║                                                                              ║
 * ║  lead-details-panel.tsx                                                      ║
 * ║         │                                                                    ║
 * ║         ▼                                                                    ║
 * ║  PreturiMain (core/)                                                         ║
 * ║         │                                                                    ║
 * ║         ▼                                                                    ║
 * ║  PreturiOrchestrator (core/)                                                 ║
 * ║         │                                                                    ║
 * ║         ├──► isVanzariPipeline? ──► VanzariView (views/)                     ║
 * ║         ├──► isReceptiePipeline? ──► ReceptieView (views/)                   ║
 * ║         ├──► isDepartmentPipeline? ──► DepartmentView (views/)               ║
 * ║         └──► default ──► CurierView (views/)                                 ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// ============================================================================
// CORE - Componente principale
// ============================================================================
export { PreturiMain, PreturiOrchestrator, PreturiProvider } from './core'

// ============================================================================
// VIEWS - View-uri pentru fiecare pipeline
// ============================================================================
export { ReceptieView, VanzariView, DepartmentView, CurierView } from './views'

// ============================================================================
// FORMS - Formulare pentru adăugare elemente
// ============================================================================
export { AddInstrumentForm, AddServiceForm, AddPartForm } from './forms'

// ============================================================================
// DIALOGS - Dialog-uri modale
// ============================================================================
export { CreateTrayDialog, EditTrayDialog, MoveInstrumentDialog } from './dialogs'

// ============================================================================
// SECTIONS - Secțiuni reutilizabile
// ============================================================================
export { 
  ItemsTable, 
  TotalsSection, 
  TrayActions, 
  TrayDetailsSection, 
  TrayImagesSection, 
  TrayTabs 
} from './sections'

// ============================================================================
// UTILS - Utilități
// ============================================================================
export { ClientDetails, PipelineRestrictions, PrintViewData } from './utils'
