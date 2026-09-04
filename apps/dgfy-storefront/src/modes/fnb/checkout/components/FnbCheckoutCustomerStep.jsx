import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GUEST_CHECKOUT_FONT_FAMILY, getGuestCheckoutTypography } from '../../../../shared/components/checkout/guestCheckoutTypography.js';

/** F&B customer step view. Identity controls are prepared by the route ViewModel. */
export function FnbCheckoutCustomerStep({
  brandColor,
  brandDark,
  canContinue,
  identityContent,
  guestEmailVerificationContent,
  isMobileViewport,
  isResponsive,
  onBack,
  onContinue
}) {
  const typography = getGuestCheckoutTypography(isMobileViewport);

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: isResponsive ? 20 : 16, background: '#fff', padding: isResponsive ? 16 : isMobileViewport ? 16 : 24, display: 'grid', gap: isMobileViewport ? 16 : 24, fontFamily: GUEST_CHECKOUT_FONT_FAMILY }}>
      <div style={{ ...typography.accountTitle, color: '#1e293b' }}>Step 1: Customer Details</div>
      {identityContent}
      {guestEmailVerificationContent}
      {!isResponsive ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBack} style={{ minHeight: 44, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: typography.action.fontSize, fontFamily: GUEST_CHECKOUT_FONT_FAMILY, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
          <button type="button" onClick={onContinue} disabled={!canContinue} style={{ minHeight: 44, borderRadius: 12, border: 'none', background: canContinue ? `linear-gradient(180deg, ${brandColor} 0%, ${brandDark} 100%)` : '#cbd5e1', color: '#fff', fontSize: typography.action.fontSize, fontFamily: GUEST_CHECKOUT_FONT_FAMILY, fontWeight: 700, cursor: canContinue ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
        </div>
      ) : null}
    </section>
  );
}
