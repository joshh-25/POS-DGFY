import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ecosystem = require('../../../ecosystem.config.cjs');

const findApp = (name) => ecosystem.apps.find((app) => app.name === name);

describe('production ecosystem registration policy', () => {
  it('keeps production DGFY company registration on mandatory manual review', () => {
    const backend = findApp('sku-backend');

    expect(backend?.env_production).toEqual(expect.objectContaining({
      TENANT_REGISTRATION_APPROVAL_MODE: 'manual'
    }));
  });

  it('keeps staging registration on mandatory manual review', () => {
    const stagingBackend = findApp('sku-staging-backend');

    expect(stagingBackend?.env).toEqual(expect.objectContaining({
      TENANT_REGISTRATION_APPROVAL_MODE: 'manual'
    }));
    expect(stagingBackend?.env_staging).toEqual(expect.objectContaining({
      TENANT_REGISTRATION_APPROVAL_MODE: 'manual'
    }));
  });
});
