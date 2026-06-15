import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Menu, User, X } from 'lucide-react';

const HERO_CANVAS_MAX_WIDTH = 1320;
const DGFY_HEADER_LOGO_URL = '/dgfy-logo.png';
const DGFY_DISCOVERY_HOME_URL = 'https://dgfy.ph/';
const DGFY_OCEAN_BLUE = '#1A4E8D';
const DGFY_DEEP_BLUE = '#1A4586';
const DGFY_ICE_BLUE = '#AEE8F4';
const DGFY_ICE_BLUE_RING = 'rgba(174, 232, 244, 0.72)';

export function StorefrontHeaderNav({
  isMobileViewport,
  bodyFont,
  onBack,
  onShop,
  onTrack = null,
  onAccount = null,
  branchSelector = null,
  activeOrderCount = 0
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!mobileMenuRef.current?.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileMenuOpen]);

  const textStyle = {
    border: 'none',
    background: 'transparent',
    color: '#0f172a',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: bodyFont || '"Source Sans 3", "Segoe UI", sans-serif',
    padding: '8px 0',
    lineHeight: 1
  };

  const mobileMenuButtonStyle = {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#0f172a',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 18px rgba(15,23,42,.06)',
    flexShrink: 0
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: isMobileViewport ? 0 : 6,
        border: '1px solid #e5eaf2',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
        marginBottom: 0,
        width: isMobileViewport ? '100%' : 'calc(100vw - 8px)',
        marginLeft: isMobileViewport ? 0 : 'calc(50% - 50vw + 4px)',
        overflow: 'visible'
      }}
    >
      <div
        style={{
          maxWidth: HERO_CANVAS_MAX_WIDTH,
          margin: '0 auto',
          minHeight: isMobileViewport ? 72 : 82,
          padding: isMobileViewport ? '14px 16px 10px' : '0 52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobileViewport ? 12 : 32,
          flexDirection: 'row'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 12 : 14, minWidth: 0, flex: '0 0 auto' }}>
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            style={{
              width: isMobileViewport ? 44 : 42,
              height: isMobileViewport ? 44 : 42,
              borderRadius: '50%',
              border: 'none',
              background: '#f8fafc',
              color: '#0f172a',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={isMobileViewport ? 17 : 18} strokeWidth={2.4} />
          </button>
          <a
            href={DGFY_DISCOVERY_HOME_URL}
            aria-label="Go to DGFY home"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, textDecoration: 'none' }}
          >
            <img
              src={DGFY_HEADER_LOGO_URL}
              alt="DGFY logo"
              style={{ height: isMobileViewport ? 28 : 34, width: 'auto', display: 'block' }}
            />
          </a>
        </div>

        {isMobileViewport ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexShrink: 0, position: 'relative' }} ref={mobileMenuRef}>
            <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <button
                type="button"
                aria-label="Profile"
                title="Profile"
                onClick={onAccount || undefined}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: `5px solid ${DGFY_ICE_BLUE_RING}`,
                  background: DGFY_OCEAN_BLUE,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: typeof onAccount === 'function' ? 'pointer' : 'default',
                  color: '#ffffff',
                  flexShrink: 0,
                  boxShadow: '0 8px 18px rgba(26, 78, 141, 0.24)'
                }}
              >
                <User size={17} strokeWidth={2.5} />
              </button>
              {activeOrderCount > 0 && (
                <span
                  aria-label={`${activeOrderCount} active order${activeOrderCount === 1 ? '' : 's'}`}
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -1,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 999,
                    padding: '0 6px',
                    background: '#f97316',
                    color: '#ffffff',
                    border: '2px solid #ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1,
                    boxShadow: '0 8px 18px rgba(249, 115, 22, 0.28)',
                    pointerEvents: 'none'
                  }}
                >
                  {activeOrderCount > 9 ? '9+' : activeOrderCount}
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setIsMobileMenuOpen((previous) => !previous)}
              style={mobileMenuButtonStyle}
            >
              {isMobileMenuOpen ? <X size={18} strokeWidth={2.4} /> : <Menu size={18} strokeWidth={2.4} />}
            </button>
            {isMobileMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  minWidth: 264,
                  maxWidth: 'calc(100vw - 32px)',
                  borderRadius: 18,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  boxShadow: '0 18px 36px rgba(15,23,42,.16)',
                  padding: 14,
                  display: 'grid',
                  gap: 10,
                  zIndex: 40
                }}
              >
                {branchSelector && (
                  <div style={{ padding: '4px 2px 10px', borderBottom: '1px solid #eef2f6' }}>
                    {branchSelector}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onShop?.();
                  }}
                  style={{ ...textStyle, justifyContent: 'flex-start', width: '100%', padding: '10px 8px' }}
                >
                  Shop
                </button>
                {onTrack && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onTrack();
                    }}
                    style={{ ...textStyle, justifyContent: 'flex-start', width: '100%', padding: '10px 8px' }}
                  >
                    Track Order
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 34,
              flexWrap: 'nowrap',
              minWidth: 0,
              whiteSpace: 'nowrap',
              marginLeft: 'auto',
              flex: '0 1 auto'
            }}
          >
            {branchSelector}
            {branchSelector && (
              <span style={{ width: 1, height: 26, background: '#d9e2ef', flexShrink: 0 }} />
            )}
            <button
              type="button"
              onClick={onShop}
              style={textStyle}
            >
              Shop
            </button>
            {onTrack && (
              <button
                type="button"
                onClick={onTrack}
                style={textStyle}
              >
                Track Order
              </button>
            )}
            <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, marginLeft: 4 }}>
              <button
                type="button"
                aria-label="Profile"
                title="Profile"
                onClick={onAccount || undefined}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  border: `6px solid ${DGFY_ICE_BLUE_RING}`,
                  background: DGFY_OCEAN_BLUE,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: typeof onAccount === 'function' ? 'pointer' : 'default',
                  color: '#ffffff',
                  flexShrink: 0,
                  boxShadow: '0 8px 18px rgba(26, 78, 141, 0.24)',
                  transition: 'background 0.2s, box-shadow 0.2s, transform 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = DGFY_DEEP_BLUE; e.currentTarget.style.boxShadow = '0 10px 22px rgba(26, 78, 141, 0.3)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = DGFY_OCEAN_BLUE; e.currentTarget.style.boxShadow = '0 8px 18px rgba(26, 78, 141, 0.24)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <User size={20} strokeWidth={2.5} />
              </button>
              {activeOrderCount > 0 && (
                <span
                  aria-label={`${activeOrderCount} active order${activeOrderCount === 1 ? '' : 's'}`}
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -1,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 999,
                    padding: '0 6px',
                    background: '#f97316',
                    color: '#ffffff',
                    border: '2px solid #ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: 1,
                    boxShadow: '0 8px 18px rgba(249, 115, 22, 0.28)',
                    pointerEvents: 'none'
                  }}
                >
                  {activeOrderCount > 9 ? '9+' : activeOrderCount}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StorefrontHeaderNav;
