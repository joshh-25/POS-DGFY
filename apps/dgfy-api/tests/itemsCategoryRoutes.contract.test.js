import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routeSource = fs.readFileSync(path.resolve(__dirname, '../src/routes/items.js'), 'utf8');

describe('item category route contract', () => {
  it('keeps category mutation endpoints behind tenant-admin authorization', () => {
    expect(routeSource).toContain('requireTenantAdmin');
    expect(routeSource).toContain("router.post('/folders', requireTenantAdmin, validateCreateFolder, itemController.createFolder);");
    expect(routeSource).toContain("router.patch('/folders/:folder_id', requireTenantAdmin, validateFolderIdParam, validateUpdateFolder, itemController.updateFolder);");
    expect(routeSource).toContain("router.delete('/folders/:folder_id', requireTenantAdmin, validateFolderIdParam, validateDeleteFolder, itemController.deleteFolder);");
  });
});
