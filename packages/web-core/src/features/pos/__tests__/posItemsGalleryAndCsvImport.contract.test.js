import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const carouselPath = path.resolve(__dirname, '../../../../Components/items/SelectedItemImageCarousel.jsx');
const pagePath = path.resolve(__dirname, '../pages/TerminalPage.jsx');
const checkoutViewPath = path.resolve(__dirname, '../components/POSCheckoutTerminalView.jsx');
const pendingPreviewStorePath = path.resolve(__dirname, '../services/posPendingItemImagePreviewStore.js');
const posCatalogServicePath = path.resolve(__dirname, '../../../services/posCatalogService.js');
const workspace = fs.readFileSync(workspacePath, 'utf8');
const carousel = fs.readFileSync(carouselPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');
const checkoutView = fs.readFileSync(checkoutViewPath, 'utf8');
const pendingPreviewStore = fs.readFileSync(pendingPreviewStorePath, 'utf8');
const posCatalogService = fs.readFileSync(posCatalogServicePath, 'utf8');

describe('POS Items gallery and IMS CSV import contracts', () => {
  it('binds queued uploads before later setup can fail and only retries failed image stages', () => {
    const stages = workspace.slice(workspace.indexOf('const runPostCreateStages ='), workspace.indexOf('const handleCreateItem ='));
    expect(stages.indexOf('bindPendingItemImagePreviewJob(')).toBeGreaterThan(stages.indexOf('imageUploadJob = await runStage('));
    expect(stages.indexOf('bindPendingItemImagePreviewJob(')).toBeLessThan(stages.indexOf('if (!barcodeCode)'));
    expect(stages).toContain("imageFiles: failedStages.some((stage) => stage.key === 'storefront_images') ? imageFiles : []");
    expect(stages).toContain('markPendingPosItemImagePreviewFailed({ itemId, attemptId: imageAttemptId })');
    expect(workspace).toContain('imageAttemptId: recoveryAttemptId');
    expect(workspace).not.toContain('pendingCreateRecovery.imageFiles || selectedImageFiles');
  });

  it('supports the shared five-image gallery in create and edit flows', () => {
    expect(workspace).toContain('const STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5;');
    expect(workspace).toContain('multiple');
    expect(workspace).toContain('<SelectedItemImageCarousel');
    expect(workspace).toContain('savedGallery={editGallery}');
    expect(workspace).toContain('onSetSavedPrimary={handleSetSavedEditPrimary}');
    expect(workspace).toContain('onRemoveSaved={handleRemoveSavedEditImage}');
    expect(workspace).toContain('onSetPendingPrimary={handleSetPendingEditPrimary}');
    expect(workspace).not.toContain('<StorefrontImageCarousel');
    expect(workspace).toContain('showPrimaryToggle');
    expect(workspace).toContain('The preview appears immediately. The optimized image is saved automatically and then replaces the preview.');
    expect(workspace).toContain('await queueStorefrontCatalogImages(itemId, filesToUpload)');
    expect(workspace).toContain('subscribeToRemotePosCatalogUpdates');
    expect(workspace).toContain('Only ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} images are allowed per item.');
    expect(workspace).toContain('large files optimized by server');
    expect(workspace).not.toContain('STOREFRONT_ITEM_IMAGE_MAX_BYTES');
  });

  it('keeps Android modal scrolling lightweight while preserving original upload files', () => {
    expect(workspace).not.toContain('bg-slate-950/60 backdrop-blur-sm px-3 py-3');
    expect(workspace.match(/bg-slate-950\/50 px-3 py-3/g)).toHaveLength(2);
    expect(workspace).toContain("toast.info('Duplicate item images were skipped.')");
    expect(carousel).toContain('posPreview = false');
    expect(carousel).toContain('acquirePosImagePreview(file)');
    expect(carousel).toContain('if (cancelled) break;');
    expect(carousel).toContain('URL.revokeObjectURL(url)');
    expect(workspace).not.toContain('monitorCreatedItemImageUpload');
    expect(workspace).toContain('<PosItemImage');
    expect(workspace).toContain('bindPendingItemImagePreviewJob({ itemId, attemptId, jobId });');
    expect(checkoutView).toContain('React.useSyncExternalStore(');
    expect(checkoutView).toContain("pendingItemImagePreviews[String(item.item_id)]?.url");
    expect(checkoutView).toContain('src: pendingImagePreview');
    expect(pendingPreviewStore).toContain('entry.attemptId === attemptId');
    expect(pendingPreviewStore).toContain('dispose(entry.attemptId)');
    expect(checkoutView).toContain('<PosItemImage');
  });

  it('uses the existing IMS CSV wizard and the dedicated import permission', () => {
    expect(workspace).toContain("import CSVImportModal from '@/components/items/CSVImportModal.jsx';");
    expect(workspace).toContain('onClick={() => setShowCsvImport(true)}');
    expect(workspace.match(/Import Items/g)).toHaveLength(2);
    expect(workspace).toContain('await Promise.all([loadItems(), loadPosFolders()]);');
    expect(workspace).toContain("const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';");
    expect(workspace).toContain("resolveUserPermissionList(terminalUser).includes('items:import')");
    expect(page).not.toContain('canImportItems={canImportItems}');
  });

  it('uploads a recoverable ZIP and CSV package in bounded chunks', () => {
    expect(workspace).toContain('Choose exactly one ZIP package and one CSV manifest.');
    expect(workspace).toContain("'Import Image Package'");
    expect(workspace).toContain('onProgress: setBulkPosImageProgress');
    expect(workspace).toContain('Retry failed');
    expect(posCatalogService).toContain('POS_BULK_IMAGE_CHUNK_BYTES = 6 * 1024 * 1024');
    expect(posCatalogService).toContain("'X-Chunk-SHA256': await sha256Hex(chunk)");
    expect(posCatalogService).toContain('getAllPosCatalogImageImportResults(jobId)');
  });
});
