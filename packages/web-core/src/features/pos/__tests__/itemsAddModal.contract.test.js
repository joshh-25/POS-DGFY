import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const stylesheetPath = path.resolve(__dirname, '../../../index.css');

describe('POS Add Items desktop modal', () => {
  it('keeps tablet-landscape dropzone sizing off the Upload New Image buttons in both forms', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
    const compactLandscapeStart = stylesheet.indexOf('/* Landscape tablets have enough width for the desktop form composition');
    const compactLandscapeEnd = stylesheet.indexOf('/* Keep the Primary image control clear of the carousel dots', compactLandscapeStart);
    const finalLandscapeStart = stylesheet.indexOf('/* Landscape tablets have limited vertical space inside the device frame.');
    const finalLandscapeEnd = stylesheet.indexOf('/* Add/Edit Item opens through a body portal', finalLandscapeStart);
    const tabletLandscapeStyles = stylesheet.slice(compactLandscapeStart, compactLandscapeEnd)
      + stylesheet.slice(finalLandscapeStart, finalLandscapeEnd);

    expect(workspace.match(/pos-items-image-upload-dropzone/g)).toHaveLength(2);
    expect(compactLandscapeStart).toBeGreaterThanOrEqual(0);
    expect(finalLandscapeStart).toBeGreaterThanOrEqual(0);
    expect(tabletLandscapeStyles.match(/\.pos-items-image-upload-dropzone\s*\{/g)).toHaveLength(2);
    expect(tabletLandscapeStyles).not.toContain('label[for="pos-item-image"]');
    expect(tabletLandscapeStyles).not.toContain('label[for="pos-item-edit-image"]');
  });

  it('caps image selection at five and uses the shared four-thumbnail overflow gallery', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const handlerStart = workspace.indexOf('const handleSelectCreateImageFiles = (files) => {');
    const handlerEnd = workspace.indexOf('const removeSelectedCreateImageFile', handlerStart);
    const imageSelectionHandler = workspace.slice(handlerStart, handlerEnd);

    expect(imageSelectionHandler).toContain('const remainingSlots = STOREFRONT_ITEM_IMAGE_MAX_COUNT - selectedImageFiles.length;');
    expect(imageSelectionHandler).toContain('const availableSlots = Math.max(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT - current.length);');
    expect(imageSelectionHandler).toContain('...normalizedFiles.slice(0, availableSlots)');
    expect(workspace).toContain('{selectedImageFiles.length} / {STOREFRONT_ITEM_IMAGE_MAX_COUNT}');
    expect(workspace.match(/maxVisibleThumbnails=\{4\}/g)).toHaveLength(2);

    const addImageStart = workspace.indexOf('id="pos-item-image"');
    const addImageEnd = workspace.indexOf('acceptedExternalProduct?.product?.image_url', addImageStart);
    const addImagePresentation = workspace.slice(addImageStart, addImageEnd);
    expect(addImagePresentation).toContain('selectedImageFiles.length > 0 ? (');
    expect(addImagePresentation).toContain('showPrimaryToggle');
    expect(addImagePresentation).toContain('editItemPresentation');
    expect(addImagePresentation).toContain('onSetPendingPrimary={handleSetPendingCreatePrimary}');
    expect(addImagePresentation).toContain('Upload New Image');
    expect(workspace).toContain('const [selectedCreatePrimaryFile, setSelectedCreatePrimaryFile] = useState(null);');
    expect(workspace).toContain('imageFiles: createImageFiles,');
  });

  it('matches the desktop wireframe while keeping create data backend-driven', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('Product Details');
    expect(workspace).toContain('max-w-[54rem]');
    expect(workspace).toContain('xl:grid-cols-[12rem_minmax(0,1fr)_12rem]');
    expect(workspace).toContain('min-h-[10rem]');
    expect(workspace).toContain('compact = false');
    expect(workspace).toContain('Product Barcode');
    expect(workspace).toContain('border-[#C7DCF3] bg-[#EEF5FF]');
    expect(workspace).toContain('-mx-px -mt-px flex shrink-0 items-center justify-between gap-3 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D]');
    expect(workspace).not.toContain('Active Item</span>');
    expect(workspace).toContain('Always Available');
    expect(workspace).toContain('Best Seller');
    expect(workspace).toContain('Senior/PWD Eligible');
    expect(workspace).toContain('getPosItemStatusSwitchClass');
    expect(workspace).toContain('pos-items-status-switch');
    expect(workspace).toContain('bg-[#1A4E8D] hover:bg-[#143F73] focus-visible:ring-[#2563EB]');
    expect(workspace).toContain('Add Options');
    expect(workspace).toContain('data-testid="pos-items-create-options-list"');
    expect(workspace).toContain('pos-items-modal-option-list pos-items-modal-scrollbar mt-2 min-h-0 space-y-1.5 overflow-y-auto');
    expect(workspace).toContain('overflow-y-auto');
    expect(workspace).toContain('listFnbModifierGroups({ include_inactive: false })');
    expect(workspace).toContain('replaceFnbItemModifierGroups(itemId');
    expect(workspace).toContain('option.name');
    expect(workspace).toContain('option.price.toFixed(2)');
    expect(workspace).not.toContain('Option Name');
    expect(workspace).not.toContain('P20.00');
  });

  it('keeps tablet-portrait primary actions solid and import controls interactive', () => {
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
    const tabletStart = stylesheet.indexOf('@media screen and (orientation: portrait) and (min-width: 768px) and (max-width: 1199.98px)');
    const tabletEnd = stylesheet.indexOf('/* The mobile Items workspace navigation', tabletStart);
    const tabletPortraitStyles = stylesheet.slice(tabletStart, tabletEnd);

    expect(tabletStart).toBeGreaterThanOrEqual(0);
    expect(tabletPortraitStyles).toContain('.dgfy-pos-shell[data-pos-items-view="true"] .pos-items-mobile-primary-button {');
    expect(tabletPortraitStyles).toContain('background-color: #1a4e8d;');
    expect(tabletPortraitStyles).toContain('.pos-items-mobile-primary-button:hover,');
    expect(tabletPortraitStyles).toContain('.pos-items-mobile-import-button:focus-visible {');
    expect(tabletPortraitStyles).toContain('.pos-items-mobile-import-button[aria-pressed="true"]');
    expect(tabletPortraitStyles).toContain('.pos-items-mobile-import-button:active {');
    expect(tabletPortraitStyles).toContain('background-color: #143f73;');
    expect(tabletPortraitStyles).toContain('outline: 2px solid #93c5fd;');
  });

  it('uses the same desktop import hover on PC and tablet landscape', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
    const importStylesStart = stylesheet.indexOf('.pos-items-catalog-workspace .pos-items-desktop-import-button:focus-visible,');
    const importStylesEnd = stylesheet.indexOf('/* Reset actions in POS > Items', importStylesStart);
    const desktopImportStyles = stylesheet.slice(importStylesStart, importStylesEnd);

    expect(workspace.match(/pos-items-desktop-import-button/g)).toHaveLength(2);
    expect(importStylesStart).toBeGreaterThanOrEqual(0);
    expect(desktopImportStyles).toContain('.pos-items-desktop-import-button:focus-visible,');
    expect(desktopImportStyles).toContain('.pos-items-desktop-import-button[aria-pressed="true"]');
    expect(desktopImportStyles).toContain('background-color: #1a4e8d;');
    expect(desktopImportStyles).toContain('.pos-items-desktop-import-button:active {');
    expect(desktopImportStyles).toContain('background-color: #143f73;');
    expect(desktopImportStyles).toContain('.pos-items-desktop-import-button:hover:not([aria-pressed="true"]):not(:active):not(:focus-visible)');
    expect(desktopImportStyles).toContain('background-color: #eff6ff;');
    expect(desktopImportStyles).toContain('color: #0f172a;');
    expect(desktopImportStyles).toContain('border-color: #1a4e8d;');
    expect(desktopImportStyles).toContain('.pos-items-mobile-import-button:hover:not([aria-pressed="true"]):not(:active):not(:focus-visible)');
  });
});
