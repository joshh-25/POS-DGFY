import { ShoppingCart } from 'lucide-react';

/**
 * Icon-only floating cart trigger for the Default/Retail storefront mode (any industry that
 * isn't F&B/Services/Simple). Mirrors modes/simple/checkout/components/SimpleCartFloatingButton.jsx's
 * structure, but is this mode's own file — not shared with MSME — per the "independent trees"
 * pattern already used for checkout elsewhere in this app. Colors match the rectangular button
 * it replaces (StorefrontCartFab.jsx's default branch), so the existing brand color is retained.
 */
export function DefaultProductCartFab({
  cartCount = 0,
  isOpen = false,
  isMobileViewport = false,
  onToggle
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isOpen ? 'Close product cart' : 'Open product cart'}
      style={{
        position: 'fixed',
        right: isMobileViewport ? 16 : 24,
        bottom: isMobileViewport ? 16 : 24,
        zIndex: 2090,
        width: isMobileViewport ? 62 : 68,
        height: isMobileViewport ? 62 : 68,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'linear-gradient(135deg,#1a4586,#1a4e8d)',
        color: '#fff',
        boxShadow: '0 18px 38px rgba(26,69,134,.34)',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center'
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          minWidth: 22,
          height: 22,
          padding: '0 6px',
          borderRadius: 999,
          background: '#0f172a',
          color: '#fff',
          fontSize: 11,
          fontWeight: 900,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px solid #fff'
        }}
      >
        {cartCount}
      </span>
      <ShoppingCart size={24} strokeWidth={2.2} />
    </button>
  );
}
