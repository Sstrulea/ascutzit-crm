/**
 * MODUL VÂNZARI - INDEX
 * ===================================
 * Exporturi principale pentru modulul Vânzări
 */

// Type definitions
export * from './types';

// Lead operations
export {
  setLeadCallback,
  setLeadNuRaspunde,
  setLeadNoDeal,
  setLeadCurierTrimis,
  setLeadOfficeDirect,
  incrementSellerStatistic
} from './leadOperations';

// Statistics
export {
  getSellerStatistics,
  getSellerStatisticsToday,
  getSellerStatisticsDashboard,
  getAllSellersStatistics,
  getTopSellers,
  incrementSellerStatistic as incrementSellerStat
} from './statistics';

// Advanced Statistics
export {
  getTimeToCloseStats,
  getTopSellers as getTopSellersAdvanced,
  getDiscountAnalysis,
  getPaymentMethodsStats,
  getAdvancedDashboardStats
} from './advancedStatistics';

// Facturare
export {
  factureazaServiceFile,
  anuleazaFactura,
  getFacturaDetails,
  generateFacturaHTML
} from './facturare';

// Price Calculator
export {
  calculateItemTotal,
  calculateTrayTotal,
  calculateServiceFileTotal,
  validateForFacturare,
  formatCurrency,
  getCalculationSummary
} from './priceCalculator';
