import React from 'react';
import { ChevronRight, MapPin, ShoppingCart, Store, Zap } from 'lucide-react';

export function DiscoveryBusinessOwnerCtaSection({
  dgfyBusinessOwnerPhoto,
  dgfySymbolLogo,
  isMobileViewport,
  openBusinessRegistrationFlow
}) {
  return (
    <section style={{ padding: isMobileViewport ? '16px 16px 80px' : '8px 0 108px', maxWidth: 1220, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, .95fr) minmax(0, 1.15fr)', gap: isMobileViewport ? 28 : 34, alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: 22 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, background: '#eff6ff', color: '#1a4e8d', border: '1px solid #dbeafe', padding: '10px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', width: 'fit-content' }}>
            <Store size={14} />
            For Business Owners
          </div>
          <div style={{ display: 'grid', gap: 14, maxWidth: 520 }}>
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 42 : 64, lineHeight: 0.98, letterSpacing: '-0.05em', fontWeight: 900, color: '#0f172a' }}>
              Put Your Business on the <span style={{ color: '#1a4e8d' }}>Map</span>
            </h2>
            <p style={{ margin: 0, fontSize: isMobileViewport ? 16 : 20, lineHeight: 1.65, color: '#64748b', maxWidth: 470 }}>
              Help customers discover your business and manage sales with DGFY.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
            {[
              { icon: <MapPin size={22} color="#1a4e8d" />, bg: '#eff6ff', title: 'Get Discovered', body: 'Be found by nearby customers searching for what you offer.' },
              { icon: <ShoppingCart size={22} color="#16a34a" />, bg: '#ecfdf5', title: 'Manage Smarter', body: 'Use POS, inventory, and tools to run your business better.' },
              { icon: <Zap size={22} color="#8b5cf6" />, bg: '#f5f3ff', title: 'Grow Faster', body: 'Reach more customers and increase your sales with DGFY.' }
            ].map((item) => (
              <div key={item.title} style={{ display: 'grid', gap: 10, paddingRight: isMobileViewport ? 0 : 12 }}>
                <div style={{ width: 58, height: 58, borderRadius: '50%', background: item.bg, display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px rgba(226,232,240,.8)' }}>
                  {item.icon}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{item.title}</div>
                <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ position: 'relative', minHeight: isMobileViewport ? 420 : 540, borderRadius: 30, overflow: 'hidden', border: '1px solid rgba(15,23,42,.08)', boxShadow: '0 30px 70px rgba(15,23,42,.10)', background: 'linear-gradient(135deg, #1f2937 0%, #334155 18%, #475569 38%, #1f2937 100%)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 18% 18%, rgba(251,191,36,.22) 0%, transparent 18%), radial-gradient(circle at 78% 20%, rgba(255,255,255,.10) 0%, transparent 16%), linear-gradient(180deg, rgba(255,255,255,.03) 0%, rgba(15,23,42,.24) 100%)' }} />
            <div style={{ position: 'absolute', top: 26, left: 28, display: 'flex', gap: 14 }}>
              {[0, 1, 2].map((index) => (
                <div key={index} style={{ width: 16, height: 16, borderRadius: '50%', background: index === 0 ? '#f59e0b' : '#fde68a', boxShadow: '0 10px 24px rgba(0,0,0,.18)' }} />
              ))}
            </div>
            <div style={{ position: 'absolute', inset: isMobileViewport ? '18% 10% 0 10%' : '14% 14% 0 6%', borderRadius: 26, background: 'linear-gradient(180deg, rgba(255,255,255,.06) 0%, rgba(15,23,42,.20) 100%)', border: '1px solid rgba(255,255,255,.10)', overflow: 'hidden' }}>
              <img
                src={dgfyBusinessOwnerPhoto}
                alt="Business owner using DGFY"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: isMobileViewport ? 'center top' : '36% center', display: 'block', filter: 'saturate(1.02) contrast(1.02)' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.04) 0%, rgba(15,23,42,0.28) 100%)' }} />
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '20%', background: 'linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,.26) 100%)' }} />

            <div style={{ position: 'absolute', left: isMobileViewport ? 18 : 'auto', right: isMobileViewport ? 18 : 22, top: isMobileViewport ? 'auto' : '22%', bottom: isMobileViewport ? 18 : 24, width: isMobileViewport ? 'auto' : 248, borderRadius: 28, background: 'rgba(255,255,255,.96)', border: '1px solid rgba(226,232,240,.9)', boxShadow: '0 24px 48px rgba(15,23,42,.18)', padding: isMobileViewport ? 18 : 22, backdropFilter: 'blur(12px)' }}>
              <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#eff6ff', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px #dbeafe' }}>
                <img src={dgfySymbolLogo} alt="DGFY" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              </div>
              <div style={{ marginTop: 18, fontSize: isMobileViewport ? 28 : 34, lineHeight: 1.02, letterSpacing: '-0.04em', fontWeight: 900, color: '#0f172a' }}>
                Register Your <span style={{ color: '#1a4e8d' }}>Business</span>
              </div>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0', fontSize: 15, lineHeight: 1.7, color: '#64748b' }}>
                List your products, services, and storefront with DGFY.
              </div>
              <button
                type="button"
                onClick={openBusinessRegistrationFlow}
                style={{ marginTop: 22, width: '100%', minHeight: 52, borderRadius: 16, border: '1px solid #1a4586', background: 'linear-gradient(180deg, #1a4e8d 0%, #1a4586 100%)', color: '#fff', fontSize: 15, fontWeight: 800, boxShadow: '0 14px 28px rgba(26, 78, 141, .28)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}
              >
                Register Your Business
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
