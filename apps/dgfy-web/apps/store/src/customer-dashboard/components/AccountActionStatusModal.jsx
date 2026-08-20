import React from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const STATUS_COPY = {
  email: {
    pendingTitle: 'Updating email address...',
    pendingMessage: 'Please wait while we prepare your email update.',
    successTitle: 'Email update ready!',
    successMessage: 'The email update screen is ready for backend verification.',
    unavailableTitle: 'Not saved yet',
    errorTitle: 'Update failed',
    errorMessage: 'We could not update your email address. Please try again.'
  },
  phone: {
    pendingTitle: 'Sending verification code...',
    pendingMessage: 'Please wait while we prepare the code for your new phone number.',
    successTitle: 'Phone update ready!',
    successMessage: 'The phone update screen is ready for backend verification.',
    unavailableTitle: 'Not saved yet',
    errorTitle: 'Update failed',
    errorMessage: 'We could not update your phone number. Please try again.'
  },
  password: {
    pendingTitle: 'Updating password...',
    pendingMessage: 'Please wait while we update your password.',
    successTitle: 'Password updated!',
    successMessage: 'Your password has been updated successfully.',
    errorTitle: 'Update failed',
    errorMessage: 'We could not update your password. Please check your current password and try again.'
  },
  identity: {
    pendingTitle: 'Uploading document...',
    pendingMessage: 'Please do not close this window while your ID is being prepared.',
    successTitle: 'Document uploaded!',
    successMessage: 'Your document is uploaded and pending verification.',
    errorTitle: 'Upload failed',
    errorMessage: 'We could not upload your document. Please try again.'
  }
};

const STATUS_TONE = {
  pending: {
    accent: '#1a4e8d',
    iconBackground: '#eaf3ff',
    iconBorder: '#bfd8f7'
  },
  success: {
    accent: '#16a34a',
    iconBackground: '#eaf8ef',
    iconBorder: '#b7e4c4'
  },
  unavailable: {
    accent: '#a16207',
    iconBackground: '#fff8e6',
    iconBorder: '#fde68a'
  },
  error: {
    accent: '#dc2626',
    iconBackground: '#fff0f0',
    iconBorder: '#fecaca'
  }
};

function getStatusCopy(mode, status, message) {
  const copy = STATUS_COPY[mode] || STATUS_COPY.password;
  if (status === 'pending') return { title: copy.pendingTitle, message: copy.pendingMessage };
  if (status === 'success') return { title: copy.successTitle, message: copy.successMessage };
  if (status === 'unavailable') {
    return { title: copy.unavailableTitle || 'Not available yet', message: message || copy.errorMessage };
  }
  return { title: copy.errorTitle, message: message || copy.errorMessage };
}

export function AccountActionStatusModal({
  mode,
  status,
  message = '',
  isMobileViewport,
  theme,
  onClose,
  onRetry
}) {
  if (!status) return null;

  const copy = getStatusCopy(mode, status, message);
  const tone = STATUS_TONE[status] || STATUS_TONE.error;
  const isPending = status === 'pending';
  const isError = status === 'error';
  const isUnavailable = status === 'unavailable';
  const isAlert = isError || isUnavailable;

  return (
    <div data-testid="account-action-status-modal" data-status={status} data-status-mode={mode} style={{ position: 'fixed', inset: 0, zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobileViewport ? 16 : 24 }}>
      <style>{`
        @keyframes dgfyAccountStatusSpin { to { transform: rotate(360deg); } }
        @keyframes dgfyAccountStatusCheck { 0% { transform: scale(.65); opacity: .35; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes dgfyAccountStatusError { 0% { transform: scale(.7); opacity: .35; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          [data-testid="account-action-status-icon"] { animation: none !important; }
        }
      `}</style>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.28)', backdropFilter: 'blur(3px)' }} />
      <section role="dialog" aria-modal="true" aria-labelledby="account-action-status-title" aria-describedby="account-action-status-message" style={{ position: 'relative', width: '100%', maxWidth: 360, boxSizing: 'border-box', border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.surface, padding: isMobileViewport ? 22 : 24, boxShadow: '0 18px 48px rgba(15,23,42,0.18)', display: 'grid', justifyItems: 'center', gap: 12, textAlign: 'center' }}>
        <button type="button" onClick={onClose} aria-label="Close status" style={{ position: 'absolute', top: 8, right: 8, width: 36, height: 36, border: 0, borderRadius: 8, background: 'transparent', color: theme.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={15} /></button>
        <div data-testid="account-action-status-icon" style={{ width: 48, height: 48, borderRadius: '50%', background: tone.iconBackground, border: `1px solid ${tone.iconBorder}`, color: tone.accent, display: 'grid', placeItems: 'center', animation: isPending ? 'dgfyAccountStatusSpin 1s linear infinite' : isAlert ? 'dgfyAccountStatusError 320ms ease-out both' : 'dgfyAccountStatusCheck 420ms ease-out both' }}>
          {isPending ? <Loader2 size={23} aria-hidden="true" /> : isAlert ? <strong aria-hidden="true" style={{ fontSize: 25, lineHeight: 1 }}>!</strong> : <Check size={25} strokeWidth={2.5} aria-hidden="true" />}
        </div>
        <div style={{ display: 'grid', gap: 5 }}>
          <h2 id="account-action-status-title" style={{ margin: 0, color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 800 }}>{copy.title}</h2>
          <p id="account-action-status-message" style={{ margin: 0, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, lineHeight: 1.45 }}>{copy.message}</p>
        </div>
        {isAlert && (
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
            <button type="button" onClick={onClose} style={{ minHeight: 38, border: `1px solid ${theme.border}`, borderRadius: 8, background: '#fff', color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={onRetry} style={{ minHeight: 38, border: 0, borderRadius: 8, background: theme.error || '#dc2626', color: '#fff', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
          </div>
        )}
      </section>
    </div>
  );
}

export default AccountActionStatusModal;
