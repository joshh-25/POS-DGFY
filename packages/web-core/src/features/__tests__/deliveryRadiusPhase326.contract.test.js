import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../..');

const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Phase 326 delivery-radius contract witnesses', () => {
  it('records the POS setup zero-radius persistence gap', () => {
    const source = readRepoFile('packages/web-core/src/features/pos/components/PosTenantSetupModal.jsx');

    expect(source).toContain('delivery_radius_km: Number(locationDraft.delivery_radius_km) || 5');
    expect(Number('0') || 5).toBe(5);
  });

  it('records the onboarding zero-radius persistence gap', () => {
    const source = readRepoFile('packages/web-core/src/features/onboarding/components/OnboardingSetupModal.jsx');

    expect(source).toContain('delivery_radius_km: Number(locationForm.delivery_radius_km || 5)');
    expect(Number('0') || 5).toBe(5);
  });

  it('records the current split between zero-radius API acceptance and form defaults', () => {
    const validatorSource = readRepoFile('apps/dgfy-api/src/validators/tenantLocationValidator.js');
    const posSetupSource = readRepoFile('packages/web-core/src/features/pos/components/PosTenantSetupModal.jsx');
    const onboardingSource = readRepoFile('packages/web-core/src/features/onboarding/components/OnboardingSetupModal.jsx');

    expect(validatorSource).toContain('delivery_radius_km: Joi.number().min(0).max(100).precision(2).default(5)');
    expect(posSetupSource).toContain('delivery_radius_km: Number(locationDraft.delivery_radius_km) || 5');
    expect(onboardingSource).toContain('delivery_radius_km: Number(locationForm.delivery_radius_km || 5)');
  });
});
