export const STOREFRONT_MOBILE_MAX_WIDTH = 839;
export const STOREFRONT_DESKTOP_MIN_WIDTH = 1024;

export const getStorefrontViewportState = (viewportWidth = 1280) => {
  const width = Number(viewportWidth || 0);
  const isMobileViewport = width <= STOREFRONT_MOBILE_MAX_WIDTH;
  const isDesktopViewport = width >= STOREFRONT_DESKTOP_MIN_WIDTH;
  const isTabletViewport = !isMobileViewport && !isDesktopViewport;

  return {
    width,
    isMobileViewport,
    isTabletViewport,
    isDesktopViewport
  };
};

export const getServicesResponsiveLayout = (viewportWidth = 1280) => {
  const viewport = getStorefrontViewportState(viewportWidth);

  return {
    ...viewport,
    heroProfileSize: viewport.isMobileViewport ? 110 : viewport.isTabletViewport ? 150 : 190,
    heroProfileBottomOffset: viewport.isMobileViewport ? -45 : viewport.isTabletViewport ? -34 : -25,
    heroContentPaddingLeft: viewport.isMobileViewport ? 126 : viewport.isTabletViewport ? 178 : 218,
    heroActionDirection: viewport.isDesktopViewport ? 'row' : 'column',
    overviewColumns: viewport.isDesktopViewport ? 3 : 1,
    promoColumns: viewport.isMobileViewport
      ? '1fr'
      : viewport.isTabletViewport
        ? 'repeat(2, minmax(0, 1fr))'
        : 'repeat(3, minmax(0, 1fr))',
    reviewColumns: viewport.isMobileViewport
      ? '1fr'
      : viewport.isTabletViewport
        ? 'repeat(2, minmax(0, 1fr))'
        : 'repeat(3, minmax(0, 1fr))',
    footerColumns: viewport.isMobileViewport
      ? '1fr'
      : viewport.isTabletViewport
        ? 'repeat(2, minmax(0, 1fr))'
        : 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
    galleryColumns: viewport.isDesktopViewport ? 'repeat(4, 1fr)' : 'repeat(2, minmax(0, 1fr))',
    usesScrollableGallery: !viewport.isDesktopViewport,
    contactColumns: viewport.isDesktopViewport ? '0.9fr 1.1fr' : '1fr',
    serviceCartHeaderColumns: viewport.isMobileViewport ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto auto'
  };
};
