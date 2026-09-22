import { forwardRef, Suspense, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  CalendarDays, Camera, Check, CheckCircle2, Copy, Edit3, Info, List, Mail, MapPin,
  Maximize2, Minimize2, Move, Phone, Search,
  Plus, Save, Settings2, Star, Store, Trash2, Type, Upload, Users
} from 'lucide-react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import StorefrontBusinessHoursScheduler from '@/src/features/settings/StorefrontBusinessHoursScheduler.jsx';
import { ResponsiveImage } from '@/src/components/media/ResponsiveImage.jsx';
import { StorefrontCoverImage } from '@/src/components/media/StorefrontCoverImage.jsx';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import { normalizeCoverPhotoTransform } from '@sieitzz/shared-constants/coverPhotoTransform';
import { CUSTOMER_ACCESS_MODE_OPTIONS, CUSTOMER_ACCESS_MODE_RANK, STOREFRONT_LOCATION_LABELS } from './storefrontSettingsConstants.js';
import StorefrontCategoriesSettings from './StorefrontCategoriesSettings.jsx';
import StorefrontWhyChooseUsSettings from './StorefrontWhyChooseUsSettings.jsx';
import StorefrontSocialLinksSettings from './StorefrontSocialLinksSettings.jsx';
import StorefrontGallerySettings from './StorefrontGallerySettings.jsx';
import StorefrontDeliveryPartnersSettings from './StorefrontDeliveryPartnersSettings.jsx';
import StorefrontReviewsSettings from './StorefrontReviewsSettings.jsx';
import { STOREFRONT_TYPOGRAPHY } from './StorefrontSectionPrimitives.jsx';
import { LAST_FULFILLMENT_METHOD_LOCKED_MESSAGE } from '@sieitzz/shared-constants/orderMethods';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
  normalizeStorefrontBusinessHours
} from '@/src/features/settings/storefrontBusinessHours.js';
import { createDefaultLocationForm } from './posSettingsModels.js';

const MapPinPicker = lazyWithChunkRetry(() => import('@/src/components/maps/MapPinPicker.jsx'));
const RequiredMark = () => <span className="ml-1 text-rose-600">*</span>;
const STOREFRONT_LOCATION_DETAIL_GRID_CLASS = 'grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.85fr)]';
const STOREFRONT_LOCATION_FIELD_LABEL_CLASS = STOREFRONT_TYPOGRAPHY.fieldLabel;
const FULFILLMENT_METHOD_LOCKED_TOAST_DURATION_MS = 10000;

const STOREFRONT_SUBTABS = [
  { id: 'setup', label: 'Store Setup', icon: Settings2 },
  { id: 'content', label: 'Store Content', icon: Store },
  { id: 'locations', label: 'Business Hours and Locations', icon: MapPin },
  { id: 'reviews', label: 'Reviews', icon: Star }
];

const cloneStorefrontForm = (value) => {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
};

const displayValue = (value, fallback = 'Not set') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const displayBoolean = (value) => (value === true ? 'Enabled' : 'Disabled');

