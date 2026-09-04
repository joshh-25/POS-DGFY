import React from 'react';

export function StorefrontCheckoutDrawerFrame({
  children,
  compactMode = false,
  desktop = false,
  disabled = false,
  fullPage = false,
  headerContent = null,
  hideBackdrop = false,
  hideHeader = false,
  isFnbMode = false,
  onBack,
  onClose,
  open = false,
  tabBarContent = null
}) {
  const handleClose = () => {
    if (fullPage) {
      onBack?.();
      return;
    }
    onClose?.();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        pointerEvents: disabled ? 'none' : (open ? 'auto' : 'none'),
        display: disabled ? 'none' : 'block'
      }}
    >
      {!hideBackdrop && (
        <div
          role="button"
          tabIndex={0}
          onClick={onClose}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onClose?.();
          }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,23,42,.50)',
            backdropFilter: 'blur(6px)',
            opacity: open ? 1 : 0,
            transition: 'opacity 180ms ease'
          }}
        />
      )}
      <aside
        style={{
          position: 'absolute',
          zIndex: 2001,
          background: compactMode ? '#ffffff' : 'linear-gradient(180deg,#ffffff 0%,#f7fbfb 100%)',
          borderStyle: 'solid',
          borderColor: compactMode ? 'transparent' : '#d6e2e8',
          borderTopWidth: compactMode ? 0 : 1,
          borderRightWidth: compactMode ? 0 : 1,
          borderBottomWidth: compactMode ? 0 : 1,
          borderLeftWidth: (desktop && compactMode) ? 1 : (compactMode ? 0 : 1),
          borderLeftColor: (desktop && compactMode) ? '#dbe5ee' : (compactMode ? 'transparent' : '#d6e2e8'),
          boxShadow: desktop
            ? (compactMode ? '0 24px 60px rgba(15,23,42,.18)' : '0 30px 80px rgba(15,23,42,.18)')
            : '0 -14px 34px rgba(15,23,42,.22)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 220ms ease, opacity 220ms ease',
          opacity: open ? 1 : 0,
          ...(fullPage
            ? {
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              maxWidth: '100%',
              borderRadius: 0,
              transform: 'translateX(0)'
            }
            : (desktop
              ? {
                top: compactMode ? 0 : 24,
                right: 0,
                bottom: 0,
                width: compactMode ? 'min(520px, calc(100vw - 40px))' : 'min(1080px, calc(100vw - 48px))',
                borderRadius: compactMode ? 0 : 26,
                transform: open ? 'translateX(0)' : 'translateX(32px)'
              }
              : {
                left: 0,
                right: 0,
                bottom: 0,
                maxHeight: '92vh',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                transform: open ? 'translateY(0)' : 'translateY(105%)'
              }))
        }}
      >
        {!hideHeader && (
          <div
            style={{
              padding: desktop ? (compactMode ? '22px 20px 16px' : '16px 18px 12px 18px') : '10px 14px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              background: compactMode ? '#ffffff' : 'rgba(255,255,255,.88)',
              boxShadow: isFnbMode ? '0 8px 20px rgba(15,23,42,0.04)' : 'none',
              zIndex: 2
            }}
          >
            {headerContent}
            <button
              type="button"
              onClick={handleClose}
              style={{
                borderRadius: 999,
                border: '1px solid #cbd5e1',
                background: '#fff',
                width: 34,
                height: 34,
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              {fullPage ? '<' : 'x'}
            </button>
          </div>
        )}

        {tabBarContent}

        <div
          data-storefront-checkout-scroll-root="true"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            scrollPaddingBottom: 'var(--storefront-mobile-checkout-footer-reserve, 196px)',
            padding: 0,
            boxSizing: 'border-box'
          }}
        >
          {children}
        </div>
      </aside>
    </div>
  );
}
