const normalizeScopeValue = (value) => String(value ?? '').trim();

const normalizeTerminalId = (value) => normalizeScopeValue(value).toUpperCase();

export const normalizeOfflinePosScope = (scope = {}) => ({
  tenantId: normalizeScopeValue(
    scope.tenantId
    ?? scope.tenant_id
    ?? scope.companyId
    ?? scope.company_id
  ),
  terminalId: normalizeTerminalId(scope.terminalId ?? scope.terminal_id),
  locationId: normalizeScopeValue(scope.locationId ?? scope.location_id),
  userId: normalizeScopeValue(scope.userId ?? scope.user_id)
});

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
