import React from 'react';

import { FnbCartDrawerHeader } from '../components/FnbCartDrawerHeader.jsx';
import { FnbCartDrawerRoute } from './FnbCartDrawerRoute.jsx';

/**
 * F&B-owned cart drawer shell. Root cart state is still passed in until cart
 * runtime ownership can be safely extracted.
 */
export function FnbCartDrawerSurface({
  cartDrawerProps,
  cartCount,
  isDesktop,
  isOpen,
  isMobileViewport,
  onClose
}) {
  const drawerTransform = isDesktop
    ? (isOpen ? 'translateX(0)' : 'translateX(32px)')
    : (isOpen ? 'translateY(0)' : 'translateY(105%)');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        pointerEvents: isOpen ? 'auto' : 'none',
        display: 'block'
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onClose();
        }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,.50)',
          backdropFilter: 'blur(6px)',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 180ms ease'
        }}
      />
      <aside
        style={{
          position: 'absolute',
          zIndex: 2001,
          background: '#ffffff',
          borderStyle: 'solid',
          borderColor: 'transparent',
          borderTopWidth: 0,
          borderRightWidth: 0,
          borderBottomWidth: 0,
          borderLeftWidth: isDesktop ? 1 : 0,
          borderLeftColor: isDesktop ? '#dbe5ee' : 'transparent',
          boxShadow: isDesktop ? '0 24px 60px rgba(15,23,42,.18)' : '0 -14px 34px rgba(15,23,42,.22)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 220ms ease, opacity 220ms ease',
          opacity: isOpen ? 1 : 0,
          ...(isDesktop
            ? {
              top: 0,
              right: 0,
              bottom: 0,
              width: 'min(520px, calc(100vw - 40px))',
              borderRadius: 0,
              transform: drawerTransform
            }
            : {
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '92vh',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              transform: drawerTransform
            })
        }}
      >
        <div
          style={{
            padding: isDesktop ? '22px 20px 16px' : '10px 14px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            background: '#ffffff',
            boxShadow: '0 8px 20px rgba(15,23,42,0.04)',
            zIndex: 2
          }}
        >
          <FnbCartDrawerHeader cartCount={cartCount} isMobileViewport={isMobileViewport} />
          <button
            type="button"
            onClick={onClose}
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
            x
          </button>
        </div>
        <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: 0 }}>
          <FnbCartDrawerRoute {...cartDrawerProps} />
        </div>
      </aside>
    </div>
  );
}
