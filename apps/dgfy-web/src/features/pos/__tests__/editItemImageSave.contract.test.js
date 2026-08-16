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
});
