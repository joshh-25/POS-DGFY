import React from 'react';
import { ArrowLeft, FileText, HeartHandshake, ShoppingBag, User } from 'lucide-react';

const HERO_CANVAS_MAX_WIDTH = 1320;
const DGFY_HEADER_LOGO_URL = '/dgfy-logo.png';

export function StorefrontHeaderNav({
  isMobileViewport,
  bodyFont,
  onBack,
  onShop,
  onTrack = null,
  onAccount = null,
  branchSelector = null
}) {
  const textStyle = {
    border: 'none',
    background: 'transparent',
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: bodyFont
  };

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: 0,
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 6px 18px rgba(15,23,42,.05)',
        marginBottom: 0,
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)'
      }}
    >
      <div
        style={{
          maxWidth: HERO_CANVAS_MAX_WIDTH,
          margin: '0 auto',
          padding: isMobileViewport ? '12px 16px' : '14px 24px',
          display: 'flex',
          alignItems: isMobileViewport ? 'stretch' : 'center',
          gap: 16,
          flexDirection: isMobileViewport ? 'column' : 'row'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: isMobileViewport ? '0 0 auto' : '0 1 180px' }}>
          <button
            type="button"
            onClick={onBack}
            style={{ border: 'none', background: '#f8fafc', color: '#0f172a', width: 44, height: 44, borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img
              src={DGFY_HEADER_LOGO_URL}
              alt="DGFY logo"
              style={{ height: 28, width: 'auto', display: 'block' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: isMobileViewport ? 'space-between' : 'flex-end', alignItems: 'center', gap: 18, flexWrap: 'nowrap', minWidth: 0, whiteSpace: 'nowrap', marginLeft: isMobileViewport ? 0 : 'auto', flex: '0 1 auto' }}>
          {branchSelector}
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
          {onAccount && (
            <button
              type="button"
              onClick={onAccount}
              style={{ ...textStyle, fontFamily: '"Inter", sans-serif' }}
            >
              <HeartHandshake size={16} />
              Account
            </button>
          )}
          <button
            type="button"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#0f172a',
              marginLeft: 8,
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
              transition: 'background 0.2s, box-shadow 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.08)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.04)'; }}
          >
            <User size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default StorefrontHeaderNav;
