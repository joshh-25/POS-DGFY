import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { buildDnsVerifier, hashVerificationToken } from '../src/modules/storefrontDomains/services/dnsVerificationService.js';

describe('storefront custom-domain DNS verification', () => {
    const previousIp = process.env.CUSTOM_STOREFRONT_APEX_IPV4;
    const previousCname = process.env.CUSTOM_STOREFRONT_CNAME_TARGET;
    const previousIpv6 = process.env.CUSTOM_STOREFRONT_APEX_IPV6;

    afterEach(() => {
        if (previousIp === undefined) delete process.env.CUSTOM_STOREFRONT_APEX_IPV4;
        else process.env.CUSTOM_STOREFRONT_APEX_IPV4 = previousIp;
        if (previousCname === undefined) delete process.env.CUSTOM_STOREFRONT_CNAME_TARGET;
        else process.env.CUSTOM_STOREFRONT_CNAME_TARGET = previousCname;
        if (previousIpv6 === undefined) delete process.env.CUSTOM_STOREFRONT_APEX_IPV6;
        else process.env.CUSTOM_STOREFRONT_APEX_IPV6 = previousIpv6;
    });

    it('requires both exact TXT ownership and the configured route target', async () => {
        process.env.CUSTOM_STOREFRONT_APEX_IPV4 = '203.0.113.10';
        delete process.env.CUSTOM_STOREFRONT_CNAME_TARGET;
        const resolver = {
            resolveTxt: jest.fn().mockResolvedValue([['dgfy-proof-token']]),
            resolve4: jest.fn().mockResolvedValue(['203.0.113.10']),
            resolve6: jest.fn().mockRejectedValue(new Error('no aaaa')),
            resolveCname: jest.fn().mockRejectedValue(new Error('no cname'))
        };
        const result = await buildDnsVerifier({ resolver })({
            hostname: 'grandmatador.com',
            verificationTokenHash: hashVerificationToken('dgfy-proof-token')
        });
        expect(result).toMatchObject({ verified: true, ownership_verified: true, route_verified: true });
        expect(resolver.resolveTxt).toHaveBeenCalledWith('_dgfy-verification.grandmatador.com');
    });

    it('rejects a conflicting AAAA route even when IPv4 and TXT match', async () => {
        process.env.CUSTOM_STOREFRONT_APEX_IPV4 = '203.0.113.10';
        delete process.env.CUSTOM_STOREFRONT_APEX_IPV6;
        const result = await buildDnsVerifier({ resolver: {
            resolveTxt: async () => [['dgfy-proof-token']],
            resolve4: async () => ['203.0.113.10'],
            resolve6: async () => ['2001:db8::99'],
            resolveCname: async () => []
        } })({
            hostname: 'grandmatador.com',
            verificationTokenHash: hashVerificationToken('dgfy-proof-token')
        });
        expect(result.verified).toBe(false);
        expect(result.ipv6_safe).toBe(false);
    });

    it('fails closed when the route target does not match', async () => {
        process.env.CUSTOM_STOREFRONT_APEX_IPV4 = '203.0.113.10';
        const result = await buildDnsVerifier({ resolver: {
            resolveTxt: async () => [['dgfy-proof-token']],
            resolve4: async () => ['198.51.100.20'],
            resolveCname: async () => []
        } })({
            hostname: 'grandmatador.com',
            verificationTokenHash: hashVerificationToken('dgfy-proof-token')
        });
        expect(result.verified).toBe(false);
        expect(result.route_verified).toBe(false);
    });

    it('rejects CAA policy that does not permit Lets Encrypt', async () => {
        process.env.CUSTOM_STOREFRONT_APEX_IPV4 = '203.0.113.10';
        const result = await buildDnsVerifier({ resolver: {
            resolveTxt: async () => [['dgfy-proof-token']],
            resolve4: async () => ['203.0.113.10'],
            resolve6: async () => [],
            resolveCname: async () => [],
            resolveCaa: async () => [{ critical: 0, issue: 'other-ca.example' }]
        } })({
            hostname: 'grandmatador.com',
            verificationTokenHash: hashVerificationToken('dgfy-proof-token')
        });
        expect(result.verified).toBe(false);
        expect(result.caa_safe).toBe(false);
    });

    it('does not treat non-issuance CAA records as a certificate restriction', async () => {
        process.env.CUSTOM_STOREFRONT_APEX_IPV4 = '203.0.113.10';
        const result = await buildDnsVerifier({ resolver: {
            resolveTxt: async () => [['dgfy-proof-token']],
            resolve4: async () => ['203.0.113.10'],
            resolve6: async () => [],
            resolveCname: async () => [],
            resolveCaa: async () => [{ critical: 0, iodef: 'mailto:security@example.com' }]
        } })({
            hostname: 'grandmatador.com',
            verificationTokenHash: hashVerificationToken('dgfy-proof-token')
        });
        expect(result.verified).toBe(true);
        expect(result.caa_safe).toBe(true);
    });
});
