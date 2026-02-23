/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                          COMPONENTS - STRUCTURĂ                              ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  📁 ORGANIZAREA FOLDERELOR:                                                  ║
 * ║  ─────────────────────────────────────────────────────────────────────────── ║
 * ║                                                                              ║
 * ║  components/                                                                 ║
 * ║  │                                                                           ║
 * ║  ├── 📁 ui/            ← Componente UI primitive (shadcn/ui)                ║
 * ║  │   └── button, input, card, dialog, table, etc.                           ║
 * ║  │                                                                           ║
 * ║  ├── 📁 auth/          ← Autentificare                                      ║
 * ║  │   ├── AuthStatus.tsx      - Starea de autentificare                      ║
 * ║  │   └── SignOutButton.tsx   - Buton deconectare                            ║
 * ║  │                                                                           ║
 * ║  ├── 📁 layout/        ← Layout și navigare                                 ║
 * ║  │   ├── sidebar.tsx         - Bara laterală                                ║
 * ║  │   └── theme-provider.tsx  - Dark/Light mode                              ║
 * ║  │                                                                           ║
 * ║  ├── 📁 dashboard/     ← Componente Dashboard                               ║
 * ║  │   ├── dashboard-charts.tsx   - Grafice                                   ║
 * ║  │   ├── dashboard-insights.tsx - Insights                                  ║
 * ║  │   └── dashboard-stats.tsx    - Statistici                                ║
 * ║  │                                                                           ║
 * ║  ├── 📁 kanban/        ← Kanban Board                                       ║
 * ║  │   ├── kanban-board.tsx - Board-ul principal                              ║
 * ║  │   └── lead-card.tsx    - Card lead                                       ║
 * ║  │                                                                           ║
 * ║  ├── 📁 leads/         ← Gestionare Lead-uri                                ║
 * ║  │   ├── lead-details-panel.tsx - Panou detalii                             ║
 * ║  │   ├── lead-history.tsx       - Istoric                                   ║
 * ║  │   ├── lead-messenger.tsx     - Mesagerie                                 ║
 * ║  │   ├── lead-modal.tsx         - Modal creare/editare                      ║
 * ║  │   └── de-confirmat.tsx       - Secțiune De Confirmat                     ║
 * ║  │                                                                           ║
 * ║  ├── 📁 lead-details/  ← Detalii Lead (subfoldere)                          ║
 * ║  │   ├── header/    - Header și tabs                                        ║
 * ║  │   ├── sections/  - Secțiuni (contact, tags, pipelines)                   ║
 * ║  │   └── actions/   - Acțiuni departament                                   ║
 * ║  │                                                                           ║
 * ║  ├── 📁 preturi/       ← Sistem Prețuri și Tăvițe (subfoldere)              ║
 * ║  │   ├── core/      - PreturiMain, Orchestrator                             ║
 * ║  │   ├── views/     - ReceptieView, VanzariView, DepartmentView             ║
 * ║  │   ├── forms/     - AddInstrument, AddService, AddPart                    ║
 * ║  │   ├── dialogs/   - CreateTray, EditTray, MoveInstrument                  ║
 * ║  │   ├── sections/  - ItemsTable, TotalsSection, TrayTabs                   ║
 * ║  │   └── utils/     - ClientDetails, PrintViewData                          ║
 * ║  │                                                                           ║
 * ║  ├── 📁 mobile/        ← Componente Mobile                                  ║
 * ║  │   ├── lead-card-mobile.tsx    - Card lead mobil                          ║
 * ║  │   ├── lead-details-sheet.tsx  - Sheet detalii                            ║
 * ║  │   ├── mobile-board-header.tsx - Header board                             ║
 * ║  │   ├── mobile-board-layout.tsx - Layout board                             ║
 * ║  │   └── stage-tabs.tsx          - Tabs stage-uri                           ║
 * ║  │                                                                           ║
 * ║  ├── 📁 print/         ← Printare                                           ║
 * ║  │   └── print-view.tsx - Vizualizare print                                 ║
 * ║  │                                                                           ║
 * ║  ├── 📁 settings/      ← Configurări                                        ║
 * ║  │   └── pipeline-editor.tsx - Editor pipeline-uri                          ║
 * ║  │                                                                           ║
 * ║  └── 📁 lazy/          ← Lazy Loading                                       ║
 * ║      └── index.tsx - Componente încărcate lazy                              ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// Re-export din subfoldere pentru acces ușor
export * from './auth'
export * from './layout'
export * from './dashboard'
export * from './kanban'
export * from './leads'
export * from './print'
export * from './settings'











