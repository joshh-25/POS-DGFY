import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeDeliveryRadiusKm } from '../settings/deliveryRadius.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../..');

const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Phase 329 delivery-radius contract', () => {
  it('preserves an explicit zero while defaulting only missing or unusable input', () => {
    expect(normalizeDeliveryRadiusKm(0)).toBe(0);
    expect(normalizeDeliveryRadiusKm('0')).toBe(0);
    expect(normalizeDeliveryRadiusKm(undefined)).toBe(5);
    expect(normalizeDeliveryRadiusKm(null)).toBe(5);
    expect(normalizeDeliveryRadiusKm('')).toBe(5);
    expect(normalizeDeliveryRadiusKm('not-a-radius')).toBe(5);
  });

  it('keeps zero radius through the POS setup save payload', () => {
    const source = readRepoFile('packages/web-core/src/features/pos/components/PosTenantSetupModal.jsx');

    expect(source).toContain('delivery_radius_km: normalizeDeliveryRadiusKm(locationDraft.delivery_radius_km)');
    expect(source).not.toContain('Number(locationDraft.delivery_radius_km) || 5');
  });

  it('keeps zero radius through the onboarding save payload', () => {
    const source = readRepoFile('packages/web-core/src/features/onboarding/components/OnboardingSetupModal.jsx');

    expect(source).toContain('delivery_radius_km: normalizeDeliveryRadiusKm(locationForm.delivery_radius_km)');
    expect(source).not.toContain('Number(locationForm.delivery_radius_km || 5)');
  });

  it('keeps the API zero-radius contract and the POS settings preview aligned', () => {
    const validatorSource = readRepoFile('apps/dgfy-api/src/validators/tenantLocationValidator.js');
    const terminalOperationsSource = readRepoFile('packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx');

    expect(validatorSource).toContain('delivery_radius_km: Joi.number().min(0).max(100).precision(2).default(5)');
    expect(terminalOperationsSource).toContain('normalizeDeliveryRadiusKm(locationForm.delivery_radius_km).toFixed(2)');
    expect(terminalOperationsSource).not.toContain('locationForm.delivery_radius_km || 5.00');
  });
});
