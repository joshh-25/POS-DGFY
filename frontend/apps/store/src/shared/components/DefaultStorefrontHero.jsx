import React from 'react';
import { Badge, GhostButton, PrimaryButton } from './StorefrontActionPrimitives.jsx';
import { StorefrontHeroShell } from './StorefrontHeroShell.jsx';

const DefaultStorefrontHero = ({
  HERO_CANVAS_MAX_WIDTH,
  STYLES,
  modeAdapter,
  selectedStore,
  isMobileViewport,
  handleShareAction,
  setIsCheckoutOpen
}) => {
  const heroTheme = modeAdapter.heroTheme || {};

  return (
    <>
      <StorefrontHeroShell
        fullBleed
        isMobileViewport={isMobileViewport}
        sectionStyle={{
          minHeight: isMobileViewport ? 190 : 316,
          borderRadius: 0,
          overflow: 'visible',
          background: `linear-gradient(135deg, ${heroTheme.surface || '#0f172a'} 0%, ${heroTheme.accentDark || '#134e4a'} 52%, ${heroTheme.accent || '#0f766e'} 100%)`,
          boxShadow: STYLES.shadow.lg
        }}
        backgroundChildren={
          <>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0.72) 76%, rgba(15,23,42,0.92) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,10,18,0.68) 0%, rgba(6,10,18,0.36) 46%, rgba(6,10,18,0.1) 100%)' }} />
          </>
        }
      >
        <div style={{ display: isMobileViewport ? 'none' : 'block' }}>
          <div style={{
            position: 'absolute',
            left: `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
            right: `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
            bottom: -25,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            paddingLeft: 218
          }}>
            <div style={{ display: 'grid', gap: 12, maxWidth: 700, minWidth: 0, flex: 1, marginBottom: 35 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Badge background="#0f766e" color="#fff" style={{ fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroEyebrow}</Badge>
              </div>
              <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
                <h1 style={{ margin: 0, color: '#fff', fontSize: 50, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', fontFamily: heroTheme.displayFont }}>{selectedStore?.tenant_name || 'Loading Storefront...'}</h1>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: 16, maxWidth: 620, lineHeight: 1.6, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexDirection: 'row',
              flexShrink: 0,
              marginLeft: 'auto',
              marginBottom: 35
            }}>
              <GhostButton onClick={handleShareAction} style={{ minWidth: 110, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, fontFamily: heroTheme.bodyFont }}>
                Share Storefront
              </GhostButton>
              <PrimaryButton onClick={() => setIsCheckoutOpen(true)} style={{ minWidth: 150, background: heroTheme.accent || '#0f766e', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, boxShadow: '0 10px 25px rgba(15,118,110,0.28)', border: 'none', fontWeight: 900, fontFamily: heroTheme.bodyFont }}>
                {modeAdapter.primaryActionLabel}
              </PrimaryButton>
            </div>
          </div>
        </div>

        <div style={{
          position: 'absolute',
          left: isMobileViewport ? '20px' : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
          bottom: isMobileViewport ? '-45px' : -25,
          width: isMobileViewport ? 110 : 190,
          height: isMobileViewport ? 110 : 190,
          borderRadius: '50%',
          background: '#fff',
          border: '3px solid #fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {selectedStore?.storefront_profile_image_url ? (
            <img
              src={selectedStore.storefront_profile_image_url}
              alt={`${selectedStore?.tenant_name} profile`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ fontSize: isMobileViewport ? 32 : 66, fontWeight: 900, color: heroTheme.accentDark || '#134e4a', fontFamily: heroTheme.displayFont }}>{(selectedStore?.tenant_name || 'S').charAt(0)}</div>
          )}
        </div>
      </StorefrontHeroShell>

      <div style={{ display: isMobileViewport ? 'block' : 'none', background: '#fff' }}>
        <div style={{ padding: '14px 16px 10px' }}>
          <div style={{ display: 'flex', marginLeft: 80, gap: 8, marginBottom: 12, marginRight: 2 }}>
            <GhostButton onClick={handleShareAction} style={{ flex: 1, background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, fontFamily: heroTheme.bodyFont, fontWeight: 600, fontSize: 13 }}>
              Share
            </GhostButton>
            <PrimaryButton onClick={() => setIsCheckoutOpen(true)} style={{ flex: 1, background: heroTheme.accent || '#0f766e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13, fontFamily: heroTheme.bodyFont }}>
              {modeAdapter.primaryActionLabel}
            </PrimaryButton>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0, color: '#0f172a', fontSize: 24, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', fontFamily: heroTheme.displayFont }}>{selectedStore?.tenant_name || 'Loading Storefront...'}</h1>
            <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.5, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
            <div className="no-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 12, color: '#475569', fontSize: 12, fontWeight: 600, marginTop: 4, fontFamily: heroTheme.bodyFont, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{modeAdapter.heroEyebrow}</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: isMobileViewport ? 'none' : 'block' }}>
        <div style={{
          maxWidth: HERO_CANVAS_MAX_WIDTH,
          margin: isMobileViewport ? '40px 16px 32px' : '70px auto 40px',
          padding: 26,
          background: '#ffffff',
          border: '1px solid #e8edf3',
          borderRadius: 24,
          boxShadow: '0 18px 42px rgba(15, 23, 42, 0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: '#64748b' }}>
            Browse the store categories and products below.
          </div>
        </div>
      </div>
    </>
  );
};

export { DefaultStorefrontHero };
