/**
 * Presentation-only shell for the expanded F&B delivery map.
 * The checkout route keeps pin state and map callbacks so this component does
 * not own any address-selection behavior.
 */
export function FnbCheckoutExpandedMapModal({
  bodyFont,
  children,
  displayFont,
  isMobileViewport,
  isOpen,
  onClose
}) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expanded delivery map"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2100,
        background: 'rgba(15,23,42,0.46)',
        display: 'grid',
        placeItems: 'center',
        padding: isMobileViewport ? 16 : 28
      }}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          borderRadius: 20,
          background: '#fff',
          border: '1px solid #dbe5ee',
          boxShadow: '0 26px 60px rgba(15,23,42,0.22)',
          padding: isMobileViewport ? 16 : 20,
          display: 'grid',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', fontFamily: displayFont }}>Large Map</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Tap anywhere on the map to pin your delivery location.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 40,
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              padding: '0 14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: bodyFont
            }}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
