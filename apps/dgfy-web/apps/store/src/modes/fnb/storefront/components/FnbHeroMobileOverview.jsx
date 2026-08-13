import React from 'react';
import { MessageSquare, Phone } from 'lucide-react';
import { GhostButton, PrimaryButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontHeroNameCluster as SharedStorefrontHeroNameCluster } from '../../../../shared/components/storefront/hero/StorefrontHeroNameCluster.jsx';

export const FnbHeroMobileOverview = ({
  followEnabled,
  followState,
  handleFollowAction,
  heroSectionModel,
  heroTheme,
  mobileHeroMetaItems,
  modeAdapter,
  openStorefrontActionLink
}) => {
  const hasRetailPalette = Boolean(heroTheme.palette?.retailHighlight);
  const surfaceAccent = heroTheme.palette?.primary || '#f97316';
  const pageBackground = hasRetailPalette ? (heroTheme.palette?.pageBackground || '#F8FAFC') : '#fff';

  return (
  <div style={{ background: pageBackground }}>
    <div style={{ padding: '14px 16px 10px' }}>
      <div style={{ display: 'flex', minHeight: 38, marginLeft: 118, gap: 8, marginBottom: 12, marginRight: 2 }}>
        {heroSectionModel.actions?.canMessage && (
          <GhostButton onClick={() => openStorefrontActionLink(heroSectionModel.actions.messageHref)} style={{ flex: 1, background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, fontFamily: heroTheme.bodyFont, fontWeight: 600, fontSize: 13 }}>
            <MessageSquare size={16} />
            Message
          </GhostButton>
        )}
        {heroSectionModel.actions?.canCall && (
          <PrimaryButton onClick={() => openStorefrontActionLink(heroSectionModel.actions.callHref)} style={{ flex: 1, background: surfaceAccent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38, borderRadius: 8, border: 'none', ...(hasRetailPalette ? { boxShadow: '0 3px 10px rgba(26,78,141,0.14)' } : {}), fontWeight: 600, fontSize: 13, fontFamily: heroTheme.bodyFont }}>
            <Phone size={16} />
            Call
          </PrimaryButton>
        )}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <SharedStorefrontHeroNameCluster
          name={heroSectionModel.name}
          textColor="#0f172a"
          fontSize={24}
          fontFamily={heroTheme.displayFont}
          accentColor={surfaceAccent}
          followEnabled={followEnabled}
          followState={followState}
          handleFollowAction={handleFollowAction}
        />
        {heroSectionModel.tagline ? (
          <p style={{ margin: 0, color: surfaceAccent, fontSize: 14, fontWeight: 600, fontStyle: 'italic', fontFamily: heroTheme.bodyFont }}>{heroSectionModel.tagline}</p>
        ) : (
          <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.5, fontFamily: heroTheme.bodyFont }}>{modeAdapter.heroDescription}</p>
        )}
        {mobileHeroMetaItems.length > 0 && (
          <div className="no-scrollbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 12, color: '#475569', fontSize: 12, fontWeight: 600, marginTop: 4, fontFamily: heroTheme.bodyFont, overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            {mobileHeroMetaItems.map((item, index) => (
              <React.Fragment key={`mobile-hero-meta-${index}`}>
                {index > 0 ? <span style={{ opacity: 0.3, flexShrink: 0 }}>|</span> : null}
                {item}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
  );
};
