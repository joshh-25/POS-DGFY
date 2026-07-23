import React from 'react';

export function DiscoveryFooter({
  buildBusinessLoginUrl,
  buildBusinessRegistrationUrl,
  dgfyHeaderLogo,
  isMobileViewport
}) {
  return (
    <footer id="discovery-contact-anchor" style={{ marginLeft: 'calc(50% - 50vw)', width: '100%', minWidth: '100vw', background: 'linear-gradient(180deg, #0c3c86 0%, #0a3475 38%, #082c63 100%)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -42, left: '-4%', right: '-4%', height: 88, background: 'linear-gradient(90deg, rgba(59,130,246,.38) 0%, rgba(96,165,250,.18) 35%, rgba(59,130,246,.34) 100%)', borderBottomLeftRadius: '50% 100%', borderBottomRightRadius: '50% 100%', opacity: 0.9 }} />
      <div style={{ position: 'absolute', top: -20, left: '-8%', right: '-8%', height: 54, background: 'linear-gradient(90deg, rgba(255,255,255,.12) 0%, rgba(255,255,255,.04) 50%, rgba(255,255,255,.10) 100%)', borderBottomLeftRadius: '50% 100%', borderBottomRightRadius: '50% 100%', opacity: 0.75 }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: isMobileViewport ? '96px 20px 42px' : '108px 24px 48px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: isMobileViewport ? 28 : 36,
            justifyItems: isMobileViewport ? 'center' : 'stretch'
          }}
        >
          {[
            {
              title: 'Company',
              links: [
                { label: 'About Us', href: '/about' },
                { label: 'Contact', href: '/contact' },
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Terms & Conditions', href: '/terms' }
              ]
            },
            {
              title: 'Explore',
              links: [
                { label: 'Products', href: '/' },
                { label: 'Services', href: '/' },
                { label: 'Merchants', href: '/' }
              ]
            },
            {
              title: 'For Business',
              links: [
                { label: 'Register Your Business', href: buildBusinessRegistrationUrl() },
                { label: 'Business Login', href: buildBusinessLoginUrl() }
              ]
            },
            {
              title: 'Contact',
              links: [
                { label: 'Email', href: 'mailto:hello@dgfy.ph' },
                { label: 'Facebook', href: 'https://facebook.com' },
                { label: 'Instagram', href: 'https://instagram.com' },
                { label: 'LinkedIn', href: 'https://linkedin.com' }
              ]
            }
          ].map((group) => (
            <div
              key={group.title}
              style={{
                display: 'grid',
                gap: 16,
                alignContent: 'start',
                justifyItems: isMobileViewport ? 'center' : 'start',
                textAlign: isMobileViewport ? 'center' : 'left'
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ffffff' }}>
                {group.title}
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {group.links.map((link) => (
                  <a
                    key={`${group.title}-${link.label}`}
                    href={link.href}
                    target={String(link.href).startsWith('http') ? '_blank' : undefined}
                    rel={String(link.href).startsWith('http') ? 'noreferrer' : undefined}
                    style={{ fontSize: 16, lineHeight: 1.55, color: 'rgba(226,232,240,.96)', textDecoration: 'none' }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: isMobileViewport ? 42 : 54, height: 1, background: 'rgba(226,232,240,.18)' }} />

        <div style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 14, paddingTop: isMobileViewport ? 28 : 34 }}>
          <img src={dgfyHeaderLogo} alt="DGFY logo" style={{ width: isMobileViewport ? 220 : 340, maxWidth: '88%', height: 'auto', display: 'block' }} />
          <div style={{ fontSize: isMobileViewport ? 28 : 40, fontWeight: 900, letterSpacing: '-0.04em', color: '#ffffff' }}>
            <span style={{ color: '#aee8f4' }}>D</span>iscover{' '}
            <span style={{ color: '#aee8f4' }}>G</span>oods{' '}
            <span style={{ color: '#aee8f4' }}>F</span>or{' '}
            <span style={{ color: '#aee8f4' }}>Y</span>ou
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(226,232,240,.86)', maxWidth: 540 }}>
            Search nearby products, services, and businesses faster with a discovery experience built for modern local commerce.
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(203,213,225,.78)' }}>
            &copy; {new Date().getFullYear()} DGFY. Powered by SKUpervisor. All Rights Reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
