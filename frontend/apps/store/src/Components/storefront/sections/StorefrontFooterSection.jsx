import React from 'react';
import { Globe, Music2 } from 'lucide-react';

function BrandFacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5H16.8V4.8c-.3 0-1.4-.1-2.6-.1-2.6 0-4.3 1.6-4.3 4.4V11H7v3h2.9v8h3.6Z" />
    </svg>
  );
}

function BrandInstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BrandMessengerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 3C6.9 3 3 6.7 3 11.2c0 2.6 1.3 4.9 3.4 6.4V21l3.2-1.8c.8.2 1.6.3 2.4.3 5.1 0 9-3.7 9-8.2S17.1 3 12 3Zm1 11.4-2.3-2.5-4.5 2.5 5-5.3 2.4 2.5 4.4-2.5-5 5.3Z" />
    </svg>
  );
}

function FooterSocialIcon({ label }) {
  const normalized = String(label || '').trim().toLowerCase();
  if (normalized === 'website') return <Globe size={18} />;
  if (normalized === 'facebook') return <BrandFacebookIcon />;
  if (normalized === 'instagram') return <BrandInstagramIcon />;
  if (normalized === 'tiktok') return <Music2 size={18} />;
  if (normalized === 'messenger') return <BrandMessengerIcon />;
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
    <>
      <style>{`
        .sf-footer-link {
          color: #94a3b8;
          transition: all 0.2s ease;
          text-decoration: none;
          display: inline-block;
        }
        .sf-footer-link:hover {
          color: #ffffff;
          transform: translateX(4px);
        }
        .sf-social-badge {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .sf-social-badge:hover {
          background: rgba(255, 255, 255, 0.1) !important;
          border-color: rgba(255, 255, 255, 0.3) !important;
          transform: translateY(-3px);
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
          color: #ffffff !important;
        }
      `}</style>
      <footer
        style={{
          marginLeft: 'calc(50% - 50vw)',
          width: '100vw',
          background: '#07111f',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Subtle decorative glow */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '20%',
          width: '60%',
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)'
        }} />

        <div
          style={{
            maxWidth: 1320,
            width: '100%',
            margin: '0 auto',
            padding: isMobileViewport ? '36px 20px 32px' : '64px 32px 40px',
            display: 'grid',
            gap: 36,
            position: 'relative',
            zIndex: 1
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
              gap: isMobileViewport ? 32 : 48
            }}
          >
            <div style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{
                  fontSize: isMobileViewport ? 28 : 34,
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                  fontFamily: displayFont,
                  color: '#ffffff'
                }}>
                  {name}
                </div>
                <div style={{ maxWidth: 380, fontSize: 15, lineHeight: 1.75, color: '#94a3b8' }}>
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
                      className="sf-social-badge"
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        background: 'rgba(255, 255, 255, 0.03)',
                        color: '#cbd5e1',
                        fontSize: 12,
                        fontWeight: 800,
                        display: 'grid',
                        placeItems: 'center',
                        textDecoration: 'none',
                        backdropFilter: 'blur(10px)'
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
              <div key={column.title} style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#ffffff', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.9 }}>
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
                          className="sf-footer-link"
                          style={{ fontSize: 15 }}
                        >
                          {item.label}
                        </a>
                      ) : (
                        <div key={`${column.title}-${index}`} style={{ fontSize: 15, color: '#94a3b8' }}>
                          {item.label}
                        </div>
                      )
                    ))
                  ) : (
                    <div style={{ fontSize: 15, color: '#94a3b8' }}>{column.emptyText || 'No entries yet.'}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              paddingTop: 24,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: isMobileViewport ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              flexDirection: isMobileViewport ? 'column' : 'row',
              gap: 12
            }}
          >
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
              &copy; {registrationYear ? `${registrationYear} ` : ''}{name}. All rights reserved.
            </div>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              {bottomRightText}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export default StorefrontFooterSection;
