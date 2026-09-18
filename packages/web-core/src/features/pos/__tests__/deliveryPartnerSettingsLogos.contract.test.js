import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const settingsSource = fs.readFileSync(
  path.resolve(currentDirectory, '../settings/StorefrontDeliveryPartnersSettings.jsx'),
  'utf8'
);

describe('POS delivery partner settings logos', () => {
  it('uses the shared logo resolver without changing the existing row contract', () => {
    expect(settingsSource).toContain("from '../../../utils/deliveryPartnerAssets.js'");
    expect(settingsSource).toContain('getDeliveryPartnerLogo(partner)');
    expect(settingsSource).toContain('role="listitem"');
  });
});
