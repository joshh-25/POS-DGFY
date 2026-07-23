export const sanitizeExternalLink = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
};

export const openStorefrontActionLink = (href) => {
  const target = String(href || '').trim();
  if (!target || typeof window === 'undefined') return;
  if (target.startsWith('tel:') || target.startsWith('mailto:')) {
    window.location.href = target;
    return;
  }
  window.open(target, '_blank', 'noopener,noreferrer');
};
