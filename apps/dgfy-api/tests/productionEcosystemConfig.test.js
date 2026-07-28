import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ecosystem = require('../../../ecosystem.config.cjs');

const findApp = (name) => ecosystem.apps.find((app) => app.name === name);

describe('production ecosystem registration policy', () => {
  it('keeps production DGFY company registration on auto-standard activation', () => {
    const backend = findApp('sku-backend');

    expect(backend?.env_production).toEqual(expect.objectContaining({
      TENANT_REGISTRATION_APPROVAL_MODE: 'auto_standard'
    }));
  });

  it('does not leave staging registration in manual-review drift by default', () => {
    const stagingBackend = findApp('sku-staging-backend');

    expect(stagingBackend?.env).toEqual(expect.objectContaining({
      TENANT_REGISTRATION_APPROVAL_MODE: 'auto_standard'
    }));
    expect(stagingBackend?.env_staging).toEqual(expect.objectContaining({
      TENANT_REGISTRATION_APPROVAL_MODE: 'auto_standard'
    }));
  });
});
