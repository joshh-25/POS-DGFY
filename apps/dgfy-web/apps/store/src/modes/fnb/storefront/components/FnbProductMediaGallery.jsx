import React from 'react';
import { ArrowUpRight, BadgeCheck, ChefHat, ShieldAlert } from 'lucide-react';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';

const FNB_BODY_FONT = '"Source Sans 3", "Segoe UI", sans-serif';

const detailBadgeStyle = (background, color, border) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 999,
  background,
  color,
  border: border ? `1px solid ${border}` : 'none',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  fontFamily: FNB_BODY_FONT
});

export function FnbProductMediaGallery({
  accentColor = '#15803d',
  accentSoft = '#f0fdf4',
  available,
  availabilityLabel,
  borderSoft = '#86efac',
  bodyFont = FNB_BODY_FONT,
  imageSources,
  imageUrl,
  itemName,
  sectionLabel,
  standardImageHeight
}) {
  return (
    <div style={{
      position: 'relative',
      borderRadius: 24,
      overflow: 'hidden',
      width: '100%',
      height: standardImageHeight,
      background: '#f8fafc',
      border: '1px solid rgba(226, 232, 240, 0.8)',
      boxShadow: '0 20px 48px rgba(15, 23, 42, 0.06)'
    }}>
      <button
        type="button"
        aria-label="View larger image"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.6)',
          display: 'grid',
          placeItems: 'center',
          color: '#475569',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
          transition: 'transform 120ms ease',
          zIndex: 10
        }}
      >
        <ArrowUpRight size={20} />
      </button>

      {imageUrl && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              display: 'grid',
              placeItems: 'center',
              color: '#475569',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              cursor: 'pointer',
              zIndex: 10
            }}
          >
            {'<'}
          </button>
          <button
            type="button"
            aria-label="Next slide"
            style={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              display: 'grid',
              placeItems: 'center',
              color: '#475569',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              cursor: 'pointer',
              zIndex: 10
            }}
          >
            {'>'}
          </button>
        </>
      )}

      {imageUrl ? (
        <StorefrontResponsiveImage
          imageSources={{ ...imageSources, src: imageSources?.largeUrl || imageUrl }}
          sizes="(max-width: 640px) calc(100vw - 32px), 720px"
          alt={itemName}
          decoding="async"
          // Issue #282, Phase D: this is the product-detail LCP image --
          // fetchPriority="high" alone did nothing while
          // StorefrontResponsiveImage's default loading="lazy" still
          // applied underneath it.
          loading="eager"
          fetchPriority="high"
          width={1024}
          height={768}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#64748b' }}>
          <ChefHat size={44} strokeWidth={1.5} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>No image available</span>
        </div>
      )}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(15,23,42,0.1) 0%, transparent 40%)', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ ...detailBadgeStyle(accentColor, '#fff'), fontFamily: bodyFont }}>{sectionLabel}</span>
        <span style={detailBadgeStyle(
          available ? accentSoft : 'rgba(254,242,242,0.95)',
          available ? accentColor : '#b91c1c',
          available ? borderSoft : '#fecaca'
        )}>
          {available ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />}
          {availabilityLabel}
        </span>
      </div>

      {imageUrl && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          display: 'flex',
          gap: 8,
          zIndex: 10
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            border: `2px solid ${accentColor}`,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            background: '#fff',
            cursor: 'pointer'
          }}>
            <StorefrontResponsiveImage
              imageSources={{ ...imageSources, src: imageSources?.thumbnailUrl || imageUrl }}
              sizes="48px"
              alt=""
              loading="lazy"
              decoding="async"
              width={48}
              height={48}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
