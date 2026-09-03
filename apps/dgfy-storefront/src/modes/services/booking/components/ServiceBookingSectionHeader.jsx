import React from 'react';

export function ServiceBookingSectionHeader({
  id,
  icon,
  title,
  description,
  servicesPrimary,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  servicesDisplayFont,
  showIcon = true,
}) {
  return (
    <div style={{ display: 'grid', gap: description ? 4 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {showIcon ? (
          <span style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0, color: servicesPrimary, background: servicesPrimarySoft, border: `1px solid ${servicesPrimaryBorder}` }}>
            {icon}
          </span>
        ) : null}
        <h3 id={id} style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', fontFamily: servicesDisplayFont || 'inherit' }}>
          {title}
        </h3>
      </div>
      {description ? <p style={{ margin: 0, color: '#58717a', fontSize: 12, lineHeight: 1.5 }}>{description}</p> : null}
    </div>
  );
}
