import { isIP } from 'node:net';

export const EXTERNAL_REDIRECT_SITES = Object.freeze({
  proventus: { label: 'Proventus', action: 'View job' },
  eytitu: { label: 'Eytitu', action: 'Book ride' },
  mapviu: { label: 'Mapviu', action: 'Inquire' },
  synqcore: { label: 'Synqcore', action: 'Book stay' }
});

export const normalizeExternalSiteKey = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return Object.hasOwn(EXTERNAL_REDIRECT_SITES, key) ? key : null;
};

export const normalizeRedirectTemplate = (value) => {
  const template = String(value || '').trim();
  if (!template || template.length > 1000 || template.split('{id}').length !== 2) return null;
  if (/[{}]/.test(template.replace('{id}', ''))) return null;
  try {
    const url = new URL(template.replace('{id}', 'example'));
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) return null;
    const hostname = url.hostname.toLowerCase();
    if (!hostname.includes('.') || isIP(hostname)
      || /\.(?:localhost|local|internal|test|example|invalid)$/.test(hostname)) return null;
    return { url_template: template, allowed_hostname: hostname };
  } catch {
    return null;
  }
};

export const resolveExternalRedirectUrl = ({ template, allowedHostname, referenceId }) => {
  const config = normalizeRedirectTemplate(template);
  const reference = String(referenceId || '').trim();
  if (!config || !reference || reference.length > 120 || config.allowed_hostname !== allowedHostname) return null;
  try {
    const url = new URL(config.url_template.replace('{id}', encodeURIComponent(reference)));
    return url.hostname.toLowerCase() === allowedHostname ? url.toString() : null;
  } catch {
    return null;
  }
};
