import { CheckCircle2, Mail, Phone, User } from 'lucide-react';

export function CustomerIdentityCard({
  title = 'Account Details',
  subtitle = 'Your DGFY account details will be used for this order.',
  showVerifiedBadge = true,
  name = '',
  phone = '',
  email = '',
  isMobileViewport = false,
  bodyFont = "'Avenir Next', 'Segoe UI', sans-serif",
  displayFont = "'Avenir Next', 'Segoe UI', sans-serif"
}) {
  const hasName = String(name || '').trim().length > 0;
  const hasPhone = String(phone || '').trim().length > 0;
  const hasEmail = String(email || '').trim().length > 0;

  return (
    <section style={{ border: '1px solid #dbeafe', borderRadius: 16, background: 'linear-gradient(135deg,#eff6ff,#ffffff)', padding: isMobileViewport ? 13 : 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{ width: isMobileViewport ? 44 : 52, height: isMobileViewport ? 44 : 52, borderRadius: '50%', background: '#dbeafe', color: '#2563eb', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <User size={isMobileViewport ? 20 : 22} />
          </div>
          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', fontFamily: displayFont }}>{hasName ? String(name).trim() : title}</div>
              {showVerifiedBadge && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#2563eb', fontFamily: bodyFont }}>
                  <CheckCircle2 size={14} />
                  Verified
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isMobileViewport ? 10 : 18 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, color: hasPhone ? '#334155' : '#94a3b8', fontWeight: hasPhone ? 600 : 500, fontFamily: bodyFont }}>
                <Phone size={15} />
                <span style={{ wordBreak: 'break-word' }}>{hasPhone ? String(phone).trim() : 'No phone number linked yet'}</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13, color: hasEmail ? '#334155' : '#94a3b8', fontWeight: hasEmail ? 600 : 500, fontFamily: bodyFont }}>
                <Mail size={15} />
                <span style={{ wordBreak: 'break-word' }}>{hasEmail ? String(email).trim() : 'No email linked yet'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
