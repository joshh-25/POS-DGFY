import {
  CheckCircle2,
  List,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Search,
  ShoppingBag,
} from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Search',
    description: 'Search for products or services near you.',
    icon: Search,
    card: 'search',
  },
  {
    number: '02',
    title: 'Compare',
    description: 'Compare nearby stores and service providers.',
    icon: List,
    card: 'compare',
  },
  {
    number: '03',
    title: 'Choose',
    description: 'Choose your preferred merchant or service.',
    icon: ShoppingBag,
    card: 'choose',
  },
  {
    number: '04',
    title: 'Order',
    description: 'Place your order, book a service, or get in touch instantly.',
    icon: CheckCircle2,
    card: 'order',
  },
];

function StepCardMock({ type }) {
  if (type === 'search') {
    return (
      <div style={{ width: '100%', height: 260, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', boxShadow: '0 20px 40px rgba(15,23,42,0.06)', padding: 18, marginTop: 18, marginBottom: 0, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', zIndex: 1, order: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px' }}>
          <Search size={16} color="#1a4e8d" />
          <div style={{ flex: 1, height: 6, background: '#cbd5e1', borderRadius: 4, opacity: 0.5 }} />
          <div style={{ width: 28, height: 28, background: '#1a4e8d', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Search size={14} color="#fff" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, overflow: 'hidden' }}>
          {['Food', 'Grocery', 'Pharmacy'].map((label) => (
            <div key={label} style={{ fontSize: 10, fontWeight: 600, padding: '5px 12px', borderRadius: 99, border: '1px solid #e2e8f0', color: '#475569', flexShrink: 0 }}>{label}</div>
          ))}
        </div>
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 12, position: 'relative', overflow: 'hidden', backgroundImage: 'radial-gradient(circle at center, #e2e8f0 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 100, height: 100, borderRadius: '50%', border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.05)' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 50, height: 50, borderRadius: '50%', border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.1)' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#1a4e8d' }}>
            <MapPin size={28} fill="#1a4e8d" color="#fff" strokeWidth={2} />
          </div>
        </div>
      </div>
    );
  }

  if (type === 'compare') {
    return (
      <div style={{ width: '100%', height: 260, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', boxShadow: '0 20px 40px rgba(15,23,42,0.06)', padding: 14, marginTop: 18, marginBottom: 0, display: 'flex', gap: 10, position: 'relative', overflow: 'hidden', boxSizing: 'border-box', zIndex: 1, order: 2 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { name: 'Kape Central', rating: '4.8 (128)' },
            { name: 'Robinsons Mart', rating: '4.6 (195)' },
            { name: 'J&M Hardware', rating: '4.7 (66)' },
          ].map((store, index) => (
            <div key={store.name} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: 12, padding: 8, display: 'flex', gap: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: index === 0 ? '#fde68a' : index === 1 ? '#bbf7d0' : '#e9d5ff' }} />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#0f172a' }}>{store.name}</div>
                <div style={{ fontSize: 8, color: '#64748b', margin: '2px 0 4px' }}>0.4 km {'\u2022'} 10-15 min</div>
                <div style={{ fontSize: 8, color: '#d97706', fontWeight: 700 }}>{'\u2605'} {store.rating}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ width: 44, background: '#f8fafc', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-around', padding: '10px 0' }}>
          <div style={{ color: '#f59e0b' }}><MapPin size={20} fill="#fde68a" /></div>
          <div style={{ color: '#22c55e' }}><MapPin size={20} fill="#bbf7d0" /></div>
          <div style={{ color: '#a855f7' }}><MapPin size={20} fill="#e9d5ff" /></div>
        </div>
      </div>
    );
  }

  if (type === 'choose') {
    return (
      <div style={{ width: '100%', height: 260, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', boxShadow: '0 20px 40px rgba(15,23,42,0.06)', overflow: 'hidden', marginTop: 18, marginBottom: 0, display: 'flex', flexDirection: 'column', textAlign: 'left', boxSizing: 'border-box', zIndex: 1, order: 2 }}>
        <div style={{ height: 110, background: 'linear-gradient(135deg, #fcd34d, #f59e0b)' }} />
        <div style={{ padding: '16px' }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>Kape Central</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>Coffee Shop</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>0.4 km {'\u2022'} 10-15 min</div>
            <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 800, background: '#f0fdf4', padding: '3px 6px', borderRadius: 6 }}>{'\u2605'} 4.8 (128)</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 20 }}>
            {['Directions', 'Call', 'Message', 'Save'].map((action, index) => (
              <div key={action} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid #f1f5f9', display: 'grid', placeItems: 'center', color: '#64748b' }}>
                  {index === 0 ? <Navigation size={14} /> : index === 1 ? <Phone size={14} /> : index === 2 ? <MessageCircle size={14} /> : <MapPin size={14} />}
                </div>
                <div style={{ fontSize: 8, fontWeight: 700, color: '#475569' }}>{action}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 260, background: '#fff', borderRadius: 24, border: '1px solid #f1f5f9', boxShadow: '0 20px 40px rgba(15,23,42,0.06)', padding: 24, marginTop: 18, marginBottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', boxSizing: 'border-box', zIndex: 1, order: 2 }}>
      <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <CheckCircle2 size={36} strokeWidth={3} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>You&apos;re All Set!</div>
      <div style={{ fontSize: 11, color: '#64748b', margin: '8px 0 24px', lineHeight: 1.5 }}>Your order has been placed successfully.</div>
      <div style={{ background: '#1a4e8d', color: '#fff', fontSize: 11, fontWeight: 700, padding: '12px 0', width: '100%', borderRadius: 10, marginBottom: 12 }}>View Order</div>
      <div style={{ color: '#1a4e8d', fontSize: 11, fontWeight: 700 }}>Track Your Order</div>
    </div>
  );
}

export function DiscoveryHowItWorksSection({ isMobileViewport }) {
  return (
    <section style={{ padding: isMobileViewport ? '60px 16px' : '100px 0 80px', maxWidth: 1140, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
      <h2 style={{ fontSize: isMobileViewport ? 28 : 36, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 16 }}>
        How <span style={{ color: '#1a4e8d' }}>DGFY</span> Works
      </h2>
      <div style={{ fontSize: isMobileViewport ? 14 : 16, color: '#64748b', margin: '0 auto 60px', lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Discover. Compare. Choose. Done.</span>
        Find what you need in just a few simple steps.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(4, 1fr)', gap: isMobileViewport ? 60 : 32, position: 'relative', alignItems: 'start' }}>
        {!isMobileViewport && (
          <div style={{ position: 'absolute', top: 92, left: '12%', right: '12%', height: 2, background: 'repeating-linear-gradient(to right, #cbd5e1 0, #cbd5e1 6px, transparent 6px, transparent 12px)', zIndex: 0 }} />
        )}

        {steps.map((step) => {
          const StepIcon = step.icon;

          return (
            <div key={step.title} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: isMobileViewport ? 10 : 0 }}>
              <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', fontSize: isMobileViewport ? 64 : 72, fontWeight: 900, color: 'rgba(15,23,42,0.12)', lineHeight: 1, letterSpacing: '-0.02em', zIndex: 0, pointerEvents: 'none' }}>{step.number}</div>
              <StepCardMock type={step.card} />
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#1a4e8d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, border: '4px solid #fff', boxShadow: '0 0 0 1px #e2e8f0', marginTop: isMobileViewport ? 34 : 42, order: 1 }}>
                <StepIcon size={20} strokeWidth={2.5} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8, order: 1 }}>{step.title}</h3>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, maxWidth: 200, order: 1 }}>{step.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
