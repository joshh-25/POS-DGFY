import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, FileText, Info, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import {
  formatCustomerIdentityDocumentDate,
  getCustomerIdentityDocument,
  normalizeCustomerIdentityDocument
} from '../model/customerIdentityDocument.js';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';
const ID_TYPE_OPTIONS = ["Driver's License", 'Passport', 'National ID', 'SSS / PhilHealth ID'];
const UPLOAD_ZONE_HEIGHT = { mobile: 124, desktop: 132 };

const isImageFile = (fileOrUrl) => {
  if (typeof fileOrUrl === 'object' && fileOrUrl) return String(fileOrUrl.type || '').startsWith('image/');
  return /\.(jpe?g|png|webp)(\?|$)/i.test(String(fileOrUrl || ''));
};

const createPreviewUrl = (file) => {
  if (!file || !isImageFile(file) || typeof URL?.createObjectURL !== 'function') return '';
  return URL.createObjectURL(file);
};

const fileLabel = (file) => file?.name || '';

function FileDropZone({ id, label, hint, file, onChange, isMobileViewport, theme }) {
  return (
    <label htmlFor={id} style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 6, minWidth: 0, cursor: 'pointer' }}>
      <span style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, fontWeight: 800 }}>{label}</span>
      <span style={{ height: isMobileViewport ? UPLOAD_ZONE_HEIGHT.mobile : UPLOAD_ZONE_HEIGHT.desktop, border: `1px dashed ${theme.primary}`, borderRadius: 8, background: 'linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%)', color: theme.muted, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 12, boxSizing: 'border-box' }}>
        <span style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
          <Upload size={24} color={theme.primary} />
          <strong style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>{file ? fileLabel(file) : 'Drag and drop your file here'}</strong>
          {!file && <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>or <span style={{ color: theme.primary, fontWeight: 800 }}>click to browse</span></span>}
          <small style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro }}>{file ? 'Ready to upload' : hint}</small>
        </span>
      </span>
      <input id={id} aria-label={label} type="file" accept={ACCEPTED_FILE_TYPES} onChange={onChange} style={{ display: 'none' }} />
    </label>
  );
}

function IdentityDocumentPreview({ document, showBack, setShowBack, theme, isMobileViewport }) {
  const frontUrl = document?.frontUrl || '';
  const backUrl = document?.backUrl || '';
  const hasBack = Boolean(backUrl);
  const activeUrl = showBack ? backUrl : frontUrl;
  const activeFile = showBack ? document?.backFile : document?.frontFile;
  const activeImage = isImageFile(activeFile || activeUrl);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ perspective: 1000, width: '100%' }}>
        <div
          data-testid="customer-valid-id-preview"
          style={{ position: 'relative', minHeight: isMobileViewport ? 132 : 154, transformStyle: 'preserve-3d', transform: showBack ? 'rotateY(180deg)' : 'rotateY(0deg)', transition: 'transform 420ms ease', borderRadius: 9 }}
        >
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', border: `1px solid ${theme.border}`, borderRadius: 9, background: '#f8fafc', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
            {!showBack && activeUrl && activeImage ? <img src={frontUrl} alt="Uploaded valid ID front" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : !showBack && activeUrl ? <div style={{ display: 'grid', justifyItems: 'center', gap: 8, color: theme.muted }}><FileText size={28} color={theme.primary} /><span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>Uploaded document preview</span></div> : !showBack ? <div style={{ display: 'grid', justifyItems: 'center', gap: 8, color: theme.muted }}><ShieldCheck size={28} color={theme.primary} /><span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>Front preview</span></div> : null}
          </div>
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', border: `1px solid ${theme.border}`, borderRadius: 9, background: '#f8fafc', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
            {showBack && activeUrl && activeImage ? <img src={backUrl} alt="Uploaded valid ID back" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : showBack && activeUrl ? <div style={{ display: 'grid', justifyItems: 'center', gap: 8, color: theme.muted }}><FileText size={28} color={theme.primary} /><span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>Uploaded document back</span></div> : <span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>Back side not provided</span>}
          </div>
        </div>
      </div>
      {hasBack && (
        <button type="button" onClick={() => setShowBack((current) => !current)} aria-label={showBack ? 'View front of valid ID' : 'View back of valid ID'} style={{ justifySelf: 'center', border: 0, background: 'transparent', color: theme.primary, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', padding: '0 8px' }}>
          {showBack ? '↶ View Front' : '↷ View Back'}
        </button>
      )}
    </div>
  );
}

