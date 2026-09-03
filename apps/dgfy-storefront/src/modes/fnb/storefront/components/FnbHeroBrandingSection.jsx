import React from 'react';
import { MousePointer2, Phone } from 'lucide-react';
import { Badge, GhostButton, PrimaryButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontHeroShell } from '../../../../shared/components/StorefrontHeroShell.jsx';
import { StorefrontHeroNameCluster as SharedStorefrontHeroNameCluster } from '../../../../shared/components/storefront/hero/StorefrontHeroNameCluster.jsx';
import { StorefrontShareQr as SharedStorefrontShareQr } from '../../../../shared/components/storefront/hero/StorefrontShareQr.jsx';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { formatFnbCurrency } from '../utils/fnbCurrency.js';

export const FnbHeroBrandingSection = ({
  desktopHeroMetaItems,
  fnbViewModel,
  followEnabled,
  followState,
  handleFollowAction,
  heroSectionModel,
  heroTheme,
  HERO_CANVAS_MAX_WIDTH,
  isBrandingImageBlocked,
  isMobileViewport,
  markBrandingImageError,
  modeAdapter,
  onBrowseMenu,
  openStorefrontActionLink,
  profileImageKey,
  selectedStore,
  shareEnabled,
  storefrontShareUrl,
  STYLES
}) => {
  // Services keeps its template tokens on the hero theme itself, while the
  // retail adapter also exposes a nested palette. Prefer the mode-owned flat
  // token so Services cannot fall back to the legacy orange defaults.
  const heroAccent = heroTheme.accent || heroTheme.palette?.primary || '#f97316';
  const heroTaglineColor = heroTheme.taglineColor || heroTheme.accentMuted || heroTheme.palette?.secondary || heroAccent;
  const heroAccentShadow = heroTheme.accentShadow || (heroTheme.palette?.primary
    ? 'rgba(26,78,141,0.3)'
    : 'rgba(249,115,22,0.3)');

  return (
  <StorefrontHeroShell
    fullBleed
    isMobileViewport={isMobileViewport}
    sectionStyle={{
      minHeight: isMobileViewport ? 190 : 316,
      borderRadius: 0,
      overflow: 'visible',
      background: heroSectionModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`)
        ? `url(${heroSectionModel.coverImageUrl}) center/cover`
        : `linear-gradient(135deg, ${heroTheme.surface || '#172033'} 0%, #22324b 50%, #40516c 100%)`,
      boxShadow: STYLES.shadow.lg
    }}
    backgroundChildren={
      <>
        {heroSectionModel.coverImageUrl && !isBrandingImageBlocked(`hero-cover:${selectedStore.slug}`) && (
          <StorefrontResponsiveImage
            imageSources={heroSectionModel.coverImageSources}
            alt=""
            loading="eager"
            fetchPriority="high"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onError={() => markBrandingImageError(`hero-cover:${selectedStore.slug}`)}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0.72) 76%, rgba(15,23,42,0.92) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(6,10,18,0.68) 0%, rgba(6,10,18,0.36) 46%, rgba(6,10,18,0.1) 100%)' }} />
      </>
    }
  >
    <SharedStorefrontShareQr
      storeUrl={storefrontShareUrl}
      isMobileViewport={isMobileViewport}
      accentColor={heroAccent}
      shareEnabled={shareEnabled}
    />
    {isMobileViewport && (
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge background={selectedStore?.storefront_open ? '#22c55e' : '#b45309'} color="#fff" style={{ fontFamily: heroTheme.bodyFont, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>{heroSectionModel.statusLabel}</Badge>
        {Number.isFinite(Number(fnbViewModel.startingPrice)) && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fde68a', fontFamily: heroTheme.bodyFont, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            Starts at {formatFnbCurrency(fnbViewModel.startingPrice)}
          </span>
        )}
      </div>
    )}
    {!isMobileViewport && (
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
            <Badge background={selectedStore?.storefront_open ? '#22c55e' : '#b45309'} color="#fff" style={{ fontFamily: heroTheme.bodyFont }}>{heroSectionModel.statusLabel}</Badge>
            {Number.isFinite(Number(fnbViewModel.startingPrice)) && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fde68a', fontFamily: heroTheme.bodyFont }}>
                Starts at {formatFnbCurrency(fnbViewModel.startingPrice)}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
            <SharedStorefrontHeroNameCluster
              name={heroSectionModel.name}
              textColor="#fff"
              fontSize={50}
              fontFamily={heroTheme.displayFont}
              accentColor={heroAccent}
              followEnabled={followEnabled}
              followState={followState}
              handleFollowAction={handleFollowAction}
              followAccentColor={heroTheme.followColor || heroAccent}
              followActiveColor={heroTheme.followActiveColor}
            />
            {heroSectionModel.tagline ? (
              <p style={{ margin: 0, color: heroTaglineColor, fontSize: 20, fontWeight: 700, lineHeight: 1.3, fontFamily: heroTheme.bodyFont }}>{heroSectionModel.tagline}</p>
            ) : (
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: 16, maxWidth: 620, lineHeight: 1.6, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
            )}
          </div>
          {desktopHeroMetaItems.length > 0 && (
            <div className="no-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 12, color: '#fff', fontSize: 14, fontWeight: 400, opacity: 0.95, marginBottom: 6, fontFamily: heroTheme.bodyFont, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
              {desktopHeroMetaItems.map((item, index) => (
                <React.Fragment key={`desktop-hero-meta-${index}`}>
                  {index > 0 ? <span style={{ opacity: 0.5, flexShrink: 0 }}>|</span> : null}
                  {item}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexDirection: 'column', flexShrink: 0, marginLeft: 'auto', marginBottom: 35 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexDirection: 'row', width: 'auto' }}>
            {heroSectionModel.actions?.canCall && (
              <GhostButton onClick={() => openStorefrontActionLink(heroSectionModel.actions.callHref)} style={{ minWidth: 110, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(12px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, fontFamily: heroTheme.bodyFont, fontWeight: 800 }}>
                <Phone size={18} />
                Call
              </GhostButton>
            )}
            <PrimaryButton onClick={onBrowseMenu} style={{ minWidth: 150, background: heroAccent, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 12, boxShadow: `0 10px 25px ${heroAccentShadow}`, border: 'none', fontWeight: 800, fontFamily: heroTheme.bodyFont }}>
              <MousePointer2 size={18} />
              {heroSectionModel.orderLabel}
            </PrimaryButton>
          </div>
        </div>
      </div>
    )}
    <div style={{
      position: 'absolute',
      left: isMobileViewport ? '20px' : `max(42px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 42px))`,
      bottom: isMobileViewport ? '-45px' : '-25px',
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
      {heroSectionModel.profileImageUrl && !isBrandingImageBlocked(profileImageKey) ? (
        <StorefrontResponsiveImage
          imageSources={heroSectionModel.profileImageSources}
          alt={`${heroSectionModel.name} profile`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => markBrandingImageError(profileImageKey)}
        />
      ) : (
        <div style={{ fontSize: isMobileViewport ? 52 : 66, fontWeight: 900, color: heroTheme.accentDark || STYLES.colors.brandDark, fontFamily: heroTheme.displayFont }}>{heroSectionModel.name.charAt(0)}</div>
      )}
    </div>
  </StorefrontHeroShell>
  );
};
