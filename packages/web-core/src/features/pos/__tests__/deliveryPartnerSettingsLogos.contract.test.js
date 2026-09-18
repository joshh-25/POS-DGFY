import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(
  path.resolve(currentDirectory, '../components/TerminalOperationsWorkspace.jsx'),
  'utf8'
);

describe('POS delivery partner settings logos', () => {
  it('uses the shared logo resolver without changing the existing row contract', () => {
    expect(workspaceSource).toContain("from '../../../utils/deliveryPartnerAssets.js'");
    expect(workspaceSource).toContain('getDeliveryPartnerLogo(row.partner)');
    expect(workspaceSource).toContain('sf-delivery-${index}');
  });
});
