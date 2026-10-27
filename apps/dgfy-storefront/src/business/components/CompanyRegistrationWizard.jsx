import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  UploadCloud,
  UserRound
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import IndustrySelect from '../../../../../packages/web-core/src/features/registration/IndustrySelect.jsx';
import StorefrontSocialLinksSettings from '../../../../../packages/web-core/src/features/pos/settings/StorefrontSocialLinksSettings.jsx';
import StorefrontBusinessHoursScheduler from '../../../../../packages/web-core/src/features/settings/StorefrontBusinessHoursScheduler.jsx';
import { createDefaultStorefrontBusinessHours } from '../../../../../packages/web-core/src/features/settings/storefrontBusinessHours.js';
import RegistrationBranchLocationPanel from './RegistrationBranchLocationPanel.jsx';
import { buildMerchantAddressPayload, hasMerchantAddressDetails, readMerchantAddressParts } from '../../../../../packages/web-core/src/components/maps/merchantAddressDetails.js';
import StagedStorefrontImages from './StagedStorefrontImages.jsx';
import {
  createCompanyRegistrationDraft,
  getCompanyRegistrationDraft,
  removeCompanyRegistrationDraftFile,
  submitCompanyRegistrationDraft,
  updateCompanyRegistrationDraft,
  uploadCompanyRegistrationDraftFile
} from '../services/companyRegistrationDraftService.js';

const MAX_PHONE_LENGTH = 12;
const MAX_TAGLINE_LENGTH = 100;
const MAX_ABOUT_LENGTH = 600;
const MAX_STORE_EMAIL_LENGTH = 120;
const MAX_MENU_FILES = 5;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DRAFT_AUTOSAVE_DELAY_MS = 700;
const MENU_ACCEPT = '.csv,.pdf,.jpg,.jpeg,.png,text/csv,text/plain,application/vnd.ms-excel,application/pdf,image/jpeg,image/png';
const MENU_EXTENSIONS = new Set(['csv', 'pdf', 'jpg', 'jpeg', 'png']);
const MENU_MIME_TYPES = new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/pdf', 'image/jpeg', 'image/png']);

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

const mergeSavedPayload = (submitted, saved) => {
  if (!isRecord(saved)) return submitted;
  const merged = { ...submitted };
  for (const [key, value] of Object.entries(saved)) {
    merged[key] = isRecord(merged[key]) && isRecord(value)
      ? mergeSavedPayload(merged[key], value)
      : value;
  }
  return merged;
};

const errorMessage = (error, fallback) => (
  error?.response?.data?.message
  || error?.message
  || fallback
);

const isDraftConflictError = (error) => Number(error?.response?.status) === 409;

const REGISTRATION_RECOVERY_VERSION = 1;
const registrationRecoveryKey = (accountId) => `dgfy:company-registration:recovery:${String(accountId || '')}`;
const payloadsMatch = (left, right) => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => payloadsMatch(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && payloadsMatch(left[key], right[key]));
};

const mergeRecoveredValue = (base, local, server) => {
  if (payloadsMatch(local, base)) return server;
  if (payloadsMatch(server, base)) return local;
  if (isRecord(base) && isRecord(local) && isRecord(server)) {
    const merged = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(server)]);
    for (const key of keys) {
      const value = mergeRecoveredValue(base[key], local[key], server[key]);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  return local;
};

const readRegistrationRecovery = (accountId) => {
  if (!accountId || typeof window === 'undefined') return null;
  try {
    const serialized = window.sessionStorage.getItem(registrationRecoveryKey(accountId));
    return serialized ? JSON.parse(serialized) : null;
  } catch {
    return null;
  }
};

const revokeImageObjectUrl = (previewUrl) => {
  if (!String(previewUrl || '').startsWith('blob:') || typeof URL.revokeObjectURL !== 'function') return;
  try {
    URL.revokeObjectURL(previewUrl);
  } catch {
    // A stale browser URL must not block draft or upload state updates.
  }
};

const writeRegistrationRecovery = ({ accountId, draftId, basePayload, payload, currentStep }) => {
  if (!accountId || !draftId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(registrationRecoveryKey(accountId), JSON.stringify({
      schemaVersion: REGISTRATION_RECOVERY_VERSION,
      accountId: String(accountId),
      draftId: String(draftId),
      basePayload: normalizePayload(basePayload),
      payload: normalizePayload(payload),
      currentStep: Math.min(3, Math.max(1, Number(currentStep) || 1))
    }));
  } catch {
    // Session storage can be disabled or full; server autosave remains the durable path.
  }
};

const clearRegistrationRecovery = (accountId, draftId) => {
  if (!accountId || typeof window === 'undefined') return;
  try {
    const key = registrationRecoveryKey(accountId);
    const recovery = readRegistrationRecovery(accountId);
    if (!draftId || !recovery?.draftId || String(recovery.draftId) === String(draftId)) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage cleanup failures; the next load validates the snapshot before use.
  }
};

const uploadIdOf = (upload) => String(upload?.id || upload?.upload_id || '').trim();

const activeUploadsFor = (uploads, category) => (Array.isArray(uploads) ? uploads : [])
  .filter((upload) => upload?.category === category && upload?.upload_status !== 'removed' && !upload?.removed_at);

const registrationLocationAddress = (location) => String(
  location?.address_line || location?.address || location?.formatted_address || location?.full_address || ''
).trim();

const registrationCoordinateIsValid = (value, min, max) => {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max;
};

