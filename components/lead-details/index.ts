/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        LEAD-DETAILS - SYSTEM OVERVIEW                        ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                              ║
 * ║  Acest modul conține componentele pentru panoul de detalii al unui lead.     ║
 * ║                                                                              ║
 * ║  📁 STRUCTURA FOLDERELOR:                                                    ║
 * ║  ─────────────────────────────────────────────────────────────────────────── ║
 * ║                                                                              ║
 * ║  lead-details/                                                               ║
 * ║  │                                                                           ║
 * ║  ├── 📁 header/        ← Header și navigare                                 ║
 * ║  │   ├── LeadDetailsHeader.tsx  - Header cu titlu și butoane                ║
 * ║  │   └── LeadDetailsTabs.tsx    - Tab-uri (Fișa de serviciu, Confirmat...)  ║
 * ║  │                                                                           ║
 * ║  ├── 📁 sections/      ← Secțiuni de conținut                               ║
 * ║  │   ├── LeadContactInfo.tsx        - Informații contact                    ║
 * ║  │   ├── LeadMessengerSection.tsx   - Mesagerie                             ║
 * ║  │   ├── LeadPipelinesSection.tsx   - Pipeline-uri și stage-uri             ║
 * ║  │   ├── LeadTagsSection.tsx        - Tag-uri (pinned, urgent)              ║
 * ║  │   ├── LeadTrayInfo.tsx           - Informații tăviță                     ║
 * ║  │   └── LeadServiceFilesSelector.tsx - Selector fișe serviciu              ║
 * ║  │                                                                           ║
 * ║  └── 📁 actions/       ← Acțiuni și butoane                                 ║
 * ║      └── LeadDepartmentActions.tsx  - Acțiuni rapide departament            ║
 * ║                                                                              ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  🔄 UTILIZARE ÎN LEAD-DETAILS-PANEL.TSX:                                     ║
 * ║  ─────────────────────────────────────────────────────────────────────────── ║
 * ║                                                                              ║
 * ║  lead-details-panel.tsx (componenta principală)                              ║
 * ║         │                                                                    ║
 * ║         ├──► LeadDetailsHeader (header/)                                     ║
 * ║         ├──► LeadDetailsTabs (header/)                                       ║
 * ║         ├──► LeadDepartmentActions (actions/)                                ║
 * ║         ├──► LeadContactInfo (sections/)                                     ║
 * ║         ├──► LeadTrayInfo (sections/)                                        ║
 * ║         ├──► LeadTagsSection (sections/)                                     ║
 * ║         ├──► LeadPipelinesSection (sections/)                                ║
 * ║         ├──► LeadServiceFilesSelector (sections/)                            ║
 * ║         └──► LeadMessengerSection (sections/)                                ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// ============================================================================
// HEADER - Header și navigare
// ============================================================================
export { LeadDetailsHeader, LeadDetailsTabs } from './header'

// ============================================================================
// SECTIONS - Secțiuni de conținut
// ============================================================================
export { 
  LeadContactInfo,
  LeadMessengerSection,
  LeadPipelinesSection,
  LeadTagsSection,
  LeadTrayInfo,
  LeadServiceFilesSelector
} from './sections'

// ============================================================================
// ACTIONS - Acțiuni și butoane
// ============================================================================
export { LeadDepartmentActions } from './actions'











