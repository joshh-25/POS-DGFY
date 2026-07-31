import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS edit-item image save flow', () => {
  it('keeps an edited image local until Save Item uploads it for the captured item ID', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const saveStart = workspace.indexOf('const handleSave = async () => {');
    const saveEnd = workspace.indexOf('const handleSelectEditImageFile = (files) => {');
    const saveHandler = workspace.slice(saveStart, saveEnd);

    expect(workspace).toContain('const [selectedEditImageFile, setSelectedEditImageFile] = useState(null);');
    expect(workspace).toContain('handleSelectEditImageFile(files);');
    expect(workspace).not.toContain('handleUploadStorefrontImage');
    expect(saveHandler).toContain('const editItemId = activeEditItem.item_id;');
    expect(saveHandler).toContain('const editImageFile = selectedEditImageFile;');
    expect(saveHandler).toContain('await uploadStorefrontCatalogImage(editItemId, editImageFile);');
    expect(saveHandler.indexOf('await uploadStorefrontCatalogImage(editItemId, editImageFile);'))
      .toBeLessThan(saveHandler.indexOf('closeEdit({ force: true });'));
    expect(workspace).toContain('Selected locally. Save Item to upload.');
  });
});
