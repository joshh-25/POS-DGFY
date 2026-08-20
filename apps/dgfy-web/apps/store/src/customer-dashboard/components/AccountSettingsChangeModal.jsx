import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Mail, Phone, ShieldCheck, X } from 'lucide-react';
import { changeDgfyPassword } from '../../../../../src/services/dgfyAuthService.js';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const MODE_COPY = {
  email: {
    title: 'Change Email',
    description: 'Enter your new email address and verify it to update your account.',
    submitLabel: 'Verify & Update Email'
  },
  phone: {
    title: 'Change Phone Number',
    description: 'Enter your new phone number and verify it to update your account.',
    submitLabel: 'Verify & Update Phone'
  },
  password: {
    title: 'Change Password',
    description: "Choose a strong password and don't reuse your old password.",
    submitLabel: 'Update Password'
  }
};

const inputStyle = {
  width: '100%',
  minHeight: 40,
  boxSizing: 'border-box',
  border: '1px solid #dbe5ee',
  borderRadius: 7,
  padding: '0 10px',
  color: '#0f172a',
  background: '#fff',
  fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary,
  outline: 'none'
};

function FieldLabel({ children }) {
  return <div style={{ color: '#0f172a', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, fontWeight: 800 }}>{children}</div>;
}

function ReadOnlyField({ icon: Icon, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, boxSizing: 'border-box', border: '1px solid #dbe5ee', borderRadius: 7, padding: '0 10px', color: '#334155', background: '#f8fafc', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, fontWeight: 700, overflowWrap: 'anywhere' }}>
      <Icon size={15} color="#1a4e8d" style={{ flexShrink: 0 }} />
      {value || 'Not provided'}
    </div>
  );
}

function InputWithIcon({ icon: Icon, ...props }) {
  return (
    <div style={{ position: 'relative' }}>
      <Icon size={15} color="#64748b" style={{ position: 'absolute', left: 10, top: 11, pointerEvents: 'none' }} />
      <input {...props} style={{ ...inputStyle, paddingLeft: 32, paddingRight: props.type === 'password' ? 36 : 10 }} />
    </div>
  );
}

