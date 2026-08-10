import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { authenticateStorefrontDomainController } from '../src/modules/storefrontDomains/middleware/authenticateStorefrontDomainController.js';

const previousEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    token: process.env.STOREFRONT_DOMAIN_CONTROLLER_TOKEN,
    ips: process.env.STOREFRONT_DOMAIN_CONTROLLER_ALLOWED_IPS
};

const restore = (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
};

afterEach(() => {
    restore('NODE_ENV', previousEnvironment.nodeEnv);
    restore('STOREFRONT_DOMAIN_CONTROLLER_TOKEN', previousEnvironment.token);
    restore('STOREFRONT_DOMAIN_CONTROLLER_ALLOWED_IPS', previousEnvironment.ips);
});

const response = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('storefront domain controller authentication', () => {
    it('accepts a matching token, stable controller id, and allowlisted production IP', () => {
        process.env.NODE_ENV = 'production';
        process.env.STOREFRONT_DOMAIN_CONTROLLER_TOKEN = 'controller-token-that-is-at-least-32-characters';
        process.env.STOREFRONT_DOMAIN_CONTROLLER_ALLOWED_IPS = '10.0.0.7';
        const req = {
            headers: {
                authorization: `Bearer ${process.env.STOREFRONT_DOMAIN_CONTROLLER_TOKEN}`,
                'x-controller-id': 'edge-controller-1'
            },
            ip: '::ffff:10.0.0.7'
        };
        const res = response();
        const next = jest.fn();

        authenticateStorefrontDomainController(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.storefrontDomainController).toEqual({
            id: 'edge-controller-1',
            ip: '10.0.0.7'
        });
        expect(res.status).not.toHaveBeenCalled();
    });

    it('fails closed in production when the source IP allowlist is absent', () => {
        process.env.NODE_ENV = 'production';
        process.env.STOREFRONT_DOMAIN_CONTROLLER_TOKEN = 'controller-token-that-is-at-least-32-characters';
        delete process.env.STOREFRONT_DOMAIN_CONTROLLER_ALLOWED_IPS;
        const req = {
            headers: {
                authorization: `Bearer ${process.env.STOREFRONT_DOMAIN_CONTROLLER_TOKEN}`,
                'x-controller-id': 'edge-controller-1'
            },
            ip: '10.0.0.7'
        };
        const res = response();
        const next = jest.fn();

        authenticateStorefrontDomainController(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error_code: 'STOREFRONT_DOMAIN_CONTROLLER_UNAUTHORIZED'
        }));
    });

    it('rejects a wrong token without revealing which credential failed', () => {
        process.env.NODE_ENV = 'development';
        process.env.STOREFRONT_DOMAIN_CONTROLLER_TOKEN = 'controller-token-that-is-at-least-32-characters';
        const req = {
            headers: {
                authorization: 'Bearer wrong-token',
                'x-controller-id': 'edge-controller-1'
            },
            ip: '127.0.0.1'
        };
        const res = response();
        const next = jest.fn();

        authenticateStorefrontDomainController(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0].message).toBe('Controller authentication failed.');
    });
});
