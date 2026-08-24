import React from 'react';
import { Info, MapPin, Navigation } from 'lucide-react';

import { DiscoveryMapCard } from '../../Components/store/DiscoveryResponsiveLayout.jsx';
import { openStorefrontActionLink, sanitizeExternalLink } from '../../shared/utils/externalLinks.js';
import { StoresMap } from './StoresMapLazy.jsx';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../packages/web-core/src/observability/analyticsEvents.js';

export function DiscoveryHeroMapStage({
  discoveryCoords,
  discoveryLayout,
  discoveryViewportMode,
  getDiscoveryMarkerKey,
  goStore,
  handleDiscoveryClusterSelect,
  handleNearMe,
  highlightedDiscoveryMarkerKey,
  isDiscoveryMobileViewport,
  setHasDiscoveryExplorationStarted,
  setHighlightedDiscoveryMarkerKey,
  setHighlightedStoreSlug,
  stableHeroDiscoveryMapPins,
  storesWithNearestBranch
}) {
  return (
    <DiscoveryMapCard viewportMode={discoveryViewportMode}>
      <div
        style={{
          position: 'relative',
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
          boxShadow: '0 8px 32px rgba(15,23,42,.10)'
        }}
      >
        <StoresMap
          stores={stableHeroDiscoveryMapPins}
          selectedKey={highlightedDiscoveryMarkerKey || null}
          userLocation={discoveryCoords}
          height={discoveryLayout.heroMapHeight}
          openPopupOnHover
          onSelectCluster={handleDiscoveryClusterSelect}
          onSelectStore={(pin) => {
            setHasDiscoveryExplorationStarted(true);
            setHighlightedStoreSlug(pin.slug);
            setHighlightedDiscoveryMarkerKey(getDiscoveryMarkerKey(pin) || '');
            trackFunnelEvent(ANALYTICS_EVENTS.DISCOVERY_MAP_PIN_CLICKED, {
              store_slug: pin.slug,
              entity_type: pin.entity_type,
              business_mode: pin.workflow_mode || pin.business_mode
            });
            // External listings have no DGFY storefront to open — routing them into
            // goStore would land the visitor on a broken/empty catalog shell.
            if (pin.entity_type === 'external_listing') {
              openStorefrontActionLink(sanitizeExternalLink(pin.storefront_url));
              return;
            }
            goStore(pin.slug, pin.location_id ?? null);
          }}
        />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(180deg, rgba(255,255,255,.20) 0%, transparent 100%)', pointerEvents: 'none' }} />
        <div
          style={{
            position: 'absolute',
            bottom: isDiscoveryMobileViewport ? 12 : 0,
            left: isDiscoveryMobileViewport ? 12 : 0,
            right: isDiscoveryMobileViewport ? 12 : 0,
            background: isDiscoveryMobileViewport ? 'rgba(15, 23, 42, 0.75)' : 'linear-gradient(0deg, rgba(15,23,42,.72) 0%, transparent 100%)',
            backdropFilter: isDiscoveryMobileViewport ? 'blur(12px)' : 'none',
            borderRadius: isDiscoveryMobileViewport ? 20 : 0,
            padding: isDiscoveryMobileViewport ? '16px 18px' : discoveryViewportMode === 'tablet' ? '26px 22px 14px' : '32px 24px 16px',
            display: isDiscoveryMobileViewport ? 'none' : 'flex',
            alignItems: isDiscoveryMobileViewport ? 'center' : 'flex-end',
            justifyContent: 'space-between',
            border: isDiscoveryMobileViewport ? '1px solid rgba(255,255,255,0.1)' : 'none',
            boxShadow: isDiscoveryMobileViewport ? '0 8px 32px rgba(0,0,0,0.25)' : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isDiscoveryMobileViewport ? 10 : discoveryViewportMode === 'tablet' ? 18 : 20, width: '100%', justifyContent: isDiscoveryMobileViewport ? 'space-between' : 'flex-start' }}>
            {isDiscoveryMobileViewport ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, borderRadius: 12, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)', padding: '7px 10px', display: 'grid', gap: 3 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#f8fafc' }}>
                    <MapPin size={13} />
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.9 }}>Location</span>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(248,250,252,.86)', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                    Store Label
                  </div>
                </div>
                <button type="button" onClick={handleNearMe} style={{ minWidth: 72, borderRadius: 12, background: 'rgba(255,255,255,.95)', color: '#0f172a', border: '1px solid rgba(148,163,184,.28)', display: 'grid', placeItems: 'center', gap: 2, padding: '6px 8px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(15,23,42,.16)' }}>
                  <Navigation size={15} fill="#0f172a" />
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#334155', lineHeight: 1.1 }}>Current Location</span>
                </button>
              </div>
            ) : (
              [
                { label: 'Stores', value: String(stableHeroDiscoveryMapPins.length || 0) },
                { label: 'Open Now', value: String(storesWithNearestBranch.filter((store) => store.storefront_open).length) }
              ].map((stat) => (
                <div key={stat.label}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{stat.value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.68)', fontWeight: 500, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
                </div>
              ))
            )}
          </div>

          {!isDiscoveryMobileViewport && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.20)', borderRadius: 999, padding: '6px 12px', color: 'rgba(255,255,255,.88)', fontSize: 12, fontWeight: 600, backdropFilter: 'blur(8px)' }}>
              <MapPin size={12} />
              Live Map
            </div>
          )}
        </div>
        {isDiscoveryMobileViewport && (
          <div style={{ position: 'absolute', right: 10, bottom: 12, zIndex: 12, display: 'grid', gap: 10, justifyItems: 'end' }}>
            <button type="button" style={{ width: 84, minHeight: 80, borderRadius: 16, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(255,255,255,.96)', boxShadow: '0 6px 18px rgba(15,23,42,.16)', display: 'grid', placeItems: 'center', gap: 4, padding: '8px 6px', color: '#0f172a', cursor: 'default' }} aria-label="Store location">
              <MapPin size={16} />
              <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', lineHeight: 1 }}>Store</span>
              <span style={{ fontSize: 8, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>Location</span>
            </button>
            <button type="button" onClick={handleNearMe} style={{ width: 84, minHeight: 80, borderRadius: 16, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(255,255,255,.96)', boxShadow: '0 6px 18px rgba(15,23,42,.16)', display: 'grid', placeItems: 'center', gap: 4, padding: '8px 6px', color: '#0f172a', cursor: 'pointer' }} aria-label="Use current location on map">
              <Navigation size={16} fill="#0f172a" />
              <span style={{ fontSize: 8, fontWeight: 800, color: '#0f172a', lineHeight: 1.15, textAlign: 'center' }}>My location</span>
            </button>
            <button type="button" aria-label="Map information" style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid rgba(148,163,184,0.28)', background: 'rgba(255,255,255,.98)', color: '#0f172a', boxShadow: '0 6px 14px rgba(15,23,42,.16)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'default' }}>
              <Info size={15} />
            </button>
          </div>
        )}
      </div>
    </DiscoveryMapCard>
  );
}