export function AccountSettingsChangeModal({ mode, isMobileViewport, theme, accountPanel, onClose, onStatusChange }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = MODE_COPY[mode] || MODE_COPY.email;
  const currentEmail = accountPanel?.me?.email || 'customer@email.com';
  const currentPhone = accountPanel?.me?.phone || '+63 *** *** ****';

  const sendCode = () => {
    setCodeSent(true);
    setFeedback(`A verification code would be sent to your new ${mode === 'email' ? 'email address' : 'phone number'}.`);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (mode === 'password') {
      if (newPassword !== confirmPassword) {
        setFeedback('New password and confirmation do not match.');
        return;
      }
      setIsSubmitting(true);
      setFeedback('');
      onStatusChange?.({ mode, status: 'pending' });
      onClose();
      try {
        await changeDgfyPassword({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        });
        onStatusChange?.({ mode, status: 'success' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (error) {
        onStatusChange?.({ mode, status: 'error', message: error?.response?.data?.message || 'Unable to update your password right now.' });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    setIsSubmitting(true);
    const statusSubject = mode === 'email' ? 'Email update' : 'Phone update';
    const message = `${statusSubject} is not connected to a saving service yet. The verification UI is ready for backend integration.`;
    onStatusChange?.({
      mode,
      status: 'pending',
      nextStatus: { mode, status: 'unavailable', message },
      delay: 650
    });
    onClose();
  };

  return (
    <div data-testid="account-settings-change-modal" data-modal-mode={mode} style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobileViewport ? 12 : 24 }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.28)', backdropFilter: 'blur(3px)' }} />
      <section role="dialog" aria-modal="true" aria-labelledby="account-settings-change-title" style={{ position: 'relative', width: '100%', maxWidth: 420, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', boxSizing: 'border-box', borderRadius: isMobileViewport ? '16px 16px 12px 12px' : 16, background: theme.surface, padding: isMobileViewport ? 16 : 20, boxShadow: '0 20px 50px rgba(15,23,42,0.22)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <h2 id="account-settings-change-title" style={{ margin: 0, color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitle, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitleWeight }}>{copy.title}</h2>
            <p style={{ margin: 0, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, lineHeight: 1.45 }}>{copy.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={`Close ${copy.title}`} style={{ border: 0, background: 'transparent', color: theme.text, minWidth: isMobileViewport ? 44 : 40, minHeight: isMobileViewport ? 44 : 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer', flexShrink: 0 }}><X size={17} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          {mode === 'email' && (
            <>
              <div style={{ display: 'grid', gap: 6 }}><FieldLabel>Current Email</FieldLabel><ReadOnlyField icon={Mail} value={currentEmail} /></div>
              <div style={{ display: 'grid', gap: 6 }}>
                <FieldLabel>New Email Address</FieldLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 }}>
                  <InputWithIcon icon={Mail} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter new email address" required />
                  <button type="button" onClick={sendCode} style={{ minHeight: isMobileViewport ? 44 : 40, border: `1px solid ${theme.primary}`, borderRadius: 7, padding: '0 10px', background: '#fff', color: theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{codeSent ? 'Resend Code' : 'Send Code'}</button>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}><FieldLabel>Verify New Email</FieldLabel><span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro }}>We&apos;ll send a verification code to your new email address.</span><InputWithIcon icon={ShieldCheck} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" maxLength={6} placeholder="Enter 6-digit code" required /></div>
            </>
          )}

          {mode === 'phone' && (
            <>
              <div style={{ display: 'grid', gap: 6 }}><FieldLabel>Current Phone Number</FieldLabel><ReadOnlyField icon={Phone} value={currentPhone} /></div>
              <div style={{ display: 'grid', gap: 6 }}>
                <FieldLabel>New Phone Number</FieldLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '74px minmax(0, 1fr) auto', gap: 7 }}>
                  <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: theme.text }}>🇵🇭 +63</div>
                  <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Enter new phone number" style={inputStyle} required />
                  <button type="button" onClick={sendCode} style={{ minHeight: isMobileViewport ? 44 : 40, border: `1px solid ${theme.primary}`, borderRadius: 7, padding: '0 10px', background: '#fff', color: theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{codeSent ? 'Resend Code' : 'Send Code'}</button>
                </div>
                <span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro }}>Example: 912 345 6789</span>
              </div>
              <div style={{ display: 'grid', gap: 6 }}><FieldLabel>Verify New Phone Number</FieldLabel><span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro }}>We&apos;ll send a verification code to your new phone number.</span><InputWithIcon icon={ShieldCheck} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" maxLength={6} placeholder="Enter 6-digit code" required /><span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro }}>Didn&apos;t receive the code? <button type="button" onClick={sendCode} style={{ border: 0, background: 'transparent', padding: 0, color: theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, fontWeight: 800, cursor: 'pointer' }}>Resend code</button></span></div>
            </>
          )}

          {mode === 'password' && (
            <>
              <div style={{ display: 'grid', gap: 6 }}><FieldLabel>Current Password</FieldLabel><div style={{ position: 'relative' }}><InputWithIcon icon={KeyRound} type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Enter your current password" required /><button type="button" onClick={() => setShowCurrentPassword((value) => !value)} aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'} style={{ position: 'absolute', right: 8, top: 8, border: 0, background: 'transparent', color: theme.muted, padding: 4, cursor: 'pointer' }}>{showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
              <div style={{ display: 'grid', gap: 6 }}><FieldLabel>New Password</FieldLabel><div style={{ position: 'relative' }}><InputWithIcon icon={KeyRound} type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Enter new password" required /><button type="button" onClick={() => setShowNewPassword((value) => !value)} aria-label={showNewPassword ? 'Hide new password' : 'Show new password'} style={{ position: 'absolute', right: 8, top: 8, border: 0, background: 'transparent', color: theme.muted, padding: 4, cursor: 'pointer' }}>{showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div><span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro }}>Min. 8 characters with uppercase, lowercase, number and symbol.</span></div>
              <div style={{ display: 'grid', gap: 6 }}><FieldLabel>Confirm New Password</FieldLabel><div style={{ position: 'relative' }}><InputWithIcon icon={KeyRound} type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" required /><button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} style={{ position: 'absolute', right: 8, top: 8, border: 0, background: 'transparent', color: theme.muted, padding: 4, cursor: 'pointer' }}>{showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
            </>
          )}

          {feedback && <div role="alert" style={{ borderRadius: 7, background: '#fff0f0', color: '#b91c1c', padding: '8px 10px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, lineHeight: 1.4 }}>{feedback}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'minmax(0, 0.68fr) minmax(0, 1.32fr)' : '1fr 1fr', gap: 8, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
            <button type="button" onClick={onClose} style={{ minHeight: isMobileViewport ? 44 : 40, border: `1px solid ${theme.border}`, borderRadius: 7, background: '#fff', color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', padding: '0 10px' }}>Cancel</button>
            <button type="submit" disabled={isSubmitting} style={{ minHeight: isMobileViewport ? 44 : 40, border: 0, borderRadius: 7, background: theme.primary, color: '#fff', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: isSubmitting ? 'wait' : 'pointer', opacity: isSubmitting ? 0.7 : 1, padding: '0 16px' }}>{isSubmitting ? 'Updating...' : copy.submitLabel}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
