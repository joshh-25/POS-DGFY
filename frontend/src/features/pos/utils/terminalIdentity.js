export const DEFAULT_TERMINAL_ID = 'COUNTER-01';
export const DEFAULT_TERMINAL_ID_OPTIONS = [DEFAULT_TERMINAL_ID, 'COUNTER-02', 'KIOSK-01'];
export const TERMINAL_REGISTRY_MODES = new Set(['warn', 'enforce']);

export const sanitizeTerminalId = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^A-Za-z0-9._-]/g, '')
  .toUpperCase();

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
      is_active: isActive,
      is_default: isActive && entry?.is_default === true,
      has_password: entry?.has_password === true,
      terminal_password: String(entry?.terminal_password || ''),
      clear_terminal_password: entry?.clear_terminal_password === true
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
  if (registryEnforced) return normalizedSelected;
  if (normalizedSelected) return normalizedSelected;
  return resolvePreferredTerminalId(registryEntries, '', { registryMode });
};
