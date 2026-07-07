import React from 'react';

export function ServiceBookingEmptyState({
  onBrowseServices,
  isMobileViewport,
}) {
  return (
    <section
      style={{
        border: '1px solid #dbe5ee',
        borderRadius: 24,
        background: '#fff',
        padding: isMobileViewport ? 20 : 28,
        boxShadow: '0 18px 42px rgba(15, 23, 42, 0.08)',
        display: 'grid',
        gap: 16,
        maxWidth: 760,
      }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>
          No service selected yet
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: '#64748b' }}>
          Choose a service first so we can load its booking details and requirements here.
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button
          type="button"
          onClick={onBrowseServices}
          style={{
            minHeight: 46,
            borderRadius: 14,
            border: 'none',
            background: '#1a4e8d',
            color: '#fff',
            padding: '0 18px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Browse Services
        </button>
      </div>
    </section>
  );
}
