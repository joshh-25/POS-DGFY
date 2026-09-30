import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const stylesheetPath = path.resolve(__dirname, '../../../index.css');

describe('POS edit-item image save flow', () => {
  it('inherits the Add Item modal shell and compact DGFY visual system', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('id="pos-items-edit-modal-title" className="text-sm font-black text-white"');
    expect(workspace).toContain('shared Add/Edit three-column layout');
    expect(workspace).toContain('min-h-[10rem] cursor-pointer flex-col items-center justify-center rounded-lg');
    expect(workspace).toContain('grid min-w-0 grid-cols-2 gap-2');
    expect(workspace.match(/max-w-\[54rem\]/g)).toHaveLength(2);
    // The shared blue modal header is used by Add/Edit Item and the item filter
    // surface also uses the same rounded header treatment.
    expect(workspace.match(/rounded-t-\[17px\] border-b border-\[#143F73\] bg-\[#1A4E8D\]/g)).toHaveLength(3);
  });

  it('keeps selection local and queues deferred images through the gallery worker flow', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const saveStart = workspace.indexOf('const handleSave = async () => {');
    const uploadStart = workspace.indexOf('const handleSelectEditImageFile = (files) => {');
    const saveEnd = uploadStart;
    const saveHandler = workspace.slice(saveStart, saveEnd);
    const uploadHandler = workspace.slice(uploadStart, workspace.indexOf('const handleRemoveSelectedEditImageFile'));

    expect(workspace).toContain('const [selectedEditImageFiles, setSelectedEditImageFiles] = useState([]);');
    expect(workspace).toContain('void handleSelectEditImageFile(files);');
    expect(workspace).not.toContain('handleUploadStorefrontImage');
    expect(saveHandler).toContain('const editItemId = activeEditItem.item_id;');
    expect(saveHandler).toContain("let editSaveStage = 'item_details';");
    expect(saveHandler).toContain('resolveEditItemSaveError(updateError, editSaveStage).message');
    expect(uploadHandler).toContain('const remainingSlots = Math.max(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT - existingGalleryCount);');
    expect(uploadHandler).toContain('const filesToPreview = normalizedFiles.slice(0, remainingSlots);');
    expect(uploadHandler).toContain('if (filesToPreview.length === 0) {');
    expect(uploadHandler).toContain('setSelectedEditImageFiles([]);');
    expect(uploadHandler).toContain('setDeferredEditImageFiles([]);');
    expect(uploadHandler).toContain('setSelectedEditImageFiles(filesToPreview);');
    expect(uploadHandler).toContain('setDeferredEditImageFiles(filesToPreview);');
    expect(workspace).toContain('const queueDeferredEditImageFiles = useCallback(async ({');
    expect(workspace).toContain('const filesToUpload = normalizedFiles.slice(0, availableSlots);');
    expect(workspace).toContain('await queueStorefrontCatalogImages(itemId, filesToUpload)');
    expect(workspace).toContain('if (!activeEditItem || deferredEditImageFiles.length === 0 || editImageUploadJob || pendingEditImageRefresh) return;');
    expect(workspace).toContain('const galleryCount = normalizeStorefrontItemGallery(activeEditItem).length;');
    expect(workspace).toContain('setPendingEditImageRefresh(null);');
    expect(uploadHandler).not.toContain('queueEditImageFiles');
    expect(saveHandler).not.toContain('queueStorefrontCatalogImages');
    expect(saveHandler).toContain('await updateItem(editItemId, {');
    expect(saveHandler).toContain('closeEdit({ force: true });');
    expect(workspace).toContain('subscribeToRemotePosCatalogUpdates');
    expect(workspace).toContain("{savingItem || persistingEditAssets ? 'Saving...' : 'Save Item'}");
    expect(workspace).toContain('<SelectedItemImageCarousel');
    expect(workspace).toContain('multiple');
    expect(workspace).toContain('onSetPendingPrimary={handleSetPendingEditPrimary}');
  });

  it('renders selected previews while the deferred gallery job is pending', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    expect(workspace).toContain('files={selectedEditImageFiles}');
    expect(workspace).toContain('editItemPresentation');
    expect(workspace).toContain('Preview ready. Remove existing images to make room; the upload will continue automatically.');
    expect(workspace).toContain('setSelectedEditImageFiles(remainingFiles);');
    expect(workspace).toContain('setDeferredEditImageFiles(remainingFiles);');
  });

  it('uses the reference gallery presentation only when Edit Item has images', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const carousel = fs.readFileSync(
      path.resolve(__dirname, '../../../../Components/items/SelectedItemImageCarousel.jsx'),
      'utf8'
    );

    expect(workspace).toContain('const hasEditImages = editGallery.length > 0 || selectedEditImageFiles.length > 0;');
    expect(workspace).toContain('<label className="pos-items-modal-label block">Product Images</label>');
    expect(workspace).toContain('<span className="shrink-0 text-[10px] font-semibold text-[#94A3B8]">{editImageCount} / {STOREFRONT_ITEM_IMAGE_MAX_COUNT}</span>');
    expect(workspace).toContain('maxVisibleThumbnails={4}');
    expect(workspace).toContain('editItemPresentation');
    expect(workspace).toContain('posItemsPresentation');
    expect(workspace).toContain('Upload New Image');
    expect(carousel).toContain('data-pos-item-image-remove="true"');
    expect(carousel).toContain('<Trash2 className="h-4 w-4" aria-hidden="true" />');
    expect(carousel).toContain("{!editItemPresentation ? <div className=\"flex min-w-0 items-center gap-2\">");
  });

  it('supports multi-file selection in Edit Item without retaining the input value', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('id="pos-item-edit-image"');
    expect(workspace).toContain('type="file"');
    expect(workspace).toContain('multiple');
    expect(workspace).toContain('void handleSelectEditImageFile(files);');
    expect(workspace).toContain("event.target.value = '';\n");
  });

  it('keeps Add Item and Edit Item aligned on modal height and spacing', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');

    expect(workspace.match(/sm:items-center sm:px-4 sm:py-3/g)).toHaveLength(2);
    expect(workspace.match(/sm:max-h-\[calc\(100dvh-1\.5rem\)\]/g)).toHaveLength(2);
    expect(workspace.match(/pos-items-status-grid mt-4 grid gap-3 md:grid-cols-3/g)).toHaveLength(2);
    expect(workspace.match(/pos-items-form-columns mt-5 grid min-w-0 gap-4/g)).toHaveLength(2);
    expect(stylesheet).toContain('.pos-items-catalog-form-modal :where([class~="gap-2.5"]) {\n  gap: 1.25rem;');
    expect(stylesheet).toContain('.pos-items-form-scale .pos-items-status-grid {\n  grid-auto-rows: minmax(4.5rem, auto);\n  gap: 0.75rem;');
  });

  it('keeps the Edit Item footer actions in one equal-width row without the extra notice', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).not.toContain('Changes update this item across POS and storefront immediately.');
    expect(workspace).toContain('pos-items-modal-footer grid shrink-0 grid-cols-1 gap-2 border-t border-slate-200 bg-white px-4 py-2 sm:px-5');
    expect(workspace).toContain('pos-items-modal-footer-actions grid min-w-0 grid-cols-2 gap-2');
    expect(workspace).toContain('h-10 min-w-0 w-full');
  });
});
