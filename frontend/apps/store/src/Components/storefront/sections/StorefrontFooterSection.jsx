import React from 'react';
import { Globe, Instagram, MessageCircle, Music2 } from 'lucide-react';

function FooterSocialIcon({ label }) {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === 'website') return <Globe size={18} />;
  if (normalized === 'facebook') return <span style={{ fontSize: 18, fontWeight: 800 }}>f</span>;
  if (normalized === 'instagram') return <Instagram size={18} />;
  if (normalized === 'tiktok') return <Music2 size={18} />;
  if (normalized === 'messenger') return <MessageCircle size={18} />;
  return <Globe size={18} />;
}

export function StorefrontFooterSection({
  isMobileViewport,
  name,
  registrationYear,
  description,
  displayFont,
  badgeLinks = [],
  columns = [],
  bottomRightText = 'Powered by SKUpervisor'
}) {
  return (
    <footer
      style={{
        marginLeft: 'calc(50% - 50vw)',
        width: '100vw',
        background: '#090b0f',
        borderTop: '1px solid rgba(148, 163, 184, 0.18)'
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          width: '100%',
          margin: '0 auto',
          padding: isMobileViewport ? '28px 16px 32px' : '48px 24px 36px',
          display: 'grid',
          gap: 28
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
            gap: isMobileViewport ? 24 : 36
          }}
        >
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.03em', fontFamily: displayFont }}>{name}</div>
              <div style={{ maxWidth: 360, fontSize: 15, lineHeight: 1.7, color: '#94a3b8' }}>
                {description}
              </div>
            </div>

            {badgeLinks.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {badgeLinks.map((link) => (
                  <a
                    key={`footer-social-${link.label}`}
                    href={link.href}
                    target={String(link.href).startsWith('http') ? '_blank' : undefined}
                    rel={String(link.href).startsWith('http') ? 'noreferrer' : undefined}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      border: '1px solid rgba(148, 163, 184, 0.18)',
                      background: 'rgba(15, 23, 42, 0.55)',
                      color: '#e2e8f0',
                      fontSize: 12,
                      fontWeight: 800,
                      display: 'grid',
                      placeItems: 'center',
                      textDecoration: 'none'
                    }}
                    title={link.label}
                  >
                    <FooterSocialIcon label={link.label} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {columns.map((column) => (
            <div key={column.title} style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {column.title}
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {Array.isArray(column.items) && column.items.length > 0 ? (
                  column.items.map((item, index) => (
                    item.href ? (
                      <a
                        key={`${column.title}-${index}`}
                        href={item.href}
                        target={String(item.href).startsWith('http') ? '_blank' : undefined}
                        rel={String(item.href).startsWith('http') ? 'noreferrer' : undefined}
                        style={{ fontSize: 15, color: '#cbd5e1', textDecoration: 'none' }}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <div key={`${column.title}-${index}`} style={{ fontSize: 15, color: '#cbd5e1' }}>
                        {item.label}
                      </div>
                    )
                  ))
                ) : (
                  <div style={{ fontSize: 15, color: '#64748b' }}>{column.emptyText || 'No entries yet.'}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            paddingTop: 18,
            borderTop: '1px solid rgba(148, 163, 184, 0.12)',
            display: 'flex',
            alignItems: isMobileViewport ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            flexDirection: isMobileViewport ? 'column' : 'row',
            gap: 10
          }}
        >
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {name}{registrationYear ? ` ${registrationYear}` : ''}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{bottomRightText}</div>
        </div>
      </div>
    </footer>
  );
}

export default StorefrontFooterSection;
