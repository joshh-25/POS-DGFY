import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getImageClientConversionFlag,
  isImageClientConversionEnabledForScope,
  resetImageClientConversionForTests,
  setImageClientConversionFromSettings,
} from '../rolloutFlag.js';

describe('rolloutFlag.js -- image_client_conversion (epic #265, Phase 298)', () => {
  beforeEach(() => {
    resetImageClientConversionForTests();
  });

  afterEach(() => {
    resetImageClientConversionForTests();
  });

  it('fails safe to "off" / every scope disabled before the setter has ever been called', () => {
    expect(getImageClientConversionFlag()).toBe('off');
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(false);
    expect(isImageClientConversionEnabledForScope('storefront_catalog_single')).toBe(false);
  });

  it('fails safe to "off" when the settings response is null (fetch failed / not attempted)', () => {
    setImageClientConversionFromSettings(null);
    expect(getImageClientConversionFlag()).toBe('off');
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(false);
  });

  it('fails safe to "off" for an unrecognized/malformed mode value', () => {
    setImageClientConversionFromSettings({ image_client_conversion: { value: 'not_a_real_mode' } });
    expect(getImageClientConversionFlag()).toBe('off');
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(false);
  });

  it('"on" enables every scope unconditionally, regardless of the scopes list', () => {
    setImageClientConversionFromSettings({
      image_client_conversion: { value: 'on' },
      image_client_conversion_scopes: { value: [] },
    });
    expect(getImageClientConversionFlag()).toBe('on');
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(true);
    expect(isImageClientConversionEnabledForScope('storefront_catalog_single')).toBe(true);
    expect(isImageClientConversionEnabledForScope('pos_catalog_bulk')).toBe(true);
  });

  it('"opt_in" enables only scopes named in image_client_conversion_scopes', () => {
    setImageClientConversionFromSettings({
      image_client_conversion: { value: 'opt_in' },
      image_client_conversion_scopes: { value: ['pos_catalog_single'] },
    });
    expect(getImageClientConversionFlag()).toBe('opt_in');
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(true);
    expect(isImageClientConversionEnabledForScope('storefront_catalog_single')).toBe(false);
  });

  it('"opt_in" with an empty scopes list enables nothing (298a: accept-and-ignore)', () => {
    setImageClientConversionFromSettings({
      image_client_conversion: { value: 'opt_in' },
      image_client_conversion_scopes: { value: [] },
    });
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(false);
  });

  it('accepts image_client_conversion_scopes as a JSON-encoded string (server data_type: json passthrough)', () => {
    setImageClientConversionFromSettings({
      image_client_conversion: { value: 'opt_in' },
      image_client_conversion_scopes: { value: '["storefront_catalog_single"]' },
    });
    expect(isImageClientConversionEnabledForScope('storefront_catalog_single')).toBe(true);
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(false);
  });

  it('fails safe to an empty scope set for a malformed scopes JSON string', () => {
    setImageClientConversionFromSettings({
      image_client_conversion: { value: 'opt_in' },
      image_client_conversion_scopes: { value: 'not json' },
    });
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(false);
  });

  it('"off" disables every scope even when a stale scopes list is still present', () => {
    setImageClientConversionFromSettings({
      image_client_conversion: { value: 'off' },
      image_client_conversion_scopes: { value: ['pos_catalog_single'] },
    });
    expect(getImageClientConversionFlag()).toBe('off');
    expect(isImageClientConversionEnabledForScope('pos_catalog_single')).toBe(false);
  });
});