const hasRegistrationLocationCoordinates = (location) => (
  registrationCoordinateIsValid(location?.latitude, -90, 90)
  && registrationCoordinateIsValid(location?.longitude, -180, 180)
);

const locationsShareCoordinates = (left, right) => (
  hasRegistrationLocationCoordinates(left)
  && hasRegistrationLocationCoordinates(right)
  && Number(left.latitude) === Number(right.latitude)
  && Number(left.longitude) === Number(right.longitude)
);

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
          <p id="registration-account-heading" className="truncate text-sm font-bold text-slate-900">{name}</p>
          <p className="truncate text-xs text-slate-600">{account?.email || 'Email unavailable'}{account?.phone ? ` · ${account.phone}` : ''}</p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">Connected DGFY account</p>
        </div>
      </div>
      <button type="button" onClick={onSignOut} className="text-xs font-bold text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">Sign out</button>
    </section>
  );
}

function StepIndicator({ step, maxStep, onSelect }) {
  const steps = [
    { number: 1, label: 'Business' },
    { number: 2, label: 'Storefront profile' },
    { number: 3, label: 'Location and submit' }
  ];
  return (
    <nav aria-label="Business registration steps" className="grid grid-cols-3 items-start">
      {steps.map((item, index) => {
        const completed = item.number < step || item.number < maxStep;
        const current = item.number === step;
        const available = item.number <= maxStep;
        const connectorComplete = item.number <= step || item.number < maxStep;
        const columnLayout = index === 0
          ? 'grid-cols-[1.75rem_minmax(0,1fr)]'
          : index === steps.length - 1
            ? 'grid-cols-[minmax(0,1fr)_1.75rem]'
            : 'grid-cols-[minmax(0,1fr)_1.75rem_minmax(0,1fr)]';
        return (
          <button
            key={item.number}
            type="button"
            onClick={() => available && onSelect(item.number)}
            disabled={!available}
            aria-current={current ? 'step' : undefined}
            aria-label={`Step ${item.number}: ${item.label}`}
            className="group min-h-11 min-w-0 rounded-md border-0 bg-transparent p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
          >
            <span className={`grid w-full items-center gap-3 ${columnLayout}`}>
              {index > 0 ? <span aria-hidden="true" className={`h-0.5 rounded-full ${connectorComplete || completed ? 'bg-[#1A4586]' : 'bg-slate-200'}`} /> : null}
              <span className={`grid h-7 w-7 place-items-center rounded-full border text-xs font-bold ${current ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white' : completed || available ? 'border-[#B9CFE8] bg-[#EEF4FB] text-[#1A4E8D]' : 'border-slate-300 bg-white text-slate-500'}`}>
                {item.number}
              </span>
              {index < steps.length - 1 ? <span aria-hidden="true" className={`h-0.5 rounded-full ${connectorComplete ? 'bg-[#1A4586]' : 'bg-slate-200'}`} /> : null}
            </span>
            <span className={`mt-2 block break-words text-xs font-semibold leading-4 sm:text-[13px] sm:leading-5 ${current || completed ? 'text-[#1A4E8D]' : available ? 'text-slate-500' : 'text-slate-400'} ${index === 0 ? 'text-left' : index === steps.length - 1 ? 'text-right' : 'text-center'}`}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SectionCard({ title, description, children, className = '', headerClassName = '', variant = 'card' }) {
  const surfaceClasses = variant === 'plain'
    ? 'min-w-0 p-4 sm:p-5'
    : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5';

  return (
    <section className={`${surfaceClasses} ${className}`}>
      {title || description ? (
        <div className={`mb-4 ${headerClassName}`}>
          {title ? <h2 className="text-base font-extrabold text-slate-900">{title}</h2> : null}
          {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function MenuUploadPanel({ uploads, disabled, onUpload, onRemove, onPendingChange }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const existingUploads = activeUploadsFor(uploads, 'menu_upload');
  const activeCount = existingUploads.length + rows.filter((row) => row.status === 'uploading').length;

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
      if (!uploaded) throw new Error('The upload did not return a saved file.');
      setRows((current) => current.filter((row) => row.id !== rowId));
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
    <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-labelledby="registration-menu-heading">
      <input ref={inputRef} type="file" multiple accept={MENU_ACCEPT} className="sr-only" disabled={disabled} aria-label="Choose menu files" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
      <h2 id="registration-menu-heading" className="flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight text-slate-900">
        <span>Menu uploads</span>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">(optional)</span>
      </h2>
      <div
        className={`mt-2 rounded-lg px-4 py-3 text-center transition-colors ${isDragging ? 'bg-blue-50 ring-2 ring-blue-200' : 'bg-slate-50'} ${disabled ? 'opacity-60' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }}
        aria-describedby="registration-menu-upload-guidance"
      >
        <span className="mx-auto grid h-6 w-6 place-items-center rounded-md bg-white text-[#1A4E8D] shadow-sm" aria-hidden="true"><UploadCloud className="h-4 w-4" /></span>
        <p className="mt-1 text-xs font-semibold text-slate-800">Drag and drop files here</p>
        <div id="registration-menu-upload-guidance" className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-xs text-slate-500">
          {['CSV', 'PDF', 'JPG', 'PNG'].map((format) => <span key={format} className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-600">{format}</span>)}
          <span className="px-1">Max 10 MB each, up to 5 files</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Or <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || activeCount >= MAX_MENU_FILES} aria-describedby="registration-menu-upload-guidance" className="inline-flex min-h-11 items-center rounded-md px-2 font-semibold text-[#1A4E8D] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-50">browse computer storage</button>
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500" role="list" aria-label="Supported menu file types">
        <span className="inline-flex items-center gap-1.5" role="listitem"><FileSpreadsheet className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" />Spreadsheets (.csv)</span>
        <span className="inline-flex items-center gap-1.5" role="listitem"><FileText className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" />PDF menus</span>
        <span className="inline-flex items-center gap-1.5" role="listitem"><ImageIcon className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" />Photos (.jpg, .png)</span>
      </div>
      <p className="mt-1 text-center text-xs leading-5 text-slate-500">Uploaded files stay with this private draft until you submit or remove them.</p>
      <div className="mt-3 space-y-2" aria-live="polite">
        {existingUploads.map((upload) => (
          <div key={uploadIdOf(upload)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><FileText className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" /><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{upload.original_name || 'Menu file'}</span><span className="text-emerald-700">Ready</span><button type="button" onClick={() => void onRemove(uploadIdOf(upload))} disabled={disabled} className="inline-flex min-h-11 items-center rounded-md px-2 text-rose-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">Remove</button></div>
        ))}
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center gap-2 text-xs"><FileText className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" /><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{row.name}</span>{row.status === 'success' ? <span className="text-emerald-700">Ready</span> : row.status === 'error' ? <button type="button" onClick={() => retry(row)} disabled={disabled} className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-bold text-[#1A4E8D] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"><RefreshCw className="h-3 w-3" aria-hidden="true" />Retry</button> : <span className="text-[#1A4E8D]">{row.progress == null ? 'Uploading…' : `${row.progress}%`}</span>}<button type="button" onClick={() => void removeRow(row)} disabled={disabled || row.status === 'uploading'} className="inline-flex min-h-11 items-center rounded-md px-2 text-rose-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">Remove</button></div>
            {row.status === 'uploading' ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={`${row.name} upload progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={row.progress == null ? 25 : Math.max(5, row.progress)}><div className="h-full rounded-full bg-[#1A4E8D]" style={{ width: `${row.progress == null ? 25 : Math.max(5, row.progress)}%` }} /></div> : null}
            {row.error ? <p className="mt-1 text-xs font-semibold text-rose-600" role="alert">{row.error}</p> : null}
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
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-xs text-slate-500">
        <span>Version {version || 'current'}</span>
        {documents?.length ? <span>· {documents.length} document{documents.length === 1 ? '' : 's'} available</span> : null}
      </div>
    </div>
  );
}

export default function CompanyRegistrationWizard({ account, token, legalTerms, disabled = false, onSubmitted, onSignOut, belowStepperContent = null, footerContent = null, scrollContainerRef = null }) {
  const [draft, setDraft] = useState(null);
  const [payload, setPayload] = useState(EMPTY_PAYLOAD);
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeUploadCount, setActiveUploadCount] = useState(0);
  const [hasMenuUploadIssues, setHasMenuUploadIssues] = useState(false);
  const [locationCandidate, setLocationCandidate] = useState(null);
  const [pageError, setPageError] = useState('');
  const [stepError, setStepError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [hasDraftSaveError, setHasDraftSaveError] = useState(false);
  const [draftConflict, setDraftConflict] = useState(false);
  const [isReloadingDraft, setIsReloadingDraft] = useState(false);
  const [consents, setConsents] = useState({ company: false, marketplace: false });
  const [imagePreviews, setImagePreviews] = useState({});
  const imagePreviewsRef = useRef({});
  const initializedAccountRef = useRef('');
  const locationCandidateRef = useRef(null);
  const confirmedLocationRef = useRef(null);
  const draftRef = useRef(null);
  const payloadRef = useRef(EMPTY_PAYLOAD);
  const confirmedPayloadRef = useRef(EMPTY_PAYLOAD);
  const stepRef = useRef(1);
  const payloadRevisionRef = useRef(0);
  const savedPayloadRevisionRef = useRef(0);
  const autosaveTimerRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const saveDraftRef = useRef(null);
  const stepContentRef = useRef(null);

  useLayoutEffect(() => {
    if (stepContentRef.current) stepContentRef.current.scrollTop = 0;
    if (scrollContainerRef?.current) scrollContainerRef.current.scrollTop = 0;
    if (typeof document !== 'undefined' && document.scrollingElement) {
      document.scrollingElement.scrollTop = 0;
    }
  }, [scrollContainerRef, step]);

  const companySnapshot = legalTerms?.flows?.company_registration?.snapshot || {};
  const companyDocuments = legalTerms?.flows?.company_registration?.documents || [];
  const legalReady = Boolean(companySnapshot.company_terms_version && companySnapshot.marketplace_terms_version);

  const persistRecoverySnapshot = (nextPayload = payloadRef.current, nextStep = stepRef.current) => {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    writeRegistrationRecovery({
      accountId: account?.id,
      draftId: currentDraft.id,
      basePayload: confirmedPayloadRef.current,
      payload: nextPayload,
      currentStep: nextStep
    });
  };

  const updateImagePreview = (category, previewUrl) => {
    const previousUrl = imagePreviewsRef.current[category];
    if (previousUrl && previousUrl !== previewUrl) revokeImageObjectUrl(previousUrl);
    const nextPreviews = { ...imagePreviewsRef.current };
    if (previewUrl) nextPreviews[category] = previewUrl;
    else delete nextPreviews[category];
    imagePreviewsRef.current = nextPreviews;
    setImagePreviews(nextPreviews);
  };

  useEffect(() => () => {
    Object.values(imagePreviewsRef.current).forEach(revokeImageObjectUrl);
    imagePreviewsRef.current = {};
  }, []);

  const setWizardStep = (nextStep) => {
    const resolvedStep = typeof nextStep === 'function' ? nextStep(stepRef.current) : nextStep;
    stepRef.current = resolvedStep;
    setStep(resolvedStep);
    persistRecoverySnapshot(payloadRef.current, resolvedStep);
  };

  const applyDraft = useCallback((value, { preserveRecovery = true } = {}) => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const nextDraft = normalizeDraft(value);
    const recovery = preserveRecovery ? readRegistrationRecovery(account?.id) : null;
    const canRecover = recovery?.schemaVersion === REGISTRATION_RECOVERY_VERSION
      && String(recovery.accountId) === String(account?.id)
      && String(recovery.draftId) === String(nextDraft.id)
      && isRecord(recovery.basePayload)
      && isRecord(recovery.payload);
    const recoveredPayload = canRecover
      ? normalizePayload(mergeRecoveredValue(recovery.basePayload, recovery.payload, nextDraft.payload))
      : nextDraft.payload;
    const recoveredStep = canRecover
      ? Math.min(3, Math.max(1, Number(recovery.currentStep) || nextDraft.current_step))
      : nextDraft.current_step;
    const hasRecoveredChanges = !payloadsMatch(recoveredPayload, nextDraft.payload)
      || recoveredStep !== nextDraft.current_step;
    const appliedDraft = { ...nextDraft, current_step: recoveredStep, payload: recoveredPayload };
    draftRef.current = appliedDraft;
    confirmedPayloadRef.current = nextDraft.payload;
    payloadRef.current = recoveredPayload;
    payloadRevisionRef.current += 1;
    savedPayloadRevisionRef.current = hasRecoveredChanges
      ? payloadRevisionRef.current - 1
      : payloadRevisionRef.current;
    stepRef.current = recoveredStep;
    confirmedLocationRef.current = recoveredPayload.location;
    setDraft(appliedDraft);
    setPayload(recoveredPayload);
    setStep(recoveredStep);
    setMaxStep(Math.max(nextDraft.current_step, recoveredStep));
    setHasDraftSaveError(false);
    setDraftConflict(false);
    if (hasRecoveredChanges) {
      writeRegistrationRecovery({
        accountId: account?.id,
        draftId: nextDraft.id,
        basePayload: nextDraft.payload,
        payload: recoveredPayload,
        currentStep: recoveredStep
      });
    } else {
      clearRegistrationRecovery(account?.id, nextDraft.id);
    }
    return hasRecoveredChanges ? { payload: recoveredPayload, currentStep: recoveredStep } : null;
  }, [account?.id]);

  const initializeDraft = useCallback(async () => {
    if (!account?.id || disabled) return;
    setIsInitializing(true);
    setPageError('');
    try {
      const nextDraft = await createCompanyRegistrationDraft(token);
      const recovered = applyDraft(nextDraft);
      if (recovered) {
        setStatusMessage('Restoring your latest edits…');
        void saveDraftRef.current?.(recovered.currentStep, recovered.payload, { background: true });
      } else {
        setStatusMessage('Draft loaded. New edits save automatically.');
      }
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

  const reloadLatestDraft = async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft || isReloadingDraft) return;
    setIsReloadingDraft(true);
    setPageError('');
    setStepError('');
    try {
      const latestDraft = await getCompanyRegistrationDraft(currentDraft.id, token);
      clearRegistrationRecovery(account?.id, currentDraft.id);
      locationCandidateRef.current = null;
      setLocationCandidate(null);
      applyDraft(latestDraft, { preserveRecovery: false });
      setStatusMessage('Latest draft loaded. Review it before continuing.');
    } catch (error) {
      setPageError(errorMessage(error, 'The latest registration draft could not be loaded. Your local edits are still here.'));
    } finally {
      setIsReloadingDraft(false);
    }
  };

  const cancelPendingAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelPendingAutosave(), [cancelPendingAutosave]);

  const scheduleDraftAutosave = () => {
    cancelPendingAutosave();
    if (draftConflict) return;
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void saveDraftRef.current?.(stepRef.current, payloadRef.current, { background: true });
    }, DRAFT_AUTOSAVE_DELAY_MS);
  };

  const updatePayload = (nextPayload) => {
    payloadRef.current = nextPayload;
    payloadRevisionRef.current += 1;
    setPayload(nextPayload);
    setStatusMessage('Unsaved changes');
    setHasDraftSaveError(false);
    persistRecoverySnapshot(nextPayload, stepRef.current);
    scheduleDraftAutosave();
  };

  const updateSection = (section, nextValue) => {
    updatePayload({ ...payloadRef.current, [section]: nextValue });
  };

  const setLocationCandidateDraft = (nextLocation) => {
    locationCandidateRef.current = nextLocation;
    setLocationCandidate(nextLocation);
  };

  // #2595: the editor works on the geocoded location and the street no./unit details separately;
  // a saved branch location's address_line is the combined `<details>, <location>`.
  const toEditableLocation = (location = {}) => ({
    ...location,
    ...readMerchantAddressParts({ address_line: registrationLocationAddress(location), address_details: location?.address_details })
  });

  const handleLocationCandidateChange = (nextLocation) => {
    const currentCandidate = locationCandidateRef.current;
    const mergedLocation = { ...(currentCandidate || toEditableLocation(payloadRef.current.location || {})), ...nextLocation };
    if (!currentCandidate && locationsShareCoordinates(mergedLocation, confirmedLocationRef.current)) return;
    setLocationCandidateDraft(mergedLocation);
  };

  const handleLocationDetailsChange = (addressDetails) => {
    const currentLocation = locationCandidateRef.current || toEditableLocation(payloadRef.current.location || {});
    setLocationCandidateDraft({ ...currentLocation, address_details: addressDetails });
  };

  const handleLocationAddressChange = (addressLine) => {
    const currentLocation = locationCandidateRef.current || toEditableLocation(payloadRef.current.location || {});
    setLocationCandidateDraft({
      ...currentLocation,
      address_line: addressLine,
      address: '',
      formatted_address: '',
      full_address: ''
    });
  };

  const updateBusiness = (field, value) => updateSection('business', { ...payloadRef.current.business, [field]: value });
  const updateStorefront = (field, value) => updateSection('storefront', { ...payloadRef.current.storefront, [field]: value });

  const updateDraftUploads = (nextUploads) => {
    const current = draftRef.current;
    if (!current) return;
    const uploads = typeof nextUploads === 'function' ? nextUploads(current.uploads) : nextUploads;
    const nextDraft = { ...current, uploads };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };

  const removeUpload = async (uploadId) => {
    const currentDraft = draftRef.current;
    if (!currentDraft || !uploadId) return;
    const removingUpload = currentDraft.uploads.find((upload) => uploadIdOf(upload) === uploadId);
    await removeCompanyRegistrationDraftFile(currentDraft.id, uploadId, token);
    updateDraftUploads((current) => current.filter((upload) => uploadIdOf(upload) !== uploadId));
    if (removingUpload?.category === 'profile_image' || removingUpload?.category === 'cover_image') {
      updateImagePreview(removingUpload.category, '');
    }
    updatePayload({
      ...payloadRef.current,
      storefront: {
        ...payloadRef.current.storefront,
        gallery: payloadRef.current.storefront.gallery.filter((entry) => String(entry.upload_id || '') !== uploadId),
        profile_upload_id: payloadRef.current.storefront.profile_upload_id === uploadId ? '' : payloadRef.current.storefront.profile_upload_id,
        cover_upload_id: payloadRef.current.storefront.cover_upload_id === uploadId ? '' : payloadRef.current.storefront.cover_upload_id
      },
      menu: { ...payloadRef.current.menu, upload_ids: payloadRef.current.menu.upload_ids.filter((id) => String(id) !== uploadId) }
    });
  };

  const uploadFile = async (category, file, onProgress, { replaceUploadId = '' } = {}) => {
    const currentDraft = draftRef.current;
    if (!currentDraft) throw new Error('The registration draft is still loading.');
    setActiveUploadCount((count) => count + 1);
    try {
      const uploaded = await uploadCompanyRegistrationDraftFile(currentDraft.id, category, file, token, onProgress, { replaceUploadId });
      updateDraftUploads((current) => [
        ...current.filter((entry) => uploadIdOf(entry) !== uploadIdOf(uploaded) && uploadIdOf(entry) !== replaceUploadId),
        uploaded
      ]);
      return uploaded;
    } finally {
      setActiveUploadCount((count) => Math.max(0, count - 1));
    }
  };

  const handleSingleImageUpload = async (category, file, onProgress) => {
    const existing = activeUploadsFor(draftRef.current?.uploads, category)[0];
    const replaceUploadId = uploadIdOf(existing);
    const uploaded = await uploadFile(category, file, onProgress, { replaceUploadId });
    const field = category === 'profile_image' ? 'profile_upload_id' : 'cover_upload_id';
    updateStorefront(field, uploadIdOf(uploaded));
    let preview = '';
    try {
      if (typeof URL.createObjectURL === 'function') preview = URL.createObjectURL(file);
    } catch {
      // Keep the staged state accurate even when this browser cannot make a local preview.
    }
    updateImagePreview(category, preview);
    return uploaded;
  };

  const validateStep = (targetStep) => {
    const errors = [];
    if (targetStep === 1) {
      if (String(payload.business.company_name || '').trim().length < 3) errors.push('Enter a company name with at least 3 characters.');
      if (!String(payload.business.industry_key || '').trim()) errors.push('Choose a business industry.');
    }
    if (targetStep === 2) {
      const email = String(payload.storefront.store_email || '').trim();
      if (email && (!email.includes('@') || email.length > MAX_STORE_EMAIL_LENGTH)) errors.push('Enter a valid store email address.');
      if (String(payload.storefront.store_phone || '').length > MAX_PHONE_LENGTH) errors.push(`Store contact number must be ${MAX_PHONE_LENGTH} characters or fewer.`);
      if (payload.storefront.delivery_partners.length > 3) errors.push('You can add up to three delivery partners.');
    }
    if (targetStep === 3) {
      const location = payload.location || {};
      const hasAddress = Boolean(registrationLocationAddress(location));
      const hasCoordinates = hasRegistrationLocationCoordinates(location);
      if (locationCandidate) errors.push('Add your selected place as a branch location or cancel the selection before submitting.');
      if (!hasAddress || !hasCoordinates) errors.push('Search or pin a place, then add it as a branch location before submitting.');
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

  const saveDraft = (nextStep, nextPayload = payloadRef.current, { background = false } = {}) => {
    cancelPendingAutosave();
    const payloadSnapshot = normalizePayload(nextPayload);
    const revisionAtSave = payloadRevisionRef.current;
    const draftIdAtSave = draftRef.current?.id;

    const performSave = async () => {
      const currentDraft = draftRef.current;
      if (!currentDraft || !draftIdAtSave || currentDraft.id !== draftIdAtSave) return false;

      if (background) {
        setStatusMessage('Saving draft…');
        setHasDraftSaveError(false);
      } else {
        setIsSaving(true);
        setStepError('');
        setStatusMessage('Saving draft…');
        setHasDraftSaveError(false);
      }

      try {
        const saved = await updateCompanyRegistrationDraft(currentDraft.id, {
          version: currentDraft.version,
          current_step: nextStep,
          payload: payloadSnapshot
        }, token);
        const latestDraft = draftRef.current;
        if (!latestDraft || latestDraft.id !== draftIdAtSave) return false;
        const nextDraft = normalizeDraft({
          ...latestDraft,
          ...saved,
          payload: mergeSavedPayload(payloadSnapshot, saved?.payload),
          uploads: Array.isArray(saved?.uploads) ? saved.uploads : latestDraft.uploads
        });
        draftRef.current = nextDraft;
        confirmedPayloadRef.current = nextDraft.payload;
        setDraft(nextDraft);
        setMaxStep((current) => Math.max(current, nextDraft.current_step));

        if (payloadRevisionRef.current === revisionAtSave) {
          payloadRef.current = nextDraft.payload;
          savedPayloadRevisionRef.current = revisionAtSave;
          confirmedLocationRef.current = nextDraft.payload.location;
          setPayload(nextDraft.payload);
          setStatusMessage('Draft saved. You can refresh and resume.');
          setHasDraftSaveError(false);
          setDraftConflict(false);
          clearRegistrationRecovery(account?.id, nextDraft.id);
        } else {
          persistRecoverySnapshot(payloadRef.current, stepRef.current);
        }

        if (!background) {
          setStepError('');
        }
        return true;
      } catch (error) {
        if (isDraftConflictError(error)) {
          setHasDraftSaveError(false);
          setDraftConflict(true);
          setStatusMessage('Draft changed elsewhere. Review your edits or reload the latest version.');
          if (!background) setStepError('');
          return false;
        }
        setHasDraftSaveError(true);
        setStatusMessage('Draft not saved. Your edits are still here. Retry the save.');
        if (!background) setStepError(errorMessage(error, 'The draft could not be saved. Please try again.'));
        return false;
      } finally {
        if (!background) setIsSaving(false);
      }
    };

    const queuedSave = saveQueueRef.current.then(performSave, performSave);
    saveQueueRef.current = queuedSave.then(() => undefined, () => undefined);
    return queuedSave;
  };

  saveDraftRef.current = saveDraft;

  const flushDraftChanges = async (nextStep = stepRef.current, { force = false } = {}) => {
    cancelPendingAutosave();
    if (force && !await saveDraft(nextStep, payloadRef.current)) return false;

    let hasUnsavedChanges = savedPayloadRevisionRef.current < payloadRevisionRef.current;
    while (hasUnsavedChanges) {
      await saveQueueRef.current;
      hasUnsavedChanges = savedPayloadRevisionRef.current < payloadRevisionRef.current;
      if (!hasUnsavedChanges) break;
      cancelPendingAutosave();
      if (!await saveDraft(nextStep, payloadRef.current)) return false;
      hasUnsavedChanges = savedPayloadRevisionRef.current < payloadRevisionRef.current;
    }
    return true;
  };

  const addBranchLocation = async () => {
    if (!draftRef.current || isSaving || isSubmitting || !locationCandidate) return false;
    const addressLine = registrationLocationAddress(locationCandidate);
    if (!addressLine || !hasRegistrationLocationCoordinates(locationCandidate)) return false;
    if (!hasMerchantAddressDetails(locationCandidate.address_details)) return false;
    const nextPayload = {
      ...payloadRef.current,
      location: {
        ...locationCandidate,
        ...buildMerchantAddressPayload({ details: locationCandidate.address_details, location: addressLine }),
        latitude: Number(locationCandidate.latitude),
        longitude: Number(locationCandidate.longitude)
      }
    };
    const saved = await saveDraft(3, nextPayload);
    if (saved) {
      setLocationCandidateDraft(null);
      setStatusMessage('Branch location added to your registration.');
    }
    return saved;
  };

  const handleNext = async () => {
    if (isSaving || isSubmitting || !draft) return;
    const errors = validateStep(step);
    if (errors.length > 0) {
      setStepError(errors.join(' '));
      return;
    }
    if (step < 3) {
      const saved = await flushDraftChanges(step + 1, { force: true });
      if (saved) setWizardStep(step + 1);
      return;
    }
    const saved = await flushDraftChanges(step);
    if (!saved) return;
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    setIsSubmitting(true);
    setStepError('');
    try {
      const result = await submitCompanyRegistrationDraft(currentDraft.id, {
        version: currentDraft.version,
        payload: payloadRef.current,
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

  const handleBack = async () => {
    if (step <= 1 || isSaving || isSubmitting) return;
    if (await flushDraftChanges(step)) {
      setWizardStep(step - 1);
      setStepError('');
    }
  };

  const handleStepSelect = async (nextStep) => {
    if (nextStep === step || isSaving || isSubmitting) return;
    if (await flushDraftChanges(step)) {
      setWizardStep(nextStep);
      setStepError('');
    }
  };

  if (isInitializing || !draft) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 lg:min-h-0 lg:flex-1">
        <AccountSummary account={account} onSignOut={onSignOut} />
        <div className="min-w-0 space-y-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-2">
          {belowStepperContent}
          {pageError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert"><p>{pageError}</p><Button type="button" variant="outline" onClick={retryInitialize} className="mt-3 min-h-9 border-rose-300 text-rose-700"><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />Try again</Button></div> : <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Loading your registration draft…</div>}
          {footerContent}
        </div>
      </div>
    );
  }

  const stepTitle = step === 1 ? 'Business details' : step === 2 ? 'Storefront profile' : 'Location and submission';
  const canGoBack = step > 1 && !isSaving && !isSubmitting;
  const isBusy = isSaving || isSubmitting || activeUploadCount > 0;
  const finalStepReady = step !== 3 || validateStep(3).length === 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 lg:min-h-0 lg:flex-1">
      <AccountSummary account={account} onSignOut={onSignOut} />
      <StepIndicator step={step} maxStep={maxStep} onSelect={(nextStep) => { void handleStepSelect(nextStep); }} />
      <div
        ref={stepContentRef}
        role="region"
        aria-labelledby="registration-step-heading"
        tabIndex={0}
        className="min-w-0 space-y-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1A4E8D] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-2"
      >
        {belowStepperContent}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 id="registration-step-heading" className="text-2xl font-extrabold tracking-tight text-slate-900">{stepTitle}</h1>
          <div className={`flex flex-wrap items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${hasDraftSaveError ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`} role="status" aria-live="polite">
            <span>{statusMessage || 'Changes save automatically.'}</span>
            {hasDraftSaveError ? <Button type="button" variant="ghost" onClick={() => void flushDraftChanges(stepRef.current, { force: true })} disabled={isSaving || isSubmitting} className="h-6 min-h-0 px-1.5 text-xs font-extrabold text-rose-700 hover:bg-rose-100">Retry save</Button> : null}
          </div>
        </div>

        {stepError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-700" role="alert">{stepError}</div> : null}
        {draftConflict ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
            <p className="font-extrabold">This registration changed elsewhere.</p>
            <p className="mt-1 leading-6">Your local edits are still shown and have not overwritten the newer draft. Review them, then reload the latest version before continuing.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void reloadLatestDraft()}
                disabled={isReloadingDraft || isBusy}
                className="min-h-11 rounded-lg bg-[#1A4E8D] px-3 text-xs font-extrabold text-white hover:bg-[#143F73]"
              >
                {isReloadingDraft ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                {isReloadingDraft ? 'Loading latest…' : 'Reload latest'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stepContentRef.current?.focus();
                  setStatusMessage('Your local edits remain below for review.');
                }}
                disabled={isReloadingDraft}
                className="min-h-11 rounded-lg border-amber-300 bg-white px-3 text-xs font-extrabold text-amber-900 hover:bg-amber-100"
              >
                Review my unsaved edits
              </Button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-5">
            <div className="w-full space-y-5">
              <div className="space-y-1.5"><InfoLabel htmlFor="registration-company-name">Company name</InfoLabel><Input id="registration-company-name" value={payload.business.company_name || ''} onChange={(event) => updateBusiness('company_name', event.target.value.slice(0, 100))} maxLength={100} placeholder="Enter company name" disabled={isBusy} /></div>
              <IndustrySelect idPrefix="registration-industry" value={payload.business.industry_key || ''} disabled={isBusy} onSelect={(entry) => updateBusiness('industry_key', entry.key)} />
              <div className="space-y-1.5">
                <InfoLabel htmlFor="registration-industry-description">Industry (optional)</InfoLabel>
                <Input
                  id="registration-industry-description"
                  value={payload.business.industry_tag || ''}
                  onChange={(event) => updateBusiness('industry_tag', event.target.value.slice(0, 120))}
                  maxLength={120}
                  placeholder="How you describe your business"
                  disabled={isBusy}
                />
              </div>
            </div>
            <div className="w-full rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-900"><h2 className="text-base font-extrabold tracking-tight">Registration ownership</h2><p className="mt-1 text-xs leading-5">This company registration belongs to the connected DGFY account. The account email and phone are used for registration updates.</p></div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Uploaded files stay with this private draft until you submit or remove them.</span></p>
            <SectionCard>
              <StagedStorefrontImages uploads={draft.uploads} previewUrls={imagePreviews} disabled={isBusy} onUpload={handleSingleImageUpload} onRemove={removeUpload} />
            </SectionCard>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><InfoLabel htmlFor="registration-store-email">Store email</InfoLabel><Input id="registration-store-email" type="email" value={payload.storefront.store_email || ''} onChange={(event) => updateStorefront('store_email', event.target.value.slice(0, MAX_STORE_EMAIL_LENGTH))} maxLength={MAX_STORE_EMAIL_LENGTH} placeholder="store@example.com" disabled={isBusy} /></div>
              <div className="space-y-1.5"><InfoLabel htmlFor="registration-store-phone">Store contact number</InfoLabel><Input id="registration-store-phone" inputMode="tel" value={payload.storefront.store_phone || ''} onChange={(event) => updateStorefront('store_phone', event.target.value.slice(0, MAX_PHONE_LENGTH))} maxLength={MAX_PHONE_LENGTH} placeholder="09XXXXXXXXX" disabled={isBusy} /><p className="text-right text-xs text-slate-500">{String(payload.storefront.store_phone || '').length}/{MAX_PHONE_LENGTH}</p></div>
              <div className="space-y-1.5 sm:col-span-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="registration-tagline" className="text-sm font-semibold text-slate-800">Tagline</Label><span className="text-xs text-slate-500">{String(payload.storefront.tagline || '').length}/{MAX_TAGLINE_LENGTH}</span></div><Input id="registration-tagline" value={payload.storefront.tagline || ''} onChange={(event) => updateStorefront('tagline', event.target.value.slice(0, MAX_TAGLINE_LENGTH))} maxLength={MAX_TAGLINE_LENGTH} placeholder="A short line that describes your store" disabled={isBusy} /></div>
              <div className="space-y-1.5 sm:col-span-2"><div className="flex items-center justify-between gap-2"><Label htmlFor="registration-about" className="text-sm font-semibold text-slate-800">About us</Label><span className="text-xs text-slate-500">{String(payload.storefront.about || '').length}/{MAX_ABOUT_LENGTH}</span></div><textarea id="registration-about" value={payload.storefront.about || ''} onChange={(event) => updateStorefront('about', event.target.value.slice(0, MAX_ABOUT_LENGTH))} maxLength={MAX_ABOUT_LENGTH} rows={5} placeholder="Tell customers what makes your business unique" disabled={isBusy} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100" /></div>
            </div>
            <StorefrontSocialLinksSettings links={payload.storefront.social_links} onChange={(links) => updateStorefront('social_links', links)} disabled={isBusy} interactionMode="inline" platformDropdown="custom" titleHeadingLevel={2} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3 sm:space-y-5">
            <SectionCard variant="plain" title="Store Location" headerClassName="!mb-2 sm:!mb-4" className="!px-0">
              <RegistrationBranchLocationPanel
                location={payload.location}
                candidate={locationCandidate}
                onCandidateChange={handleLocationCandidateChange}
                onAddressChange={handleLocationAddressChange}
                onDetailsChange={handleLocationDetailsChange}
                onAdd={() => void addBranchLocation()}
                onCancel={() => setLocationCandidateDraft(null)}
                onChangeLocation={() => setLocationCandidateDraft(toEditableLocation(payload.location))}
                disabled={isBusy}
              />
            </SectionCard>
            <StorefrontBusinessHoursScheduler
              value={payload.hours}
              onChange={(hours) => updateSection('hours', hours)}
              compactDayLabels
              compactDaySelection
              headingLevel={2}
              hideHeadingIcon
              hideScheduleSummaryHeader
              unboxed
              registrationScheduleEditor
              disabled={isBusy}
            />
            <MenuUploadPanel uploads={draft.uploads} disabled={isBusy} onUpload={uploadFile} onRemove={removeUpload} onPendingChange={setHasMenuUploadIssues} />
            <section className="space-y-3" aria-labelledby="registration-required-agreements-heading">
              <h2 id="registration-required-agreements-heading" className="sr-only">Required agreements</h2>
              <LegalConsent id="registration-company-terms" checked={consents.company} onChange={(event) => setConsents((current) => ({ ...current, company: event.target.checked }))} disabled={isBusy || !legalReady} title="Company Registration Terms" description="I agree to the current DGFY Company Registration Terms." version={companySnapshot.company_terms_version} documents={companyDocuments.filter((document) => String(document.key || '').includes('company'))} />
              <LegalConsent id="registration-marketplace-terms" checked={consents.marketplace} onChange={(event) => setConsents((current) => ({ ...current, marketplace: event.target.checked }))} disabled={isBusy || !legalReady} title="Marketplace Terms" description="I agree to the current DGFY Marketplace Provider Terms." version={companySnapshot.marketplace_terms_version} documents={companyDocuments.filter((document) => String(document.key || '').includes('marketplace'))} />
              {!legalReady ? <p className="text-xs font-semibold text-rose-600" role="alert">Current DGFY terms are unavailable. Registration cannot be submitted until they load.</p> : null}
            </section>
          </div>
        ) : null}

        {step === 3 && !finalStepReady ? <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800" role="status">Add a branch location, set business hours, accept both required agreements, and finish any upload actions before submitting.</p> : null}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch gap-3 border-t border-slate-100 pt-5 sm:flex sm:justify-end">
          <Button type="button" variant="outline" onClick={() => { if (canGoBack) void handleBack(); }} disabled={!canGoBack} className="min-h-11 shrink-0 gap-1.5 rounded-lg px-4 font-bold"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Back</Button>
          <Button type="button" onClick={() => void handleNext()} disabled={isBusy || !draft || !finalStepReady} className="h-auto min-h-11 min-w-0 gap-1.5 rounded-lg bg-[#1A4E8D] px-3 py-2 text-center font-extrabold leading-tight text-white hover:bg-[#143F73] sm:h-11 sm:whitespace-nowrap sm:px-5 sm:py-0 sm:leading-normal">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : step === 3 ? <Check className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}{isSubmitting ? 'Submitting…' : isSaving ? 'Saving…' : step === 3 ? 'Submit registration' : 'Save and continue'}</Button>
        </div>
        {footerContent}
      </div>
    </div>
  );
}
