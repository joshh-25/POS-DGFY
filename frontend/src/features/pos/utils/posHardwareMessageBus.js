const POS_SURFACE = String(import.meta.env?.VITE_APP_SURFACE || '').trim().toLowerCase();
const POS_HARDWARE_MESSAGE_EVENT = 'pos:hardware-message';

const toSafeText = (value, fallback = '') => {
  const text = String(value ?? fallback).trim();
  return text || fallback;
};

const normalizeDetails = (details) => {
  if (!details || typeof details !== 'object') return null;
  if (Array.isArray(details)) return details;
  return Object.keys(details).length > 0 ? details : null;
};

export const POS_HARDWARE_MESSAGE_EVENT_NAME = POS_HARDWARE_MESSAGE_EVENT;

export const emitPosHardwareMessage = (
  {
    title = 'Hardware message',
    message = '',
    tone = 'info',
    source = 'iMin hardware',
    details = null
  } = {},
  windowObj = typeof window !== 'undefined' ? window : null
) => {
  if (POS_SURFACE !== 'pos') return null;
  if (!windowObj || typeof windowObj.dispatchEvent !== 'function') return null;

  const normalizedMessage = toSafeText(message);
  if (!normalizedMessage) return null;

  const payload = {
    title: toSafeText(title, 'Hardware message'),
    message: normalizedMessage,
    tone: ['info', 'success', 'warning', 'error'].includes(tone) ? tone : 'info',
    source: toSafeText(source, 'iMin hardware'),
    details: normalizeDetails(details),
    timestamp: new Date().toISOString()
  };

  windowObj.dispatchEvent(new CustomEvent(POS_HARDWARE_MESSAGE_EVENT, { detail: payload }));
  return payload;
};
