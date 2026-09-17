import { useState } from 'react';
import { Building2, Copy, Edit3, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
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

export default function PosProfileSettingsPane({
  terminalUser,
  companyInfo,
  profileForm,
  setProfileForm,
  locked,
  loading,
  savingTab,
  onSave = async () => true
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const saving = savingTab === 'profile';
  const canEdit = !locked && !loading;

  const beginEditing = () => {
    setEditSnapshot({ ...profileForm });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (editSnapshot) setProfileForm(editSnapshot);
    setEditSnapshot(null);
    setIsEditing(false);
  };

  const saveProfile = async () => {
    const saved = await onSave();
    if (saved !== false) {
      setEditSnapshot(null);
      setIsEditing(false);
    }
  };

  const updateField = (key, value) => {
    setProfileForm((current) => ({ ...current, [key]: value }));
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
          <div className="flex w-full sm:w-auto">
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
        <div className="rounded-2xl border border-[#DDE8F5] bg-white px-4 sm:px-5">
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
        </div>
        {isEditing ? (
          <div className="mt-4 flex flex-row justify-end gap-2">
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
              disabled={!canEdit || saving}
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
