export const DEFAULT_TERMINAL_ID = 'COUNTER-01';
export const DEFAULT_TERMINAL_ID_OPTIONS = [DEFAULT_TERMINAL_ID, 'COUNTER-02', 'KIOSK-01'];
export const TERMINAL_REGISTRY_MODES = new Set(['warn', 'enforce']);

export const sanitizeTerminalId = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^A-Za-z0-9._-]/g, '')
  .toUpperCase();

export const createSuggestedTerminalId = (entries = [], prefix = 'COUNTER') => {
  const normalizedPrefix = sanitizeTerminalId(prefix).replace(/[-_.]+$/g, '') || 'COUNTER';
  const usedIds = new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => sanitizeTerminalId(entry?.terminal_id))
      .filter(Boolean)
  );

  for (let index = 1; index <= 999; index += 1) {
    const candidate = `${normalizedPrefix}-${String(index).padStart(2, '0')}`;
    if (!usedIds.has(candidate)) {
      return candidate;
    }
  }

  return `${normalizedPrefix}-${Date.now()}`;
};

export const normalizeTerminalRegistry = (rawRegistry) => {
  let parsed = rawRegistry;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set();
  const normalized = [];
  parsed.forEach((entry) => {
    const terminalId = sanitizeTerminalId(entry?.terminal_id);
    if (!terminalId) return;
    if (seen.has(terminalId)) return;
    seen.add(terminalId);

    const isActive = entry?.is_active !== false;
    normalized.push({
      terminal_id: terminalId,
      label: String(entry?.label || '').trim(),
      location_id: Number.isInteger(Number(entry?.location_id)) ? Number(entry?.location_id) : null,
      cashier_email: String(entry?.cashier_email || '').trim().toLowerCase(),
      is_active: isActive,
      is_default: isActive && entry?.is_default === true,
      pairing_version: String(entry?.pairing_version || '').trim(),
      paired_device_ready: entry?.paired_device_ready === true || Boolean(entry?.pairing_version)
    });
  });

  if (normalized.length === 0) return [];

  const defaultIndex = normalized.findIndex((entry) => entry.is_default === true);
  if (defaultIndex >= 0) {
    normalized.forEach((entry, index) => {
      if (index !== defaultIndex) {
        entry.is_default = false;
      }
    });
  } else {
    const firstActiveIndex = normalized.findIndex((entry) => entry.is_active);
    if (firstActiveIndex >= 0) {
      normalized[firstActiveIndex].is_default = true;
    }
  }

  return normalized;
};

export const resolvePreferredTerminalId = (
  registryEntries = [],
  preferredTerminalId = '',
  { registryMode = 'warn' } = {}
) => {
  const activeEntries = Array.isArray(registryEntries)
    ? registryEntries.filter((entry) => entry?.is_active !== false)
    : [];
  const normalizedPreferred = sanitizeTerminalId(preferredTerminalId);

  if (activeEntries.length === 0) {
    return normalizedPreferred || (registryMode === 'warn' ? DEFAULT_TERMINAL_ID : '');
  }

  if (normalizedPreferred && activeEntries.some((entry) => entry.terminal_id === normalizedPreferred)) {
    return normalizedPreferred;
  }

  const defaultEntry = activeEntries.find((entry) => entry.is_default === true);
  if (defaultEntry?.terminal_id) return defaultEntry.terminal_id;
  return activeEntries[0]?.terminal_id || '';
};

export const resolveLoginTerminalId = ({
  selectedTerminalId = '',
  registryEnforced = false,
  registryEntries = [],
  registryMode = 'warn'
} = {}) => {
  const normalizedSelected = sanitizeTerminalId(selectedTerminalId);
  if (registryEnforced) {
    if (
      normalizedSelected
      && Array.isArray(registryEntries)
      && registryEntries.some((entry) => entry?.is_active !== false && entry?.terminal_id === normalizedSelected)
    ) {
      return normalizedSelected;
    }
    return resolvePreferredTerminalId(registryEntries, '', { registryMode: 'enforce' });
  }
  if (normalizedSelected) return normalizedSelected;
  return resolvePreferredTerminalId(registryEntries, '', { registryMode });
};
