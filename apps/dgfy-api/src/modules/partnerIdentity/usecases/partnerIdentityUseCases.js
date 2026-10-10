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
