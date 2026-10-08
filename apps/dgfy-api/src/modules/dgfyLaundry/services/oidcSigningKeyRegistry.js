import crypto from 'node:crypto';
import { resolveSigningKeyMaterial } from '../../shared/utils/oidcSigningKeyResolver.js';
import { oidcSigningKeyRepository } from '../repositories/oidcSigningKeyRepository.js';

const legacyKeyId = () => String(process.env.DGFY_OIDC_KEY_ID || 'dglaundry-oidc-1').trim();
const legacyPublicKey = () => resolveSigningKeyMaterial({
    inlineEnvVar: 'DGFY_OIDC_PUBLIC_KEY',
    fileEnvVar: 'DGFY_OIDC_PUBLIC_KEY_FILE',
    label: 'OIDC public verification key'
}).pem;
const legacyPublicKeyConfigured = () => Boolean(
    String(process.env.DGFY_OIDC_PUBLIC_KEY || '').trim()
    || String(process.env.DGFY_OIDC_PUBLIC_KEY_FILE || '').trim()
);
const legacyPrivateKey = () => resolveSigningKeyMaterial({
    inlineEnvVar: 'DGFY_OIDC_PRIVATE_KEY',
    fileEnvVar: 'DGFY_OIDC_PRIVATE_KEY_FILE',
    label: 'OIDC private signing key'
}).pem;

const loadPrivateKey = (row) => resolveSigningKeyMaterial({
    fileEnvVar: row.private_key_env_ref,
    label: `OIDC private signing key ${row.kid}`
}).pem;
const supportedPublicKey = (pem) => {
    const key = crypto.createPublicKey(pem);
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) {
        throw new Error('OIDC signing keys must be RSA keys of at least 2048 bits.');
    }
    return key;
};

const legacyEntry = () => {
    const privateKeyPem = legacyPrivateKey();
    let publicKeyPem = legacyPublicKey();
    if (!publicKeyPem && privateKeyPem && !legacyPublicKeyConfigured()) {
        try {
            publicKeyPem = crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' });
        } catch {
            publicKeyPem = '';
        }
    }
    if (privateKeyPem && publicKeyPem) {
        try {
            if (!supportedPublicKey(publicKeyPem).equals(supportedPublicKey(crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' })))) return null;
        } catch { return null; }
    } else if (publicKeyPem) {
        try { supportedPublicKey(publicKeyPem); } catch { return null; }
    }
    return privateKeyPem || publicKeyPem
        ? { kid: legacyKeyId(), privateKeyPem, publicKeyPem }
        : null;
};

const keyIsConfigured = (pem) => {
    try { return Boolean(crypto.createPrivateKey(pem)); } catch { return false; }
};

export const getActiveSigningKey = async () => {
    if (process.env.NODE_ENV === 'test' && process.env.OIDC_SIGNING_KEY_REGISTRY_TEST_MODE !== 'true') return legacyEntry();
    const row = await oidcSigningKeyRepository.findActive();
    if (row) {
        const privateKeyPem = loadPrivateKey(row);
        if (!privateKeyPem) throw new Error(`OIDC private key is not configured for ${row.kid}`);
        const privatePublicKey = supportedPublicKey(crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }));
        if (!privatePublicKey.equals(supportedPublicKey(row.public_key_pem))) throw new Error(`OIDC public/private key mismatch for ${row.kid}`);
        return { kid: row.kid, privateKeyPem, publicKeyPem: row.public_key_pem };
    }

    // Keep the existing env-backed key usable until operators seed the registry.
    // Once any registry row exists, its state is authoritative (including all-revoked).
    const rows = await oidcSigningKeyRepository.count();
    if (rows > 0) throw new Error('No active OIDC signing key is configured.');
    return legacyEntry();
};

export const listVerificationKeys = async () => {
    if (process.env.NODE_ENV === 'test' && process.env.OIDC_SIGNING_KEY_REGISTRY_TEST_MODE !== 'true') {
        const legacy = legacyEntry();
        return legacy?.publicKeyPem ? [{ kid: legacy.kid, publicKeyPem: legacy.publicKeyPem }] : [];
    }
    const rows = await oidcSigningKeyRepository.findVerificationKeys();
    if (rows.length) {
        return rows.map(({ kid, public_key_pem: publicKeyPem }) => {
            supportedPublicKey(publicKeyPem);
            return { kid, publicKeyPem };
        });
    }
    if ((await oidcSigningKeyRepository.count()) > 0) return [];
    const publicKeyPem = legacyPublicKey();
    if (publicKeyPem) supportedPublicKey(publicKeyPem);
    return publicKeyPem ? [{ kid: legacyKeyId(), publicKeyPem }] : [];
};

export const promoteKey = async ({ kid }) => {
    const row = await oidcSigningKeyRepository.findByKid(kid);
    if (!row) throw new Error(`OIDC signing key not found: ${kid}`);
    if (row.status === 'revoked') throw new Error(`OIDC signing key is revoked: ${kid}`);
    const privateKeyPem = loadPrivateKey(row);
    if (!privateKeyPem || !keyIsConfigured(privateKeyPem)) throw new Error(`OIDC private key is invalid or unavailable for ${kid}`);
    const derivedPublic = supportedPublicKey(crypto.createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }));
    const configuredPublic = supportedPublicKey(row.public_key_pem);
    if (!derivedPublic.equals(configuredPublic)) throw new Error(`OIDC public/private key mismatch for ${kid}`);
    return oidcSigningKeyRepository.promote(kid);
};

export const retireKey = async ({ kid }) => {
    const row = await oidcSigningKeyRepository.findByKid(kid);
    if (!row) throw new Error(`OIDC signing key not found: ${kid}`);
    if (row.status === 'active') throw new Error('Promote another signing key before retiring the active key.');
    return oidcSigningKeyRepository.transition(kid, 'retiring');
};
export const revokeKey = async ({ kid }) => {
    const row = await oidcSigningKeyRepository.findByKid(kid);
    if (!row) throw new Error(`OIDC signing key not found: ${kid}`);
    if (row.status === 'active') throw new Error('Promote another signing key before revoking the active key.');
    return oidcSigningKeyRepository.transition(kid, 'revoked');
};
