import { createHash, randomBytes } from 'node:crypto';
import dns from 'node:dns/promises';

export const hashVerificationToken = (token) => createHash('sha256').update(String(token)).digest('hex');

export const createVerificationToken = () => {
    const token = `dgfy-${randomBytes(24).toString('base64url')}`;
    return {
        token,
        hash: hashVerificationToken(token),
        hint: token.slice(-8)
    };
};

const parseList = (value) => String(value || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);

export const buildDnsVerifier = ({ resolver = dns } = {}) => async ({ hostname, verificationTokenHash }) => {
    const expectedIps = new Set(parseList(process.env.CUSTOM_STOREFRONT_APEX_IPV4));
    const expectedIpv6 = new Set(parseList(process.env.CUSTOM_STOREFRONT_APEX_IPV6));
    const expectedCnames = new Set(parseList(process.env.CUSTOM_STOREFRONT_CNAME_TARGET).map((entry) => entry.replace(/\.$/, '')));
    if (expectedIps.size === 0 && expectedCnames.size === 0) {
        throw new Error('Custom storefront DNS targets are not configured.');
    }

    const verificationName = `_dgfy-verification.${hostname}`;
    const txtRecords = await resolver.resolveTxt(verificationName);
    const txtValues = (txtRecords || []).map((parts) => parts.join(''));
    const ownershipVerified = txtValues.some((value) => hashVerificationToken(value) === verificationTokenHash);

    let addressRecords = [];
    let address6Records = [];
    let cnameRecords = [];
    let caaRecords = [];
    try { addressRecords = await resolver.resolve4(hostname); } catch { /* CNAME-only domains may not expose A here. */ }
    try { address6Records = await resolver.resolve6(hostname); } catch { /* IPv6 is optional. */ }
    try { cnameRecords = await resolver.resolveCname(hostname); } catch { /* Apex A records do not have a CNAME. */ }
    try {
        caaRecords = typeof resolver.resolveCaa === 'function'
            ? await resolver.resolveCaa(hostname)
            : [];
    } catch { /* No CAA record means the CA is not restricted. */ }
    const routeVerified = addressRecords.some((value) => expectedIps.has(String(value).toLowerCase()))
        || address6Records.some((value) => expectedIpv6.has(String(value).toLowerCase()))
        || cnameRecords.some((value) => expectedCnames.has(String(value).toLowerCase().replace(/\.$/, '')));
    const ipv6Safe = address6Records.length === 0
        || (expectedIpv6.size > 0 && address6Records.every((value) => expectedIpv6.has(String(value).toLowerCase())));
    const caaIssueRecords = caaRecords
        .map((record) => String(record?.issue || '').trim().toLowerCase())
        .filter(Boolean);
    const caaSafe = caaIssueRecords.length === 0
        || caaIssueRecords.some((value) => value.split(';')[0].trim() === 'letsencrypt.org');

    return {
        verified: ownershipVerified && routeVerified && ipv6Safe && caaSafe,
        ownership_verified: ownershipVerified,
        route_verified: routeVerified,
        ipv6_safe: ipv6Safe,
        caa_safe: caaSafe,
        verification_name: verificationName,
        observed_a: addressRecords,
        observed_aaaa: address6Records,
        observed_cname: cnameRecords,
        observed_caa: caaRecords
    };
};

export const verifyStorefrontDns = buildDnsVerifier();
