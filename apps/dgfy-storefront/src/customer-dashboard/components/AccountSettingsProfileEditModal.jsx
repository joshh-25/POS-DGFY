import React, { useMemo, useState } from 'react';
import { Camera, Check, X } from 'lucide-react';
import { ProfileVerificationStatusBadge } from './ProfileVerificationStatusBadge.jsx';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const MAX_ABOUT_LENGTH = 150;
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

const inputStyle = {
  width: '100%',
  minHeight: 40,
  boxSizing: 'border-box',
  border: '1px solid #dbe5ee',
  borderRadius: 8,
  padding: '0 11px',
  color: '#0f172a',
  background: '#fff',
  fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary,
  outline: 'none'
};

function splitProfileName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { completeFirstName: parts[0] || '', middleName: '', lastName: '' };
  return {
    completeFirstName: parts[0] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts[parts.length - 1] || ''
  };
}

function getInitials(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'GU';
}

function FieldLabel({ htmlFor, children, optional = false }) {
  return (
    <label htmlFor={htmlFor} style={{ color: '#0f172a', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, fontWeight: 800 }}>
      {children}{optional && <span style={{ color: '#64748b', fontWeight: 600 }}> (optional)</span>}
    </label>
  );
}

export function AccountSettingsProfileEditModal({
  isMobileViewport,
  theme,
  initialProfile,
  profileVerification,
  onClose,
  onSave
}) {
  const initialNameFields = useMemo(() => splitProfileName(initialProfile?.fullName), [initialProfile?.fullName]);
  const [lastName, setLastName] = useState(initialNameFields.lastName);
  const [completeFirstName, setCompleteFirstName] = useState(initialNameFields.completeFirstName);
  const [middleName, setMiddleName] = useState(initialNameFields.middleName);
  const [aboutYou, setAboutYou] = useState(String(initialProfile?.aboutYou || '').slice(0, MAX_ABOUT_LENGTH));
  const [profilePhoto, setProfilePhoto] = useState(initialProfile?.photoUrl || '');
  const [feedback, setFeedback] = useState('');

  const displayName = [completeFirstName, middleName, lastName].map((value) => value.trim()).filter(Boolean).join(' ');

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > MAX_PROFILE_IMAGE_BYTES) {
      setFeedback('Choose an image file up to 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfilePhoto(String(reader.result || ''));
      setFeedback('');
    };
    reader.onerror = () => setFeedback('The profile photo could not be previewed.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!displayName) {
      setFeedback('Enter at least one name before saving.');
      return;
    }

    onSave({
      fullName: displayName,
      initials: getInitials(displayName),
      aboutYou: aboutYou.trim(),
      photoUrl: profilePhoto
    });
  };

  return (
    <div data-testid="customer-profile-edit-modal" style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobileViewport ? 12 : 24 }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.28)', backdropFilter: 'blur(3px)' }} />
      <section role="dialog" aria-modal="true" aria-labelledby="customer-profile-edit-title" style={{ position: 'relative', width: '100%', maxWidth: 520, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', boxSizing: 'border-box', borderRadius: isMobileViewport ? 14 : 16, background: theme.surface, padding: isMobileViewport ? 16 : 20, boxShadow: '0 20px 50px rgba(15,23,42,0.22)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
            <h2 id="customer-profile-edit-title" style={{ margin: 0, color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitle, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.modalTitleWeight }}>Edit Profile</h2>
            <p style={{ margin: 0, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, lineHeight: 1.45 }}>Update your personal information and how businesses see you</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Edit Profile" style={{ border: 0, background: 'transparent', color: theme.text, minWidth: isMobileViewport ? 44 : 40, minHeight: isMobileViewport ? 44 : 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer', flexShrink: 0 }}><X size={17} /></button>
        </div>

        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 14, display: 'grid', justifyItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <div data-testid="customer-profile-edit-avatar" style={{ width: isMobileViewport ? 76 : 84, height: isMobileViewport ? 76 : 84, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', overflow: 'hidden', fontSize: isMobileViewport ? 24 : 28, fontWeight: 800 }}>
              {profilePhoto ? <img src={profilePhoto} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block' }} /> : getInitials(displayName)}
            </div>
            <label htmlFor="customer-profile-photo" aria-label="Choose profile photo" style={{ position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: '50%', border: '2px solid #fff', background: theme.surface, color: theme.primary, display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,23,42,0.12)' }}>
              <Camera size={14} />
            </label>
            <input id="customer-profile-photo" type="file" accept="image/*" onChange={handlePhotoChange} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
          </div>
          <div style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 700 }}>{displayName || 'Your name'}</div>
          <ProfileVerificationStatusBadge isMobileViewport={isMobileViewport} theme={theme} profileVerification={profileVerification} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <div style={{ display: 'grid', gap: 6 }}><FieldLabel htmlFor="customer-profile-last-name">Last Name</FieldLabel><input id="customer-profile-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="e.g. Sy" style={inputStyle} /></div>
            <div style={{ display: 'grid', gap: 6 }}><FieldLabel htmlFor="customer-profile-first-name">Complete First Name</FieldLabel><input id="customer-profile-first-name" value={completeFirstName} onChange={(event) => setCompleteFirstName(event.target.value)} placeholder="e.g. Henddry" style={inputStyle} /></div>
            <div style={{ display: 'grid', gap: 6 }}><FieldLabel htmlFor="customer-profile-middle-name" optional>Middle Name</FieldLabel><input id="customer-profile-middle-name" value={middleName} onChange={(event) => setMiddleName(event.target.value)} placeholder="e.g. Dela Cruz" style={inputStyle} /></div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <FieldLabel htmlFor="customer-profile-about" optional>About You</FieldLabel>
            <textarea id="customer-profile-about" value={aboutYou} onChange={(event) => setAboutYou(event.target.value.slice(0, MAX_ABOUT_LENGTH))} placeholder="Tell us a little about yourself" maxLength={MAX_ABOUT_LENGTH} rows={4} style={{ ...inputStyle, height: 88, padding: '10px 11px', resize: 'vertical', lineHeight: 1.4 }} />
            <div style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, textAlign: 'right' }}>{aboutYou.length} / {MAX_ABOUT_LENGTH}</div>
          </div>

          {feedback && <div role="status" style={{ borderRadius: 8, background: theme.infoBg, color: theme.primary, padding: '8px 10px', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, lineHeight: 1.4 }}>{feedback}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
            <button type="button" onClick={onClose} style={{ minHeight: isMobileViewport ? 44 : 40, border: `1px solid ${theme.border}`, borderRadius: 8, background: '#fff', color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ minHeight: isMobileViewport ? 44 : 40, border: 0, borderRadius: 8, background: theme.primary, color: '#fff', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Check size={15} /> Save Changes</button>
          </div>
        </form>
      </section>
    </div>
  );
}
