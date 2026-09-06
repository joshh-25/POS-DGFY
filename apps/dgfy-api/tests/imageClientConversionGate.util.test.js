import { describe, expect, it, jest } from '@jest/globals';
import {
    IMAGE_CLIENT_CONVERSION_SCOPE,
    isPlatformControlledImageClientConversionKey,
    resolveImageClientConversionGate
} from '../src/modules/shared/utils/imageClientConversionGate.js';

describe('imageClientConversionGate util (epic #265, Phase 298)', () => {
    it('flags both settings keys as platform-controlled', () => {
        expect(isPlatformControlledImageClientConversionKey('image_client_conversion')).toBe(true);
        expect(isPlatformControlledImageClientConversionKey('image_client_conversion_scopes')).toBe(true);
        expect(isPlatformControlledImageClientConversionKey('pos_receipt_footer_message')).toBe(false);
    });

    it('fails safe (closed) with no scope', async () => {
        const gate = await resolveImageClientConversionGate({
            settingsRepository: { getSettingsByKeys: jest.fn() }
        });
        expect(gate).toEqual({ enabled: false, mode: 'off', scope: null });
    });

    it('fails safe (closed) with no settingsRepository', async () => {
        const gate = await resolveImageClientConversionGate({
            scope: IMAGE_CLIENT_CONVERSION_SCOPE.POS_CATALOG_SINGLE
        });
        expect(gate).toEqual({ enabled: false, mode: 'off', scope: IMAGE_CLIENT_CONVERSION_SCOPE.POS_CATALOG_SINGLE });
    });

    it('fails safe (closed) when the settings read throws', async () => {
        const gate = await resolveImageClientConversionGate({
            scope: IMAGE_CLIENT_CONVERSION_SCOPE.POS_CATALOG_SINGLE,
            settingsRepository: { getSettingsByKeys: jest.fn().mockRejectedValue(new Error('db down')) }
        });
        expect(gate).toEqual({ enabled: false, mode: 'off', scope: IMAGE_CLIENT_CONVERSION_SCOPE.POS_CATALOG_SINGLE });
    });

    it('fails safe (closed) for an unset/never-migrated settings row', async () => {
        const gate = await resolveImageClientConversionGate({
            scope: IMAGE_CLIENT_CONVERSION_SCOPE.POS_CATALOG_SINGLE,
            settingsRepository: { getSettingsByKeys: jest.fn().mockResolvedValue({}) }
        });
        expect(gate).toEqual({ enabled: false, mode: 'off', scope: IMAGE_CLIENT_CONVERSION_SCOPE.POS_CATALOG_SINGLE });
    });

    it('"on" enables every scope', async () => {
        const gate = await resolveImageClientConversionGate({
            scope: IMAGE_CLIENT_CONVERSION_SCOPE.STOREFRONT_CATALOG_BULK,
            settingsRepository: { getSettingsByKeys: jest.fn().mockResolvedValue({ image_client_conversion: { value: 'on' } }) }
        });
        expect(gate).toEqual({ enabled: true, mode: 'on', scope: IMAGE_CLIENT_CONVERSION_SCOPE.STOREFRONT_CATALOG_BULK });
    });

    it('"opt_in" enables only a scope named in image_client_conversion_scopes', async () => {
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'opt_in' },
                image_client_conversion_scopes: { value: ['pos_catalog_single'] }
            })
        };
        const enabled = await resolveImageClientConversionGate({ scope: 'pos_catalog_single', settingsRepository });
        const disabled = await resolveImageClientConversionGate({ scope: 'storefront_catalog_single', settingsRepository });
        expect(enabled.enabled).toBe(true);
        expect(disabled.enabled).toBe(false);
    });

    it('accepts a JSON-encoded scopes string (data_type: json passthrough)', async () => {
        const settingsRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue({
                image_client_conversion: { value: 'opt_in' },
                image_client_conversion_scopes: { value: '["storefront_catalog_single"]' }
            })
        };
        const gate = await resolveImageClientConversionGate({ scope: 'storefront_catalog_single', settingsRepository });
        expect(gate.enabled).toBe(true);
    });

    it('fails safe to disabled for a malformed mode value', async () => {
        const gate = await resolveImageClientConversionGate({
            scope: 'pos_catalog_single',
            settingsRepository: { getSettingsByKeys: jest.fn().mockResolvedValue({ image_client_conversion: { value: 'enabled_lol' } }) }
        });
        expect(gate).toEqual({ enabled: false, mode: 'off', scope: 'pos_catalog_single' });
    });
});
