import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CustomerIdentityCard } from '../checkout/CustomerIdentityCard.jsx';

const DEFAULT_ACCENT = '#1a4e8d';
const DEFAULT_ACCENT_DARK = '#1a4586';

// Placeholder identity — this step is not wired to the real DGFY account/guest-checkout
// backend yet. See DefaultOrderPage.jsx's doc comment.
const PLACEHOLDER_ACCOUNT = {
  name: 'Guest Customer',
  phone: '+63 917 000 0000',
  email: 'guest@example.com'
};

/**
 * Default/Retail order page's Account step. Mirrors
 * modes/simple/checkout/components/SimpleCheckoutCustomerStep.jsx's layout, but shows a
 * placeholder identity card instead of real signed-in/guest account data — this step isn't
 * connected to the backend yet.
 */
export function DefaultOrderAccountStep({
  isMobileViewport = false,
  servicesBodyFont,
  servicesDisplayFont,
  onBackToCatalog,
  onContinue
}) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 1: Customer Details</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>
        Placeholder account details are shown here for now — this step isn&apos;t connected to sign-in or guest checkout yet.
      </div>
      <CustomerIdentityCard
        title="Account Details"
        subtitle="Placeholder account details will be used for this order."
        showVerifiedBadge={false}
        name={PLACEHOLDER_ACCOUNT.name}
        phone={PLACEHOLDER_ACCOUNT.phone}
        email={PLACEHOLDER_ACCOUNT.email}
        isMobileViewport={isMobileViewport}
        bodyFont={servicesBodyFont}
        displayFont={servicesDisplayFont}
      />
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10 }}>
        <button type="button" onClick={onBackToCatalog} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back to Catalog</button>
        <button type="button" onClick={onContinue} style={{ minHeight: 46, borderRadius: 12, border: 'none', background: `linear-gradient(180deg, ${DEFAULT_ACCENT} 0%, ${DEFAULT_ACCENT_DARK} 100%)`, color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
      </div>
    </section>
  );
}
