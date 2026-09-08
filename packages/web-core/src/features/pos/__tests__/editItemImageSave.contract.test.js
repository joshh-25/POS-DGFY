import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS edit-item image save flow', () => {
  it('uploads edited images automatically while keeping a temporary preview', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const saveStart = workspace.indexOf('const handleSave = async () => {');
    const uploadStart = workspace.indexOf('const handleSelectEditImageFile = (files) => {');
    const saveEnd = uploadStart;
    const saveHandler = workspace.slice(saveStart, saveEnd);
    const uploadHandler = workspace.slice(uploadStart, workspace.indexOf('const handleRemoveSelectedEditImageFile'));

    expect(workspace).toContain('const [selectedEditImageFiles, setSelectedEditImageFiles] = useState([]);');
    expect(workspace).toContain('void handleSelectEditImageFile(files);');
    expect(workspace).not.toContain('handleUploadStorefrontImage');
    expect(workspace).toContain('const [deferredEditImageFiles, setDeferredEditImageFiles] = useState([]);');
    expect(saveHandler).toContain('const editItemId = activeEditItem.item_id;');
    expect(saveHandler).toContain("let editSaveStage = 'item_details';");
    expect(saveHandler).toContain('resolveEditItemSaveError(updateError, editSaveStage).message');
    expect(uploadHandler).toContain('setSelectedEditImageFiles(filesToPreview);');
    expect(uploadHandler).toContain('setDeferredEditImageFiles(filesToPreview);');
    expect(workspace).toContain('await queueStorefrontCatalogImage(itemId, filesToUpload[0])');
    expect(workspace).toContain('await queueStorefrontCatalogImages(itemId, filesToUpload)');
    expect(workspace).toContain('setPendingEditImageRefresh({');
    expect(workspace).toContain('Remove existing images to make room; upload will continue automatically.');
    expect(uploadHandler).not.toContain('pollEditImageUpload');
    expect(workspace).toContain('subscribeToRemotePosCatalogUpdates');
    expect(uploadHandler).not.toContain('setPersistingEditAssets(true);');
    expect(workspace).toContain("{savingItem || persistingEditAssets ? 'Saving...' : 'Save Item'}");
    expect(workspace).toContain('<SelectedItemImageCarousel');
    expect(workspace).toContain('multiple');
  });

  it('hides pending previews as their saved gallery entries arrive', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const reconciliationStart = workspace.indexOf('const visibleSelectedEditImageFiles = useMemo(() => {');
    const reconciliationEnd = workspace.indexOf('// Real, already-persisted item id', reconciliationStart);
    const reconciliation = workspace.slice(reconciliationStart, reconciliationEnd);

    expect(reconciliation).toContain('normalizeStorefrontItemGallery(activeEditItem).length');
    expect(reconciliation).toContain('pendingEditImageRefresh.existingGalleryCount');
    expect(reconciliation).toContain('pendingEditImageRefresh.pendingCount');
    expect(reconciliation).toContain('return selectedEditImageFiles.slice(savedUploadCount);');
    expect(workspace).toContain('files={visibleSelectedEditImageFiles}');
  });

  it('supports image drops in Edit Item without allowing browser navigation', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const dropStart = workspace.indexOf('const handleEditImageDrop = async (event) => {');
    const dropEnd = workspace.indexOf('const handleRemoveSelectedEditImageFile', dropStart);
    const dropHandler = workspace.slice(dropStart, dropEnd);

    expect(workspace).toContain('data-testid="pos-edit-item-image-drop-zone"');
    expect(workspace).toContain('onDrop={handleEditImageDrop}');
    expect(workspace).toContain('const [isEditImageDragActive, setIsEditImageDragActive] = useState(false);');
    expect(workspace).toContain('Drag item images here or choose files');
    expect(dropHandler).toContain('event.preventDefault();');
    expect(dropHandler).toContain('event.stopPropagation();');
    expect(dropHandler).toContain('handleSelectEditImageFile(imageFiles);');
    expect(dropHandler).toContain("event.dataTransfer?.getData('text/uri-list')");
  });
});
