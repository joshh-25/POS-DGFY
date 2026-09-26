import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../..');

const readRepoFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Phase 327 delivery-fee validation contracts', () => {
  it('keeps the one-meter minimum in the shared constants package', () => {
    const source = readRepoFile('packages/shared-constants/src/deliveryFee.js');

    expect(source).toContain('MIN_DELIVERY_INCREMENT_KM = 0.001');
    expect(source).toContain('MIN_DELIVERY_INCREMENT_METERS = 1');
  });

  it('enforces the minimum in every settings entry point and the backend normalizer', () => {
    const apiValidator = readRepoFile('apps/dgfy-api/src/validators/settingsValidator.js');
    const apiNormalizer = readRepoFile('apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFeeConfig.js');
    const sharedSerializer = readRepoFile('packages/web-core/src/features/settings/deliveryFeeConfig.js');
    const posSettings = readRepoFile('packages/web-core/src/features/pos/components/PosDeliveryPricingSettingsCard.jsx');
    const imsSettings = readRepoFile('apps/dgfy-ims/Pages/Settings.jsx');

    expect(apiValidator).toContain('increment_km: Joi.number().min(MIN_DELIVERY_INCREMENT_KM)');
    expect(apiNormalizer).toContain('incrementKm < MIN_DELIVERY_INCREMENT_KM');
    expect(sharedSerializer).toContain('calc.increment_km, { min: MIN_DELIVERY_INCREMENT_KM');
    expect(posSettings).toContain('min={String(MIN_DELIVERY_INCREMENT_KM)}');
    expect(imsSettings).toContain('min={String(MIN_DELIVERY_INCREMENT_KM)}');
  });

  it('guards policy output from non-finite or invalid integer results', () => {
    const policySource = readRepoFile('apps/dgfy-api/src/modules/deliveryPricing/domain/deliveryFeePolicy.js');

    expect(policySource).toContain("'NON_FINITE_RESULT'");
    expect(policySource).toContain('MIN_DELIVERY_INCREMENT_METERS');
  });
});
