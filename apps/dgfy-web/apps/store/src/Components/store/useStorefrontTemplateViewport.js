import React from 'react';

const DESKTOP_MIN = 1024;
const TABLET_MIN = 768;

const getViewportKind = (width) => {
  if (width >= DESKTOP_MIN) return 'desktop';
  if (width >= TABLET_MIN) return 'tablet';
  return 'mobile';
};

export const useStorefrontTemplateViewport = () => {
  const [viewportKind, setViewportKind] = React.useState(() => {
    if (typeof window === 'undefined') return 'desktop';
    return getViewportKind(window.innerWidth);
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setViewportKind(getViewportKind(window.innerWidth));
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    viewportKind,
    isMobile: viewportKind === 'mobile',
    isTablet: viewportKind === 'tablet',
    isDesktop: viewportKind === 'desktop'
  };
};
