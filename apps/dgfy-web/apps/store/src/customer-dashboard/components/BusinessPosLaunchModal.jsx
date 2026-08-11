import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ExternalLink, KeyRound, X } from 'lucide-react';

export function BusinessPosLaunchModal({ company, intent = 'pos', dayCloseLoading = false, dayCloseStatus = null, dayCloseError = '', onClose, onOpenInNewTab, onConfigureDayClosePin, theme }) {
  const stayButtonRef = useRef(null);
  const passwordInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const companyName = String(company?.company_name || company?.name || 'this business').trim();
  const companyKey = String(company?.tenant_id || company?.tenantId || company?.id || companyName).trim();
  const isDayClose = intent === 'day_close' || intent === 'day_close_pin';
  const canConfigureDayClosePin = isDayClose && dayCloseStatus?.canCloseDay === true;
  const [form, setForm] = useState({ currentPassword: '', pin: '', confirmation: '' });
  const [visibleFields, setVisibleFields] = useState({ currentPassword: false, pin: false, confirmation: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!company) return undefined;
    setForm({ currentPassword: '', pin: '', confirmation: '' });
    setVisibleFields({ currentPassword: false, pin: false, confirmation: false });
    setSubmitting(false);
    setError('');
    (canConfigureDayClosePin ? passwordInputRef : stayButtonRef).current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canConfigureDayClosePin, companyKey]);

  if (!company) return null;

  const renderSensitiveInput = ({ field, label, inputMode, autoComplete, placeholder = '' }) => {
    const visible = visibleFields[field] === true;
    const isNumeric = inputMode === 'numeric';
    return (
      <label style={{ display: 'grid', gap: 6, color: theme.text, fontSize: 13, fontWeight: 700 }}>
        {label}
        <span style={{ position: 'relative', display: 'block' }}>
          <input
            ref={field === 'currentPassword' ? passwordInputRef : undefined}
            value={form[field]}
            onChange={(event) => setForm((current) => ({
              ...current,
              [field]: isNumeric ? event.target.value.replace(/\D/g, '').slice(0, 12) : event.target.value
            }))}
            type={visible ? 'text' : 'password'}
            inputMode={inputMode}
            autoComplete={autoComplete}
            placeholder={placeholder}
            disabled={submitting}
            style={{ width: '100%', minHeight: 42, borderRadius: 10, border: `1px solid ${theme.border}`, padding: '0 44px 0 12px', font: 'inherit', boxSizing: 'border-box' }}
          />
          <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} onClick={() => setVisibleFields((current) => ({ ...current, [field]: !current[field] }))} disabled={submitting} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, border: 'none', borderRadius: 8, background: 'transparent', color: theme.muted, display: 'grid', placeItems: 'center', cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>
    );
  };

  const submitDayClosePin = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!form.currentPassword) return setError('Enter your current account password.');
    if (!/^\d{4,12}$/.test(form.pin)) return setError('Enter a 4 to 12 digit Day Close PIN.');
    if (form.pin !== form.confirmation) return setError('Day Close PIN confirmation does not match.');
    if (typeof onConfigureDayClosePin !== 'function') return setError('Day Close PIN setup is unavailable right now.');
    setSubmitting(true);
    setError('');
    try {
      await onConfigureDayClosePin({ currentPassword: form.currentPassword, pin: form.pin });
    } catch (submitError) {
      setError(submitError?.payload?.message || submitError?.message || 'Failed to configure your Day Close PIN.');
      setSubmitting(false);
    }
  };

  const isDayClosePinFormValid = Boolean(form.currentPassword)
    && /^\d{4,12}$/.test(form.pin)
    && form.pin === form.confirmation;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2590, background: 'rgba(15, 23, 42, 0.52)', backdropFilter: 'blur(4px)' }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={isDayClose ? 'dgfy-day-close-pin-title' : 'dgfy-pos-launch-title'}
        aria-describedby={isDayClose ? 'dgfy-day-close-pin-description' : 'dgfy-pos-launch-description'}
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(460px, calc(100% - 32px))', borderRadius: 18, border: `1px solid ${theme.border}`, background: theme.surface, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)', padding: 22 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 id={isDayClose ? 'dgfy-day-close-pin-title' : 'dgfy-pos-launch-title'} style={{ margin: 0, color: theme.text, fontSize: 20, fontWeight: 800 }}>
              {isDayClose ? 'Day Close' : 'Open DGFY POS?'}
            </h3>
            <p id={isDayClose ? 'dgfy-day-close-pin-description' : 'dgfy-pos-launch-description'} style={{ margin: '8px 0 0', color: theme.muted, fontSize: 14, lineHeight: 1.55 }}>
              {isDayClose
                ? <>Check your Day Close access for <strong>{companyName}</strong>. Your PIN is private and is used only to confirm a Z-reading.</>
                : <>Open <strong>{companyName}</strong> in DGFY POS while keeping this Storefront page open.</>}
            </p>
          </div>
          <button type="button" aria-label="Close POS launch dialog" onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.muted, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
        {isDayClose ? dayCloseLoading ? (
          <p style={{ margin: '22px 0 0', color: theme.muted }}>Checking your Day Close access...</p>
        ) : dayCloseError ? (
          <><p role="alert" style={{ margin: '22px 0 0', color: '#B42318', fontSize: 13 }}>{dayCloseError}</p><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}><button ref={stayButtonRef} type="button" onClick={onClose} style={{ minHeight: 42, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, padding: '0 15px', fontSize: 14, fontWeight: 700 }}>Close</button></div></>
        ) : !canConfigureDayClosePin ? (
          <><p role="status" style={{ margin: '22px 0 0', borderRadius: 10, background: '#FFF7ED', color: '#9A3412', padding: 12, fontSize: 13, lineHeight: 1.5 }}>Your manager must enable <strong>Can close day and generate Z-reading</strong> before you can create a PIN.</p><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}><button ref={stayButtonRef} type="button" onClick={onClose} style={{ minHeight: 42, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, padding: '0 15px', fontSize: 14, fontWeight: 700 }}>Close</button></div></>
        ) : (
          <form onSubmit={submitDayClosePin} style={{ display: 'grid', gap: 14, marginTop: 22 }}>
            <p role="status" style={{ margin: 0, borderRadius: 10, background: dayCloseStatus?.pinConfigured ? '#ECFDF3' : theme.infoBg, color: dayCloseStatus?.pinConfigured ? '#166534' : theme.primary, padding: 12, fontSize: 13 }}>{dayCloseStatus?.pinConfigured ? 'PIN ready. You can change your personal PIN here.' : 'You are authorized. Set your personal PIN to confirm Z-readings.'}</p>
            {renderSensitiveInput({ field: 'currentPassword', label: 'Current account password', autoComplete: 'current-password' })}
            {renderSensitiveInput({ field: 'pin', label: 'New Day Close PIN', inputMode: 'numeric', autoComplete: 'new-password', placeholder: '4 to 12 digits' })}
            {renderSensitiveInput({ field: 'confirmation', label: 'Confirm new PIN', inputMode: 'numeric', autoComplete: 'new-password', placeholder: 'Re-enter PIN' })}
            {error ? <p role="alert" style={{ margin: 0, color: '#B42318', fontSize: 13 }}>{error}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button ref={stayButtonRef} type="button" onClick={onClose} disabled={submitting} style={{ minHeight: 42, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, padding: '0 15px', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting || !isDayClosePinFormValid} style={{ minHeight: 42, borderRadius: 10, border: 'none', background: theme.primary, color: '#fff', padding: '0 16px', fontSize: 14, fontWeight: 800, cursor: submitting || !isDayClosePinFormValid ? 'not-allowed' : 'pointer', opacity: submitting || !isDayClosePinFormValid ? 0.55 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={16} />
                {submitting ? 'Saving...' : (dayCloseStatus?.pinConfigured ? 'Change my PIN' : 'Set my PIN')}
              </button>
            </div>
          </form>
        ) : <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
          <button ref={stayButtonRef} type="button" onClick={onClose} style={{ minHeight: 42, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, padding: '0 15px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Stay on Storefront
          </button>
          <button type="button" onClick={onOpenInNewTab} style={{ minHeight: 42, borderRadius: 10, border: 'none', background: theme.primary, color: '#fff', padding: '0 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ExternalLink size={16} />
            Open POS in new tab
          </button>
        </div>}
      </section>
    </div>
  );
}

export default BusinessPosLaunchModal;
