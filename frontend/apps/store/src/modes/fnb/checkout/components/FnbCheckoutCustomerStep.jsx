import { ChevronLeft, ChevronRight } from 'lucide-react';

/** F&B customer step view. Identity controls are prepared by the route ViewModel. */
export function FnbCheckoutCustomerStep({
  bodyFont,
  brandColor,
  brandDark,
  canContinue,
  identityContent,
  guestEmailVerificationContent,
  customerNotice,
  isMobileViewport,
  isResponsive,
  mutedTextColor,
  onBack,
  onContinue
}) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: isResponsive ? 20 : 16, background: '#fff', padding: isResponsive ? 16 : isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 1: Customer Details</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>{customerNotice}</div>
      {identityContent}
      {guestEmailVerificationContent}
      {!isResponsive ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBack} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontFamily: bodyFont, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
          <button type="button" onClick={onContinue} disabled={!canContinue} style={{ minHeight: 46, borderRadius: 12, border: 'none', background: canContinue ? `linear-gradient(180deg, ${brandColor} 0%, ${brandDark} 100%)` : '#cbd5e1', color: '#fff', fontFamily: bodyFont, fontWeight: 700, cursor: canContinue ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
        </div>
      ) : null}
      {!canContinue ? <div style={{ fontSize: 12, color: mutedTextColor }}>Complete required fields to continue.</div> : null}
    </section>
  );
}
