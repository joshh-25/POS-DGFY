import { describe, expect, it } from '@jest/globals';
import { normalizeStorefrontHostname, readRequestHostname } from '../src/modules/storefrontDomains/utils/hostnamePolicy.js';

describe('storefront custom-domain hostname policy', () => {
    it('normalizes case, trailing dots, and internationalized labels', () => {
        expect(normalizeStorefrontHostname('GrandMatador.COM.')).toBe('grandmatador.com');
        expect(normalizeStorefrontHostname('münchen.example')).toBe('xn--mnchen-3ya.example');
    });

    it.each([
        'https://grandmatador.com',
        'grandmatador.com/path',
        '*.grandmatador.com',
        '127.0.0.1',
        'localhost',
        'dgfy.ph',
        'customer.dgfy.ph'
    ])('rejects unsafe or reserved hostname %s', (hostname) => {
        expect(() => normalizeStorefrontHostname(hostname)).toThrow();
    });

    it('ignores an untrusted forwarded host and strips a port from Host', () => {
        expect(readRequestHostname({ headers: {
            host: 'GrandMatador.com:443',
            'x-forwarded-host': 'attacker.example'
        } })).toBe('grandmatador.com');
    });
});
