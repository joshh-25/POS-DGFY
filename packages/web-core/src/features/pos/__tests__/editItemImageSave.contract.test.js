import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

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
    expect(workspace).toContain('compactRemoveAction');
    expect(workspace).toContain('Preview ready. Remove existing images to make room; the upload will continue automatically.');
    expect(workspace).toContain('setSelectedEditImageFiles(remainingFiles);');
    expect(workspace).toContain('setDeferredEditImageFiles(remainingFiles);');
  });

  it('supports multi-file selection in Edit Item without retaining the input value', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    expect(workspace).toContain('id="pos-item-edit-image"');
    expect(workspace).toContain('type="file"');
    expect(workspace).toContain('multiple');
    expect(workspace).toContain('void handleSelectEditImageFile(files);');
    expect(workspace).toContain("event.target.value = '';\n");
  });
});
