const normalizeScopeValue = (value) => String(value ?? '').trim();

const normalizeTerminalId = (value) => normalizeScopeValue(value).toUpperCase();

// `scope = {}` only defaults an `undefined` argument -- callers that pass
// `null` (e.g. a component prop whose default is `null`) skip that default
// and reach the property reads below directly, so `null` is normalized
// explicitly here too.
export const normalizeOfflinePosScope = (scope = {}) => {
  const source = scope || {};
  return {
    tenantId: normalizeScopeValue(
      source.tenantId
      ?? source.tenant_id
      ?? source.companyId
      ?? source.company_id
    ),
    terminalId: normalizeTerminalId(source.terminalId ?? source.terminal_id),
    locationId: normalizeScopeValue(source.locationId ?? source.location_id),
    userId: normalizeScopeValue(source.userId ?? source.user_id)
  };
};

export const isOfflinePosScopeReady = (scope = {}) => {
  const normalized = normalizeOfflinePosScope(scope);
  return Boolean(
    normalized.tenantId
    && normalized.terminalId
    && normalized.locationId
    && normalized.userId
  );
};

export const buildOfflinePosScopeKey = (scope = {}) => {
  const normalized = normalizeOfflinePosScope(scope);
  if (!isOfflinePosScopeReady(normalized)) return '';
  return [
    normalized.tenantId,
    normalized.terminalId,
    normalized.locationId,
    normalized.userId
  ].map((value) => encodeURIComponent(value)).join('|');
};

export const toOfflinePosScopeFields = (scope = {}) => {
  const normalized = normalizeOfflinePosScope(scope);
  return {
    tenant_id: normalized.tenantId || null,
    terminal_id: normalized.terminalId || null,
    location_id: normalized.locationId || null,
    user_id: normalized.userId || null,
    scope_key: buildOfflinePosScopeKey(normalized) || null
  };
};
