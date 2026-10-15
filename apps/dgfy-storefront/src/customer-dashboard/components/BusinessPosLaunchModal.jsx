import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ExternalLink, KeyRound, X } from 'lucide-react';

export function BusinessPosLaunchModal({ company, intent = 'pos', globalPinLoading = false, globalPinStatus = null, globalPinError = '', onClose, onOpenInNewTab, onConfigureGlobalPin, theme }) {
  const stayButtonRef = useRef(null);
  const passwordInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const companyName = String(company?.company_name || company?.name || 'this business').trim();
  const companyKey = String(company?.tenant_id || company?.tenantId || company?.id || companyName).trim();
  const modalOpen = Boolean(company);
  const isGlobalPin = intent === 'global_pin' || intent === 'global_pos_pin';
  const isPinSetup = isGlobalPin;
  const pinStatus = globalPinStatus;
  const canConfigurePin = pinStatus?.canConfigureGlobalPin === true;
  const [form, setForm] = useState({ currentPassword: '', pin: '', confirmation: '' });
  const [visibleFields, setVisibleFields] = useState({ currentPassword: false, pin: false, confirmation: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    (canConfigurePin && !successMessage ? passwordInputRef : stayButtonRef).current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canConfigurePin, companyKey, modalOpen, successMessage]);

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

  const submitPin = async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!form.currentPassword) return setError('Enter your current account password.');
    const pinLabel = 'PIN';
    if (!/^\d{4,12}$/.test(form.pin)) return setError(`Enter a 4 to 12 digit ${pinLabel}.`);
    if (form.pin !== form.confirmation) return setError(`${pinLabel} confirmation does not match.`);
    if (typeof onConfigureGlobalPin !== 'function') return setError('PIN setup is unavailable right now.');
    setSubmitting(true);
    setError('');
    try {
      await onConfigureGlobalPin({ currentPassword: form.currentPassword, pin: form.pin });
      setForm({ currentPassword: '', pin: '', confirmation: '' });
      setVisibleFields({ currentPassword: false, pin: false, confirmation: false });
      setSuccessMessage(`PIN saved. This is your global PIN for permitted POS actions in ${companyName}.`);
      setSubmitting(false);
    } catch (submitError) {
      setError(submitError?.payload?.message || submitError?.message || `Failed to configure your ${pinLabel}.`);
      setSubmitting(false);
    }
  };

  const isPinFormValid = Boolean(form.currentPassword)
    && /^\d{4,12}$/.test(form.pin)
    && form.pin === form.confirmation;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2590, background: 'rgba(15, 23, 42, 0.52)', backdropFilter: 'blur(4px)' }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={isPinSetup ? 'dgfy-global-pos-pin-title' : 'dgfy-pos-launch-title'}
        aria-describedby={isPinSetup ? 'dgfy-global-pos-pin-description' : 'dgfy-pos-launch-description'}
        style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(460px, calc(100% - 32px))', borderRadius: 18, border: `1px solid ${theme.border}`, background: theme.surface, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)', padding: 22 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 id={isPinSetup ? 'dgfy-global-pos-pin-title' : 'dgfy-pos-launch-title'} style={{ margin: 0, color: theme.text, fontSize: 20, fontWeight: 800 }}>
              {isGlobalPin ? 'PIN' : 'Open DGFY POS?'}
            </h3>
            <p id={isPinSetup ? 'dgfy-global-pos-pin-description' : 'dgfy-pos-launch-description'} style={{ margin: '8px 0 0', color: theme.muted, fontSize: 14, lineHeight: 1.55 }}>
              {isGlobalPin
                ? <>Set the one PIN you use for permitted POS actions in <strong>{companyName}</strong>. This PIN is global for this company, while access is still controlled by your permissions.</>
                : <>Open <strong>{companyName}</strong> in DGFY POS while keeping this Storefront page open.</>}
            </p>
          </div>
          <button type="button" aria-label={isGlobalPin ? 'Close PIN dialog' : 'Close POS launch dialog'} onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.muted, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
        {isPinSetup ? globalPinLoading ? (
          <p style={{ margin: '22px 0 0', color: theme.muted }}>Checking your PIN access...</p>
        ) : globalPinError ? (
          <><p role="alert" style={{ margin: '22px 0 0', color: '#B42318', fontSize: 13 }}>{globalPinError}</p><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}><button ref={stayButtonRef} type="button" onClick={onClose} style={{ minHeight: 42, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, padding: '0 15px', fontSize: 14, fontWeight: 700 }}>Close</button></div></>
        ) : !canConfigurePin ? (
          <><p role="status" style={{ margin: '22px 0 0', borderRadius: 10, background: '#FFF7ED', color: '#9A3412', padding: 12, fontSize: 13, lineHeight: 1.5 }}>Your account must have <strong>POS transaction access</strong> in this company before you can create a PIN.</p><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}><button ref={stayButtonRef} type="button" onClick={onClose} style={{ minHeight: 42, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, padding: '0 15px', fontSize: 14, fontWeight: 700 }}>Close</button></div></>
        ) : successMessage ? (
          <div style={{ display: 'grid', gap: 16, marginTop: 22 }}>
            <p role="status" style={{ margin: 0, borderRadius: 10, background: '#ECFDF3', color: '#166534', padding: 14, fontSize: 13, lineHeight: 1.55, fontWeight: 700 }}>{successMessage}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button ref={stayButtonRef} type="button" onClick={onClose} style={{ minHeight: 42, borderRadius: 10, border: 'none', background: theme.primary, color: '#fff', padding: '0 16px', fontSize: 14, fontWeight: 800 }}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitPin} style={{ display: 'grid', gap: 14, marginTop: 22 }}>
            <p role="status" style={{ margin: 0, borderRadius: 10, background: pinStatus?.pinConfigured ? '#ECFDF3' : theme.infoBg, color: pinStatus?.pinConfigured ? '#166534' : theme.primary, padding: 12, fontSize: 13 }}>{pinStatus?.pinConfigured ? 'PIN ready. You can change your PIN here.' : 'You are authorized. Set your PIN. It will be global for permitted POS actions in this company.'}</p>
            {renderSensitiveInput({ field: 'currentPassword', label: 'Current account password', autoComplete: 'current-password' })}
            {renderSensitiveInput({ field: 'pin', label: 'New PIN', inputMode: 'numeric', autoComplete: 'new-password', placeholder: '4 to 12 digits' })}
            {renderSensitiveInput({ field: 'confirmation', label: 'Confirm new PIN', inputMode: 'numeric', autoComplete: 'new-password', placeholder: 'Re-enter PIN' })}
            {error ? <p role="alert" style={{ margin: 0, color: '#B42318', fontSize: 13 }}>{error}</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button ref={stayButtonRef} type="button" onClick={onClose} disabled={submitting} style={{ minHeight: 42, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, padding: '0 15px', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting || !isPinFormValid} style={{ minHeight: 42, borderRadius: 10, border: 'none', background: theme.primary, color: '#fff', padding: '0 16px', fontSize: 14, fontWeight: 800, cursor: submitting || !isPinFormValid ? 'not-allowed' : 'pointer', opacity: submitting || !isPinFormValid ? 0.55 : 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={16} />
                {submitting ? 'Saving...' : (pinStatus?.pinConfigured ? 'Change PIN' : 'Set PIN')}
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
