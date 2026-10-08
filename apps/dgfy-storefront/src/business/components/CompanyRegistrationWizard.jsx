import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Trash2,
  Upload,
  UserRound
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import IndustrySelect from '../../../../../packages/web-core/src/features/registration/IndustrySelect.jsx';
import StorefrontDeliveryPartnersSettings from '../../../../../packages/web-core/src/features/pos/settings/StorefrontDeliveryPartnersSettings.jsx';
import StorefrontGallerySettings from '../../../../../packages/web-core/src/features/pos/settings/StorefrontGallerySettings.jsx';
import StorefrontSocialLinksSettings from '../../../../../packages/web-core/src/features/pos/settings/StorefrontSocialLinksSettings.jsx';
import StorefrontBusinessHoursScheduler from '../../../../../packages/web-core/src/features/settings/StorefrontBusinessHoursScheduler.jsx';
import { createDefaultStorefrontBusinessHours } from '../../../../../packages/web-core/src/features/settings/storefrontBusinessHours.js';
import {
  createCompanyRegistrationDraft,
  removeCompanyRegistrationDraftFile,
  submitCompanyRegistrationDraft,
  updateCompanyRegistrationDraft,
  uploadCompanyRegistrationDraftFile
} from '../services/companyRegistrationDraftService.js';

const MapPinPicker = lazy(() => import('../../../../../packages/web-core/src/components/maps/MapPinPicker.jsx'));

const MAX_PHONE_LENGTH = 12;
const MAX_TAGLINE_LENGTH = 100;
const MAX_ABOUT_LENGTH = 600;
const MAX_STORE_EMAIL_LENGTH = 120;
const MAX_MENU_FILES = 5;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MENU_ACCEPT = '.csv,.pdf,.jpg,.jpeg,.png,text/csv,text/plain,application/vnd.ms-excel,application/pdf,image/jpeg,image/png';
const MENU_EXTENSIONS = new Set(['csv', 'pdf', 'jpg', 'jpeg', 'png']);
const MENU_MIME_TYPES = new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/pdf', 'image/jpeg', 'image/png']);

const BUSINESS_TYPES = [
  { value: 'retail', label: 'Retail' },
  { value: 'service', label: 'Service business' },
  { value: 'food_beverage', label: 'Food and beverage' },
  { value: 'professional', label: 'Professional services' },
  { value: 'other', label: 'Other' }
];

const EMPTY_PAYLOAD = Object.freeze({
  business: {},
  storefront: {
    social_links: {},
    delivery_partners: [],
    gallery: []
  },
  location: {},
  hours: createDefaultStorefrontBusinessHours(),
  menu: { upload_ids: [] }
});

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizePayload = (value = {}) => {
  const storefront = isRecord(value.storefront) ? value.storefront : {};
  const menu = isRecord(value.menu) ? value.menu : {};
  return {
    business: isRecord(value.business) ? value.business : {},
    storefront: {
      ...storefront,
      social_links: isRecord(storefront.social_links) ? storefront.social_links : {},
      delivery_partners: Array.isArray(storefront.delivery_partners) ? storefront.delivery_partners : [],
      gallery: Array.isArray(storefront.gallery) ? storefront.gallery : []
    },
    location: isRecord(value.location) ? value.location : {},
    hours: value.hours && ((Array.isArray(value.hours) && value.hours.length > 0) || (isRecord(value.hours) && Object.keys(value.hours).length > 0))
      ? value.hours
      : EMPTY_PAYLOAD.hours,
    menu: {
      ...menu,
      upload_ids: Array.isArray(menu.upload_ids) ? menu.upload_ids : []
    }
  };
};

const normalizeDraft = (value = {}) => ({
  ...value,
  version: Number(value.version || 1),
  current_step: Math.min(3, Math.max(1, Number(value.current_step || 1))),
  payload: normalizePayload(value.payload),
  uploads: Array.isArray(value.uploads) ? value.uploads : []
});

const errorMessage = (error, fallback) => (
  error?.response?.data?.message
  || error?.message
  || fallback
);

const uploadIdOf = (upload) => String(upload?.id || upload?.upload_id || '').trim();

