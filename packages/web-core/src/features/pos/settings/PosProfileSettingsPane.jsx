import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Copy, Edit3, Eye, EyeOff, KeyRound, Mail, Phone, Save, Send, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';

const PROFILE_FIELDS = [
  { key: 'username', label: 'Username', icon: UserRound },
  { key: 'email', label: 'Email', icon: Mail },
  {
    key: 'phoneNumber',
    label: 'Phone Number',
    icon: Phone,
    wide: true
  }
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_OTP_PATTERN = /^\d{6}$/;
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function ProfileField({ field, value, editing, onChange, disabled = false }) {
  const Icon = field.icon;
  const fieldId = `pos-profile-${field.key}`;

  if (!editing) {
    return (
      <div
        className={[
          'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-[#E3ECF7] py-3.5 last:border-b-0',
          'min-[1200px]:grid-cols-[3rem_minmax(16rem,0.85fr)_minmax(0,1.15fr)] min-[1200px]:items-center min-[1200px]:gap-3'
        ].join(' ')}
      >
        <div className="row-span-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#EEF5FF] text-[#1A4E8D] min-[1200px]:row-span-1">
          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-[#0F172A]">{field.label}</p>
        </div>
        <div className="min-w-0 md:pt-0.5">
          <p className="break-words text-[13px] font-semibold leading-5 text-[#0F172A] sm:text-[14px]">{value || '-'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid gap-1.5 sm:gap-2 ${field.wide ? 'md:col-span-2' : ''}`}>
      <Label htmlFor={fieldId} className="text-[12px] font-bold text-slate-700">
        {field.label}
      </Label>
      <div className="relative flex items-center">
        <Icon className="absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
        <Input
          id={fieldId}
          className={[
            'h-9 rounded-xl border-slate-200 pl-10',
            'text-[13px] font-medium leading-5 text-[#0F172A]',
            'focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20'
          ].join(' ')}
          value={value || ''}
          onChange={(event) => onChange(field.key, event.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisibility,
  autoComplete,
  disabled = false
}) {
  return (
    <div className="grid gap-1.5 sm:gap-2">
      <Label htmlFor={id} className="text-[12px] font-bold text-slate-700">
        {label}
      </Label>
      <div className="relative flex items-center">
        <KeyRound className="absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          className="h-9 rounded-xl border-slate-200 pl-10 pr-10 text-[13px] font-medium leading-5 text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <button
          type="button"
          className="absolute right-2 grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onToggleVisibility}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          title={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          disabled={disabled}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default function PosProfileSettingsPane({
  terminalUser,
  companyInfo,
  profileForm,
  setProfileForm,
  profileEmailBaseline = '',
  locked,
  loading,
  savingTab,
  onSave = async () => true,
  onRequestEmailOtp = async () => true,
  onChangePassword = async () => true
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpTarget, setEmailOtpTarget] = useState('');
  const [requestingEmailOtp, setRequestingEmailOtp] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false
  });
  const saving = savingTab === 'profile';
  const passwordSaving = savingTab === 'profile-password';
  const canEdit = !locked && !loading;
  const currentEmail = String(profileForm?.email || '').trim();
  const emailChanged = normalizeEmail(currentEmail) !== normalizeEmail(profileEmailBaseline);
  const emailIsValid = EMAIL_PATTERN.test(currentEmail);
  const otpMatchesCurrentEmail = normalizeEmail(emailOtpTarget) === normalizeEmail(currentEmail);
  const emailChangeReady = !emailChanged || (
    emailIsValid
    && otpMatchesCurrentEmail
    && EMAIL_OTP_PATTERN.test(emailOtpCode)
  );

  useEffect(() => {
    if (!emailChanged) {
      setEmailOtpCode('');
      setEmailOtpTarget('');
      return;
    }

    if (emailOtpTarget && !otpMatchesCurrentEmail) {
      setEmailOtpCode('');
      setEmailOtpTarget('');
    }
  }, [emailChanged, emailOtpTarget, otpMatchesCurrentEmail]);

  const emailOtpStatus = useMemo(() => {
    if (!emailChanged || !otpMatchesCurrentEmail) return '';
    return EMAIL_OTP_PATTERN.test(emailOtpCode)
      ? 'Verification code entered.'
      : 'Enter the 6-digit code sent to the new email.';
  }, [emailChanged, emailOtpCode, otpMatchesCurrentEmail]);

  const beginEditing = () => {
    setEditSnapshot({ ...profileForm });
    setEmailOtpCode('');
    setEmailOtpTarget('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (editSnapshot) setProfileForm(editSnapshot);
    setEditSnapshot(null);
    setEmailOtpCode('');
    setEmailOtpTarget('');
    setIsEditing(false);
  };

  const saveProfile = async () => {
    if (!emailChangeReady) {
      toast.error('Send a verification code and enter the 6-digit code before saving the new email.');
      return;
    }

    const saved = await onSave({ emailOtpCode: emailChanged ? emailOtpCode : '' });
    if (saved !== false) {
      setEditSnapshot(null);
      setEmailOtpCode('');
      setEmailOtpTarget('');
      setIsEditing(false);
    }
  };

  const updateField = (key, value) => {
    setProfileForm((current) => ({ ...current, [key]: value }));
    if (key === 'email') {
      setEmailOtpCode('');
      setEmailOtpTarget('');
    }
  };

  const requestEmailOtp = async () => {
    if (!emailIsValid) {
      toast.error('Enter a valid new email address first.');
      return;
    }

    setRequestingEmailOtp(true);
    try {
      const requested = await onRequestEmailOtp(currentEmail);
      if (requested !== false) {
        setEmailOtpTarget(currentEmail);
        setEmailOtpCode('');
      }
    } finally {
      setRequestingEmailOtp(false);
    }
  };

  const resetPasswordForm = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setVisiblePasswords({ currentPassword: false, newPassword: false, confirmPassword: false });
  };

  const beginPasswordEditing = () => {
    resetPasswordForm();
    setPasswordEditing(true);
  };

  const cancelPasswordEditing = () => {
    resetPasswordForm();
    setPasswordEditing(false);
  };

  const updatePasswordField = (field, value) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  };

  const savePassword = async (event) => {
    event.preventDefault();
    const currentPassword = String(passwordForm.currentPassword || '');
    const newPassword = String(passwordForm.newPassword || '');
    const confirmPassword = String(passwordForm.confirmPassword || '');

    if (!currentPassword) {
      toast.error('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }

    const saved = await onChangePassword({ currentPassword, newPassword });
    if (saved !== false) {
      resetPasswordForm();
      setPasswordEditing(false);
    }
  };

  const copyCompanyToken = async () => {
    const token = String(companyInfo?.company_token || '');
    if (!token) {
      toast.error('Company token is unavailable.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      toast.error('Clipboard copy is unavailable. Please copy the token manually.');
      return;
    }

    try {
      await navigator.clipboard.writeText(token);
      toast.success('Company token copied to clipboard.');
    } catch {
      toast.error('Unable to copy company token.');
    }
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="pos-profile-heading" className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div
              className={[
                'relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full',
                'bg-[#EAF3FF] text-[#1A4E8D] sm:h-20 sm:w-20'
              ].join(' ')}
            >
              <UserRound className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={1.7} aria-hidden="true" />
              <span
                className={[
                  'absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-lg',
                  'border-2 border-white bg-white text-[#0F172A] shadow-sm sm:h-9 sm:w-9'
                ].join(' ')}
              >
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
            </div>
            <div className="min-w-0">
              <h2
                id="pos-profile-heading"
                className="text-[16px] font-extrabold tracking-tight text-[#0F172A]"
              >
                Shared Account Profile
              </h2>
              <p className="mt-1 text-[12px] font-medium leading-5 text-[#6F86A8]">
              These values come from the same tenant account used by IMS and POS.
              </p>
            </div>
          </div>
          <div className="flex min-h-10 w-full items-center justify-end sm:min-h-11 sm:w-auto sm:min-w-24">
            {!isEditing && canEdit ? (
              <Button
                type="button"
                className={[
                  'min-h-10 w-full gap-1.5 rounded-xl bg-[#1A4E8D] px-4',
                  'text-[13px] font-bold text-white shadow-sm hover:bg-[#124B92] sm:text-[14px]',
                  'sm:min-h-11 sm:w-auto'
                ].join(' ')}
                onClick={beginEditing}
                aria-label="Edit profile"
              >
                <Edit3 className="h-4 w-4" />
                Edit
              </Button>
            ) : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#DDE8F5] bg-white px-4 transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none sm:px-5">
          <div
            key={isEditing ? 'pos-profile-editing' : 'pos-profile-summary'}
            className="pos-profile-edit-surface-enter"
          >
            <div className={isEditing ? 'grid gap-3 py-4 sm:gap-4 sm:py-5 md:grid-cols-2' : ''}>
              {PROFILE_FIELDS.map((field) => (
                <ProfileField
                  key={field.key}
                  field={field}
                  value={profileForm?.[field.key]}
                  editing={isEditing}
                  onChange={updateField}
                  disabled={!canEdit || saving}
                />
              ))}
            </div>
            {isEditing && emailChanged ? (
              <div className="pos-profile-edit-actions-enter mb-4 rounded-xl border border-[#DDE8F5] bg-[#F7FAFE] p-3.5 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <Label htmlFor="pos-profile-email-otp" className="text-[12px] font-bold text-slate-700">
                      Email verification code
                    </Label>
                    <p className="mt-1 text-[12px] leading-5 text-slate-500">
                      Verify the new email before saving this profile.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 gap-1.5 rounded-lg border-[#1A4E8D] px-3 text-[12px] font-bold text-[#1A4E8D] hover:bg-[#EEF5FF]"
                    onClick={requestEmailOtp}
                    disabled={!canEdit || saving || requestingEmailOtp || !emailIsValid}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    {requestingEmailOtp ? 'Sending...' : emailOtpTarget && otpMatchesCurrentEmail ? 'Resend code' : 'Send code'}
                  </Button>
                </div>
                <div className="relative mt-3 flex items-center">
                  <Mail className="absolute left-3 h-4 w-4 text-slate-400" aria-hidden="true" />
                  <Input
                    id="pos-profile-email-otp"
                    className="h-9 rounded-xl border-slate-200 pl-10 text-[13px] font-medium tracking-[0.22em] text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={emailOtpCode}
                    onChange={(event) => setEmailOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    disabled={!canEdit || saving}
                    aria-describedby="pos-profile-email-otp-status"
                  />
                </div>
                <p id="pos-profile-email-otp-status" className="mt-2 flex items-center gap-1 text-[12px] text-slate-500" aria-live="polite">
                  {emailOtpStatus === 'Verification code entered.' ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : null}
                  {emailOtpStatus}
                </p>
              </div>
            ) : null}
          </div>
        </div>
        {isEditing ? (
          <div className="pos-profile-edit-actions-enter mt-4 flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-9 min-w-0 flex-1 rounded-xl px-4 text-[13px] font-bold sm:min-h-10 sm:flex-none sm:px-5"
              onClick={cancelEditing}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={[
                'flex min-h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl',
                'bg-[#1A4E8D] px-4 text-[13px] font-bold text-white shadow-sm',
                'transition-colors duration-200 hover:bg-[#143F73] sm:min-h-10 sm:flex-none sm:px-5 sm:text-[14px]'
              ].join(' ')}
              disabled={!canEdit || saving || !emailChangeReady}
              onClick={saveProfile}
            >
              {saving ? 'Saving...' : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Save Profile</span>
                </>
              )}
            </Button>
          </div>
        ) : null}
      </section>
      <section aria-labelledby="pos-change-password-heading" className="rounded-2xl border border-[#DDE8F5] bg-white p-4 sm:p-5">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EEF5FF] text-[#1A4E8D]">
              <KeyRound className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="pos-change-password-heading" className="text-[15px] font-extrabold tracking-tight text-[#0F172A]">
                Password
              </h2>
              <p className="mt-1 text-[12px] font-medium text-[#6F86A8]">
                Update the password used to sign in to POS and IMS.
              </p>
            </div>
          </div>
          {!passwordEditing && canEdit ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-9 w-full rounded-xl border-[#1A4E8D] px-3 text-[12px] font-bold text-[#1A4E8D] hover:bg-[#EEF5FF] sm:w-auto"
              onClick={beginPasswordEditing}
              aria-label="Change password"
            >
              Change password
            </Button>
          ) : null}
        </div>
        {passwordEditing ? (
          <form className="mt-4 space-y-4 border-t border-[#E3ECF7] pt-4" onSubmit={savePassword}>
            <div className="grid gap-3 md:grid-cols-3">
              <PasswordField
                id="pos-current-password"
                label="Current password"
                value={passwordForm.currentPassword}
                onChange={(value) => updatePasswordField('currentPassword', value)}
                visible={visiblePasswords.currentPassword}
                onToggleVisibility={() => togglePasswordVisibility('currentPassword')}
                autoComplete="current-password"
                disabled={!canEdit || passwordSaving}
              />
              <PasswordField
                id="pos-new-password"
                label="New password"
                value={passwordForm.newPassword}
                onChange={(value) => updatePasswordField('newPassword', value)}
                visible={visiblePasswords.newPassword}
                onToggleVisibility={() => togglePasswordVisibility('newPassword')}
                autoComplete="new-password"
                disabled={!canEdit || passwordSaving}
              />
              <PasswordField
                id="pos-confirm-password"
                label="Confirm new password"
                value={passwordForm.confirmPassword}
                onChange={(value) => updatePasswordField('confirmPassword', value)}
                visible={visiblePasswords.confirmPassword}
                onToggleVisibility={() => togglePasswordVisibility('confirmPassword')}
                autoComplete="new-password"
                disabled={!canEdit || passwordSaving}
              />
            </div>
            <p className="text-[12px] font-medium text-slate-500">Use at least 8 characters.</p>
            <div className="flex flex-row justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-9 min-w-0 flex-1 rounded-xl px-4 text-[13px] font-bold sm:flex-none sm:px-5"
                onClick={cancelPasswordEditing}
                disabled={passwordSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-h-9 min-w-0 flex-1 rounded-xl bg-[#1A4E8D] px-4 text-[13px] font-bold text-white shadow-sm hover:bg-[#143F73] sm:flex-none sm:px-5"
                disabled={!canEdit || passwordSaving}
              >
                {passwordSaving ? 'Saving...' : 'Save password'}
              </Button>
            </div>
          </form>
        ) : null}
      </section>
      {!isEditing && terminalUser?.is_master_admin === true && companyInfo ? (
        <section aria-labelledby="pos-company-information-heading" className="grid gap-3 md:grid-cols-2">
          <h2 id="pos-company-information-heading" className="sr-only">Company Information</h2>
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#DDE8F5] bg-[#F1F7FF] p-4 sm:p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E2F0FF] text-[#1761C2]">
              <Building2 className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8399BA]">Company Name</p>
              <p className="mt-1.5 break-words text-[13px] font-bold text-[#0F172A] sm:text-[14px]">
                {companyInfo.company_name || '-'}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#DCEFE4] bg-[#F2FBF6] p-4 sm:p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#D8F7E7] text-[#0A9A68]">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8399BA]">Company Token</p>
              <p className="mt-1.5 break-all text-[13px] font-bold text-[#0F172A] sm:text-[14px]">{companyInfo.company_token || '-'}</p>
            </div>
            <button
              type="button"
              className={[
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                'border border-[#D8EFE3] text-[#7896B2] transition-colors hover:bg-white',
                'hover:text-[#0A9A68] focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-[#0A9A68]/30 disabled:cursor-not-allowed disabled:opacity-50'
              ].join(' ')}
              onClick={copyCompanyToken}
              aria-label="Copy company token"
              title="Copy company token"
              disabled={!companyInfo.company_token}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
