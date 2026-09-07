import { StorefrontAboutDescription } from '../../../../features/shared-storefront/components/StorefrontAboutDescription.jsx';
import React from 'react';
import { SimpleHeroGallery } from './SimpleHeroGallery.jsx';

const SimpleHeroAbout = ({
  STYLES,
  aboutText,
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
          <StorefrontAboutDescription text={aboutText} accentColor={heroTheme.accent || STYLES.colors.brand} fontFamily={heroTheme.bodyFont} />
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