const activeUploadsFor = (uploads, category) => (Array.isArray(uploads) ? uploads : [])
  .filter((upload) => upload?.category === category && upload?.upload_status !== 'removed' && !upload?.removed_at);

function InfoLabel({ htmlFor, children, hint }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800">{children}</Label>
      {hint ? <span title={hint} aria-label={hint} className="text-slate-400"><Info className="h-4 w-4" aria-hidden="true" /></span> : null}
    </div>
  );
}

function AccountSummary({ account, onSignOut }) {
  const name = [account?.first_name, account?.middle_name, account?.last_name].filter(Boolean).join(' ') || 'DGFY account';
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4" aria-labelledby="registration-account-heading">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#1A4E8D] shadow-sm"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="registration-account-heading" className="truncate text-sm font-bold text-slate-900">{name}</h2>
          <p className="truncate text-xs text-slate-600">{account?.email || 'Email unavailable'}{account?.phone ? ` · ${account.phone}` : ''}</p>
          <p className="mt-1 text-[11px] font-semibold text-emerald-700">Connected DGFY account</p>
        </div>
      </div>
      <button type="button" onClick={onSignOut} className="text-xs font-bold text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">Sign out</button>
    </section>
  );
}

function StepIndicator({ step, maxStep, onSelect }) {
  const steps = [
    { number: 1, label: 'Business details' },
    { number: 2, label: 'Storefront profile' },
    { number: 3, label: 'Location and submit' }
  ];
  return (
    <nav aria-label="Business registration steps" className="grid gap-2 sm:grid-cols-3">
      {steps.map((item) => {
        const completed = item.number < step || item.number < maxStep;
        const current = item.number === step;
        const available = item.number <= maxStep;
        return (
          <button
            key={item.number}
            type="button"
            onClick={() => available && onSelect(item.number)}
            disabled={!available}
            aria-current={current ? 'step' : undefined}
            className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 text-left transition ${current ? 'border-[#1A4E8D] bg-blue-50 text-[#1A4E8D]' : completed ? 'border-emerald-200 bg-emerald-50/60 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'} disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${current ? 'bg-[#1A4E8D] text-white' : completed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {completed ? <Check className="h-4 w-4" aria-hidden="true" /> : item.number}
            </span>
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-wide">Step {item.number}</span>
              <span className="block text-xs font-bold">{item.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function SectionCard({ title, description, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StagedImageField({ label, description, category, uploads, previewUrl, disabled, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const upload = activeUploadsFor(uploads, category)[0];

  const chooseFile = async (file) => {
    if (!file || disabled || isUploading) return;
    setError('');
    setProgress(0);
    setIsUploading(true);
    try {
      await onUpload(category, file, setProgress);
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'The image could not be uploaded.'));
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        className="sr-only"
        disabled={disabled || isUploading}
        aria-label={`Choose ${label.toLowerCase()}`}
        onChange={(event) => { const [file] = Array.from(event.target.files || []); event.target.value = ''; void chooseFile(file); }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled || isUploading} className="min-h-9 gap-1.5 rounded-lg border-blue-200 px-3 text-xs font-bold text-[#1A4E8D]">
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {isUploading ? 'Uploading…' : upload ? 'Replace image' : 'Choose image'}
        </Button>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {previewUrl ? <img src={previewUrl} alt={`${label} preview`} className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-slate-400"><ImageIcon className="h-8 w-8" aria-hidden="true" /></div>}
      </div>
      {upload ? <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden="true" />{upload.original_name || 'Image staged for review'}</p> : null}
      {isUploading ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`${label} upload progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress == null ? 30 : Math.max(5, progress)}><div className="h-full rounded-full bg-[#1A4E8D] transition-[width]" style={{ width: `${progress == null ? 30 : Math.max(5, progress)}%` }} /></div> : null}
      {upload ? <button type="button" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:underline" onClick={() => onRemove(uploadIdOf(upload))} disabled={disabled || isUploading}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Remove image</button> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">{error}</p> : null}
    </div>
  );
}

function MenuUploadPanel({ uploads, disabled, onUpload, onRemove, onPendingChange }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const existingUploads = activeUploadsFor(uploads, 'menu_upload');
  const activeCount = existingUploads.length + rows.filter((row) => row.status === 'uploading' || row.status === 'success').length;

  useEffect(() => {
    onPendingChange?.(rows.some((row) => row.status === 'uploading' || row.status === 'error'));
  }, [onPendingChange, rows]);

  const validateFile = (file) => {
    const extension = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
    if (!MENU_MIME_TYPES.has(String(file?.type || '').toLowerCase()) && !MENU_EXTENSIONS.has(extension)) return 'Use CSV, PDF, JPG, JPEG, or PNG files.';
    if (Number(file?.size || 0) > MAX_UPLOAD_BYTES) return 'Each menu file must be 10 MB or smaller.';
    return '';
  };

  const uploadRow = async (rowId, file) => {
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, status: 'uploading', error: '', progress: 0 } : row));
    try {
      const uploaded = await onUpload('menu_upload', file, (progress) => setRows((current) => current.map((row) => row.id === rowId ? { ...row, progress } : row)));
      setRows((current) => current.map((row) => row.id === rowId ? { ...row, status: 'success', progress: 100, uploadId: uploadIdOf(uploaded), uploaded } : row));
    } catch (uploadError) {
      setRows((current) => current.map((row) => row.id === rowId ? { ...row, status: 'error', error: errorMessage(uploadError, 'Upload failed.') } : row));
    }
  };

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || disabled) return;
    const available = Math.max(0, MAX_MENU_FILES - activeCount);
    files.slice(0, available).forEach((file) => {
      const validationError = validateFile(file);
      const rowId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const row = { id: rowId, name: file.name || 'Menu file', file, progress: 0, status: validationError ? 'error' : 'uploading', error: validationError };
      setRows((current) => [...current, row]);
      if (!validationError) void uploadRow(rowId, file);
    });
  };

  const removeRow = async (row) => {
    if (row.status === 'success' && row.uploadId) await onRemove(row.uploadId);
    setRows((current) => current.filter((entry) => entry.id !== row.id));
  };

  const retry = (row) => { if (row?.file) void uploadRow(row.id, row.file); };

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3" aria-labelledby="registration-menu-heading">
      <input ref={inputRef} type="file" multiple accept={MENU_ACCEPT} className="sr-only" disabled={disabled} aria-label="Choose menu files" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="registration-menu-heading" className="text-sm font-bold text-slate-900">Menu uploads <span className="font-normal text-slate-500">(optional)</span></h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Upload up to five CSV, PDF, JPG, JPEG, or PNG files. Maximum 10 MB per file.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled || activeCount >= MAX_MENU_FILES} className="min-h-9 gap-1.5 rounded-lg border-blue-200 px-3 text-xs font-bold text-[#1A4E8D]"><Upload className="h-4 w-4" aria-hidden="true" />Choose files</Button>
      </div>
      <div className="mt-3 rounded-xl border border-dashed border-blue-200 bg-white px-4 py-5 text-center text-xs text-slate-500" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
        Drag and drop files here, or use the picker above.
      </div>
      <div className="mt-3 space-y-2" aria-live="polite">
        {existingUploads.map((upload) => (
          <div key={uploadIdOf(upload)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><FileText className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" /><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{upload.original_name || 'Menu file'}</span><span className="text-emerald-700">Ready</span><button type="button" onClick={() => void onRemove(uploadIdOf(upload))} disabled={disabled} className="text-rose-600 hover:underline">Remove</button></div>
        ))}
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center gap-2 text-xs"><FileText className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" /><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{row.name}</span>{row.status === 'success' ? <span className="text-emerald-700">Ready</span> : row.status === 'error' ? <button type="button" onClick={() => retry(row)} disabled={disabled} className="inline-flex items-center gap-1 font-bold text-[#1A4E8D] hover:underline"><RefreshCw className="h-3 w-3" aria-hidden="true" />Retry</button> : <span className="text-[#1A4E8D]">{row.progress == null ? 'Uploading…' : `${row.progress}%`}</span>}<button type="button" onClick={() => void removeRow(row)} disabled={disabled || row.status === 'uploading'} className="text-rose-600 hover:underline">Remove</button></div>
            {row.status === 'uploading' ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`${row.name} upload progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={row.progress == null ? 25 : Math.max(5, row.progress)}><div className="h-full rounded-full bg-[#1A4E8D]" style={{ width: `${row.progress == null ? 25 : Math.max(5, row.progress)}%` }} /></div> : null}
            {row.error ? <p className="mt-1 text-[11px] font-semibold text-rose-600" role="alert">{row.error}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function LegalConsent({ id, checked, onChange, title, description, version, documents, disabled }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label htmlFor={id} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
        <input id={id} type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="mt-1 h-5 w-5 shrink-0 accent-[#1A4E8D]" />
        <span><span className="block font-bold text-slate-900">{title}</span><span className="block text-xs leading-5 text-slate-600">{description}</span></span>
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-[11px] text-slate-500">
        <span>Version {version || 'current'}</span>
        {documents?.length ? <span>· {documents.length} document{documents.length === 1 ? '' : 's'} available</span> : null}
      </div>
    </div>
  );
}

export default function CompanyRegistrationWizard({ account, token, legalTerms, disabled = false, onSubmitted, onSignOut }) {
  const [draft, setDraft] = useState(null);
  const [payload, setPayload] = useState(EMPTY_PAYLOAD);
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeUploadCount, setActiveUploadCount] = useState(0);
  const [hasMenuUploadIssues, setHasMenuUploadIssues] = useState(false);
  const [pageError, setPageError] = useState('');
  const [stepError, setStepError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [consents, setConsents] = useState({ company: false, marketplace: false });
  const [imagePreviews, setImagePreviews] = useState({});
  const initializedAccountRef = useRef('');

  const companySnapshot = legalTerms?.flows?.company_registration?.snapshot || {};
  const companyDocuments = legalTerms?.flows?.company_registration?.documents || [];
  const legalReady = Boolean(companySnapshot.company_terms_version && companySnapshot.marketplace_terms_version);

  const applyDraft = useCallback((value) => {
    const nextDraft = normalizeDraft(value);
    setDraft(nextDraft);
    setPayload(nextDraft.payload);
    setStep(nextDraft.current_step);
    setMaxStep(nextDraft.current_step);
  }, []);

  const initializeDraft = useCallback(async () => {
    if (!account?.id || disabled) return;
    setIsInitializing(true);
    setPageError('');
    try {
      const nextDraft = await createCompanyRegistrationDraft(token);
      applyDraft(nextDraft);
      setStatusMessage('Draft loaded. Your progress is saved as you continue.');
    } catch (error) {
      setPageError(errorMessage(error, 'The registration draft could not be loaded.'));
    } finally {
      setIsInitializing(false);
    }
  }, [account?.id, applyDraft, disabled, token]);

  useEffect(() => {
    const accountKey = String(account?.id || '');
    if (!accountKey || disabled || initializedAccountRef.current === accountKey) return;
    initializedAccountRef.current = accountKey;
    void initializeDraft();
  }, [account?.id, disabled, initializeDraft]);

  const retryInitialize = () => {
    initializedAccountRef.current = '';
    void initializeDraft();
  };

  const updateSection = (section, nextValue) => {
    setPayload((current) => ({ ...current, [section]: nextValue }));
    setStatusMessage('Unsaved changes');
  };

  const updateBusiness = (field, value) => updateSection('business', { ...payload.business, [field]: value });
  const updateStorefront = (field, value) => updateSection('storefront', { ...payload.storefront, [field]: value });

  const updateDraftUploads = (nextUploads) => setDraft((current) => (current
    ? { ...current, uploads: typeof nextUploads === 'function' ? nextUploads(current.uploads) : nextUploads }
    : current));

  const removeUpload = async (uploadId) => {
    if (!draft || !uploadId) return;
    await removeCompanyRegistrationDraftFile(draft.id, uploadId, token);
    updateDraftUploads((current) => current.filter((upload) => uploadIdOf(upload) !== uploadId));
    setPayload((current) => ({
      ...current,
      storefront: {
        ...current.storefront,
        gallery: current.storefront.gallery.filter((entry) => String(entry.upload_id || '') !== uploadId),
        profile_upload_id: current.storefront.profile_upload_id === uploadId ? '' : current.storefront.profile_upload_id,
        cover_upload_id: current.storefront.cover_upload_id === uploadId ? '' : current.storefront.cover_upload_id
      },
      menu: { ...current.menu, upload_ids: current.menu.upload_ids.filter((id) => String(id) !== uploadId) }
    }));
  };

  const uploadFile = async (category, file, onProgress) => {
    if (!draft) throw new Error('The registration draft is still loading.');
    setActiveUploadCount((count) => count + 1);
    try {
      const uploaded = await uploadCompanyRegistrationDraftFile(draft.id, category, file, token, onProgress);
      setDraft((current) => (current ? {
        ...current,
        uploads: [...current.uploads.filter((entry) => uploadIdOf(entry) !== uploadIdOf(uploaded)), uploaded]
      } : current));
      return uploaded;
    } finally {
      setActiveUploadCount((count) => Math.max(0, count - 1));
    }
  };

  const handleSingleImageUpload = async (category, file, onProgress) => {
    const existing = activeUploadsFor(draft?.uploads, category)[0];
    if (existing) await removeUpload(uploadIdOf(existing));
    const uploaded = await uploadFile(category, file, onProgress);
    const field = category === 'profile_image' ? 'profile_upload_id' : 'cover_upload_id';
    updateStorefront(field, uploadIdOf(uploaded));
    const preview = URL.createObjectURL(file);
    setImagePreviews((current) => ({ ...current, [category]: preview }));
    return uploaded;
  };

  const handleGalleryUpload = async (replaceIndex, file, { onProgress } = {}) => {
    const oldEntry = replaceIndex == null ? null : payload.storefront.gallery[replaceIndex];
    const uploaded = await uploadFile('gallery_image', file, onProgress);
    if (oldEntry?.upload_id && oldEntry.upload_id !== uploadIdOf(uploaded)) {
      await removeUpload(oldEntry.upload_id);
    }
    setImagePreviews((current) => ({ ...current, [`gallery-${uploadIdOf(uploaded)}`]: URL.createObjectURL(file) }));
    return { success: true, uploaded: { upload_id: uploadIdOf(uploaded) } };
  };

  const handleGalleryChange = (images) => updateStorefront('gallery', images.map((entry, index) => ({
    ...(entry.upload_id ? { upload_id: entry.upload_id } : {}),
    caption: String(entry.caption || '').slice(0, 100),
    alt: String(entry.alt || '').slice(0, 125),
    sort_order: index
  })));

  const validateStep = (targetStep) => {
    const errors = [];
    if (targetStep === 1) {
      if (!String(payload.business.business_type || '').trim()) errors.push('Choose a business type.');
      if (String(payload.business.company_name || '').trim().length < 3) errors.push('Enter a company name with at least 3 characters.');
      if (!String(payload.business.industry_key || '').trim()) errors.push('Choose an industry.');
    }
    if (targetStep === 2) {
      const email = String(payload.storefront.store_email || '').trim();
      if (email && (!email.includes('@') || email.length > MAX_STORE_EMAIL_LENGTH)) errors.push('Enter a valid store email address.');
      if (String(payload.storefront.store_phone || '').length > MAX_PHONE_LENGTH) errors.push(`Store contact number must be ${MAX_PHONE_LENGTH} characters or fewer.`);
      if (payload.storefront.delivery_partners.length > 3) errors.push('You can add up to three delivery partners.');
    }
    if (targetStep === 3) {
      const location = payload.location || {};
      const hasAddress = [location.address_line, location.address, location.formatted_address].some((value) => String(value || '').trim());
      const hasCoordinates = Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude));
      if (!hasAddress && !hasCoordinates) errors.push('Add a business address or choose a location on the map.');
      const hasHours = isRecord(payload.hours) && Object.keys(payload.hours).length > 0;
      if (!hasHours) errors.push('Set your business hours.');
      if (!consents.company) errors.push('Accept the Company Registration Terms.');
      if (!consents.marketplace) errors.push('Accept the Marketplace Terms.');
      if (!legalReady) errors.push('Current DGFY terms are unavailable. Try again later.');
      if (activeUploadCount > 0) errors.push('Wait for all uploads to finish.');
      if (hasMenuUploadIssues) errors.push('Retry or remove menu uploads that are still pending.');
      if (activeUploadsFor(draft?.uploads, 'menu_upload').some((upload) => upload.validation_status !== 'passed')) errors.push('Wait for menu uploads to finish validation.');
    }
    return errors;
  };

  const saveDraft = async (nextStep) => {
    if (!draft) return false;
    setIsSaving(true);
    setStepError('');
    try {
      const saved = await updateCompanyRegistrationDraft(draft.id, { version: draft.version, current_step: nextStep, payload }, token);
      applyDraft(saved);
      setStatusMessage('Draft saved.');
      return true;
    } catch (error) {
      setStepError(errorMessage(error, 'The draft could not be saved. Please try again.'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = async () => {
    if (isSaving || isSubmitting || !draft) return;
    const errors = validateStep(step);
    if (errors.length > 0) {
      setStepError(errors.join(' '));
      return;
    }
    if (step < 3) {
      const saved = await saveDraft(step + 1);
      if (saved) setStep(step + 1);
      return;
    }
    setIsSubmitting(true);
    setStepError('');
    try {
      const result = await submitCompanyRegistrationDraft(draft.id, {
        version: draft.version,
        payload,
        accepted_company_terms: true,
        accepted_marketplace_terms: true,
        company_terms_version: companySnapshot.company_terms_version,
        marketplace_terms_version: companySnapshot.marketplace_terms_version
      }, token);
      setStatusMessage('Registration submitted for review.');
      onSubmitted?.(result);
    } catch (error) {
      setStepError(errorMessage(error, 'The registration could not be submitted. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const galleryDisplayImages = useMemo(() => payload.storefront.gallery.map((entry) => ({
    ...entry,
    url: imagePreviews[`gallery-${entry.upload_id}`] || entry.url || ''
  })), [imagePreviews, payload.storefront.gallery]);

  if (isInitializing || !draft) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <AccountSummary account={account} onSignOut={onSignOut} />
        {pageError ? <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert"><p>{pageError}</p><Button type="button" variant="outline" onClick={retryInitialize} className="mt-3 min-h-9 border-rose-300 text-rose-700"><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button></div> : <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Loading your registration draft…</div>}
      </div>
    );
  }

  const stepTitle = step === 1 ? 'Business details' : step === 2 ? 'Storefront profile' : 'Location and submission';
  const stepDescription = step === 1 ? 'Tell us what business you are registering.' : step === 2 ? 'Add the public information customers will see.' : 'Finish your location, hours, menu, and required agreements.';
  const canGoBack = step > 1 && !isSaving && !isSubmitting;
  const isBusy = isSaving || isSubmitting || activeUploadCount > 0;
  const finalStepReady = step !== 3 || validateStep(3).length === 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <AccountSummary account={account} onSignOut={onSignOut} />
      <StepIndicator step={step} maxStep={maxStep} onSelect={(nextStep) => { setStep(nextStep); setStepError(''); }} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#1A4E8D]">Step {step} of 3</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{stepTitle}</h1><p className="mt-1 text-sm text-slate-500">{stepDescription}</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{statusMessage || 'Draft autosave on step completion'}</span>
        </div>

        {stepError ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-700" role="alert">{stepError}</div> : null}

        {step === 1 ? (
          <div className="space-y-5">
            <SectionCard title="Company identity" description="These details identify the company connected to your DGFY account.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><InfoLabel htmlFor="registration-business-type" hint="Choose the broad type that best describes the company.">Business type</InfoLabel><select id="registration-business-type" value={payload.business.business_type || ''} onChange={(event) => updateBusiness('business_type', event.target.value)} disabled={isBusy} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100"><option value="">Select business type</option>{BUSINESS_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
                <div className="space-y-1.5"><InfoLabel htmlFor="registration-company-name">Company name</InfoLabel><Input id="registration-company-name" value={payload.business.company_name || ''} onChange={(event) => updateBusiness('company_name', event.target.value.slice(0, 100))} maxLength={100} placeholder="Enter your registered company name" disabled={isBusy} /></div>
              </div>
              <div className="mt-4"><IndustrySelect idPrefix="registration-industry" value={payload.business.industry_key || ''} disabled={isBusy} onSelect={(entry) => updateBusiness('industry_key', entry.key)} /></div>
            </SectionCard>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900"><p className="font-bold">Registration ownership</p><p className="mt-1 text-xs leading-5">This company registration belongs to the connected DGFY account. The account email and phone are used for registration updates.</p></div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <SectionCard title="Storefront images" description="Upload optional images that will be staged with this registration for review.">
              <div className="grid gap-4 lg:grid-cols-2"><StagedImageField label="Profile photo" description="JPG or PNG, one image." category="profile_image" uploads={draft.uploads} previewUrl={imagePreviews.profile_image} disabled={isBusy} onUpload={handleSingleImageUpload} onRemove={removeUpload} /><StagedImageField label="Cover photo" description="JPG or PNG, one image." category="cover_image" uploads={draft.uploads} previewUrl={imagePreviews.cover_image} disabled={isBusy} onUpload={handleSingleImageUpload} onRemove={removeUpload} /></div>
            </SectionCard>
            <SectionCard title="Storefront contact and description" description="All fields below are optional, but help customers recognize and contact your store.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><InfoLabel htmlFor="registration-store-email">Store email</InfoLabel><Input id="registration-store-email" type="email" value={payload.storefront.store_email || ''} onChange={(event) => updateStorefront('store_email', event.target.value.slice(0, MAX_STORE_EMAIL_LENGTH))} maxLength={MAX_STORE_EMAIL_LENGTH} placeholder="store@example.com" disabled={isBusy} /></div>
                <div className="space-y-1.5"><InfoLabel htmlFor="registration-store-phone">Store contact number</InfoLabel><Input id="registration-store-phone" inputMode="tel" value={payload.storefront.store_phone || ''} onChange={(event) => updateStorefront('store_phone', event.target.value.slice(0, MAX_PHONE_LENGTH))} maxLength={MAX_PHONE_LENGTH} placeholder="09XXXXXXXXX" disabled={isBusy} /><p className="text-right text-[11px] text-slate-500">{String(payload.storefront.store_phone || '').length}/{MAX_PHONE_LENGTH}</p></div>
                <div className="space-y-1.5 sm:col-span-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="registration-tagline" className="text-sm font-semibold text-slate-800">Tagline</Label><span className="text-[11px] text-slate-500">{String(payload.storefront.tagline || '').length}/{MAX_TAGLINE_LENGTH}</span></div><Input id="registration-tagline" value={payload.storefront.tagline || ''} onChange={(event) => updateStorefront('tagline', event.target.value.slice(0, MAX_TAGLINE_LENGTH))} maxLength={MAX_TAGLINE_LENGTH} placeholder="A short line that describes your store" disabled={isBusy} /></div>
                <div className="space-y-1.5 sm:col-span-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="registration-about" className="text-sm font-semibold text-slate-800">About us</Label><span className="text-[11px] text-slate-500">{String(payload.storefront.about || '').length}/{MAX_ABOUT_LENGTH}</span></div><textarea id="registration-about" value={payload.storefront.about || ''} onChange={(event) => updateStorefront('about', event.target.value.slice(0, MAX_ABOUT_LENGTH))} maxLength={MAX_ABOUT_LENGTH} rows={5} placeholder="Tell customers what makes your business unique" disabled={isBusy} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100" /></div>
              </div>
            </SectionCard>
            <StorefrontSocialLinksSettings links={payload.storefront.social_links} onChange={(links) => updateStorefront('social_links', links)} disabled={isBusy} interactionMode="inline" />
            <StorefrontDeliveryPartnersSettings partners={payload.storefront.delivery_partners} maxPartners={3} onChange={(partners) => updateStorefront('delivery_partners', partners)} disabled={isBusy} />
            <StorefrontGallerySettings images={galleryDisplayImages} onChange={handleGalleryChange} onUploadImage={handleGalleryUpload} onRemoveImage={(entry) => entry?.upload_id ? removeUpload(entry.upload_id) : undefined} disabled={isBusy} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-5">
            <SectionCard title="Business location" description="Provide an address or place a pin on the map so customers and reviewers can locate the business.">
              <div className="space-y-4"><div className="space-y-1.5"><InfoLabel htmlFor="registration-address">Business address</InfoLabel><textarea id="registration-address" value={payload.location.address_line || ''} onChange={(event) => updateSection('location', { ...payload.location, address_line: event.target.value.slice(0, 255) })} rows={3} placeholder="Street, barangay, city, province" disabled={isBusy} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><InfoLabel htmlFor="registration-latitude">Latitude <span className="font-normal text-slate-500">(optional)</span></InfoLabel><Input id="registration-latitude" inputMode="decimal" value={payload.location.latitude || ''} onChange={(event) => updateSection('location', { ...payload.location, latitude: event.target.value })} disabled={isBusy} /></div><div className="space-y-1.5"><InfoLabel htmlFor="registration-longitude">Longitude <span className="font-normal text-slate-500">(optional)</span></InfoLabel><Input id="registration-longitude" inputMode="decimal" value={payload.location.longitude || ''} onChange={(event) => updateSection('location', { ...payload.location, longitude: event.target.value })} disabled={isBusy} /></div></div><div className="overflow-hidden rounded-xl border border-slate-200"><Suspense fallback={<div className="flex h-48 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading map…</div>}><MapPinPicker latitude={payload.location.latitude} longitude={payload.location.longitude} addressLine={payload.location.address_line || ''} onChange={(location) => updateSection('location', { ...payload.location, ...location })} defaultAdjustMode locationEditorMode /></Suspense></div></div>
            </SectionCard>
            <SectionCard title="Business hours" description="Set at least one open schedule so customers know when the business operates."><StorefrontBusinessHoursScheduler value={payload.hours} onChange={(hours) => updateSection('hours', hours)} disabled={isBusy} /></SectionCard>
            <MenuUploadPanel uploads={draft.uploads} disabled={isBusy} onUpload={uploadFile} onRemove={removeUpload} onPendingChange={setHasMenuUploadIssues} />
            <SectionCard title="Required agreements" description="These two consents are captured separately with the current published versions and stored with your submission.">
              <div className="space-y-3"><LegalConsent id="registration-company-terms" checked={consents.company} onChange={(event) => setConsents((current) => ({ ...current, company: event.target.checked }))} disabled={isBusy || !legalReady} title="Company Registration Terms" description="I agree to the current DGFY Company Registration Terms." version={companySnapshot.company_terms_version} documents={companyDocuments.filter((document) => String(document.key || '').includes('company'))} /><LegalConsent id="registration-marketplace-terms" checked={consents.marketplace} onChange={(event) => setConsents((current) => ({ ...current, marketplace: event.target.checked }))} disabled={isBusy || !legalReady} title="Marketplace Terms" description="I agree to the current DGFY Marketplace Provider Terms." version={companySnapshot.marketplace_terms_version} documents={companyDocuments.filter((document) => String(document.key || '').includes('marketplace'))} /></div>
              {!legalReady ? <p className="mt-3 text-xs font-semibold text-rose-600" role="alert">Current DGFY terms are unavailable. Registration cannot be submitted until they load.</p> : null}
            </SectionCard>
          </div>
        ) : null}

        {step === 3 && !finalStepReady ? <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800" role="status">Complete the business address, business hours, both required agreements, and any upload actions before submitting.</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => { if (canGoBack) { setStep((current) => current - 1); setStepError(''); } }} disabled={!canGoBack} className="min-h-11 gap-1.5 rounded-lg px-4 font-bold"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Back</Button>
          <Button type="button" onClick={() => void handleNext()} disabled={isBusy || !draft || !finalStepReady} className="min-h-11 gap-1.5 rounded-lg bg-[#1A4E8D] px-5 font-extrabold text-white hover:bg-[#143F73]">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : step === 3 ? <Check className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}{isSubmitting ? 'Submitting…' : isSaving ? 'Saving…' : step === 3 ? 'Submit Details and Create Company' : 'Save and continue'}</Button>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-3 text-xs leading-5 text-blue-900"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>Your progress is saved in a private registration draft. Uploaded files remain staged for this registration until you submit or remove them.</p></div>
    </div>
  );
}
