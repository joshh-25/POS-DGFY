/**
 * Moved verbatim from `StorefrontApp.jsx`. No component-scoped
 * dependencies (only `toast`), so this is a plain utility rather than a
 * hook — callers pass their own `toast` instance.
 */
export async function copyTextToClipboard(toast, value, successMessage = 'Copied.') {
  const text = String(value || '').trim();
  if (!text) {
    toast.error('Nothing to copy.');
    return false;
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
      return true;
    }
  } catch {
    // Fall through to legacy copy path.
  }

  try {
    if (typeof document !== 'undefined') {
      const fallbackInput = document.createElement('textarea');
      fallbackInput.value = text;
      fallbackInput.setAttribute('readonly', '');
      fallbackInput.style.position = 'fixed';
      fallbackInput.style.opacity = '0';
      fallbackInput.style.left = '-9999px';
      document.body.appendChild(fallbackInput);
      fallbackInput.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(fallbackInput);
      if (copied) {
        toast.success(successMessage);
        return true;
      }
    }
  } catch {
    // handled below
  }

  toast.error('Copy failed. Please copy manually.');
  return false;
}
