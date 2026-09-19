import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS edit-item image save flow', () => {
  it('keeps selection local and queues edited images through the deferred upload flow', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const queueStart = workspace.indexOf('const queueDeferredEditImageFiles = useCallback');
    const queueEnd = workspace.indexOf('\n  }, []);', queueStart);
    const queueHandler = workspace.slice(queueStart, queueEnd);
    const uploadStart = workspace.indexOf('const handleSelectEditImageFile = (files) => {');
    const uploadHandler = workspace.slice(uploadStart, workspace.indexOf('const handleRemoveSelectedEditImageFile'));

    expect(workspace).toContain('const [selectedEditImageFiles, setSelectedEditImageFiles] = useState([]);');
    expect(workspace).toContain('void handleSelectEditImageFile(files);');
    expect(workspace).not.toContain('handleUploadStorefrontImage');
    expect(uploadHandler).toContain('setSelectedEditImageFiles(filesToPreview);');
    expect(uploadHandler).toContain('setDeferredEditImageFiles(filesToPreview);');
    expect(uploadHandler).not.toContain('queueEditImageFiles');
    expect(queueHandler).toContain('const filesToUpload = normalizedFiles.slice(0, availableSlots);');
    expect(queueHandler).toContain('await queueStorefrontCatalogImages(itemId, filesToUpload)');
    expect(queueHandler).toContain('setPendingEditImageRefresh');
    expect(workspace).toContain('The previous image is still being optimized');
    expect(uploadHandler).not.toContain('pollEditImageUpload');
    expect(workspace).toContain('subscribeToRemotePosCatalogUpdates');
    expect(uploadHandler).not.toContain('setPersistingEditAssets(true);');
    expect(workspace).toContain("{savingItem || persistingEditAssets ? 'Saving...' : 'Save Item'}");
    expect(workspace).toContain('<SelectedItemImageCarousel');
    expect(workspace).toContain('multiple');
    expect(workspace).toContain('onSetPendingPrimary={handleSetPendingEditPrimary}');
    expect(workspace).toContain('onSetSavedPrimary={handleSetSavedEditPrimary}');
  });

  it('renders selected previews until Save Item queues the worker job', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    expect(workspace).toContain('files={selectedEditImageFiles}');
    expect(workspace).toContain('The preview appears immediately. The optimized image is saved automatically and then replaces the preview.');
    expect(workspace).toContain('queueDeferredEditImageFiles');
  });

  it('supports selecting multiple Edit Item images through the file input', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    expect(workspace).toContain('type="file"');
    expect(workspace).toContain('accept="image/*"');
    expect(workspace).toContain('multiple');
    expect(workspace).toContain('const files = Array.from(event.target.files || []);');
    expect(workspace).toContain('handleSelectEditImageFile(files);');
    expect(workspace).not.toContain('data-testid="pos-edit-item-image-drop-zone"');
  });
});