function StorefrontStatus({ enabled, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-extrabold ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function ReadOnlySection({ title, description, descriptionClassName = '', titleIcon: TitleIcon = null, titleMeta = null, children, className = '', action = null, bare = false }) {
  const sectionClassName = bare
    ? `min-w-0 ${className}`.trim()
    : `rounded-2xl border border-[#DDE8F5] bg-white p-4 sm:p-5 ${className}`;

  return (
    <section className={sectionClassName}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {TitleIcon ? <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D] lg:hidden"><TitleIcon className="h-4 w-4" aria-hidden="true" /></span> : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={STOREFRONT_TYPOGRAPHY.sectionTitle}>{title}</h3>
              {titleMeta}
            </div>
            {description ? <p className={`mt-1 max-w-prose ${STOREFRONT_TYPOGRAPHY.sectionDescription} ${descriptionClassName}`}>{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StorefrontToggle({ label, description, checked, disabled, saving, status, onChange, className = '' }) {
  return (
    <div className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 ${className}`}>
      <div className="min-w-0">
        <p className={STOREFRONT_TYPOGRAPHY.itemLabel}>{label}</p>
        {description ? <p className={`mt-0.5 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>{description}</p> : null}
        {status ? <p className={`mt-1 text-[11px] font-bold ${status === 'error' ? 'text-rose-600' : status === 'saved' ? 'text-emerald-700' : 'text-[#1A4E8D]'}`} aria-live="polite">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Could not save; restored previous value.'}</p> : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled || saving}
        onCheckedChange={onChange}
        aria-label={label}
        className={`shrink-0 focus-visible:ring-[#1A4E8D] disabled:cursor-default disabled:opacity-100 ${checked ? 'bg-[#1A4E8D]' : 'bg-slate-200'}`}
      />
    </div>
  );
}

function StorefrontDisplayOptions({ storefrontForm, canInteract, storefrontBooleanState = {}, onToggle }) {
  return (
    <section className="space-y-3 pt-4 sm:pt-6" aria-labelledby="storefront-display-options-heading">
      <h3 id="storefront-display-options-heading" className={STOREFRONT_TYPOGRAPHY.sectionTitle}>
        Display and checkout options
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StorefrontToggle
          label="Harmonized UI"
          description="Use the current DGFY storefront presentation."
          className="lg:col-span-2"
          checked={storefrontForm?.storefrontUiV2Enabled === true}
          disabled={!canInteract}
          saving={storefrontBooleanState.storefront_ui_v2_enabled === 'saving'}
          status={storefrontBooleanState.storefront_ui_v2_enabled}
          onChange={(value) => onToggle?.('storefrontUiV2Enabled', 'storefront_ui_v2_enabled', 'Harmonized UI', value)}
        />
        <StorefrontToggle
          label="Show Follow Button"
          description="Allow customers to follow this storefront."
          className="lg:col-span-2"
          checked={storefrontForm?.storefrontFollowEnabled === true}
          disabled={!canInteract}
          saving={storefrontBooleanState.storefront_follow_enabled === 'saving'}
          status={storefrontBooleanState.storefront_follow_enabled}
          onChange={(value) => onToggle?.('storefrontFollowEnabled', 'storefront_follow_enabled', 'Follow button', value)}
        />
        <StorefrontToggle
          label="Show Share Button"
          description="Allow customers to share storefront links."
          className="lg:col-span-2"
          checked={storefrontForm?.storefrontShareEnabled === true}
          disabled={!canInteract}
          saving={storefrontBooleanState.storefront_share_enabled === 'saving'}
          status={storefrontBooleanState.storefront_share_enabled}
          onChange={(value) => onToggle?.('storefrontShareEnabled', 'storefront_share_enabled', 'Share button', value)}
        />
        <StorefrontToggle
          label="Allow Guest Checkout"
          description="Let customers check out without an account."
          className="lg:col-span-3"
          checked={storefrontForm?.storefrontGuestCheckoutEnabled !== false}
          disabled={!canInteract}
          saving={storefrontBooleanState.storefront_guest_checkout_enabled === 'saving'}
          status={storefrontBooleanState.storefront_guest_checkout_enabled}
          onChange={(value) => onToggle?.('storefrontGuestCheckoutEnabled', 'storefront_guest_checkout_enabled', 'Guest checkout', value)}
        />
        <StorefrontToggle
          label="Accept Cash on Delivery/Pickup"
          description="Allow cash as a supported payment method."
          className="lg:col-span-3"
          checked={storefrontForm?.storefrontCashPaymentEnabled !== false}
          disabled={!canInteract}
          saving={storefrontBooleanState.storefront_cash_payment_enabled === 'saving'}
          status={storefrontBooleanState.storefront_cash_payment_enabled}
          onChange={(value) => onToggle?.('storefrontCashPaymentEnabled', 'storefront_cash_payment_enabled', 'Cash payment', value)}
        />
      </div>
    </section>
  );
}

function StorefrontSubtabNavigation({ activeSubtab, onChange, disabled }) {
  const sectionsViewportRef = useRef(null);
  const activeSubtabIndex = STOREFRONT_SUBTABS.findIndex((tab) => tab.id === activeSubtab);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (activeSubtabIndex <= 0 || activeSubtabIndex >= STOREFRONT_SUBTABS.length - 1) return undefined;

    const viewport = sectionsViewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return undefined;

    const activeSectionElement = document.getElementById(`pos-storefront-tab-${activeSubtab}`);
    if (!activeSectionElement || !viewport.contains(activeSectionElement)) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const viewportRect = viewport.getBoundingClientRect();
      const sectionRect = activeSectionElement.getBoundingClientRect();
      const sectionCenter = sectionRect.left - viewportRect.left + viewport.scrollLeft + (sectionRect.width / 2);
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollTo({
        left: Math.min(maxScrollLeft, Math.max(0, sectionCenter - (viewport.clientWidth / 2))),
        behavior: 'smooth'
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeSubtab, activeSubtabIndex]);

  const handleKeyDown = (event) => {
    const currentIndex = STOREFRONT_SUBTABS.findIndex((tab) => tab.id === activeSubtab);
    if (currentIndex < 0) return;

    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % STOREFRONT_SUBTABS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + STOREFRONT_SUBTABS.length) % STOREFRONT_SUBTABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = STOREFRONT_SUBTABS.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    onChange(STOREFRONT_SUBTABS[nextIndex].id);
    window.requestAnimationFrame(() => {
      document.getElementById(`pos-storefront-tab-${STOREFRONT_SUBTABS[nextIndex].id}`)?.focus();
    });
  };

  return (
    <div ref={sectionsViewportRef} role="tablist" aria-label="Storefront settings sections" className="-mx-1 overflow-x-auto">
      <div className="flex min-w-max gap-2 px-1 min-[1200px]:grid min-[1200px]:min-w-0 min-[1200px]:grid-cols-4 min-[1200px]:px-0">
        {STOREFRONT_SUBTABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubtab === tab.id;
          return (
            <button
              key={tab.id}
              id={`pos-storefront-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="pos-storefront-panel"
              tabIndex={active ? 0 : -1}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              onClick={() => onChange(tab.id)}
              className={`inline-flex min-h-10 min-w-36 w-max shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-2 text-center text-[13px] font-bold leading-4 shadow-sm transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 focus-visible:ring-offset-1 sm:px-3 min-[1200px]:min-h-9 min-[1200px]:w-full min-[1200px]:shrink min-[1200px]:whitespace-normal min-[1200px]:px-4 min-[1200px]:py-0 ${active ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-[#1A4E8D]/20 hover:bg-[#164278]' : 'border-slate-200 bg-white text-slate-600 hover:border-[#9BBBE0] hover:bg-[#F5F9FF] hover:text-[#1A4E8D]'} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CustomerAccessModeCards({ requestedMode, effectiveMode, disabled = true, saving = false, platformMaxMode = 'transaction', onChange }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Customer Access Mode options">
      {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => {
        const ModeIcon = option.icon;
        const isSelected = requestedMode === option.value;
        const isUnavailable = CUSTOMER_ACCESS_MODE_RANK[option.value] > CUSTOMER_ACCESS_MODE_RANK[platformMaxMode];
        const isDisabled = disabled || saving || isUnavailable;
        return (
          <button
            key={`storefront-summary-access-mode-${option.value}`}
            type="button"
            disabled={isDisabled}
            onClick={() => onChange?.(option.value)}
            aria-pressed={isSelected}
            aria-label={`${option.label}: ${option.description}`}
            className={`relative grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 rounded-2xl border px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-2 sm:flex sm:min-h-64 sm:flex-col sm:items-center sm:gap-0 sm:px-5 sm:py-7 sm:text-center ${isSelected ? 'border-2 border-[#1A4E8D] bg-blue-50/50' : 'border-slate-200 bg-white'} ${isDisabled ? 'cursor-default opacity-100' : 'hover:border-blue-200 hover:bg-slate-50'}`}
          >
            {isSelected ? <span className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-[#1A4E8D] text-white" aria-hidden="true"><Check className="h-5 w-5 stroke-[3]" /></span> : null}
            <span className={`row-span-2 grid h-16 w-16 shrink-0 place-items-center self-center rounded-full sm:h-20 sm:w-20 ${option.iconClassName}`} aria-hidden="true"><ModeIcon className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={1.8} /></span>
            <span className={`min-w-0 text-[14px] font-extrabold sm:mt-5 ${isSelected ? 'text-[#1A4E8D]' : 'text-[#0F172A]'}`}>{option.label}</span>
            <span className="min-w-0 text-[13px] leading-6 text-[#475569] sm:mt-3">{option.description}</span>
            {isSelected ? <span className="col-span-2 mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 sm:mt-auto"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{saving ? 'Saving automatically' : effectiveMode === option.value ? 'Applied automatically' : `Requested; effective ${effectiveMode}`}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function StoreSetupSummary({
  storefrontForm,
  storefrontPublicUrl,
  requestedCustomerAccessMode,
  effectiveCustomerAccessMode,
  customerAccessRollbackActive,
  customerAccessLimitation,
  canEditSettings,
  locked,
  loading,
  storefrontBooleanState = {},
  onToggle,
  onCustomerAccessModeChange,
  platformMaxCustomerAccessMode,
  onCopyUrl,
  onOpenStorefront,
  onGenerateStorefrontSlug,
  savingTab
}) {
  const canInteract = canEditSettings && !locked && !loading;
  const hasCustomerAccessLimitation = customerAccessRollbackActive
    || (Boolean(customerAccessLimitation) && !/currently available/i.test(String(customerAccessLimitation)));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="storefront-id-summary-heading">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h3 id="storefront-id-summary-heading" className={STOREFRONT_TYPOGRAPHY.sectionTitle}>Storefront ID and item QR links</h3>
            {storefrontForm.storeTenantSlug ? (
              <>
                <p className={`mt-1 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>This stable ID is used by Storefront item links and generated POS QR codes.</p>
                <code className="mt-2 block break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-[#1A4E8D]">{storefrontForm.storeTenantSlug}</code>
              </>
            ) : <p className="mt-1 text-[12px] leading-5 text-amber-700">No Storefront ID is saved yet. Generate one to enable customer-facing item QR codes.</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {storefrontForm.storeTenantSlug ? (
              <>
                <Button type="button" variant="outline" onClick={() => void onCopyUrl()} disabled={!storefrontPublicUrl} className="min-h-9 rounded-lg px-3 text-[12px] font-bold text-[#1A4E8D]"><Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Copy URL</Button>
                <Button type="button" variant="outline" onClick={onOpenStorefront} disabled={!storefrontPublicUrl} className="min-h-9 rounded-lg px-3 text-[12px] font-bold text-[#1A4E8D]">Open Storefront</Button>
              </>
            ) : canEditSettings ? (
              <Button type="button" onClick={() => void onGenerateStorefrontSlug()} disabled={Boolean(savingTab)} className="min-h-10 rounded-lg bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white hover:bg-[#143F73]">{savingTab === 'storefront_slug' ? 'Generating…' : 'Generate Storefront ID'}</Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3 pt-4 sm:pt-6" aria-labelledby="storefront-access-summary-heading">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-[#1A4E8D] sm:h-12 sm:w-12"><Users className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" /></div>
          <div className="min-w-0">
            <h3 id="storefront-access-summary-heading" className="text-[15px] font-extrabold tracking-tight text-[#0F172A]">Customer Access Mode</h3>
            <p className={`mt-1 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>Select a mode to apply changes automatically.</p>
          </div>
        </div>
        <CustomerAccessModeCards requestedMode={requestedCustomerAccessMode} effectiveMode={effectiveCustomerAccessMode} disabled={!canInteract} saving={savingTab === 'storefront_access_mode'} platformMaxMode={platformMaxCustomerAccessMode} onChange={onCustomerAccessModeChange} />
        {hasCustomerAccessLimitation ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">{customerAccessLimitation || 'The requested mode is temporarily limited.'}</p> : null}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <StorefrontToggle
          label="Storefront visible"
          description="Controls public storefront visibility from shared tenant settings."
          checked={storefrontForm.storeIsVisible === true}
          disabled={!canInteract}
          saving={storefrontBooleanState.store_is_visible === 'saving'}
          status={storefrontBooleanState.store_is_visible}
          onChange={(value) => onToggle?.('storeIsVisible', 'store_is_visible', 'Storefront visibility', value)}
        />
        <StorefrontToggle
          label="Searchable without map pin"
          description="Preserves the same no-location storefront behavior used in IMS."
          checked={storefrontForm.storeHasNoLocation === true}
          disabled={!canInteract}
          saving={storefrontBooleanState.store_has_no_location === 'saving'}
          status={storefrontBooleanState.store_has_no_location}
          onChange={(value) => onToggle?.('storeHasNoLocation', 'store_has_no_location', 'Map-pin search setting', value)}
        />
      </div>

      <StorefrontDisplayOptions
        storefrontForm={storefrontForm}
        canInteract={canInteract}
        storefrontBooleanState={storefrontBooleanState}
        onToggle={onToggle}
      />

    </div>
  );
}

const triggerCoverHaptic = () => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(8);
  } catch {
    // Haptic feedback is an optional enhancement and is unavailable in some WebViews.
  }
};

// A small amount of initial scale gives the crop surface room to move in both
// directions. Without it, a wide cover image fits the editor exactly at 1× and
// horizontal drags appear to do nothing until the merchant discovers zoom.
const MIN_REPOSITION_ZOOM = 1.1;

const CoverPhotoAdjustment = forwardRef(function CoverPhotoAdjustment({ coverSrc, initialTransform, disabled, onSave, onRemove }, ref) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [zoom, setZoom] = useState(1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [error, setError] = useState('');
  const [hasAdjustmentChanges, setHasAdjustmentChanges] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [repositioning, setRepositioning] = useState(false);
  const previewRef = useRef(null);
  const uploadInputRef = useRef(null);
  const actionButtonRef = useRef(null);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const source = previewUrl || coverSrc;
  const savedTransform = normalizeCoverPhotoTransform(initialTransform);
  const activeZoom = hasAdjustmentChanges ? zoom : savedTransform.scale;
  const activePositionX = hasAdjustmentChanges ? positionX : savedTransform.x;
  const activePositionY = hasAdjustmentChanges ? positionY : savedTransform.y;
  const previewUrlRef = useRef('');

  useEffect(() => () => {
    if (previewUrlRef.current && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
  }, []);

  const replacePreviewUrl = (file) => {
    if (previewUrlRef.current && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextUrl = file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : '';
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  };

  const handleFileSelection = (file) => {
    if (!file) return;
    setError('');
    setSelectedFile(file);
    replacePreviewUrl(file);
    setZoom(1);
    setPositionX(0);
    setPositionY(0);
    setHasAdjustmentChanges(true);
    setActionMenuOpen(false);
    setRepositioning(true);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    handleFileSelection(file);
  };

  const updateZoom = (nextZoom, { feedback = false } = {}) => {
    const normalizedZoom = Math.min(2.5, Math.max(1, Number(nextZoom) || 1));
    if (activeZoom === normalizedZoom) return;
    if (feedback) triggerCoverHaptic();
    setHasAdjustmentChanges(true);
    setZoom(normalizedZoom);
  };

  const handlePreviewPointerDown = (event) => {
    if (disabled || !repositioning || !source || event.target.closest?.('button,label,input')) return;
    if (activeZoom < MIN_REPOSITION_ZOOM) {
      setHasAdjustmentChanges(true);
      setZoom(MIN_REPOSITION_ZOOM);
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointersRef.current.size === 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      pinchRef.current = {
        startDistance: Math.hypot(second.x - first.x, second.y - first.y),
        startZoom: activeZoom
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      positionX: activePositionX,
      positionY: activePositionY
    };
  };

  const handlePreviewPointerMove = (event) => {
    if (disabled || !repositioning) return;
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (pinchRef.current.startDistance > 0) {
        updateZoom(pinchRef.current.startZoom * (distance / pinchRef.current.startDistance));
      }
      return;
    }
    const drag = dragRef.current;
    const preview = previewRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !preview) return;
    const bounds = preview.getBoundingClientRect();
    const horizontalDelta = ((event.clientX - drag.startX) / Math.max(bounds.width, 1)) * 200;
    const verticalDelta = ((event.clientY - drag.startY) / Math.max(bounds.height, 1)) * 200;
    setHasAdjustmentChanges(true);
    setPositionX(Math.max(-100, Math.min(100, drag.positionX + horizontalDelta)));
    setPositionY(Math.max(-100, Math.min(100, drag.positionY + verticalDelta)));
  };

  const handlePreviewPointerEnd = (event) => {
    pointersRef.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId || pointersRef.current.size === 0) dragRef.current = null;
  };

  const handlePreviewKeyDown = (event) => {
    if (disabled || !repositioning || !source) return;
    const step = event.shiftKey ? 10 : 4;
    const updates = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step]
    };
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      updateZoom(activeZoom + 0.1, { feedback: true });
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      updateZoom(activeZoom - 0.1, { feedback: true });
      return;
    }
    const [horizontalDelta, verticalDelta] = updates[event.key] || [];
    if (horizontalDelta == null) return;
    event.preventDefault();
    if (activeZoom < MIN_REPOSITION_ZOOM) setZoom(MIN_REPOSITION_ZOOM);
    setHasAdjustmentChanges(true);
    setPositionX(Math.max(-100, Math.min(100, activePositionX + horizontalDelta)));
    setPositionY(Math.max(-100, Math.min(100, activePositionY + verticalDelta)));
  };

  const handlePreviewWheel = (event) => {
    if (disabled || !repositioning || !source) return;
    event.preventDefault();
    updateZoom(activeZoom - (event.deltaY > 0 ? 0.1 : -0.1));
  };

  const handleChoosePhoto = () => {
    if (disabled) return;
    setActionMenuOpen(false);
    uploadInputRef.current?.click();
  };

  const handleReposition = () => {
    if (disabled || !source) return;
    setActionMenuOpen(false);
    if (activeZoom < MIN_REPOSITION_ZOOM) {
      setHasAdjustmentChanges(true);
      setZoom(MIN_REPOSITION_ZOOM);
    }
    setRepositioning(true);
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => previewRef.current?.focus());
    }
  };

  const handleActionMenuKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setActionMenuOpen(false);
    actionButtonRef.current?.focus();
  };

  const handleRemove = async () => {
    if (disabled || !source) return;
    const hadPersistedSource = Boolean(coverSrc);
    setActionMenuOpen(false);
    setRepositioning(false);
    setSelectedFile(null);
    replacePreviewUrl(null);
    setZoom(1);
    setPositionX(0);
    setPositionY(0);
    setHasAdjustmentChanges(false);
    setError('');
    if (hadPersistedSource) await onRemove?.();
  };

  const handleSave = useCallback(async () => {
    setError('');
    if (!hasAdjustmentChanges) return true;
    try {
      const saved = await onSave?.({
        file: selectedFile,
        transform: normalizeCoverPhotoTransform({ x: activePositionX, y: activePositionY, scale: activeZoom })
      });
      if (saved === false) return false;
      setHasAdjustmentChanges(false);
      return true;
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save the cover photo adjustment.');
      return false;
    }
  }, [activePositionX, activePositionY, activeZoom, hasAdjustmentChanges, onSave, selectedFile]);

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

  return (
    <div className="relative h-40 min-w-0 sm:h-48" aria-label="Adjust cover photo">
      <div
        ref={previewRef}
        role="group"
        aria-label="Cover photo adjustment canvas"
        aria-describedby="cover-photo-adjustment-instructions"
        tabIndex={disabled || !source || !repositioning ? -1 : 0}
        className={`absolute inset-0 overflow-hidden overscroll-contain rounded-lg border border-[#1A4E8D] bg-slate-100 ${source && !disabled && repositioning ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
        onPointerDown={handlePreviewPointerDown}
        onPointerMove={handlePreviewPointerMove}
        onPointerUp={handlePreviewPointerEnd}
        onPointerCancel={handlePreviewPointerEnd}
        onWheel={handlePreviewWheel}
        onKeyDown={handlePreviewKeyDown}
      >
        {source ? (
          <StorefrontCoverImage
            sources={{ src: source }}
            alt="Cover photo crop preview"
            hideOnError
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover transition-transform"
            draggable="false"
            transform={{ x: activePositionX, y: activePositionY, scale: activeZoom }}
          />
        ) : <div className="flex h-full items-center justify-center text-[11px] font-semibold text-[#64748B]">Choose a cover photo to begin</div>}
        <div className={`pointer-events-none absolute inset-0 transition-colors ${repositioning ? 'bg-slate-950/45' : 'bg-slate-950/20'}`} aria-hidden="true" />
        {repositioning && source ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-4" aria-hidden="true">
            <div className="inline-flex max-w-full flex-col items-center gap-0.5 rounded-lg bg-slate-950/75 px-3 py-2 text-center text-xs font-extrabold text-white shadow-lg sm:text-sm">
              <Move className="h-4 w-4 shrink-0 text-slate-200 sm:h-5 sm:w-5" aria-hidden="true" />
              <span>Drag or use arrow keys to reposition image</span>
              <span className="text-[10px] font-semibold text-slate-200 sm:text-[11px]">Scroll, pinch, or use + / − to zoom</span>
            </div>
          </div>
        ) : null}
        <div className="absolute right-2 top-12 z-20">
          <button
            type="button"
            aria-label="Cover photo editing help"
            title="Choose Edit cover photo, then Upload photo to replace the image or Reposition to drag, pinch, and zoom."
            className="group relative grid h-7 w-7 place-items-center rounded-full border border-white/80 bg-white/95 text-[#1A4E8D] shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            <span role="tooltip" className="pointer-events-none absolute right-0 top-full mt-2 w-56 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left text-[10px] font-semibold leading-4 text-[#334155] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              Choose Edit cover photo, then Upload photo to replace the image or Reposition to drag, pinch, and zoom.
            </span>
          </button>
        </div>
      </div>
      <button
        ref={actionButtonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={actionMenuOpen}
        aria-controls="cover-photo-action-menu"
        onClick={() => setActionMenuOpen((current) => !current)}
        disabled={disabled}
        className="absolute bottom-2 right-2 z-30 inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/80 bg-white/95 px-2.5 text-[11px] font-extrabold text-[#1A4E8D] shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Camera className="h-3.5 w-3.5" aria-hidden="true" />Edit cover photo
      </button>
      {actionMenuOpen ? (
        <div id="cover-photo-action-menu" role="menu" aria-label="Cover photo actions" onKeyDown={handleActionMenuKeyDown} className="absolute bottom-12 right-2 z-40 min-w-48 overflow-hidden rounded-lg border border-slate-700 bg-[#232323] p-1 shadow-xl">
          <button type="button" role="menuitem" onClick={handleChoosePhoto} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] font-semibold text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white">
            <Upload className="h-4 w-4" aria-hidden="true" />Upload photo
          </button>
          <button type="button" role="menuitem" onClick={handleReposition} disabled={!source} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] font-semibold text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-45">
            <Move className="h-4 w-4" aria-hidden="true" />Reposition
          </button>
          <div className="my-1 border-t border-slate-600" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={() => void handleRemove()} disabled={!source} className="flex min-h-10 w-full items-center gap-2 rounded-md bg-rose-500/20 px-2.5 text-left text-[12px] font-semibold text-rose-100 transition-colors hover:bg-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-45">
            <Trash2 className="h-4 w-4" aria-hidden="true" />Remove
          </button>
        </div>
      ) : null}
      <h3 id="store-image-summary-heading" className="absolute left-2 top-2 z-10 rounded-md border border-white/80 bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-[#0F172A] shadow-sm">Store Image</h3>
      <p id="cover-photo-adjustment-instructions" className="sr-only">
        Choose Edit cover photo, then Upload photo to replace the image or Reposition to drag, pinch, and zoom. Dragging starts with a small amount of scale so the image can move in either direction. Arrow keys move the image and plus/minus keys adjust zoom when the canvas is focused.
      </p>
      {repositioning ? <p className="sr-only" role="status" aria-live="polite">Reposition mode active. Drag, pinch, or use your scroll wheel to adjust the cover photo.</p> : null}
      <input ref={uploadInputRef} id="storefront-cover-adjustment-upload" type="file" accept="image/*" aria-label="Choose a cover photo" className="sr-only" disabled={disabled} onChange={handleFileChange} />
      {error ? <p className="absolute inset-x-2 bottom-12 z-20 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600 shadow-sm" role="alert">{error}</p> : null}
    </div>
  );
});

function BasicInformationEditor({ storefrontForm, disabled, onClose, onSave }) {
  const [draft, setDraft] = useState(() => cloneStorefrontForm(storefrontForm));
  const [saving, setSaving] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const handleSave = async () => {
    if (saving || disabled) return;
    setSaving(true);
    try {
      const saved = await onSave?.(draft);
      if (saved !== false) onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(nextOpen) => { if (!nextOpen) onClose?.(); }} overlayClassName="bg-black/30 backdrop-blur-none">
      <DialogContent
        id="store-basic-information-editor"
        aria-labelledby="store-basic-information-dialog-title"
        aria-describedby="store-basic-information-dialog-description"
        className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full"
      >
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <DialogTitle id="store-basic-information-dialog-title" className="text-[16px] font-extrabold text-[#0F172A]">Edit Basic Information</DialogTitle>
          <DialogDescription id="store-basic-information-dialog-description" className="mt-1 text-[12px] leading-5 text-[#64748B]">Update the text customers see on your storefront.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="grid gap-1.5">
            <Label htmlFor="storefront-basic-tagline" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Tagline</Label>
            <Input
              id="storefront-basic-tagline"
              autoFocus
              value={draft?.storefrontTagline || ''}
              maxLength={120}
              onChange={(event) => update('storefrontTagline', event.target.value)}
              className="h-9 rounded-lg border-slate-200 text-[13px] text-[#0F172A]"
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="storefront-basic-about" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>About</Label>
              <button
                type="button"
                aria-controls="storefront-basic-about"
                aria-expanded={aboutExpanded}
                onClick={() => setAboutExpanded((current) => !current)}
                className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-bold text-[#1A4E8D] transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"
              >
                {aboutExpanded ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
                {aboutExpanded ? 'Collapse field' : 'Expand field'}
              </button>
            </div>
            <textarea
              id="storefront-basic-about"
              value={draft?.storefrontAbout || ''}
              maxLength={500}
              wrap="soft"
              onChange={(event) => update('storefrontAbout', event.target.value)}
              className={`w-full max-h-[50vh] resize-y rounded-lg border border-slate-200 px-3 py-2 text-[13px] leading-5 text-[#0F172A] outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 sm:max-h-96 ${aboutExpanded ? 'min-h-[14rem] sm:min-h-[18rem]' : 'min-h-24'}`}
            />
          </div>
        </div>
        <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="min-h-9 min-w-0 flex-1 rounded-lg px-3 text-[13px] font-bold text-[#0F172A] sm:flex-none sm:text-[14px]">Cancel</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || disabled} className="min-h-9 min-w-0 flex-1 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white hover:bg-[#143F73] sm:flex-none sm:text-[14px]">{saving ? 'Saving…' : 'Save Changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StorefrontContactInformationModal({ storefrontForm, disabled = false, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({
    storefrontPhone: storefrontForm?.storefrontPhone || '',
    storefrontEmail: storefrontForm?.storefrontEmail || ''
  }));
  const [saving, setSaving] = useState(false);
  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const handleSave = async () => {
    if (saving || disabled) return;
    setSaving(true);
    try {
      const saved = await onSave?.({ ...storefrontForm, ...draft });
      if (saved !== false) onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent id="storefront-contact-information-editor" className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">Edit Storefront Contact</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">Update the mobile number and email customers see on your storefront.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 px-5 py-5 sm:px-6">
          <div className="grid gap-1.5">
            <Label htmlFor="storefront-contact-phone" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Mobile number</Label>
            <Input id="storefront-contact-phone" type="tel" inputMode="tel" value={draft.storefrontPhone} maxLength={40} onChange={(event) => update('storefrontPhone', event.target.value)} className="h-9 rounded-lg border-slate-200 text-[13px]" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="storefront-contact-email" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Email</Label>
            <Input id="storefront-contact-email" type="email" inputMode="email" value={draft.storefrontEmail} maxLength={160} onChange={(event) => update('storefrontEmail', event.target.value)} className="h-9 rounded-lg border-slate-200 text-[13px]" />
          </div>
        </div>
        <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="min-h-9 rounded-lg px-3 text-[12px] font-bold text-[#0F172A]">Cancel</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || disabled} className="min-h-9 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]">{saving ? 'Saving…' : 'Save Changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StorefrontImageEditor({ storefrontAssets, disabled, assetUploadingType = '', assetDeletingType = '', onUploadAsset, onDeleteAsset, onClose }) {
  const coverRef = useRef(null);
  const profileUploadInputRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [profileActionMenuOpen, setProfileActionMenuOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ file: null, previewUrl: '', remove: false });
  const profileBusy = assetUploadingType === 'profile' || assetDeletingType === 'profile';
  const profilePreviewSrc = profileDraft.previewUrl || (profileDraft.remove ? '' : storefrontAssets?.profile ? resolveAssetUrl(storefrontAssets.profile) : '');

  useEffect(() => () => {
    if (profileDraft.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(profileDraft.previewUrl);
    }
  }, [profileDraft.previewUrl]);

  const handleProfileFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    const previewUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
    setProfileDraft({ file, previewUrl, remove: false });
    setProfileActionMenuOpen(false);
  };

  const handleProfileRemove = () => {
    setProfileDraft({ file: null, previewUrl: '', remove: true });
    setProfileActionMenuOpen(false);
  };

  const handleProfileActionMenuKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setProfileActionMenuOpen(false);
  };

  const handleSave = async () => {
    if (saving || disabled) return;
    setSaving(true);
    try {
      const saved = await coverRef.current?.save?.();
      if (saved === false) return;
      if (profileDraft.file) {
        const profileSaved = await onUploadAsset?.('profile', profileDraft.file);
        if (profileSaved === false) return;
      } else if (profileDraft.remove && storefrontAssets?.profile) {
        const profileRemoved = await onDeleteAsset?.('profile');
        if (profileRemoved === false) return;
      }
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/30 p-3 sm:p-4" aria-label="Edit Store Image">
      <div className="space-y-3">
        <div className="relative">
          <CoverPhotoAdjustment ref={coverRef} coverSrc={storefrontAssets?.cover ? resolveAssetUrl(storefrontAssets.cover) : ''} initialTransform={storefrontAssets?.coverTransform} disabled={disabled || assetUploadingType === 'cover' || assetDeletingType === 'cover'} onSave={async ({ file, transform }) => onUploadAsset?.('cover', file, transform)} onRemove={() => onDeleteAsset?.('cover')} />
          <div className="absolute -bottom-8 left-4 h-16 w-16 rounded-full border-4 border-white bg-slate-100 shadow md:h-20 md:w-20">
            <div className="h-full w-full overflow-hidden rounded-full">{profilePreviewSrc ? <ResponsiveImage sources={{ src: profilePreviewSrc }} alt="Storefront profile preview" hideOnError className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">No icon</div>}</div>
            <input ref={profileUploadInputRef} id="storefront-profile-upload-preview" type="file" accept="image/*" className="sr-only" disabled={disabled || profileBusy} onChange={handleProfileFileChange} />
            <button type="button" aria-haspopup="menu" aria-expanded={profileActionMenuOpen} aria-controls="profile-icon-action-menu" aria-label="Change profile icon" title="Change profile icon" disabled={disabled || profileBusy} onClick={() => setProfileActionMenuOpen((current) => !current)} className="absolute bottom-0 right-0 z-20 grid h-7 w-7 translate-x-1/4 translate-y-1/4 place-items-center rounded-full border-2 border-white bg-white text-[#1A4E8D] shadow-md transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-60"><Camera className="h-3.5 w-3.5" aria-hidden="true" /></button>
            {profileActionMenuOpen ? (
              <div id="profile-icon-action-menu" role="menu" aria-label="Profile icon actions" onKeyDown={handleProfileActionMenuKeyDown} className="absolute bottom-8 left-0 z-40 min-w-44 overflow-hidden rounded-lg border border-slate-700 bg-[#232323] p-1 shadow-xl">
                <button type="button" role="menuitem" onClick={() => profileUploadInputRef.current?.click()} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] font-semibold text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"><Upload className="h-4 w-4" aria-hidden="true" />Upload photo</button>
                <button type="button" role="menuitem" onClick={handleProfileRemove} disabled={!storefrontAssets?.profile && !profileDraft.file} className="flex min-h-10 w-full items-center gap-2 rounded-md bg-rose-500/20 px-2.5 text-left text-[12px] font-semibold text-rose-100 transition-colors hover:bg-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-45"><Trash2 className="h-4 w-4" aria-hidden="true" />Remove</button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-[#64748B]"><span>Drag or zoom the cover photo after choosing Reposition.</span>{profileDraft.file ? <span className="text-[#1A4E8D]" role="status">New profile selected. Save to apply.</span> : profileDraft.remove ? <span className="text-rose-600" role="status">Profile icon will be removed when saved.</span> : null}</div>
          <div className="flex shrink-0 items-center justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={saving || profileBusy} className="min-h-9 rounded-lg px-3 text-[12px] font-bold text-[#0F172A]">Cancel</Button><Button type="button" onClick={() => void handleSave()} disabled={saving || disabled || profileBusy} className="min-h-9 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]">{saving ? 'Saving…' : 'Save Changes'}</Button></div>
        </div>
      </div>
    </div>
  );
}

function StorefrontEditIconButton({ ariaLabel, title = ariaLabel, onClick, disabled = false, expanded, controls, appearance = 'filled', className = '' }) {
  const appearanceClassName = appearance === 'outline'
    ? 'border-blue-200 bg-white text-[#1A4E8D] hover:border-blue-300 hover:bg-blue-50 hover:text-[#1A4E8D]'
    : 'border-[#1A4E8D] bg-[#1A4E8D] text-white hover:border-[#143F73] hover:bg-[#143F73] hover:text-white';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      {...(typeof expanded === 'boolean' ? { 'aria-expanded': expanded } : {})}
      {...(controls ? { 'aria-controls': controls } : {})}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${appearanceClassName} ${className}`}
    >
      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function StorefrontBusinessHoursEditPanel({ value, disabled = false, onCancel, onSave, initialComposerOpen = false, onComposerClose, inlinePreview = false }) {
  const [draft, setDraft] = useState(() => normalizeStorefrontBusinessHours(value));
  const [savedDraft, setSavedDraft] = useState(() => normalizeStorefrontBusinessHours(value));
  const [saving, setSaving] = useState(false);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(savedDraft);

  const handleCancel = () => {
    if (inlinePreview) {
      setDraft(savedDraft);
      return;
    }
    onCancel?.();
  };

  const handleSave = async () => {
    if (!hasChanges || saving || disabled || typeof onSave !== 'function') return;
    setSaving(true);
    try {
      const saved = await onSave(draft);
      if (saved !== false) {
        setSavedDraft(normalizeStorefrontBusinessHours(draft));
        if (!inlinePreview) onCancel?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleCommit = async (nextHours) => {
    if (saving || disabled || typeof onSave !== 'function') return;
    setDraft(nextHours);
    setSaving(true);
    try {
      const saved = await onSave(nextHours);
      if (saved !== false) setSavedDraft(normalizeStorefrontBusinessHours(nextHours));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="storefront-business-hours-editor" className="min-w-0" aria-label="Edit Business Hours" aria-busy={saving}>
      <StorefrontBusinessHoursScheduler
        value={draft}
        onChange={setDraft}
        onScheduleCommit={inlinePreview ? handleScheduleCommit : undefined}
        disabled={disabled || saving}
        showHeader={!inlinePreview}
        hideScheduleSummaryHeader={!inlinePreview}
        initialComposerOpen={initialComposerOpen}
        draftNotice={inlinePreview ? '' : 'This updates your Business Hours draft. Select Save Changes below to save these changes.'}
        onComposerClose={onComposerClose}
        headerContent={!inlinePreview ? (
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0">
              <h4 className={`${STOREFRONT_TYPOGRAPHY.itemLabel} max-sm:text-[11px]`}>Edit Business Hours <Edit3 className="inline h-3 w-3 text-[#2F74FF] align-[-1px] sm:hidden" aria-hidden="true" /></h4>
              <p className={`mt-0.5 max-sm:text-[9px] max-sm:leading-3 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>Update the schedule customers see on your storefront, then save when finished.</p>
            </div>
            {!hasChanges ? (
              <button
                type="button"
                aria-label="Close business hours editor"
                title="Close"
                onClick={onCancel}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-slate-100 hover:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
      />
      {inlinePreview ? (
        <p aria-live="polite" className="mt-2 text-[12px] text-slate-500">
          {saving ? 'Saving Business Hours…' : 'Business Hours changes save automatically.'}
        </p>
      ) : null}
      {hasChanges && !inlinePreview ? (
        <div className="mt-4 flex flex-col-reverse gap-2 border-t border-blue-100 pt-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={saving} className="min-h-9 w-full rounded-lg px-4 text-[12px] font-bold text-[#1A4E8D] sm:w-auto">Cancel</Button>
          <Button type="button" onClick={() => void handleSave()} disabled={disabled || saving} className="min-h-9 w-full rounded-lg bg-[#1A4E8D] px-4 text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:w-auto">
            <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BasicInformationSummary({ storefrontForm, canEdit = false, disabled = false, onSave }) {
  const [open, setOpen] = useState(false);
  const rows = [
    {
      label: 'Tagline',
      description: 'A short phrase that describes your store.',
      value: storefrontForm?.storefrontTagline,
      icon: Type
    },
    {
      label: 'About',
      description: 'A brief description about your store.',
      value: storefrontForm?.storefrontAbout,
      icon: List
    }
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-labelledby="store-basic-information-heading">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center">
          <div className="min-w-0">
            <h3 id="store-basic-information-heading" className={STOREFRONT_TYPOGRAPHY.sectionTitle}>Basic Information</h3>
            <p className={`mt-0.5 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>This information will appear on your storefront.</p>
          </div>
        </div>
        {canEdit ? <StorefrontEditIconButton ariaLabel="Edit basic information" title={open ? 'Close basic information' : 'Edit basic information'} onClick={() => setOpen((current) => !current)} disabled={disabled} expanded={open} controls="store-basic-information-editor" /> : null}
      </div>
      {open ? <BasicInformationEditor storefrontForm={storefrontForm} disabled={disabled} onClose={() => setOpen(false)} onSave={onSave} /> : null}
      <div className="mt-3 space-y-2">
        {rows.map(({ label, description, value, icon: Icon }) => (
          <div key={label} className="grid min-w-0 gap-3 px-3 py-3 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:items-center sm:px-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]" aria-hidden="true"><Icon className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className={STOREFRONT_TYPOGRAPHY.itemLabel}>{label}</p>
                <p className={`mt-0.5 ${STOREFRONT_TYPOGRAPHY.helper}`}>{description}</p>
              </div>
            </div>
            <p className="min-w-0 break-words text-[12px] font-semibold leading-5 text-[#334155] sm:border-l sm:border-slate-200 sm:pl-4">{displayValue(value)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const normalizeStoreContentStringList = (value) => (Array.isArray(value)
  ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  : []);

export function StorefrontContentSaveBar({ canEdit, savingTab, onCancel, onSave }) {
  const saving = savingTab === 'storefront_content';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={saving}
      className="pointer-events-none fixed bottom-4 z-[70]"
      style={{
        left: 'calc(var(--pos-main-left, 0px) + 0.75rem)',
        right: '0.75rem',
        bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))'
      }}
    >
      <div className="pointer-events-auto flex w-full flex-col gap-3 rounded-xl border border-blue-200 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.18)] sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <p className={STOREFRONT_TYPOGRAPHY.itemLabel}>Unsaved Store Content changes</p>
          <p className={`mt-0.5 ${STOREFRONT_TYPOGRAPHY.helper}`}>Save when you are finished editing the storefront content.</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={Boolean(savingTab)} className="min-h-9 min-w-0 flex-1 rounded-lg px-3 text-[12px] font-bold text-[#1A4E8D] sm:flex-none">Cancel</Button>
          <Button type="button" onClick={() => void onSave()} disabled={!canEdit || Boolean(savingTab)} className="min-h-9 min-w-0 flex-1 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:flex-none">
            <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StoreContentSummary({ storefrontForm, setStorefrontForm, storefrontAssets, storefrontLocations = [], canEditSettings, locked, loading, assetUploadingType = '', assetDeletingType = '', onGroupSave, onUploadGalleryImage, onUploadAsset, onDeleteAsset }) {
  const categoryCount = normalizeStoreContentStringList(storefrontForm?.storefrontCategories).length;
  const categoriesFitBesideWhy = categoryCount >= 1 && categoryCount <= 5;
  const primaryLocation = storefrontLocations.find((location) => location?.is_primary_storefront === true) || storefrontLocations[0] || null;
  const storefrontName = displayValue(storefrontForm?.storefrontName || storefrontForm?.storeName || primaryLocation?.name || storefrontForm?.storeTenantSlug, 'Storefront');
  const storefrontIsActive = storefrontForm?.storeIsVisible === true;
  const canInteract = canEditSettings && !locked && !loading;
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [contactInformationEditorOpen, setContactInformationEditorOpen] = useState(false);
  const saveGroup = (group, nextForm = storefrontForm) => onGroupSave?.(group, nextForm);

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={STOREFRONT_TYPOGRAPHY.pageTitle}>Store Content</h2>
          <p className={`mt-1 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>Review the storefront groups and save all content updates together when you are finished.</p>
        </div>
      </div>
      {imageEditorOpen ? (
        <StorefrontImageEditor storefrontAssets={storefrontAssets} disabled={!canInteract} assetUploadingType={assetUploadingType} assetDeletingType={assetDeletingType} onUploadAsset={onUploadAsset} onDeleteAsset={onDeleteAsset} onClose={() => setImageEditorOpen(false)} />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-labelledby="store-image-summary-heading">
          <>
            <div className="relative min-w-0">
              <div className="relative h-40 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:h-48">
                <h3 id="store-image-summary-heading" className="absolute left-2 top-2 z-10 rounded-md border border-white/80 bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-[#0F172A] shadow-sm">Store Image</h3>
                {storefrontAssets?.cover ? <StorefrontCoverImage sources={{ src: resolveAssetUrl(storefrontAssets.cover) }} transform={storefrontAssets?.coverTransform} alt="Storefront cover preview" hideOnError className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-[#64748B]">No cover photo uploaded</div>}
              </div>
              {canEditSettings ? <StorefrontEditIconButton ariaLabel="Edit Store Image" title="Edit Store Image" onClick={() => setImageEditorOpen(true)} className="absolute right-2 top-2" /> : null}
              <div className="absolute -bottom-8 left-4 h-16 w-16 rounded-full border-4 border-white bg-slate-100 shadow-md sm:h-20 sm:w-20">
                <div className="h-full w-full overflow-hidden rounded-full">
                  {storefrontAssets?.profile ? <ResponsiveImage sources={{ src: resolveAssetUrl(storefrontAssets.profile) }} alt="Storefront profile preview" hideOnError className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#64748B]">No icon</div>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-10 text-[11px] font-semibold text-[#64748B]">
              <span>Cover photo</span><span aria-hidden="true">·</span><span>Profile icon</span>
            </div>
          </>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-labelledby="store-information-summary-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id="store-information-summary-heading" className={STOREFRONT_TYPOGRAPHY.sectionTitle}>Information</h3>
          {canEditSettings ? <StorefrontEditIconButton ariaLabel="Edit storefront contact information" title="Edit storefront contact information" onClick={() => setContactInformationEditorOpen(true)} disabled={!canInteract} expanded={contactInformationEditorOpen} controls="storefront-contact-information-editor" /> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-6">
          <div className="flex min-w-0 items-center gap-3 px-1 py-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]" aria-hidden="true"><Store className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8399BA]">Information</p>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                <p className={`min-w-0 truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`} title={storefrontName}>{storefrontName}</p>
                <StorefrontStatus enabled={storefrontIsActive}>{storefrontIsActive ? 'Active' : 'Inactive'}</StorefrontStatus>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 px-1 py-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]" aria-hidden="true"><Phone className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className={`truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`} title={displayValue(storefrontForm?.storefrontPhone)}>{displayValue(storefrontForm?.storefrontPhone)}</p>
              <p className={`mt-0.5 ${STOREFRONT_TYPOGRAPHY.helper}`}>Mobile</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3 px-1 py-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]" aria-hidden="true"><Mail className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className={`truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`} title={displayValue(storefrontForm?.storefrontEmail)}>{displayValue(storefrontForm?.storefrontEmail)}</p>
              <p className={`mt-0.5 ${STOREFRONT_TYPOGRAPHY.helper}`}>Email</p>
            </div>
          </div>
        </div>
        {contactInformationEditorOpen ? <StorefrontContactInformationModal storefrontForm={storefrontForm} disabled={!canInteract} onClose={() => setContactInformationEditorOpen(false)} onSave={async (nextForm) => {
          return saveGroup('basic', nextForm);
        }} /> : null}
      </section>

      <BasicInformationSummary
        storefrontForm={storefrontForm}
        canEdit={canInteract}
        disabled={!canInteract}
        onSave={async (nextForm) => {
          return saveGroup('basic', nextForm);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <div className={categoriesFitBesideWhy ? 'min-w-0' : 'min-w-0 lg:col-span-2'}>
          <StorefrontCategoriesSettings className="h-full" categories={storefrontForm.storefrontCategories} disabled={!canInteract} onChange={(nextCategories) => setStorefrontForm?.((current) => ({ ...current, storefrontCategories: nextCategories }))} />
        </div>
        <div className={categoriesFitBesideWhy ? 'min-w-0' : 'min-w-0 lg:col-span-2'}>
          <StorefrontWhyChooseUsSettings interactionMode="modal" className="h-full" phrases={storefrontForm.storefrontWhyChooseUs} disabled={!canInteract} onChange={(nextPhrases) => setStorefrontForm?.((current) => ({ ...current, storefrontWhyChooseUs: nextPhrases }))} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <StorefrontSocialLinksSettings interactionMode="modal" links={{ messenger: storefrontForm.storefrontSocialMessenger, facebook: storefrontForm.storefrontSocialFacebook, instagram: storefrontForm.storefrontSocialInstagram }} disabled={!canInteract} onChange={(nextLinks) => setStorefrontForm?.((current) => ({ ...current, storefrontSocialMessenger: nextLinks.messenger || '', storefrontSocialFacebook: nextLinks.facebook || '', storefrontSocialInstagram: nextLinks.instagram || '' }))} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <StorefrontDeliveryPartnersSettings partners={storefrontForm.storefrontDeliveryPartners} disabled={!canInteract} onChange={(nextPartners) => setStorefrontForm?.((current) => ({ ...current, storefrontDeliveryPartners: nextPartners }))} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <StorefrontGallerySettings images={storefrontForm.storefrontGalleryImages} disabled={!canInteract} loading={loading} assetUploadingType={assetUploadingType} onChange={(nextImages) => setStorefrontForm?.((current) => ({ ...current, storefrontGalleryImages: nextImages }))} onUploadImage={onUploadGalleryImage} />
        </div>
      </div>

    </div>
  );
}

function StorefrontGroupEditor({
  group,
  storefrontForm,
  setStorefrontForm,
  storefrontAssets,
  locked,
  loading,
  canEdit,
  coverAdjustmentRef,
  assetUploadingType,
  assetDeletingType,
  handleUploadAsset,
  handleDeleteAsset,
  handleGalleryAssetUpload,
  onSave,
  onCancel,
  savingTab,
  hidden = false
}) {
  if (!group || group === 'all') return null;
  const labels = {
    image: 'Store Image',
    basic: 'Basic Information',
    categories: 'Store Categories',
    why: 'Why Choose Us',
    social: 'Social Links',
    gallery: 'Gallery',
    delivery: 'Delivery Partners'
  };
  const title = labels[group] || 'Store Content';
  const saveLabel = `Save ${title}`;

  return (
    <div className={`${hidden ? 'hidden ' : ''} space-y-6`} aria-label={`${title} editor`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-extrabold tracking-tight text-[#0F172A]">{title}</h2>
          <p className="mt-1 text-[12px] leading-5 text-[#64748B]">Edit this storefront group, then save it without changing the other groups.</p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#1A4E8D]">Editing</span>
      </div>

      {group === 'image' ? (
        <section className="border-b border-slate-200 pb-6" aria-labelledby="store-image-editor-heading">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="relative min-w-0">
              <CoverPhotoAdjustment
                ref={coverAdjustmentRef}
                coverSrc={storefrontAssets.cover ? resolveAssetUrl(storefrontAssets.cover) : ''}
                initialTransform={storefrontAssets.coverTransform}
                disabled={locked || assetUploadingType === 'cover' || assetDeletingType === 'cover'}
                onSave={async ({ file, transform }) => handleUploadAsset('cover', file, transform)}
                onRemove={() => handleDeleteAsset('cover')}
              />
              <div className="absolute -bottom-8 left-4 h-16 w-16 rounded-full border-4 border-white bg-slate-100 shadow md:h-20 md:w-20">
                <div className="h-full w-full overflow-hidden rounded-full">
              {storefrontAssets.profile ? <ResponsiveImage sources={{ src: resolveAssetUrl(storefrontAssets.profile) }} alt="Storefront profile preview" hideOnError className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500 md:text-xs">No icon</div>}
                </div>
                <input id="storefront-profile-upload-edit" type="file" accept="image/*" className="sr-only" disabled={locked || assetUploadingType === 'profile' || assetDeletingType === 'profile'} onChange={(event) => { const file = event.target.files?.[0] || null; event.target.value = ''; if (file) void handleUploadAsset('profile', file); }} />
                <label htmlFor="storefront-profile-upload-edit" className="absolute bottom-0 right-0 z-20 grid h-7 w-7 translate-x-1/4 translate-y-1/4 cursor-pointer place-items-center rounded-full border-2 border-white bg-white text-[#1A4E8D] shadow-md transition-colors hover:bg-blue-50" aria-label="Change profile icon"><Camera className="h-3.5 w-3.5" aria-hidden="true" /></label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-10 text-[11px] font-semibold text-[#64748B]"><span>Cover photo</span><span aria-hidden="true">·</span><span>Profile icon</span><Button type="button" variant="outline" aria-label="Remove profile icon" title="Remove profile icon" className="h-7 w-7 rounded-full border-rose-200 bg-rose-50 p-0 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-rose-500" disabled={locked || !storefrontAssets.profile || assetUploadingType === 'profile' || assetDeletingType === 'profile'} onClick={() => handleDeleteAsset('profile')}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button></div>
          </div>
        </section>
      ) : null}

      {group === 'basic' ? (
        <section className="border-b border-slate-200 pb-6" aria-labelledby="storefront-basic-editor-heading">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2"><Label className="text-[12px] font-extrabold text-[#0F172A]">Tagline</Label><Input className="h-9 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontTagline} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontTagline: event.target.value }))} disabled={locked || loading} /></div>
            <div className="grid gap-2"><Label className="text-[12px] font-extrabold text-[#0F172A]">Phone</Label><Input className="h-9 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontPhone} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontPhone: event.target.value }))} disabled={locked || loading} /></div>
            <div className="grid gap-2"><Label className="text-[12px] font-extrabold text-[#0F172A]">Email</Label><Input className="h-9 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontEmail} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontEmail: event.target.value }))} disabled={locked || loading} /></div>
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 p-3"><StorefrontBusinessHoursScheduler disabled={!canEdit} value={storefrontForm.storefrontHours} onChange={(nextHours) => setStorefrontForm((current) => ({ ...current, storefrontHours: nextHours }))} /></div>
          <div className="mt-4 grid gap-2"><Label className="text-[12px] font-extrabold text-[#0F172A]">About</Label><textarea className="min-h-[96px] rounded-lg border border-slate-200 px-3 py-2 text-[13px]" value={storefrontForm.storefrontAbout} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontAbout: event.target.value }))} disabled={locked || loading} /></div>
        </section>
      ) : null}

      {group === 'categories' ? <StorefrontCategoriesSettings categories={storefrontForm.storefrontCategories} disabled={!canEdit} onChange={(nextCategories) => setStorefrontForm((current) => ({ ...current, storefrontCategories: nextCategories }))} /> : null}
      {group === 'why' ? <StorefrontWhyChooseUsSettings interactionMode="modal" phrases={storefrontForm.storefrontWhyChooseUs} disabled={!canEdit} onChange={(nextPhrases) => setStorefrontForm((current) => ({ ...current, storefrontWhyChooseUs: nextPhrases }))} /> : null}
      {group === 'social' ? <StorefrontSocialLinksSettings links={{ messenger: storefrontForm.storefrontSocialMessenger, facebook: storefrontForm.storefrontSocialFacebook, instagram: storefrontForm.storefrontSocialInstagram }} disabled={!canEdit} onChange={(nextLinks) => setStorefrontForm((current) => ({ ...current, storefrontSocialMessenger: nextLinks.messenger || '', storefrontSocialFacebook: nextLinks.facebook || '', storefrontSocialInstagram: nextLinks.instagram || '' }))} /> : null}
      {group === 'gallery' ? <StorefrontGallerySettings images={storefrontForm.storefrontGalleryImages} disabled={!canEdit} loading={loading} assetUploadingType={assetUploadingType} onChange={(nextImages) => setStorefrontForm((current) => ({ ...current, storefrontGalleryImages: nextImages }))} onUploadImage={handleGalleryAssetUpload} /> : null}
      {group === 'delivery' ? <StorefrontDeliveryPartnersSettings partners={storefrontForm.storefrontDeliveryPartners} disabled={!canEdit} onChange={(nextPartners) => setStorefrontForm((current) => ({ ...current, storefrontDeliveryPartners: nextPartners }))} /> : null}
      <div className="flex flex-row justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={Boolean(savingTab)} className="min-h-9 min-w-0 flex-1 rounded-lg px-4 text-[12px] font-bold text-[#1A4E8D] sm:flex-none">Cancel</Button>
        <Button type="button" onClick={() => void onSave()} disabled={!canEdit || Boolean(savingTab) || assetUploadingType === 'cover' || assetDeletingType === 'cover' || String(assetUploadingType || '').startsWith('gallery-')} className="min-h-9 min-w-0 flex-1 rounded-lg bg-[#1A4E8D] px-4 text-[12px] font-bold text-white hover:bg-[#143F73] sm:flex-none"><Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{savingTab ? 'Saving…' : saveLabel}</Button>
      </div>
    </div>
  );
}

function StorefrontBusinessHoursSection({ hours, canEditSettings, onSaveBusinessHours, editingBranch = false }) {
  return (
    <section className="min-w-0 border-0 bg-transparent p-0" aria-labelledby="business-hours-heading">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D] lg:hidden"><CalendarDays className="h-4 w-4" aria-hidden="true" /></span>
        <h3 id="business-hours-heading" className={`${STOREFRONT_TYPOGRAPHY.sectionTitle} shrink-0`}>{editingBranch ? 'Edit Business Hours' : 'Business Hours'}</h3>
      </div>
      {editingBranch ? <p className={`mt-1 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>Update the schedule customers see on your storefront. Changes save automatically.</p> : null}
      <div className="mt-4 min-w-0">
        <StorefrontBusinessHoursEditPanel
          value={hours}
          disabled={!canEditSettings}
          inlinePreview
          onSave={onSaveBusinessHours}
        />
      </div>
    </section>
  );
}

function StoreLocationsSummary({ storefrontForm, storefrontLocations, canEditSettings, onAddLocation, onEditLocation, selectedLocationId, onSelectLocation, onSaveBusinessHours }) {
  const [searchTerm, setSearchTerm] = useState('');
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const hours = storefrontForm?.storefrontHours;
  const filteredLocations = storefrontLocations.filter((location) => {
    if (!normalizedSearchTerm) return true;
    return [location.name, location.address_line]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearchTerm));
  });
  const selectedLocation = storefrontLocations.find((location) => location.location_id === selectedLocationId) || storefrontLocations[0] || null;
  const orderMethods = selectedLocation ? [
    selectedLocation.supports_delivery !== false && 'Delivery',
    selectedLocation.supports_pickup !== false && 'Pickup',
    selectedLocation.scheduling_enabled !== false && 'Scheduled',
    selectedLocation.immediate_fulfillment_enabled !== false && 'Immediate'
  ].filter(Boolean) : [];
  return (
    <div className="space-y-5 lg:space-y-8">
      <StorefrontBusinessHoursSection hours={hours} canEditSettings={canEditSettings} onSaveBusinessHours={onSaveBusinessHours} />

      <ReadOnlySection
        title="Storefront Locations"
        titleMeta={<span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-[#1A4E8D] lg:hidden" aria-hidden="true">{storefrontLocations.length}</span>}
        className="relative"
        bare
      >
        {storefrontLocations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-[12px] text-[#64748B]">
          <p>No storefront locations configured.</p>
          {canEditSettings ? <Button type="button" onClick={onAddLocation} className="mt-3 min-h-9 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-bold text-white hover:bg-[#143F73]">{STOREFRONT_LOCATION_LABELS.addLocation}</Button> : null}
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 lg:gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <aside className="min-w-0 border-0 bg-transparent p-0 lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-3 xl:p-4" aria-label="Storefront locations list">
            <div className="hidden items-center justify-between gap-2 lg:flex">
              <div className="flex min-w-0 items-center gap-2">
                <h4 className={`truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`}>Branches</h4>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-[#1A4E8D]">{storefrontLocations.length}</span>
              </div>
              <span className="text-[11px] font-semibold text-[#64748B]">{filteredLocations.length} shown</span>
            </div>
            <label className="relative mt-3 hidden lg:block">
              <span className="sr-only">Search branches</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8399BA]" aria-hidden="true" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search branches..." className="h-9 w-full min-w-0 rounded-lg border-slate-200 pl-9 text-[12px]" />
            </label>
            <div className="mt-3 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:block lg:max-h-[420px] lg:space-y-2 lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1 lg:pb-0">
              {filteredLocations.length > 0 ? filteredLocations.map((location) => {
                const isSelected = selectedLocation?.location_id === location.location_id;
                return (
                  <button
                    key={`pos-storefront-location-summary-${location.location_id}`}
                    type="button"
                    onClick={() => onSelectLocation?.(location.location_id)}
                    aria-pressed={isSelected}
                    className={`w-[176px] shrink-0 rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] sm:w-[180px] sm:p-3 lg:w-full lg:shrink lg:p-3 ${isSelected ? 'border-[#9FC4FF] bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}
                  >
                    <div className="flex min-w-0 items-start gap-2 lg:gap-2.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg lg:h-8 lg:w-8 ${isSelected ? 'bg-[#1A4E8D] text-white' : 'bg-blue-50 text-[#1A4E8D]'}`}><Store className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1">
                          <span className="min-w-0 truncate text-[11px] font-bold leading-4 text-[#0F172A] lg:text-[13px]">{displayValue(location.name, 'Unnamed location')}</span>
                          {location.is_primary_storefront === true ? <span className="shrink-0 rounded-full bg-emerald-50 px-1 py-0.5 text-[9px] font-extrabold leading-3 text-emerald-700 lg:hidden">{STOREFRONT_LOCATION_LABELS.primaryLocation}</span> : null}
                        </span>
                        <span className={`mt-0.5 truncate text-[10px] leading-4 text-[#64748B] lg:mt-1 lg:text-[11px] ${isSelected ? 'hidden lg:block' : 'block'}`}>{displayValue(location.address_line, 'No address specified')}</span>
                      </span>
                    </div>
                    <span className="mt-1 hidden flex-wrap items-center gap-1.5 pl-9 text-[10px] font-bold lg:mt-2 lg:flex lg:pl-10 lg:text-[11px]">
                      <span className={`hidden items-center gap-1 lg:inline-flex ${location.is_active === true ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${location.is_active === true ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />{location.is_active === true ? STOREFRONT_LOCATION_LABELS.active : STOREFRONT_LOCATION_LABELS.inactive}</span>
                      {location.is_primary_storefront === true ? <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{STOREFRONT_LOCATION_LABELS.primaryLocation}</span> : null}
                    </span>
                  </button>
                );
              }) : <p className={`rounded-lg bg-slate-50 px-3 py-5 text-center ${STOREFRONT_TYPOGRAPHY.helper}`}>No branches match your search.</p>}
            </div>
            {canEditSettings ? <Button type="button" onClick={onAddLocation} variant="outline" className="absolute right-0 top-0 h-8 min-h-8 rounded-lg border-blue-200 px-2.5 py-1 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50 lg:static lg:mt-3 lg:h-10 lg:min-h-9 lg:w-full lg:px-3 lg:py-2 lg:text-[12px]"><Plus className="mr-1 h-3.5 w-3.5 lg:mr-1.5" aria-hidden="true" />{STOREFRONT_LOCATION_LABELS.addLocation}</Button> : null}
          </aside>

          {selectedLocation ? (
            <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white lg:p-3 xl:p-4">
              <div className="flex min-w-0 items-start justify-between gap-2 border-b border-slate-100 p-3 sm:gap-3 lg:p-0 lg:pb-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1A4E8D]"><Store className="h-4 w-4" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <h4 className={`truncate ${STOREFRONT_TYPOGRAPHY.sectionTitle}`}>{displayValue(selectedLocation.name, 'Unnamed location')}</h4>
                      {selectedLocation.is_primary_storefront === true ? <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700 lg:hidden">{STOREFRONT_LOCATION_LABELS.primaryLocation}</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      {selectedLocation.is_primary_storefront === true ? <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 lg:inline-flex">{STOREFRONT_LOCATION_LABELS.primaryLocation}</span> : null}
                      <span className={`inline-flex items-center gap-1 ${selectedLocation.is_active === true ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${selectedLocation.is_active === true ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />{selectedLocation.is_active === true ? STOREFRONT_LOCATION_LABELS.active : STOREFRONT_LOCATION_LABELS.inactive}</span>
                    </div>
                  </div>
                </div>
                {canEditSettings ? <Button type="button" variant="outline" onClick={() => onEditLocation(selectedLocation)} className="h-8 min-h-8 shrink-0 rounded-lg border-blue-200 px-2.5 py-1 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50 lg:h-10 lg:min-h-9 lg:px-3 lg:py-2 lg:text-[12px]" aria-label={`${STOREFRONT_LOCATION_LABELS.editBranch}: ${selectedLocation.name || 'location'}`} title={STOREFRONT_LOCATION_LABELS.editBranch}><Edit3 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{STOREFRONT_LOCATION_LABELS.editBranch}</Button> : null}
              </div>
              <div className={`mt-0 ${STOREFRONT_LOCATION_DETAIL_GRID_CLASS} lg:mt-3`}>
                <div className="min-w-0 overflow-hidden border-b border-slate-200 bg-slate-50 lg:rounded-lg lg:border" aria-label={`Map preview for ${selectedLocation.name || 'location'}`}>
                  <div className="pointer-events-none">
                    <Suspense fallback={<div className="flex h-[260px] items-center justify-center text-[11px] text-[#64748B] sm:h-[340px] lg:h-[420px]">Loading map preview…</div>}>
                      <MapPinPicker readOnly latitude={selectedLocation.latitude} longitude={selectedLocation.longitude} deliveryRadiusKm={selectedLocation.delivery_radius_km} addressLine={selectedLocation.address_line} onChange={() => {}} />
                    </Suspense>
                  </div>
                </div>
                <div className="min-w-0 border-t border-slate-100 p-3 lg:rounded-lg lg:border lg:p-3">
                  <h5 className={STOREFRONT_TYPOGRAPHY.itemLabel}>Branch Information</h5>
                  <dl className="mt-3 divide-y divide-slate-100 text-[12px]">
                    <div className="py-2 first:pt-0"><dt className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>{STOREFRONT_LOCATION_LABELS.address}</dt><dd className="mt-1 break-words font-semibold leading-4 text-[#334155]">{displayValue(selectedLocation.address_line, 'No address specified')}</dd></div>
                    <div className="flex items-center justify-between gap-2 py-2"><dt className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>{STOREFRONT_LOCATION_LABELS.deliveryRadius}</dt><dd className="font-extrabold text-[#0F172A]">{displayValue(selectedLocation.delivery_radius_km, '0')}</dd></div>
                    <div className="flex items-center justify-between gap-2 py-2"><dt className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>{STOREFRONT_LOCATION_LABELS.estimatedWaitTime}</dt><dd className="font-extrabold text-[#0F172A]">{displayValue(selectedLocation.current_wait_time_minutes, '0')}</dd></div>
                    <div className="flex items-center justify-between gap-2 py-2"><dt className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>Accepting orders</dt><dd><StorefrontStatus enabled={selectedLocation.is_active === true && selectedLocation.is_open === true}>{selectedLocation.is_active === true && selectedLocation.is_open === true ? 'Active' : 'Paused'}</StorefrontStatus></dd></div>
                    <div className="flex items-center justify-between gap-2 py-2 last:pb-0"><dt className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>Primary location</dt><dd className="font-extrabold text-[#0F172A]">{selectedLocation.is_primary_storefront === true ? 'Yes' : 'No'}</dd></div>
                  </dl>
                  <div className="mt-3 border-t border-slate-100 pt-3"><p className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>Order methods</p><div className="mt-1.5 flex flex-wrap gap-1.5">{orderMethods.length > 0 ? orderMethods.map((method) => <span key={method} className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-[#1A4E8D]">{method}</span>) : <span className="text-[11px] font-semibold text-[#64748B]">None enabled</span>}</div><p className={`mt-3 ${STOREFRONT_LOCATION_FIELD_LABEL_CLASS}`}>Out-of-stock sales</p><p className="mt-1 text-[12px] font-semibold text-[#334155]">{displayBoolean(selectedLocation.allow_out_of_stock_sales === true)}</p></div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        )}
      </ReadOnlySection>
    </div>
  );
}

export default function PosStorefrontSettingsPane({
  storefrontForm, setStorefrontForm, storefrontAssets, storefrontPublicUrl, storefrontLocationRequired,
  storefrontTenantId = '',
  editingLocationId = null,
  readOnly = false,
  settingsSurface = 'pos',
  editorSection = 'storefront',
  startWithNewLocation = false,
  locationEditorOnly = false,
  activeSubtab: controlledActiveSubtab, onActiveSubtabChange, selectedLocationId: controlledSelectedLocationId, onSelectedLocationChange,
  hasActivePrimaryStorefrontLocation, requestedCustomerAccessMode, effectiveCustomerAccessMode, platformMaxCustomerAccessMode,
  customerAccessRollbackActive, customerAccessLimitation, locked, loading, savingTab, canEditSettings,
  handleStorefrontSave, handleStorefrontGroupSave, handleCopyStorefrontUrl, handleGenerateStorefrontSlug, handleCustomerAccessModeChange,
  handleUploadAsset, handleDeleteAsset, handleGalleryAssetUpload, assetUploadingType, assetDeletingType,
  storefrontLocations, locationsLoading, locationSaving, locationForm, setLocationForm,
  loadStorefrontLocations, resetLocationForm, handleEditLocation, handleSetPrimaryLocation, handleDeactivateLocation,
  handleReactivateLocation, handleDeleteLocation, handleLocationPinChange, leadTimeRequiredMissing, leadTimeRangeInverted,
  lastFulfillmentMethodLocked, handleSaveLocation, handleStorefrontBooleanChange, storefrontBooleanState = {},
  storefrontContentDirty = false, onStorefrontContentNavigationRequest, onDirtyChange = () => {}, expansionScrollParentRef = null
}) {
  const [localActiveSubtab, setLocalActiveSubtab] = useState('setup');
  const [isEditing, setIsEditing] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const handleFulfillmentMethodChange = useCallback((field, value) => {
    if (value === false && lastFulfillmentMethodLocked) {
      toast.warning(LAST_FULFILLMENT_METHOD_LOCKED_MESSAGE, {
        duration: FULFILLMENT_METHOD_LOCKED_TOAST_DURATION_MS
      });
      return;
    }
    setLocationForm((current) => ({ ...current, [field]: value !== false }));
  }, [lastFulfillmentMethodLocked, setLocationForm]);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [locationEditSnapshot, setLocationEditSnapshot] = useState(() => (
    startWithNewLocation ? cloneStorefrontForm(createDefaultLocationForm()) : null
  ));
  const [localSelectedLocationId, setLocalSelectedLocationId] = useState(null);
  const [locationSearchTerm, setLocationSearchTerm] = useState('');
  const coverAdjustmentRef = useRef(null);
  const storefrontLocationsBoundaryRef = useRef(null);
  const activeSubtab = controlledActiveSubtab ?? localActiveSubtab;
  const setActiveSubtab = onActiveSubtabChange || setLocalActiveSubtab;
  const selectedLocationId = controlledSelectedLocationId ?? localSelectedLocationId;
  const setSelectedLocationId = onSelectedLocationChange || setLocalSelectedLocationId;
  const canEdit = canEditSettings && !readOnly && !locked && !loading;
  const autoStartLocationEditor = startWithNewLocation && !readOnly && !loading;
  const viewActiveSubtab = autoStartLocationEditor ? 'locations' : activeSubtab;
  const viewIsEditing = autoStartLocationEditor || isEditing;
  const setupActive = viewActiveSubtab === 'setup';
  const contentActive = viewActiveSubtab === 'content';
  const locationsActive = viewActiveSubtab === 'locations';
  const reviewsActive = viewActiveSubtab === 'reviews';
  const categoryCount = normalizeStoreContentStringList(storefrontForm?.storefrontCategories).length;
  const categoriesFitBesideWhy = categoryCount >= 1 && categoryCount <= 5;
  const normalizedLocationSearchTerm = locationSearchTerm.trim().toLowerCase();
  const filteredStorefrontLocations = (Array.isArray(storefrontLocations) ? storefrontLocations : []).filter((location) => {
    if (!normalizedLocationSearchTerm) return true;
    return [location.name, location.address_line]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedLocationSearchTerm));
  });
  const locationEditorOnlySurface = settingsSurface !== 'business-admin' || readOnly || startWithNewLocation;
  const showLocationEditorOnly = locationEditorOnly && locationEditorOnlySurface;
  const locationPluralLabel = editorSection === 'branches' ? 'Branches' : 'Storefront Locations';
  const locationEditorTitle = editingLocationId
    ? STOREFRONT_LOCATION_LABELS.editBranch
    : STOREFRONT_LOCATION_LABELS.addBranch;
  const locationDirty = Boolean(
    locationsActive
    && viewIsEditing
    && locationEditSnapshot
    && JSON.stringify(locationForm) !== JSON.stringify(locationEditSnapshot)
  );

  useEffect(() => {
    onDirtyChange?.(Boolean(storefrontContentDirty || locationDirty));
  }, [locationDirty, onDirtyChange, storefrontContentDirty]);

  const cancelEditing = () => {
    if (editSnapshot) setStorefrontForm(editSnapshot);
    setEditSnapshot(null);
    setLocationEditSnapshot(null);
    setEditingGroup(null);
    setIsEditing(false);
    if (locationsActive) resetLocationForm();
  };

  const handleSubtabChange = (nextSubtab) => {
    if (isEditing || nextSubtab === activeSubtab) return;
    if (activeSubtab === 'content' && storefrontContentDirty) {
      onStorefrontContentNavigationRequest?.(nextSubtab);
      return;
    }
    setActiveSubtab(nextSubtab);
  };

  const handleLocationEdit = (location) => {
    if (!canEdit) return;
    setSelectedLocationId(location.location_id);
    setActiveSubtab('locations');
    setIsEditing(true);
    setEditSnapshot(cloneStorefrontForm(storefrontForm));
    setLocationEditSnapshot(null);
    handleEditLocation(location);
  };

  const handleAddLocation = () => {
    if (!canEdit) return;
    setActiveSubtab('locations');
    setIsEditing(true);
    setEditSnapshot(cloneStorefrontForm(storefrontForm));
    setLocationEditSnapshot(cloneStorefrontForm(createDefaultLocationForm()));
    resetLocationForm();
  };

  const handleToggle = (field, settingKey, label, value) => {
    const previousValue = storefrontForm?.[field] === true;
    setStorefrontForm((current) => ({ ...current, [field]: value === true }));
    if (field === 'storeHasNoLocation' && value !== true && !hasActivePrimaryStorefrontLocation) {
      setLocationForm((current) => (current.is_active === false ? current : { ...current, is_primary_storefront: true }));
    }
    void handleStorefrontBooleanChange?.({ settingKey, field, label, value: value === true, previousValue });
  };

  const saveEditing = async () => {
    if (coverAdjustmentRef.current) {
      const coverSaved = await coverAdjustmentRef.current.save();
      if (coverSaved === false) return;
    }
    const saved = await handleStorefrontSave();
    if (saved !== false) {
      setEditSnapshot(null);
      setEditingGroup(null);
      setIsEditing(false);
    }
  };

  const saveContentGroup = async () => {
    if (!editingGroup || editingGroup === 'all') return saveEditing();
    if (editingGroup === 'image' && coverAdjustmentRef.current) {
      const coverSaved = await coverAdjustmentRef.current.save();
      if (coverSaved === false) return false;
    }
    const saved = await handleStorefrontGroupSave?.(editingGroup);
    if (saved !== false) {
      setEditSnapshot(null);
      setEditingGroup(null);
      setIsEditing(false);
    }
    return saved;
  };

  const saveLocation = async () => {
    const saved = await handleSaveLocation();
    if (saved === true) {
      setEditSnapshot(null);
      setLocationEditSnapshot(null);
      setEditingGroup(null);
      setIsEditing(false);
    }
    return saved;
  };

  const renderEditFooter = (label = 'Save Storefront', onSave = saveEditing) => (
    <div className="mt-5 flex flex-row justify-end gap-2 border-t border-slate-100 pt-4">
      <Button type="button" variant="outline" onClick={cancelEditing} disabled={savingTab === 'storefront'} className="min-h-9 min-w-0 flex-1 rounded-lg px-4 text-[12px] font-bold text-[#1A4E8D] sm:flex-none">Cancel</Button>
      <Button type="button" onClick={() => void onSave()} disabled={!canEdit || Boolean(savingTab)} className="min-h-9 min-w-0 flex-1 rounded-lg bg-[#1A4E8D] px-4 text-[12px] font-bold text-white hover:bg-[#143F73] sm:flex-none">
        <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{savingTab === 'storefront' ? 'Saving…' : label}
      </Button>
    </div>
  );

    return (
    <div className={`business-admin-storefront-pane grid min-w-0 gap-6 sm:gap-6 ${showLocationEditorOnly ? 'business-admin-location-editor-only' : ''} ${contentActive && storefrontContentDirty ? 'pb-[calc(10rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(7rem+env(safe-area-inset-bottom,0px))]' : 'pb-6 sm:pb-8'}`}>
      {!showLocationEditorOnly ? <StorefrontSubtabNavigation activeSubtab={viewActiveSubtab} onChange={handleSubtabChange} disabled={viewIsEditing} /> : null}
      <p className="sr-only" aria-live="polite">
        {Object.values(storefrontBooleanState).some((status) => status === 'saving')
          ? 'Saving Storefront setting.'
          : Object.values(storefrontBooleanState).some((status) => status === 'saved')
            ? 'Storefront setting saved.'
            : Object.values(storefrontBooleanState).some((status) => status === 'error')
              ? 'Storefront setting could not be saved. The previous value was restored.'
              : ''}
      </p>

      <div id="pos-storefront-panel" role="tabpanel" aria-labelledby={`pos-storefront-tab-${viewActiveSubtab}`} className="min-w-0">
      {!viewIsEditing && setupActive ? (
        <StoreSetupSummary
          storefrontForm={storefrontForm}
          storefrontPublicUrl={storefrontPublicUrl}
          requestedCustomerAccessMode={requestedCustomerAccessMode}
          effectiveCustomerAccessMode={effectiveCustomerAccessMode}
          customerAccessRollbackActive={customerAccessRollbackActive}
          customerAccessLimitation={customerAccessLimitation}
          canEditSettings={canEdit}
          locked={locked}
          loading={loading}
          storefrontBooleanState={storefrontBooleanState}
          onToggle={handleToggle}
          onCustomerAccessModeChange={handleCustomerAccessModeChange}
          platformMaxCustomerAccessMode={platformMaxCustomerAccessMode}
          onCopyUrl={handleCopyStorefrontUrl}
          onOpenStorefront={() => window.open(storefrontPublicUrl, '_blank', 'noopener,noreferrer')}
          onGenerateStorefrontSlug={handleGenerateStorefrontSlug}
          savingTab={savingTab}
        />
      ) : null}
      {!viewIsEditing && contentActive ? <StoreContentSummary storefrontForm={storefrontForm} setStorefrontForm={setStorefrontForm} storefrontAssets={storefrontAssets} storefrontLocations={storefrontLocations} canEditSettings={canEditSettings} locked={locked} loading={loading} assetUploadingType={assetUploadingType} assetDeletingType={assetDeletingType} onGroupSave={handleStorefrontGroupSave} onUploadGalleryImage={handleGalleryAssetUpload} onUploadAsset={handleUploadAsset} onDeleteAsset={handleDeleteAsset} /> : null}
      {!viewIsEditing && locationsActive ? <StoreLocationsSummary storefrontForm={storefrontForm} storefrontLocations={storefrontLocations} canEditSettings={canEdit} selectedLocationId={selectedLocationId} onSelectLocation={setSelectedLocationId} onAddLocation={handleAddLocation} onEditLocation={handleLocationEdit} onSaveBusinessHours={(nextHours) => {
        if (typeof handleStorefrontGroupSave !== 'function') return false;
        return handleStorefrontGroupSave('basic', { ...storefrontForm, storefrontHours: nextHours });
      }} /> : null}
      {!viewIsEditing && reviewsActive ? <StorefrontReviewsSettings tenantId={storefrontTenantId} /> : null}

      <StorefrontGroupEditor
        group={contentActive && editingGroup && editingGroup !== 'all' ? editingGroup : null}
        storefrontForm={storefrontForm}
        setStorefrontForm={setStorefrontForm}
        storefrontAssets={storefrontAssets}
        locked={locked}
        loading={loading}
        canEdit={canEdit}
        coverAdjustmentRef={coverAdjustmentRef}
        assetUploadingType={assetUploadingType}
        assetDeletingType={assetDeletingType}
        handleUploadAsset={handleUploadAsset}
        handleDeleteAsset={handleDeleteAsset}
        handleGalleryAssetUpload={handleGalleryAssetUpload}
        onSave={saveContentGroup}
        onCancel={cancelEditing}
        savingTab={savingTab}
        hidden={!viewIsEditing}
      />

      <div className={`${setupActive && viewIsEditing ? '' : 'hidden'} space-y-8`}>
      <div className="border-b border-slate-200 pb-8 last:border-b-0">
        <div className="grid gap-3 md:grid-cols-2">
          <StorefrontToggle
            label="Storefront visible"
            description="Controls public storefront visibility from shared tenant settings."
            checked={storefrontForm.storeIsVisible === true}
            disabled={!canEdit}
            saving={storefrontBooleanState.store_is_visible === 'saving'}
            status={storefrontBooleanState.store_is_visible}
            onChange={(value) => handleToggle('storeIsVisible', 'store_is_visible', 'Storefront visibility', value)}
          />
          <StorefrontToggle
            label="Searchable without map pin"
            description="Preserves the same no-location storefront behavior used in IMS."
            checked={storefrontForm.storeHasNoLocation === true}
            disabled={!canEdit}
            saving={storefrontBooleanState.store_has_no_location === 'saving'}
            status={storefrontBooleanState.store_has_no_location}
            onChange={(value) => handleToggle('storeHasNoLocation', 'store_has_no_location', 'Map-pin search setting', value)}
          />
        </div>
        {storefrontLocationRequired && !hasActivePrimaryStorefrontLocation ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-[12px] text-rose-700">
            Public Storefront currently requires one active primary storefront location. Add a location below and mark it as the <span className="font-bold">primary location</span>, or enable <span className="font-bold">Searchable without map pin</span>.
          </div>
        ) : null}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-[#0F172A]">Storefront ID and item QR links</p>
              {storefrontForm.storeTenantSlug ? (
                <>
                  <p className={`mt-1 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>
                    This stable ID is used by Storefront item links and generated POS QR codes.
                  </p>
                  <code className="mt-2 block break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-[#1A4E8D]">
                    {storefrontForm.storeTenantSlug}
                  </code>
                </>
              ) : (
                <p className="mt-1 text-[12px] leading-5 text-amber-700">
                  No Storefront ID is saved yet. Generate one to enable customer-facing item QR codes.
                </p>
              )}
            </div>
            {storefrontForm.storeTenantSlug ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleCopyStorefrontUrl()}
                  disabled={!storefrontPublicUrl}
                >
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Copy URL
                </Button>
                <Button
                  type="button"
                  onClick={() => window.open(storefrontPublicUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!storefrontPublicUrl}
                >
                  Open Storefront
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                className="shrink-0"
                onClick={() => void handleGenerateStorefrontSlug()}
                disabled={!canEdit || Boolean(savingTab)}
              >
                {savingTab === 'storefront_slug' ? 'Generating...' : 'Generate Storefront ID'}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-[#1A4E8D]">
              <Users className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <Label htmlFor="pos-customer-access-mode" className="text-[15px] font-extrabold tracking-tight text-[#0F172A]">Customer Access Mode</Label>
              <p className={`mt-1 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>Select a mode to apply changes automatically.</p>
            </div>
          </div>

          <select
            id="pos-customer-access-mode"
            className="sr-only"
            value={requestedCustomerAccessMode}
            onChange={(event) => void handleCustomerAccessModeChange(event.target.value)}
            disabled={locked || loading || savingTab === 'storefront_access_mode'}
          >
            {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={CUSTOMER_ACCESS_MODE_RANK[option.value] > CUSTOMER_ACCESS_MODE_RANK[platformMaxCustomerAccessMode]}
              >
                {option.label}
              </option>
            ))}
          </select>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Customer Access Mode options">
            {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => {
              const ModeIcon = option.icon;
              const isSelected = requestedCustomerAccessMode === option.value;
              const isUnavailable = CUSTOMER_ACCESS_MODE_RANK[option.value] > CUSTOMER_ACCESS_MODE_RANK[platformMaxCustomerAccessMode];
              const isDisabled = !canEdit || savingTab === 'storefront_access_mode' || isUnavailable;
              return (
                <button
                  key={option.value}
                  type="button"
                  // Mobile (<sm): compact 2-col grid - image spans both rows on the left,
                  // label/description auto-flow into the right column via CSS grid's default
                  // row-then-column placement (no extra wrapper needed).
                  // sm: and up: original vertical/centered card layout, unchanged.
                  className={`relative grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 rounded-2xl border px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-2 sm:flex sm:min-h-64 sm:flex-col sm:items-center sm:gap-0 sm:px-5 sm:py-7 sm:text-center ${isSelected ? 'border-2 border-[#1A4E8D] bg-blue-50/50' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'} ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  onClick={() => void handleCustomerAccessModeChange(option.value)}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  aria-label={`${option.label}: ${option.description}`}
                >
                  {isSelected ? (
                    <span className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-[#1A4E8D] text-white" aria-hidden="true">
                      <Check className="h-5 w-5 stroke-[3]" />
                    </span>
                  ) : null}
                  <span className={`row-span-2 grid h-20 w-20 shrink-0 place-items-center self-center rounded-full ${option.iconClassName}`} aria-hidden="true">
                    <ModeIcon className="h-10 w-10 stroke-[1.8]" />
                  </span>
                  <span className={`min-w-0 text-[14px] font-extrabold sm:mt-5 ${isSelected ? 'text-[#1A4E8D]' : 'text-[#0F172A]'}`}>{option.label}</span>
                  <span className="min-w-0 text-[13px] leading-6 text-[#475569] sm:mt-3">{option.description}</span>
                  {isSelected ? (
                    <span className="col-span-2 mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 sm:mt-auto">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {savingTab === 'storefront_access_mode'
                        ? 'Saving automatically'
                        : (effectiveCustomerAccessMode === option.value ? 'Applied automatically' : `Requested; effective ${effectiveCustomerAccessMode}`)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

        </div>
      </div>
      {renderEditFooter('Save Store Setup')}
      </div>
      {contentActive && viewIsEditing && editingGroup === 'all' ? <div className="space-y-8" aria-label="Store Content editor">
      <div className="border-b border-slate-200 pb-8 last:border-b-0">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="relative min-w-0">
            <div className="pointer-events-auto absolute right-2 top-2 z-30 flex items-center gap-1.5">
              <Button type="button" variant="outline" onClick={cancelEditing} disabled={savingTab === 'storefront'} className="min-h-8 rounded-lg border-slate-200 bg-white/95 px-2.5 text-[11px] font-bold text-[#1A4E8D] shadow-sm">Cancel</Button>
              <Button type="button" aria-label="Save Store Content" onClick={() => void saveEditing()} disabled={!canEdit || savingTab === 'storefront' || assetUploadingType === 'cover' || assetDeletingType === 'cover' || String(assetUploadingType || '').startsWith('gallery-')} className="min-h-8 rounded-lg bg-[#1A4E8D] px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#143F73]">
                <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{savingTab === 'storefront' ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <CoverPhotoAdjustment ref={coverAdjustmentRef} coverSrc={storefrontAssets.cover ? resolveAssetUrl(storefrontAssets.cover) : ''} initialTransform={storefrontAssets.coverTransform} disabled={locked || assetUploadingType === 'cover' || assetDeletingType === 'cover'} onSave={async ({ file, transform }) => handleUploadAsset('cover', file, transform)} onRemove={() => handleDeleteAsset('cover')} />
            <div className="absolute -bottom-8 left-4 h-16 w-16 rounded-full border-4 border-white bg-slate-100 shadow md:h-20 md:w-20">
              <div className="h-full w-full overflow-hidden rounded-full">
                {storefrontAssets.profile ? (
                  <ResponsiveImage sources={{ src: resolveAssetUrl(storefrontAssets.profile) }} alt="Storefront profile preview" hideOnError className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500 md:text-xs">No icon</div>
                )}
              </div>
              <input id="storefront-profile-upload-edit" type="file" accept="image/*" className="sr-only" disabled={locked || assetUploadingType === 'profile' || assetDeletingType === 'profile'} onChange={(event) => { const file = event.target.files?.[0] || null; event.target.value = ''; if (file) void handleUploadAsset('profile', file); }} />
              <label htmlFor="storefront-profile-upload-edit" className="absolute bottom-0 right-0 z-20 grid h-7 w-7 translate-x-1/4 translate-y-1/4 cursor-pointer place-items-center rounded-full border-2 border-white bg-white text-[#1A4E8D] shadow-md transition-colors hover:bg-blue-50" aria-label="Change profile icon"><Camera className="h-3.5 w-3.5" aria-hidden="true" /></label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-10 text-[11px] font-semibold text-[#64748B]">
            <span>Cover photo</span>
            <span aria-hidden="true">·</span>
            <span>Profile icon</span>
            <Button type="button" variant="outline" aria-label="Remove profile icon" title="Remove profile icon" className="h-7 w-7 rounded-full border-rose-200 bg-rose-50 p-0 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-rose-500" disabled={locked || !storefrontAssets.profile || assetUploadingType === 'profile' || assetDeletingType === 'profile'} onClick={() => handleDeleteAsset('profile')}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
          </div>
        </div>
      </div>
      <div className="border-b border-slate-200 pb-8 last:border-b-0">
        <p className={STOREFRONT_TYPOGRAPHY.sectionTitle}>Storefront Content</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Tagline</Label>
            <Input className="h-9 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontTagline} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontTagline: event.target.value }))} disabled={locked || loading} />
          </div>
          <div className="grid gap-2">
            <Label className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Phone</Label>
            <Input className="h-9 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontPhone} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontPhone: event.target.value }))} disabled={locked || loading} />
          </div>
          <div className="grid gap-2">
            <Label className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Email</Label>
            <Input className="h-9 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontEmail} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontEmail: event.target.value }))} disabled={locked || loading} />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <StorefrontBusinessHoursScheduler disabled={!canEdit} value={storefrontForm.storefrontHours} onChange={(nextHours) => setStorefrontForm((current) => ({ ...current, storefrontHours: nextHours }))} />
        </div>
        <div className="mt-4 grid gap-2">
          <Label className={STOREFRONT_TYPOGRAPHY.fieldLabel}>About</Label>
          <textarea className="min-h-[96px] rounded-lg border border-slate-200 px-3 py-2 text-[13px]" value={storefrontForm.storefrontAbout} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontAbout: event.target.value }))} disabled={locked || loading} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <StorefrontToggle
            label="Harmonized UI"
            description="Use the current DGFY storefront presentation."
            checked={storefrontForm.storefrontUiV2Enabled === true}
            disabled={!canEdit}
            saving={storefrontBooleanState.storefront_ui_v2_enabled === 'saving'}
            status={storefrontBooleanState.storefront_ui_v2_enabled}
            onChange={(value) => handleToggle('storefrontUiV2Enabled', 'storefront_ui_v2_enabled', 'Harmonized UI', value)}
          />
          <StorefrontToggle
            label="Show Follow Button"
            description="Allow customers to follow this storefront."
            checked={storefrontForm.storefrontFollowEnabled === true}
            disabled={!canEdit}
            saving={storefrontBooleanState.storefront_follow_enabled === 'saving'}
            status={storefrontBooleanState.storefront_follow_enabled}
            onChange={(value) => handleToggle('storefrontFollowEnabled', 'storefront_follow_enabled', 'Follow button', value)}
          />
          <StorefrontToggle
            label="Show Share Button"
            description="Allow customers to share storefront links."
            checked={storefrontForm.storefrontShareEnabled === true}
            disabled={!canEdit}
            saving={storefrontBooleanState.storefront_share_enabled === 'saving'}
            status={storefrontBooleanState.storefront_share_enabled}
            onChange={(value) => handleToggle('storefrontShareEnabled', 'storefront_share_enabled', 'Share button', value)}
          />
          <StorefrontToggle
            label="Allow Guest Checkout"
            description="Let customers check out without an account."
            checked={storefrontForm.storefrontGuestCheckoutEnabled !== false}
            disabled={!canEdit}
            saving={storefrontBooleanState.storefront_guest_checkout_enabled === 'saving'}
            status={storefrontBooleanState.storefront_guest_checkout_enabled}
            onChange={(value) => handleToggle('storefrontGuestCheckoutEnabled', 'storefront_guest_checkout_enabled', 'Guest checkout', value)}
          />
          <StorefrontToggle
            label="Accept Cash on Delivery/Pickup"
            description="Allow cash as a supported payment method."
            checked={storefrontForm.storefrontCashPaymentEnabled !== false}
            disabled={!canEdit}
            saving={storefrontBooleanState.storefront_cash_payment_enabled === 'saving'}
            status={storefrontBooleanState.storefront_cash_payment_enabled}
            onChange={(value) => handleToggle('storefrontCashPaymentEnabled', 'storefront_cash_payment_enabled', 'Cash payment', value)}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 lg:items-stretch">
          <div className={categoriesFitBesideWhy ? 'min-w-0' : 'min-w-0 lg:col-span-2'}>
            <StorefrontCategoriesSettings
              className="h-full"
              categories={storefrontForm.storefrontCategories}
              disabled={locked || loading}
              onChange={(nextCategories) => setStorefrontForm((current) => ({ ...current, storefrontCategories: nextCategories }))}
            />
          </div>
          <div className={categoriesFitBesideWhy ? 'min-w-0' : 'min-w-0 lg:col-span-2'}>
            <StorefrontWhyChooseUsSettings
              interactionMode="modal"
              className="h-full"
              phrases={storefrontForm.storefrontWhyChooseUs}
              disabled={locked || loading}
              onChange={(nextPhrases) => setStorefrontForm((current) => ({ ...current, storefrontWhyChooseUs: nextPhrases }))}
            />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <StorefrontSocialLinksSettings
              links={{
                messenger: storefrontForm.storefrontSocialMessenger,
                facebook: storefrontForm.storefrontSocialFacebook,
                instagram: storefrontForm.storefrontSocialInstagram
              }}
              disabled={locked || loading}
              onChange={(nextLinks) => setStorefrontForm((current) => ({
                ...current,
                storefrontSocialMessenger: nextLinks.messenger || '',
                storefrontSocialFacebook: nextLinks.facebook || '',
                storefrontSocialInstagram: nextLinks.instagram || ''
              }))}
            />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <StorefrontGallerySettings
              images={storefrontForm.storefrontGalleryImages}
              disabled={locked || loading}
              loading={loading}
              assetUploadingType={assetUploadingType}
              onChange={(nextImages) => setStorefrontForm((current) => ({ ...current, storefrontGalleryImages: nextImages }))}
              onUploadImage={handleGalleryAssetUpload}
            />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <StorefrontDeliveryPartnersSettings
              partners={storefrontForm.storefrontDeliveryPartners}
              disabled={locked || loading}
              onChange={(nextPartners) => setStorefrontForm((current) => ({ ...current, storefrontDeliveryPartners: nextPartners }))}
            />
          </div>
        </div>
      </div>

      </div> : null}
      {locationsActive && viewIsEditing && !showLocationEditorOnly ? (
        <StorefrontBusinessHoursSection
          hours={storefrontForm?.storefrontHours}
          canEditSettings={canEdit}
          editingBranch
          onSaveBusinessHours={(nextHours) => {
            if (typeof handleStorefrontGroupSave !== 'function') return false;
            return handleStorefrontGroupSave('basic', { ...storefrontForm, storefrontHours: nextHours });
          }}
        />
      ) : null}
      <div ref={storefrontLocationsBoundaryRef} className={`business-admin-storefront-locations-panel ${locationsActive && viewIsEditing ? 'mt-5 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] sm:pb-0 lg:mt-8' : 'hidden'} space-y-3`}>
          <div>
            <h2 className="business-admin-storefront-locations-header text-[14px] font-extrabold text-[#0F172A]">
              {locationPluralLabel}{storefrontLocationRequired ? <RequiredMark /> : null}
            </h2>
          </div>
          <div className="business-admin-storefront-locations-grid grid min-w-0 gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:gap-5">
            <aside className="business-admin-storefront-location-list hidden min-w-0 rounded-xl border border-[#DDE8F5] bg-white p-3 lg:block lg:p-4" aria-label={`${locationPluralLabel} list`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className={`truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`}>Branches</h3>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-[#1A4E8D]">{storefrontLocations.length}</span>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-[#64748B]">{filteredStorefrontLocations.length} shown</span>
              </div>

              <label className="relative mt-3 block">
                <span className="sr-only">Search branches</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8399BA]" aria-hidden="true" />
                <Input
                  value={locationSearchTerm}
                  onChange={(event) => setLocationSearchTerm(event.target.value)}
                  placeholder="Search branches..."
                  className="h-9 w-full min-w-0 rounded-lg border-slate-200 pl-9 text-[12px]"
                />
              </label>

              <div className="business-admin-storefront-location-list-scroll mt-3 space-y-2 lg:max-h-[420px] lg:overflow-y-auto lg:pr-1">
                {filteredStorefrontLocations.length > 0 ? filteredStorefrontLocations.map((location) => {
                  const activeEditingId = locationForm?.location_id || locationForm?.id;
                  const isSelected = activeEditingId === location.location_id;
                  return (
                    <div
                      key={`pos-storefront-location-${location.location_id}`}
                      onClick={() => handleEditLocation(location)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleEditLocation(location);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`${STOREFRONT_LOCATION_LABELS.editBranch}: ${location.name || 'branch'}`}
                      className={`group relative cursor-pointer rounded-lg border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] ${isSelected ? 'border-[#7DB1F5] bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-[#1A4E8D] text-white' : 'bg-blue-50 text-[#1A4E8D]'}`}><Store className="h-4 w-4" aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`}>{location.name || 'Unnamed branch'}</p>
                          <p className={`mt-1 truncate ${STOREFRONT_TYPOGRAPHY.helper}`}>{location.address_line || 'No address specified'}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-10 text-[11px] font-bold">
                        <span className={`inline-flex items-center gap-1 ${location.is_active === true ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${location.is_active === true ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />{location.is_active === true ? STOREFRONT_LOCATION_LABELS.active : STOREFRONT_LOCATION_LABELS.inactive}</span>
                        {location.is_primary_storefront === true ? <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{STOREFRONT_LOCATION_LABELS.primaryLocation}</span> : <button type="button" onClick={(event) => { event.stopPropagation(); handleSetPrimaryLocation(location); }} disabled={locationSaving || location.is_active !== true} className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Set Primary</button>}
                      </div>
                    </div>
                  );
                }) : <p className={`rounded-lg bg-slate-50 px-3 py-5 text-center ${STOREFRONT_TYPOGRAPHY.helper}`}>{storefrontLocations.length === 0 ? 'No storefront locations configured.' : 'No branches match your search.'}</p>}
              </div>

              <Button type="button" onClick={resetLocationForm} disabled={locationSaving} variant="outline" className="mt-3 min-h-9 w-full rounded-lg border-blue-200 px-3 text-[12px] font-bold text-[#1A4E8D] hover:bg-blue-50">
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{STOREFRONT_LOCATION_LABELS.addLocation}
              </Button>
            </aside>

            <section className="business-admin-storefront-location-editor relative min-w-0 sm:rounded-xl sm:border sm:border-[#DDE8F5] sm:bg-white sm:p-4" aria-labelledby="location-editor-heading">
              <div className="flex min-w-0 flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1A4E8D]">
                    <Store className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 id="location-editor-heading" className={STOREFRONT_TYPOGRAPHY.sectionTitle}>{locationEditorTitle}</h3>
                    <p className={`mt-1 ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>Update your branch details and settings.</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                      {locationForm.is_primary_storefront === true ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{STOREFRONT_LOCATION_LABELS.primaryLocation}</span> : null}
                      <span className={`inline-flex items-center gap-1 ${locationForm.is_active === true ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${locationForm.is_active === true ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />{locationForm.is_active === true ? STOREFRONT_LOCATION_LABELS.active : STOREFRONT_LOCATION_LABELS.inactive}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`mt-4 ${STOREFRONT_LOCATION_DETAIL_GRID_CLASS}`}>
                <div className="min-w-0 rounded-lg border border-slate-200 p-3 sm:border-0 sm:p-0">
                  <div className="min-w-0">
                    <Suspense fallback={<div className="flex h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center text-xs text-slate-500 sm:h-[340px] lg:h-[420px]">Loading map picker...</div>}>
                      <MapPinPicker
                        latitude={locationForm.latitude}
                        longitude={locationForm.longitude}
                        deliveryRadiusKm={locationForm.delivery_radius_km}
                        addressLine={locationForm.address_line}
                        onChange={handleLocationPinChange}
                        defaultAdjustMode
                        locationEditorMode
                        expansionBoundaryRef={storefrontLocationsBoundaryRef}
                        expansionScrollParentRef={expansionScrollParentRef}
                      />
                    </Suspense>
                  </div>
                </div>

                <div className="min-w-0 rounded-lg border border-slate-200 p-3 sm:p-4">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-[#1A4E8D]" aria-hidden="true" />
                    <h4 className={STOREFRONT_TYPOGRAPHY.itemLabel}>Basic Details</h4>
                  </div>
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-1.5">
                      <Label className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>{STOREFRONT_LOCATION_LABELS.branchName}<RequiredMark /></Label>
                      <Input value={locationForm.name} onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Main Branch" className="h-9 rounded-lg border-slate-200 text-[13px]" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>{STOREFRONT_LOCATION_LABELS.address}<RequiredMark /></Label>
                      <Input value={locationForm.address_line} onChange={(event) => setLocationForm((current) => ({ ...current, address_line: event.target.value }))} placeholder="Street, City, Province" className="h-9 rounded-lg border-slate-200 text-[13px]" />
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-[#1A4E8D]" aria-hidden="true" /><h4 className={STOREFRONT_TYPOGRAPHY.itemLabel}>Operational Settings</h4></div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5"><Label className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>{STOREFRONT_LOCATION_LABELS.deliveryRadius}<RequiredMark /></Label><Input value={locationForm.delivery_radius_km} onChange={(event) => setLocationForm((current) => ({ ...current, delivery_radius_km: event.target.value }))} placeholder="5" className="h-9 rounded-lg border-slate-200 text-[13px]" /></div>
                      <div className="grid gap-1.5"><Label className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>{STOREFRONT_LOCATION_LABELS.estimatedWaitTime}<RequiredMark /></Label><Input value={locationForm.current_wait_time_minutes} onChange={(event) => setLocationForm((current) => ({ ...current, current_wait_time_minutes: event.target.value }))} placeholder="15" className="h-9 rounded-lg border-slate-200 text-[13px]" /></div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <StorefrontToggle label={STOREFRONT_LOCATION_LABELS.open} description="Accept orders here" checked={locationForm.is_open === true} disabled={!canEdit} onChange={(value) => setLocationForm((current) => ({ ...current, is_open: value === true }))} />
                      <StorefrontToggle label={STOREFRONT_LOCATION_LABELS.primaryLocation} description="Primary storefront for map publication" checked={locationForm.is_primary_storefront === true} disabled={!canEdit} onChange={(value) => setLocationForm((current) => ({ ...current, is_primary_storefront: value === true }))} />
                      <StorefrontToggle label={STOREFRONT_LOCATION_LABELS.allowOutOfStockSales} description="Sell out-of-stock items" checked={locationForm.allow_out_of_stock_sales === true} disabled={!canEdit} onChange={(value) => setLocationForm((current) => ({ ...current, allow_out_of_stock_sales: value === true }))} />
                      <StorefrontToggle label={STOREFRONT_LOCATION_LABELS.supportsDelivery} description="Accept delivery orders" checked={locationForm.supports_delivery !== false} disabled={!canEdit} onChange={(value) => handleFulfillmentMethodChange('supports_delivery', value)} />
                      <StorefrontToggle label={STOREFRONT_LOCATION_LABELS.supportsPickup} description="Accept pickup orders" checked={locationForm.supports_pickup !== false} disabled={!canEdit} onChange={(value) => handleFulfillmentMethodChange('supports_pickup', value)} />
                      <StorefrontToggle label={STOREFRONT_LOCATION_LABELS.allowScheduledOrders} description="Offer scheduled orders" checked={locationForm.scheduling_enabled !== false} disabled={!canEditSettings} onChange={(value) => setLocationForm((current) => ({ ...current, scheduling_enabled: value !== false }))} />
                      <StorefrontToggle label={STOREFRONT_LOCATION_LABELS.allowImmediateFulfillment} description="Offer immediate fulfillment" checked={locationForm.immediate_fulfillment_enabled !== false} disabled={!canEditSettings} onChange={(value) => setLocationForm((current) => ({ ...current, immediate_fulfillment_enabled: value !== false }))} />
                    </div>

                    {locationForm.immediate_fulfillment_enabled === false ? (
                      <div className="mt-3 grid gap-1.5 rounded-lg border border-slate-100 p-2.5">
                        <Label className={STOREFRONT_LOCATION_FIELD_LABEL_CLASS}>Fulfillment Lead Time (days)</Label>
                        <p className="text-[12px] leading-5 text-slate-500">Shown to buyers in place of the NOW promise. Required while immediate fulfillment is off.</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="number" min="0" max="365" placeholder="Minimum days" value={locationForm.fulfillment_lead_time_min_days} disabled={!canEditSettings} onChange={(event) => setLocationForm((current) => ({ ...current, fulfillment_lead_time_min_days: event.target.value }))} className="h-9 rounded-lg border-slate-200 text-[12px]" />
                          <Input type="number" min="0" max="365" placeholder="Maximum days" value={locationForm.fulfillment_lead_time_max_days} disabled={!canEditSettings} onChange={(event) => setLocationForm((current) => ({ ...current, fulfillment_lead_time_max_days: event.target.value }))} className="h-9 rounded-lg border-slate-200 text-[12px]" />
                        </div>
                        {leadTimeRequiredMissing ? <p className="text-[12px] leading-5 text-amber-700">A minimum and maximum lead time are required while immediate fulfillment is off.</p> : null}
                        {leadTimeRangeInverted ? <p className="text-[12px] leading-5 text-amber-700">Maximum days must be greater than or equal to minimum days.</p> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-slate-200 bg-white px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_12px_rgba(15,23,42,0.08)] sm:absolute sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:z-auto sm:mt-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
                <Button type="button" variant="outline" onClick={cancelEditing} disabled={locationSaving} className="min-h-11 flex-1 rounded-lg border-slate-200 px-4 text-[12px] font-bold text-[#1A4E8D] hover:bg-blue-50 sm:min-h-9 sm:flex-none">Cancel</Button>
                <Button type="button" onClick={() => void saveLocation()} disabled={locationSaving} className="min-h-11 flex-1 rounded-lg bg-[#1A4E8D] px-4 text-[12px] font-bold text-white hover:bg-[#143F73] sm:min-h-9 sm:flex-none">{locationSaving ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </section>
          </div>
      </div>
      </div>
    </div>
  );
}
