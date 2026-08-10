import * as authController from '../src/controllers/authController.js';
import * as authHandlers from '../src/modules/auth/controllers/authHandlers.js';
import * as reportController from '../src/controllers/reportController.js';
import * as reportHandlers from '../src/modules/reports/controllers/reportHandlers.js';
import * as receiveTokenController from '../src/controllers/receiveTokenController.js';
import * as receiveTokenHandlers from '../src/modules/receiveTokens/controllers/receiveTokenHandlers.js';
import * as csvExportController from '../src/controllers/csvExportController.js';
import * as csvExportHandlers from '../src/modules/csv/controllers/itemCsvExportHandlers.js';
import * as csvImportController from '../src/controllers/csvImportController.js';
import * as csvImportHandlers from '../src/modules/csv/controllers/itemCsvImportHandlers.js';
import * as supplierCsvController from '../src/controllers/supplierCSVController.js';
import * as supplierCsvHandlers from '../src/modules/csv/controllers/supplierCsvHandlers.js';

describe('Controller compatibility facades', () => {
  const expectFacadeParity = (controllerModule, handlerModule, exportNames) => {
    for (const exportName of exportNames) {
      expect(controllerModule).toHaveProperty(exportName);
      expect(handlerModule).toHaveProperty(exportName);
      expect(controllerModule[exportName]).toBe(handlerModule[exportName]);
    }
  };

  test('authController delegates to auth module handlers', () => {
    expectFacadeParity(authController, authHandlers, [
      'register',
      'login',
      'refreshToken',
      'logout',
      'lookupEmail',
      'validateToken',
      'validateInviteToken',
      'acceptInvitation'
    ]);
  });

  test('reportController delegates to reports module handlers', () => {
    expectFacadeParity(reportController, reportHandlers, [
      'getExpiryReport',
      'getEnhancedStockAging',
      'getProductionReport',
      'getPurchaseOrderAnalysis',
      'getExecutiveSummary',
      'getComplianceBooksPackage',
      'exportComplianceBooksPackage',
      'getSnapshots',
      'getSnapshotById',
      'saveSnapshot',
      'exportReportCSV',
      'getStockAging',
      'getSurplusShortage',
      'getFinancialSummary',
      'getSupplierPerformance'
    ]);
  });

  test('receiveTokenController delegates to receiveTokens module handlers', () => {
    expectFacadeParity(receiveTokenController, receiveTokenHandlers, [
      'generateToken',
      'validateToken',
      'receiveViaToken',
      'markTokenUsed'
    ]);
  });

  test('csv item controllers delegate to csv module handlers', () => {
    expectFacadeParity(csvExportController, csvExportHandlers, [
      'exportItems',
      'exportAllItems',
      'previewExport'
    ]);

    expectFacadeParity(csvImportController, csvImportHandlers, [
      'previewImport',
      'confirmImport',
      'getTemplate'
    ]);
  });

  test('supplierCSVController delegates to csv supplier handlers', () => {
    expectFacadeParity(supplierCsvController, supplierCsvHandlers, [
      'exportSuppliers',
      'getTemplate',
      'previewImport',
      'confirmImport'
    ]);
  });
});
