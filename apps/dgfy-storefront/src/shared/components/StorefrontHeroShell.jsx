import React from 'react';

export const StorefrontHeroShell = ({
  fullBleed = false,
  isMobileViewport = false,
  sectionStyle = {},
  backgroundChildren = null,
  children,
  outerStyle = {}
}) => (
  <div
    style={{
      position: 'relative',
      ...(fullBleed && !isMobileViewport
        ? { width: '100vw', marginLeft: 'calc(50% - 50vw)' }
        : { width: '100%' }),
      ...outerStyle
    }}
  >
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...sectionStyle
      }}
    >
      {backgroundChildren}
      {children}
    </section>
  </div>
);
