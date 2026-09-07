import React from 'react';

/**
 * Shared current-status card for storefront tracking flows.
 * Routes provide status copy, icon, and palette tokens; the compact layout is
 * intentionally identical for every industry and fulfillment method.
 */
export function StorefrontTrackingStatusCard({
  title,
  description,
  icon,
  accentColor,
  background,
  borderColor,
  bodyFont,
  displayFont,
  isMobileViewport = false,
  style
}) {
  return (
    <section
      aria-label="Current order status"
      style={{
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        padding: isMobileViewport ? 16 : 18,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 0,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: accentColor,
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2
          style={{
            margin: 0,
            color: '#0f172a',
            fontSize: isMobileViewport ? 18 : 20,
            lineHeight: 1.25,
            fontWeight: 800,
            fontFamily: displayFont,
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </h2>
        {description ? (
          <p
            style={{
              margin: '4px 0 0',
              color: '#334155',
              fontSize: 14,
              lineHeight: 1.4,
              fontFamily: bodyFont,
              overflowWrap: 'anywhere',
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default StorefrontTrackingStatusCard;
