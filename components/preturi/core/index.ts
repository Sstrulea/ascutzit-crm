/**
 * 📁 CORE - Componente principale și orchestrare
 * 
 * Aceste componente formează nucleul sistemului Preturi:
 * - PreturiMain: Entry point principal (componenta exportată pentru utilizare externă)
 * - PreturiOrchestrator: Decide ce view să afișeze în funcție de pipeline
 * - PreturiProvider: Context provider pentru state management
 * 
 * Flux: PreturiMain → PreturiOrchestrator → View-uri (Receptie/Vanzari/Department/Curier)
 */

export { default as PreturiMain } from './PreturiMain'
export { PreturiOrchestrator } from './PreturiOrchestrator'
export { PreturiProvider } from './PreturiProvider'











