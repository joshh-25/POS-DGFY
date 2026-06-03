import React from 'react';
import { ArrowLeft, User } from 'lucide-react';

const HERO_CANVAS_MAX_WIDTH = 1320;
const DGFY_HEADER_LOGO_URL = '/dgfy-logo.png';

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
    fontFamily: bodyFont || '"Inter", sans-serif',
    padding: '8px 0',
    lineHeight: 1
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: isMobileViewport ? 0 : 6,
        border: '1px solid #e5eaf2',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
        marginBottom: 0,
        width: isMobileViewport ? '100vw' : 'calc(100vw - 8px)',
        marginLeft: isMobileViewport ? 'calc(50% - 50vw)' : 'calc(50% - 50vw + 4px)',
        overflow: 'visible'
      }}
    >
      <div
        style={{
          maxWidth: HERO_CANVAS_MAX_WIDTH,
          margin: '0 auto',
          minHeight: isMobileViewport ? 68 : 82,
          padding: isMobileViewport ? '12px 16px' : '0 52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobileViewport ? 14 : 32,
          flexDirection: 'row'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobileViewport ? 10 : 14, minWidth: 0, flex: '0 0 auto' }}>
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            style={{
              width: isMobileViewport ? 38 : 42,
              height: isMobileViewport ? 38 : 42,
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
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img
              src={DGFY_HEADER_LOGO_URL}
              alt="DGFY logo"
              style={{ height: isMobileViewport ? 28 : 34, width: 'auto', display: 'block' }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: isMobileViewport ? 16 : 34,
            flexWrap: 'nowrap',
            minWidth: 0,
            whiteSpace: 'nowrap',
            marginLeft: 'auto',
            flex: '0 1 auto',
            overflowX: isMobileViewport ? 'auto' : 'visible',
            scrollbarWidth: 'none'
          }}
        >
          {branchSelector}
          {branchSelector && !isMobileViewport && (
            <span style={{ width: 1, height: 26, background: '#d9e2ef', flexShrink: 0 }} />
          )}
          <button
            type="button"
            onClick={onShop}
            style={{ ...textStyle, fontFamily: '"Inter", sans-serif' }}
          >
            Shop
          </button>
          {onTrack && (
            <button
              type="button"
              onClick={onTrack}
              style={{ ...textStyle, fontFamily: '"Inter", sans-serif' }}
            >
              Track Order
            </button>
          )}
          <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, marginLeft: isMobileViewport ? 0 : 4 }}>
            <button
              type="button"
              aria-label="Profile"
              title="Profile"
              onClick={onAccount || undefined}
              style={{
                width: isMobileViewport ? 40 : 48,
                height: isMobileViewport ? 40 : 48,
                borderRadius: '50%',
                border: '6px solid #eaf2ff',
                background: '#0b74ff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: typeof onAccount === 'function' ? 'pointer' : 'default',
                color: '#ffffff',
                flexShrink: 0,
                boxShadow: '0 8px 18px rgba(11, 116, 255, 0.28)',
                transition: 'background 0.2s, box-shadow 0.2s, transform 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = '#075fd6'; e.currentTarget.style.boxShadow = '0 10px 22px rgba(11, 116, 255, 0.34)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = '#0b74ff'; e.currentTarget.style.boxShadow = '0 8px 18px rgba(11, 116, 255, 0.28)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <User size={isMobileViewport ? 17 : 20} strokeWidth={2.5} />
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
      </div>
    </div>
  );
}

export default StorefrontHeaderNav;
