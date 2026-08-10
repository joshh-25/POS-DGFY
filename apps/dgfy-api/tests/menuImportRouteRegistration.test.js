import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression test for a specific failure mode: a `develop` merge resolved a
 * conflict on this exact route block by silently keeping develop's side,
 * dropping the batch menu-import routes while every file they depend on
 * (controllers, use cases, the worker, server.js's startup wiring) stayed
 * intact and kept compiling. Nothing else in the 81-test menu-import suite
 * would have caught it — those tests exercise handlers and use cases
 * directly, never the router that wires an HTTP path to a handler. This test
 * reads the router source rather than instantiating it, matching the
 * existing convention in commercePaymentRouteMount.contract.test.js, since
 * instantiating the full router would require mocking its entire
 * controller/use-case/DB dependency graph for no extra safety here.
 */
const routesSource = readFileSync(resolve(process.cwd(), 'src/routes/items.js'), 'utf8');

describe('menu import route registration contract', () => {
  it('registers all four batch menu import routes behind the batch guard', () => {
    expect(routesSource).toContain("import * as menuImportBatchHandlers from '../modules/menuImport/controllers/menuImportBatchHandlers.js';");
    expect(routesSource).toContain('const requireMenuImportBatchEnabled = ');

    expect(routesSource).toContain("router.post(\n  '/import/menu/jobs',");
    expect(routesSource).toContain('menuImportBatchHandlers.createMenuImportJob');
    expect(routesSource).toContain("router.get(\n  '/import/menu/jobs/:jobId',");
    expect(routesSource).toContain('menuImportBatchHandlers.getMenuImportJob');
    expect(routesSource).toContain("router.post(\n  '/import/menu/jobs/:jobId/preview',");
    expect(routesSource).toContain('menuImportBatchHandlers.previewMenuImportJob');
    expect(routesSource).toContain("router.post(\n  '/import/menu/confirm',");

    // All four share the batch guard and the same permission check.
    const batchRouteBlock = routesSource.slice(
      routesSource.indexOf("router.post(\n  '/import/menu/jobs',"),
      routesSource.indexOf('// CSV Export routes')
    );
    expect(batchRouteBlock.match(/requireMenuImportBatchEnabled/g)).toHaveLength(4);
    expect(batchRouteBlock.match(/checkPermission\(PERMISSIONS\.INVENTORY\.actions\.IMPORT_ITEMS\)/g)).toHaveLength(4);
  });

  it('re-enters tenant context after the multipart parser on the batch upload route', () => {
    // menuImportBatchUpload streams via multer, whose callbacks can resume on
    // a different async resource than the request — without this wrapper the
    // workflow-mode lookup inside createMenuImportJobUseCase can silently read
    // the wrong tenant's database.
    expect(routesSource).toContain('preserveTenantContext(menuImportBatchUpload.array(\'files\'))');
  });

  it('keeps the deprecated single-file routes served, but marks them deprecated', () => {
    expect(routesSource).toContain("import { markLegacyMenuImportDeprecated } from '../middleware/menuImportDeprecation.js';");

    const singleFilePreview = routesSource.slice(
      routesSource.indexOf("router.post(\n  '/import/pdf/preview',"),
      routesSource.indexOf("router.post(\n  '/import/pdf/confirm',")
    );
    expect(singleFilePreview).toContain('markLegacyMenuImportDeprecated');

    const singleFileConfirm = routesSource.slice(
      routesSource.indexOf("router.post(\n  '/import/pdf/confirm',"),
      routesSource.indexOf("router.post(\n  '/import/menu/jobs',")
    );
    expect(singleFileConfirm).toContain('markLegacyMenuImportDeprecated');
  });

  it('does not mark the batch confirm route as deprecated even though it reuses confirmPdfImport', () => {
    // /import/menu/confirm belongs to the batch (successor) path; only
    // /import/pdf/* is the deprecated predecessor.
    const batchConfirmBlock = routesSource.slice(
      routesSource.indexOf("router.post(\n  '/import/menu/confirm',"),
      routesSource.indexOf('// CSV Export routes')
    );
    expect(batchConfirmBlock).not.toContain('markLegacyMenuImportDeprecated');
  });

  it('registers every menu import route before the :item_id catch-all routes', () => {
    const itemIdRouteIndex = routesSource.indexOf("router.put(\n  '/:item_id',");
    const menuImportIndexes = [
      "router.post(\n  '/import/pdf/preview',",
      "router.post(\n  '/import/pdf/confirm',",
      "router.post(\n  '/import/menu/jobs',",
      "router.get(\n  '/import/menu/jobs/:jobId',",
      "router.post(\n  '/import/menu/jobs/:jobId/preview',",
      "router.post(\n  '/import/menu/confirm',"
    ].map((needle) => routesSource.indexOf(needle));

    expect(itemIdRouteIndex).toBeGreaterThan(-1);
    menuImportIndexes.forEach((index) => {
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(itemIdRouteIndex);
    });
  });
});
