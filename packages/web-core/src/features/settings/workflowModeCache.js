import {
  DISABLED_CAPABILITIES_SETTING_KEY,
  ENABLED_CAPABILITIES_SETTING_KEY,
  WORKFLOW_MODE_SETTING_KEY
} from './workflowMode.js';
import { STORE_PROFILE_SETTING_KEY } from '@sieitzz/shared-constants/storeProfile';

// Issue #2824: last-known-good workflow settings, so a failed GET /settings does not drop an F&B
// terminal to the Counter fallback. This is deliberately NOT part of the offline POS snapshot
// (offlinePosSnapshotStore.js: "settings never enter browser snapshots", ADR 0014) -- it is a
// separate, versioned key with its own tenant scope, carved out by the ADR 0014 2026-10-26
// amendment. It holds only the tenant's own persisted setting values (ADR 0056 Decision 2).
const STORAGE_KEY_PREFIX = 'dgfy.workflow-mode.last-known-good.v1';

const CACHED_SETTING_KEYS = Object.freeze([
  WORKFLOW_MODE_SETTING_KEY,
  ENABLED_CAPABILITIES_SETTING_KEY,
  DISABLED_CAPABILITIES_SETTING_KEY,
  STORE_PROFILE_SETTING_KEY
]);

const getStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

// Two independent 32-bit FNV-1a-style passes. Synchronous on purpose: crypto.subtle is unavailable
// on insecure origins (the POS can be served from a LAN host, ADR 0025). This is NOT a security
// boundary -- it only keeps the raw company token out of storage key names. Tenant isolation comes
// from requiring the derived key (stored in the record too) to match the current session's.
const deriveTenantKey = (companyToken) => {
  const token = String(companyToken || '').trim();
  if (!token) return '';

  let first = 0x811c9dc5;
  let second = 0x9747b28c;
  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
};

const getStorageKey = (tenantKey) => (tenantKey ? `${STORAGE_KEY_PREFIX}:${tenantKey}` : '');

/**
 * Persist the workflow-relevant subset of a SUCCESSFUL GET /settings response for this tenant.
 * Never call this with a fallback/default value.
 */
export const saveWorkflowModeCache = (companyToken, settings) => {
  const storage = getStorage();
  const tenantKey = deriveTenantKey(companyToken);
  const storageKey = getStorageKey(tenantKey);
  if (!storage || !storageKey || !settings || typeof settings !== 'object') return false;

  const subset = {};
  CACHED_SETTING_KEYS.forEach((key) => {
    if (settings[key] && typeof settings[key] === 'object' && 'value' in settings[key]) {
      subset[key] = { value: settings[key].value };
    }
  });

  try {
    storage.setItem(storageKey, JSON.stringify({
      tenant_key: tenantKey,
      saved_at: new Date().toISOString(),
      settings: subset
    }));
    return true;
  } catch {
    return false;
  }
};

/**
 * Returns a settings-shaped object ({ [key]: { value } }) for this tenant, or null when there is
 * no tenant identity, no record, or the record belongs to a different tenant.
 */
export const loadWorkflowModeCache = (companyToken) => {
  const storage = getStorage();
  const tenantKey = deriveTenantKey(companyToken);
  const storageKey = getStorageKey(tenantKey);
  if (!storage || !storageKey) return null;

  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.tenant_key !== tenantKey) return null;
    if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) return null;
    return parsed.settings;
  } catch {
    return null;
  }
};
