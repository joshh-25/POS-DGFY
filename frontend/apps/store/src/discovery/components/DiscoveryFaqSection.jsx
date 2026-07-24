import React from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';

export function DiscoveryFaqSection({
  isMobileViewport,
  openDiscoveryFaqIndex,
  setOpenDiscoveryFaqIndex
}) {
  return (
    <section style={{ padding: isMobileViewport ? '0 16px 88px' : '0 0 112px', maxWidth: 1180, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, .82fr) minmax(0, 1.18fr)', gap: isMobileViewport ? 28 : 42, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, background: '#eff6ff', color: '#1a4e8d', border: '1px solid #dbeafe', padding: '10px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', width: 'fit-content' }}>
            <MessageCircle size={14} />
            Frequently Asked Questions
          </div>
          <div style={{ display: 'grid', gap: 14, maxWidth: 460 }}>
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 34 : 50, lineHeight: 1.02, letterSpacing: '-0.04em', fontWeight: 900, color: '#0f172a' }}>
              Answers Before You <span style={{ color: '#1a4e8d' }}>Explore</span>
            </h2>
            <p style={{ margin: 0, fontSize: isMobileViewport ? 15 : 18, lineHeight: 1.75, color: '#64748b' }}>
              Everything shoppers and business owners usually ask before using DGFY discovery.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 12, padding: isMobileViewport ? '20px 18px' : '22px 24px', borderRadius: 26, background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)', border: '1px solid #e2e8f0', boxShadow: '0 16px 40px rgba(15,23,42,.06)' }}>
            {[
              { label: 'Search nearby', value: 'Product- and service-based discovery within your area' },
              { label: 'Business signup', value: 'Fast onboarding for merchants ready to be found' },
              { label: 'Customer trust', value: 'Clear status, distance, branches, and storefront details' }
            ].map((item) => (
              <div key={item.label} style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1a4e8d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: '#475569' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {[
            {
              question: 'How does DGFY find businesses near me?',
              answer: 'When you search, DGFY uses your current location when available and matches nearby businesses that offer the product or service you need. Results are then organized into an easier map-and-list discovery view.'
            },
            {
              question: 'Do I need to enable location to use storefront discovery?',
              answer: 'Location gives you more accurate nearby results and distance estimates. If location is unavailable, the page can still show broader discovery results, but the experience is less precise.'
            },
            {
              question: 'What does Register Your Business do?',
              answer: 'It takes merchants to the DGFY registration flow so they can list their storefront, products, and services, then become discoverable to nearby customers on the platform.'
            },
            {
              question: 'Can customers compare multiple stores before choosing?',
              answer: 'Yes. The discovery experience is designed to help customers compare business cards, location distance, store status, and storefront details before visiting or ordering.'
            }
          ].map((item, index) => {
            const isOpen = openDiscoveryFaqIndex === index;
            return (
              <div
                key={item.question}
                style={{
                  borderRadius: 24,
                  background: '#fff',
                  border: isOpen ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  boxShadow: isOpen ? '0 18px 40px rgba(37,99,235,.10)' : '0 10px 26px rgba(15,23,42,.05)',
                  overflow: 'hidden',
                  transition: 'all 220ms ease'
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenDiscoveryFaqIndex((current) => current === index ? -1 : index)}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    padding: isMobileViewport ? '20px 18px' : '22px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>{item.question}</div>
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                      {isOpen ? 'Tap to collapse' : 'Tap to expand'}
                    </div>
                  </div>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: isOpen ? '#1a4e8d' : '#eff6ff', color: isOpen ? '#fff' : '#1a4e8d', display: 'grid', placeItems: 'center', flexShrink: 0, transition: 'all 200ms ease' }}>
                    <ChevronDown size={18} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }} />
                  </div>
                </button>
                {isOpen ? (
                  <div style={{ padding: isMobileViewport ? '0 18px 20px' : '0 24px 22px' }}>
                    <div style={{ height: 1, background: '#e2e8f0', marginBottom: 16 }} />
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: '#475569' }}>
                      {item.answer}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
