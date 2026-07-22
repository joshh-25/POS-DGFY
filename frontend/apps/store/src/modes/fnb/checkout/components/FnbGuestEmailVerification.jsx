import { Mail, Send, ShieldCheck } from 'lucide-react';

export function FnbGuestEmailVerification({
  bodyFont,
  code,
  cooldownActive,
  cooldownLabel,
  error,
  isMobileViewport,
  loading,
  onCodeChange,
  onRequestCode,
  onVerifyCode,
  verified,
}) {
  if (verified) {
    return (
      <section style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 999, background: '#eff6ff', color: '#1a4e8d', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={18} />
          </span>
          <div style={{ display: 'grid', gap: 2 }}>
            <strong style={{ color: '#0f172a' }}>Email verified</strong>
            <span style={{ color: '#64748b', fontSize: 13 }}>You can now continue this guest order.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 999, background: '#eff6ff', color: '#1a4e8d', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Mail size={18} />
        </span>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ color: '#0f172a', fontSize: isMobileViewport ? 18 : 20 }}>Verify your email</strong>
            <span style={{ borderRadius: 999, background: '#eff6ff', color: '#1a4e8d', padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>
              Recommended
            </span>
          </div>
          <span style={{ color: '#64748b', fontSize: 13 }}>We will send a 6-digit code before your order is placed.</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr auto', gap: 10, alignItems: 'center' }}>
        <label style={{ position: 'relative', display: 'block' }}>
          <ShieldCheck size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            placeholder="6-digit code"
            style={{
              width: '100%',
              minHeight: 44,
              border: '1px solid #cbd5e1',
              borderRadius: 12,
              padding: '0 14px 0 44px',
              boxSizing: 'border-box',
              fontFamily: bodyFont,
              fontWeight: 600,
              letterSpacing: 2,
            }}
          />
        </label>
        <button
          type="button"
          onClick={onVerifyCode}
          disabled={loading || String(code || '').length !== 6}
          style={{
            minHeight: 44,
            borderRadius: 12,
            border: 'none',
            background: loading || String(code || '').length !== 6 ? '#dbeafe' : '#1a4e8d',
            color: loading || String(code || '').length !== 6 ? '#1a4e8d' : '#fff',
            padding: '0 22px',
            fontWeight: 800,
            fontFamily: bodyFont,
            cursor: loading || String(code || '').length !== 6 ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Checking...' : 'Verify'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onRequestCode}
          disabled={loading || cooldownActive}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#1a4e8d',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: 0,
            fontWeight: 800,
            fontFamily: bodyFont,
            cursor: loading || cooldownActive ? 'not-allowed' : 'pointer',
          }}
        >
          <Send size={16} />
          {cooldownActive ? `Send again in ${cooldownLabel}` : 'Send code again'}
        </button>
        <span style={{ color: '#64748b', fontSize: 12 }}>Didn&apos;t receive the code? Check your spam folder.</span>
      </div>
      {error ? <div style={{ color: '#dc2626', fontSize: 12 }}>{error}</div> : null}
    </section>
  );
}
