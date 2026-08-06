import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(
  path.resolve(testDirectory, '../components/TerminalOperationsWorkspace.jsx'),
  'utf8'
);

describe('storefront location pin actions', () => {
  it('uses the shared confirmation dialog that supports the location action props', () => {
    expect(workspaceSource).toContain("import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';");
    expect(workspaceSource).toContain('open={Boolean(pendingLocationAction)}');
    expect(workspaceSource).toContain('onOpenChange={(open) => { if (!open) setPendingLocationAction(null); }}');
  });

  it('requires confirmation before calling the delete or reactivate APIs', () => {
    expect(workspaceSource).toContain("setPendingLocationAction({ type: 'delete', locationId });");
    expect(workspaceSource).toContain("setPendingLocationAction({ type: 'reactivate', locationId });");
    expect(workspaceSource).toContain("handleDeleteLocation(pendingLocationAction.locationId, { confirmed: true })");
    expect(workspaceSource).toContain("handleReactivateLocation(pendingLocationAction.locationId, { confirmed: true })");
  });
});
