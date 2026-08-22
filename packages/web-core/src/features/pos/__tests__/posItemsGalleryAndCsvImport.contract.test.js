import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const pagePath = path.resolve(__dirname, '../pages/TerminalPage.jsx');
const workspace = fs.readFileSync(workspacePath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

describe('POS Items gallery and IMS CSV import contracts', () => {
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

  it('uses the existing IMS CSV wizard and the dedicated import permission', () => {
    expect(workspace).toContain("import CSVImportModal from '@/components/items/CSVImportModal.jsx';");
    expect(workspace).toContain('onClick={() => setShowCsvImport(true)}');
    expect(workspace.match(/Import Items/g)).toHaveLength(2);
    expect(workspace).toContain('await Promise.all([loadItems(), loadPosFolders()]);');
    expect(workspace).toContain("const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';");
    expect(workspace).toContain("resolveUserPermissionList(terminalUser).includes('items:import')");
    expect(page).not.toContain('canImportItems={canImportItems}');
  });
});
