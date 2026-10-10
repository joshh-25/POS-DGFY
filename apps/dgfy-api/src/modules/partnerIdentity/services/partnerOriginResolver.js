import { normalizeRegisteredOrigin } from '../domain/destinationPolicy.js';
import { partnerIdentityRegistryRepository } from '../repositories/partnerIdentityRegistryRepository.js';

const metadataPaths = new Set(['/oidc/.well-known/openid-configuration', '/oidc/jwks']);
const metadataMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const resolvePartnerCorsOrigin = async (origin, req = {}) => {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.path || req.originalUrl || req.url || '').split('?', 1)[0];
  if (!origin || !metadataMethods.has(method) || !metadataPaths.has(path)) return false;
  const clients = await partnerIdentityRegistryRepository.listActiveBrowserClients();
  return clients.some((client) => {
    if (client.status !== 'active' || client.client_type !== 'browser' || client.app?.status !== 'approved') return false;
    const environment = client.environment || 'production';
    let incoming;
    try { incoming = normalizeRegisteredOrigin(origin, environment).canonical; } catch { return false; }
    return (client.allowed_origins || []).some((registered) => {
      try { return normalizeRegisteredOrigin(registered, environment).canonical === incoming; } catch { return false; }
    });
  });
};
