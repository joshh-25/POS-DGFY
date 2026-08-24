import React from 'react';
import { SimpleHeroGallery } from './SimpleHeroGallery.jsx';

const SimpleHeroAbout = ({
  STYLES,
  aboutText,
  hasAboutToggle,
  galleryImages,
  galleryImagesFull,
  galleryOverflowCount,
  hasGallerySection,
  isMobileViewport,
  heroTheme
}) => (
  <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
    {aboutText ? (
      <>
        <div style={{ fontSize: heroTheme.typography?.label?.size || 12, fontWeight: heroTheme.typography?.label?.weight || 700, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>About Us</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: '#475569',
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: hasAboutToggle ? 3 : 'unset',
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontFamily: heroTheme.bodyFont
          }}>
            {aboutText}
          </p>
        </div>
      </>
    ) : null}
    {hasGallerySection ? (
      <SimpleHeroGallery
        STYLES={STYLES}
        galleryImages={galleryImages}
        galleryImagesFull={galleryImagesFull}
        galleryOverflowCount={galleryOverflowCount}
        heroTheme={heroTheme}
        isMobileViewport={isMobileViewport}
      />
    ) : null}
  </div>
);

export { SimpleHeroAbout };
