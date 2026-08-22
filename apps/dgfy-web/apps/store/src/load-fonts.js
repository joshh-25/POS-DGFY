// Keep the public discovery shell paintable with system fallbacks while the
// optional brand fonts download. This avoids a render-blocking third-party
// stylesheet without relying on an inline event handler, which the storefront
// CSP intentionally disallows.
const fontStylesheet = document.querySelector('[data-font-stylesheet]');

if (fontStylesheet) {
  const enableFonts = () => {
    fontStylesheet.media = 'all';
  };

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(enableFonts);
  } else {
    window.setTimeout(enableFonts, 0);
  }
}
