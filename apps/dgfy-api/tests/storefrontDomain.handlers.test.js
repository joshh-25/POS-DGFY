import { afterEach, describe, expect, it } from '@jest/globals';
import {
    getStorefrontDomainContext,
    resolveStorefrontCanonicalOrigin
} from '../src/modules/storefrontDomains/controllers/storefrontDomainHandlers.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
});

describe('storefront custom-domain handlers', () => {
    it('preserves the local port and HTTP protocol for a localhost preview alias', () => {
        process.env.NODE_ENV = 'development';
        const req = {
            protocol: 'http',
            get: () => 'grandmatador.localhost:5175'
        };
        const context = { domain: { hostname: 'grandmatador.localhost', role: 'canonical' } };

        expect(resolveStorefrontCanonicalOrigin(req, context))
            .toBe('http://grandmatador.localhost:5175');
    });

    it('keeps verified production domains on HTTPS', () => {
        process.env.NODE_ENV = 'production';
        const context = { domain: { hostname: 'grandmatador.com', role: 'canonical' } };

        expect(resolveStorefrontCanonicalOrigin({ protocol: 'http' }, context))
            .toBe('https://grandmatador.com');
    });

    it('returns the resolved local preview context', () => {
        process.env.NODE_ENV = 'development';
        const req = {
            protocol: 'http',
            get: () => 'grandmatador.localhost:5175',
            storefrontDomainContext: {
                tenant: { id: 'tenant-1' },
                discovery: { slug: 'grandmatador-3236ed' },
                domain: { hostname: 'grandmatador.localhost', role: 'canonical' },
                canonical_domain: { hostname: 'grandmatador.localhost', role: 'canonical' }
            }
        };
        const response = {};
        response.status = (status) => {
            response.statusCode = status;
            return response;
        };
        response.json = (body) => {
            response.body = body;
            return response;
        };

        getStorefrontDomainContext(req, response);

        expect(response.statusCode).toBe(200);
        expect(response.body.data).toEqual({
            tenant_id: 'tenant-1',
            slug: 'grandmatador-3236ed',
            canonical_origin: 'http://grandmatador.localhost:5175',
            routing_mode: 'custom_domain',
            redirect_to: null
        });
    });

    it('returns the canonical redirect target for an alias host', () => {
        process.env.NODE_ENV = 'production';
        const req = {
            protocol: 'https',
            storefrontDomainContext: {
                tenant: { id: 'tenant-1' },
                discovery: { slug: 'grandmatador-3236ed' },
                domain: { hostname: 'www.grandmatador.com', role: 'alias' },
                canonical_domain: { hostname: 'grandmatador.com', role: 'canonical' }
            }
        };
        const response = {};
        response.status = (status) => {
            response.statusCode = status;
            return response;
        };
        response.json = (body) => {
            response.body = body;
            return response;
        };

        getStorefrontDomainContext(req, response);

        expect(response.body.data).toMatchObject({
            routing_mode: 'custom_domain_alias',
            canonical_origin: 'https://grandmatador.com',
            redirect_to: 'https://grandmatador.com'
        });
    });
});