function CompactValidIdState({ isMobileViewport, theme, onOpen }) {
  return (
    <section id="customer-valid-id-panel" data-testid="customer-valid-id-panel" aria-label="Valid ID" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 10, height: isMobileViewport ? 'auto' : '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body }}>Valid ID</strong>
        <button type="button" onClick={onOpen} style={{ border: 0, background: 'transparent', color: theme.primary, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', padding: '0 4px' }}>Upload ID</button>
      </div>
      <div style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary }}>No ID preview is open. Upload a government-issued ID to complete verification.</div>
    </section>
  );
}

export function ValidIdPanel({ isMobileViewport, theme, accountPanel, profileVerification }) {
  const persistedDocument = useMemo(() => getCustomerIdentityDocument(accountPanel), [accountPanel]);
  const [localDocument, setLocalDocument] = useState(null);
  const [isPersistedDocumentHidden, setIsPersistedDocumentHidden] = useState(false);
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(!persistedDocument.hasUploaded);
  const [idType, setIdType] = useState(persistedDocument.idType || '');
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [showBack, setShowBack] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const objectUrlsRef = useRef([]);

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL?.(url));
  }, []);

  const activeDocument = localDocument || (isPersistedDocumentHidden ? null : persistedDocument);
  const hasUploadedDocument = Boolean(activeDocument?.hasUploaded);
  const isVerified = localDocument
    ? localDocument.isVerified === true
    : Boolean(activeDocument?.isVerified || (profileVerification?.idVerified && hasUploadedDocument));

  const handleFileChange = (side) => (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('Each file must be 5 MB or smaller.');
      return;
    }
    setUploadError('');
    if (side === 'front') setFrontFile(file);
    else setBackFile(file);
  };

  const handleUpload = (event) => {
    event.preventDefault();
    if (!idType) return setUploadError('Select an ID type before uploading.');
    if (!frontFile) return setUploadError('Upload the front side of your ID.');
    setIsUploading(true);
    const nextFrontUrl = createPreviewUrl(frontFile);
    const nextBackUrl = createPreviewUrl(backFile);
    [nextFrontUrl, nextBackUrl].filter(Boolean).forEach((url) => objectUrlsRef.current.push(url));
    setLocalDocument(normalizeCustomerIdentityDocument({
      front_url: nextFrontUrl,
      back_url: nextBackUrl,
      id_type: idType,
      uploaded_at: new Date().toISOString(),
      status: 'pending',
      frontFile,
      backFile
    }));
    setIsPersistedDocumentHidden(false);
    setIsUploadPanelOpen(false);
    setShowBack(false);
    setIsUploading(false);
  };

  const handleRemove = () => {
    setLocalDocument(null);
    setIsPersistedDocumentHidden(true);
    setFrontFile(null);
    setBackFile(null);
    setShowBack(false);
    setIsUploadPanelOpen(true);
    setUploadError('');
  };

  if (!isUploadPanelOpen && !hasUploadedDocument) return <CompactValidIdState isMobileViewport={isMobileViewport} theme={theme} onOpen={() => setIsUploadPanelOpen(true)} />;

  if (hasUploadedDocument && !isUploadPanelOpen) {
    return (
      <section id="customer-valid-id-panel" data-testid="customer-valid-id-panel" aria-label="Valid ID details" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 12, minWidth: 0, height: isMobileViewport ? 'auto' : '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body }}>Valid ID Details</strong>
          <button type="button" onClick={() => setIsUploadPanelOpen(false)} aria-label="Close valid ID details" style={{ border: 0, background: 'transparent', color: theme.text, minWidth: isMobileViewport ? 44 : 40, minHeight: isMobileViewport ? 44 : 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 8, padding: '9px 10px', background: isVerified ? '#edf8ef' : '#fff8e8', color: isVerified ? '#137333' : '#9a6700' }}>
          {isVerified ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
          <div style={{ display: 'grid', gap: 2 }}>
            <strong style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>{isVerified ? 'Verified' : 'Pending verification'}</strong>
            <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro }}>{isVerified ? 'Your ID has been verified.' : 'Your uploaded ID is waiting for verification.'}</span>
          </div>
        </div>
        <div style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.label, fontWeight: 800 }}>Uploaded ID</div>
        <IdentityDocumentPreview document={activeDocument} showBack={showBack} setShowBack={setShowBack} theme={theme} isMobileViewport={isMobileViewport} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>
          <div><strong style={{ display: 'block', color: theme.text }}>ID Type</strong><span style={{ color: theme.muted }}>{activeDocument.idType || 'Not provided'}</span></div>
          <div><strong style={{ display: 'block', color: theme.text }}>Uploaded On</strong><span style={{ color: theme.muted }}>{formatCustomerIdentityDocumentDate(activeDocument.uploadedAt)}</span></div>
          <div><strong style={{ display: 'block', color: theme.text }}>Expires On</strong><span style={{ color: theme.muted }}>{formatCustomerIdentityDocumentDate(activeDocument.expiresAt)}</span></div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" onClick={() => { setIdType(activeDocument.idType || ''); setIsUploadPanelOpen(true); }} style={{ border: `1px solid ${theme.primary}`, borderRadius: 7, background: '#fff', color: theme.primary, minHeight: 34, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 800, cursor: 'pointer' }}>Replace ID</button>
          <button type="button" onClick={handleRemove} style={{ border: '1px solid #ef4444', borderRadius: 7, background: '#fff', color: '#dc2626', minHeight: 34, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Trash2 size={13} /> Remove ID</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, lineHeight: 1.4 }}><ShieldCheck size={13} style={{ flexShrink: 0 }} /> Your ID is securely stored and used only for verification purposes.</div>
      </section>
    );
  }

  return (
    <section id="customer-valid-id-panel" data-testid="customer-valid-id-panel" aria-label="Upload Valid ID" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobileViewport ? 14 : 16, display: 'grid', alignContent: 'start', gap: 12, minWidth: 0, height: 'auto', alignSelf: 'start', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'grid', gap: 4 }}><strong style={{ color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body }}>Upload Valid ID</strong><span style={{ color: theme.muted, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>Upload a clear photo or scan of your government-issued ID.</span></div>
          <button type="button" onClick={() => setIsUploadPanelOpen(false)} aria-label="Close valid ID upload" style={{ border: 0, background: 'transparent', color: theme.text, minWidth: isMobileViewport ? 44 : 40, minHeight: isMobileViewport ? 44 : 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <form onSubmit={handleUpload} style={{ display: 'grid', alignContent: 'start', gap: 12 }}>
        <label htmlFor="customer-valid-id-type" style={{ display: 'grid', gap: 6, color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, fontWeight: 800 }}>
          ID Type
          <select id="customer-valid-id-type" value={idType} onChange={(event) => setIdType(event.target.value)} style={{ minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '0 10px', color: idType ? theme.text : theme.muted, background: '#fff', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption }}>
            <option value="">Select ID type</option>
            {ID_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
          <FileDropZone id="customer-valid-id-front" label="Front of ID" hint="JPG, PNG or PDF · Max 5MB" file={frontFile} onChange={handleFileChange('front')} isMobileViewport={isMobileViewport} theme={theme} />
          <FileDropZone id="customer-valid-id-back" label="Back of ID (optional)" hint="Add the back to enable Flip / View Back" file={backFile} onChange={handleFileChange('back')} isMobileViewport={isMobileViewport} theme={theme} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 8, padding: '10px 12px', background: theme.infoBg, color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.micro, lineHeight: 1.4 }}><Info size={14} color={theme.primary} style={{ flexShrink: 0 }} /><div><strong>Accepted IDs</strong><br />Passport · Driver&apos;s License · National ID · SSS / PhilHealth ID</div></div>
        {uploadError && <div role="alert" style={{ color: '#b91c1c', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, fontWeight: 700 }}>{uploadError}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'auto auto', justifyContent: isMobileViewport ? 'stretch' : 'end', gap: 8 }}>
          <button type="button" onClick={() => setIsUploadPanelOpen(false)} style={{ width: isMobileViewport ? '100%' : 112, minHeight: isMobileViewport ? 44 : 40, border: `1px solid ${theme.border}`, borderRadius: 8, background: '#fff', color: theme.text, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={isUploading} style={{ width: isMobileViewport ? '100%' : 132, minHeight: isMobileViewport ? 44 : 40, border: 0, borderRadius: 8, background: theme.primary, color: '#fff', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: isUploading ? 'wait' : 'pointer', opacity: isUploading ? 0.7 : 1 }}>{isUploading ? 'Uploading...' : 'Upload ID'}</button>
        </div>
      </form>
    </section>
  );
}
