import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

const STATIC_RESERVED_HOSTS = new Set([
    'localhost',
    'dgfy.ph',
    'www.dgfy.ph',
    'api.dgfy.ph',
    'store.dgfy.ph'
]);

const configuredReservedHosts = () => String(process.env.STOREFRONT_RESERVED_HOSTNAMES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

export const normalizeStorefrontHostname = (value) => {
    const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
    if (!raw || raw.includes('://') || /[/?#@\s:*]/.test(raw) || isIP(raw)) {
        throw new Error('A valid public hostname without scheme, path, port, wildcard, or IP address is required.');
    }

    const hostname = domainToASCII(raw).toLowerCase();
    const labels = hostname.split('.');
    const validLabel = (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
    if (hostname.length > 253 || labels.length < 2 || labels.some((label) => !validLabel(label))) {
        throw new Error('A valid public hostname is required.');
    }

    const reserved = new Set([...STATIC_RESERVED_HOSTS, ...configuredReservedHosts()]);
    if (reserved.has(hostname) || hostname.endsWith('.dgfy.ph')) {
        throw new Error('DGFY platform hostnames cannot be registered as storefront custom domains.');
    }

    return hostname;
};

export const readRequestHostname = (req) => {
    const trustForwardedHost = process.env.TRUST_FORWARDED_HOST_FOR_STOREFRONT_DOMAINS === 'true';
    const forwardedHost = trustForwardedHost
        ? String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim()
        : '';
    const host = forwardedHost || String(req.headers?.host || '').trim();
    const withoutPort = host.startsWith('[')
        ? host.slice(1, host.indexOf(']'))
        : host.replace(/:\d+$/, '');
    try {
        return normalizeStorefrontHostname(withoutPort);
    } catch {
        return '';
    }
};
