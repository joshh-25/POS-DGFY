import React from 'react';

const FnbHeroDesktopAboutGallery = ({
  STYLES,
  aboutText,
  galleryImages,
  hasAboutSection,
  hasAboutToggle,
  hasGallerySection,
  heroTheme
}) => (
  <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
    {hasAboutSection && (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>About Us</div>
        <p style={{
          fontSize: 13,
          lineHeight: 1.7,
          color: '#475569',
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: hasAboutToggle ? 3 : 'unset',
          WebkitBoxOrient: 'vertical',
          overflow: hasAboutToggle ? 'hidden' : 'visible',
          fontFamily: heroTheme.bodyFont
        }}>
          {aboutText}
        </p>
      </div>
    )}

    {hasGallerySection && (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>Gallery</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 2, overflowX: 'visible', paddingBottom: 0 }}>
          {galleryImages.slice(0, 4).map((url, index) => (
            <div key={`${url}-${index}`} style={{ width: '100%', minWidth: 0, height: 72, borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#e2e8f0', flexShrink: 0 }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export { FnbHeroDesktopAboutGallery };

