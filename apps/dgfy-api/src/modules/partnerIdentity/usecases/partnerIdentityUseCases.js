const unavailable = () => Object.assign(new Error('Partner identity registry is unavailable.'), { statusCode: 503 });

export const buildPartnerIdentityUseCases = ({ registryRepository, legacyClientSource = null }) => ({
  async resolveClient(clientId, { allowLegacy = true } = {}) {
    const normalized = String(clientId || '').trim();
    if (!normalized) return null;
    let client;
    try { client = await registryRepository.findClientByClientId(normalized); }
    catch { throw unavailable(); }
    if (!client && allowLegacy && legacyClientSource) {
      try { client = await legacyClientSource(normalized); }
      catch { throw unavailable(); }
    }
    if (!client || client.status !== 'active' || client.app?.status !== 'approved') return null;
    return client;
  }
});

const asArray = (value) => Array.isArray(value) ? value : [];
const tokenScopes = (value) => String(value || '').split(/\s+/).filter(Boolean);

export const authorizePartnerAccess = async ({ registryRepository, client, token, tenantSelector, locationId, scope, mode = 'online' }) => {
  const deny = (reason, quarantine = false) => ({ allowed: false, quarantine, reason });
  if (!client || client.status !== 'active' || client.app?.status !== 'approved') return deny('CLIENT_NOT_ACTIVE');
  const candidateTenant = tenantSelector == null ? null : String(tenantSelector);
  let attachments;
  if (candidateTenant) attachments = await registryRepository.findAttachmentsForClientTenant(client.client_id, candidateTenant);
  else if (mode === 'reconcile') attachments = await registryRepository.findAttachmentsForClient(client.client_id);
  else attachments = await registryRepository.findActiveAttachments(client.client_id);
  if (!attachments.length) return deny('ATTACHMENT_REQUIRED');
  const activeAttachments = attachments.filter((item) => item.status === 'active');
  if (!candidateTenant && activeAttachments.length > 1) return deny('AMBIGUOUS_ATTACHMENT');
  const attachment = activeAttachments[0];
  if (!attachment) {
    if (!candidateTenant && mode === 'reconcile' && attachments.length > 1) return deny('AMBIGUOUS_ATTACHMENT');
    const inactive = attachments[0];
    if (mode === 'reconcile' && ['suspended', 'disconnected', 'revoked'].includes(inactive.status)) return deny('ATTACHMENT_NOT_ACTIVE', true);
    return deny('ATTACHMENT_NOT_ACTIVE');
  }
  const grantedScopes = asArray(attachment.scopes);
  const issuedScopes = tokenScopes(token?.scope);
  if (scope && (!grantedScopes.includes(scope) || !issuedScopes.includes(scope))) return deny('SCOPE_DENIED');
  if (issuedScopes.some((item) => !grantedScopes.includes(item))) return deny('SCOPE_DENIED');
  const locations = asArray(attachment.location_ids).map(String);
  if (locationId != null && !locations.includes(String(locationId))) return deny('LOCATION_DENIED');
  return { allowed: true, attachment, locationIds: locations, scopes: grantedScopes, locationAuthority: attachment.location_authority || {} };
};
