import { describe, expect, it } from 'vitest';

import {
  getServicesResponsiveLayout,
  getStorefrontViewportState
} from '../storefrontViewport.js';

describe('storefrontViewport', () => {
  it('classifies storefront widths into mobile, tablet, and desktop bands', () => {
    expect(getStorefrontViewportState(390)).toMatchObject({
      isMobileViewport: true,
      isTabletViewport: false,
      isDesktopViewport: false
    });

    expect(getStorefrontViewportState(900)).toMatchObject({
      isMobileViewport: false,
      isTabletViewport: true,
      isDesktopViewport: false
    });

    expect(getStorefrontViewportState(1280)).toMatchObject({
      isMobileViewport: false,
      isTabletViewport: false,
      isDesktopViewport: true
    });
  });

  it('returns tablet-friendly services layout tokens between mobile and desktop', () => {
    expect(getServicesResponsiveLayout(900)).toMatchObject({
      heroActionDirection: 'column',
      overviewColumns: 1,
      promoColumns: 'repeat(2, minmax(0, 1fr))',
      reviewColumns: 'repeat(2, minmax(0, 1fr))',
      footerColumns: 'repeat(2, minmax(0, 1fr))',
      usesScrollableGallery: true
    });
  });
});
