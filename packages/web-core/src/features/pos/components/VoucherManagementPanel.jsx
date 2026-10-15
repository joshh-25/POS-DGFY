import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
  Filter,
  Pause,
  Pencil,
  Play,
  RefreshCcw,
  SortAsc,
  SortDesc,
  Ticket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination } from '@/components/ui/pagination';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import VoucherFormModal from './VoucherFormModal.jsx';
import { PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import PosSearchField, { POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS } from './PosSearchField.jsx';
import { getFolders, getItems } from '@/services/itemService.js';
import {
  activateVoucher,
  archiveVoucher,
  createVoucher,
  getVoucher,
  listVouchers,
  pauseVoucher,
  updateVoucher
} from '@/services/voucherService.js';
import { listPricelists } from '@/services/pricelistService.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import {
  BENEFIT_CLASS_LABEL,
  PAGE_SIZE,
  applyVoucherKindDefaults,
  blankForm,
  bpsToPercentString,
  buildVoucherPayload,
  peso,
  suggestVoucherCode,
  validateFormLocally,
  voucherToForm
} from './voucherFormModel.js';

// Voucher merchant authoring UI (#614, Phase 103; extended #1334, Phase 245). Governed by ADR 0066.
//
// Read `apps/dgfy-api/src/modules/vouchers/domain/voucherEligibilityPolicy.js` and
// `apps/dgfy-api/src/validators/voucherValidator.js` before touching the bitmask/payload shape
// below -- they are the source of truth this file mirrors, not the other way around.
//
// THE BUG THIS FILE MUST NOT REPEAT: the legacy Promo Codes editor
// (TerminalOperationsWorkspace.jsx's storefront promo section) hydrates its ENTIRE promo object --
// including the server-owned `used_count` -- into flat editable form state, then PUTs the whole
// blob back with no optimistic lock. A redemption between load and save gets silently clobbered.
// The voucher API defends against exactly this with a mandatory `version` field (409
// VOUCHER_VERSION_CONFLICT on a stale value) and `Joi.any().forbidden()` on `redeemed_count` /
// `redeemed_value_centavos` / `redeemed_quantity` on both create and update. This file never spreads
// its whole form draft into an outgoing payload -- `buildVoucherPayload` (voucherFormModel.js) builds
// the request body field-by-field from exactly the writable columns, so a server-owned counter can
// never leak into a PUT/POST no matter what ends up in local state, and every update always resends
// the last known `version`.
//
// #1334/Phase 245: the pure payload/validation/kind-defaulting logic lives in voucherFormModel.js,
// extracted so it's unit-testable without jsdom. This file re-exports `blankForm` and
// `buildVoucherPayload` below purely so #716's pre-existing regression test
// (`voucherManagementPayload.test.js`, which imports from this file's path) keeps passing unchanged.

export { blankForm, buildVoucherPayload };

// The status machine, mirrored from `voucherUseCases.js`'s ALLOWED_STATUS_TRANSITIONS. The server's
// 409 VOUCHER_INVALID_STATUS_TRANSITION is the real source of truth -- this copy only drives which
// buttons render, never bypasses the server check.
const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['active', 'archived']),
  active: Object.freeze(['paused', 'archived']),
  paused: Object.freeze(['active', 'archived']),
  expired: Object.freeze(['active', 'archived']),
  archived: Object.freeze([])
});
const LIFECYCLE_ACTION_LABEL = Object.freeze({ activate: 'Activate', pause: 'Pause', archive: 'Archive' });
const LIFECYCLE_ACTION_FN = { activate: activateVoucher, pause: pauseVoucher, archive: archiveVoucher };

const STATUS_BADGE_CLASS = Object.freeze({
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-100 text-amber-700 border-amber-200',
  expired: 'bg-rose-100 text-rose-700 border-rose-200',
  archived: 'bg-slate-200 text-slate-500 border-slate-300'
});

const STATUS_LABEL = Object.freeze({
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  expired: 'Expired',
  archived: 'Archived'
});

const VOUCHER_DESKTOP_FILTER_WIDTH = 464;
const VOUCHER_FORM_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const VOUCHER_STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
  { value: 'archived', label: 'Archived' }
]);

const VOUCHER_TYPE_OPTIONS = Object.freeze([
  { value: '', label: 'All voucher types' },
  { value: 'promo_code', label: 'Promo codes' },
  { value: 'delivery_campaign', label: 'Delivery campaigns' }
]);

const VOUCHER_BENEFIT_OPTIONS = Object.freeze([
  { value: '', label: 'All types' },
  { value: 'percent_off', label: 'Percent off' },
  { value: 'amount_off', label: 'Amount off' },
  { value: 'fixed_price', label: 'Fixed price' },
  { value: 'free_delivery', label: 'Free delivery' }
]);

const VOUCHER_SORT_OPTIONS = Object.freeze([
  { value: 'created_at', label: 'Created' },
  { value: 'code', label: 'Code' },
  { value: 'valid_until', label: 'Valid until' }
]);

const VOUCHER_AUTO_APPLY_OPTIONS = Object.freeze([
  { value: '', label: 'Any' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' }
]);

const VoucherPlusIcon = ({ className = '', ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M9 12h6" />
    <path d="M12 9v6" />
  </svg>
);

const VoucherFilterChoiceGroup = ({ label, value, options, onChange, mobile = false, fillRow = false, testId }) => {
  const optionGroupClassName = fillRow
    ? 'mt-1.5 grid min-w-0 max-w-full grid-cols-2 gap-2'
    : mobile
      ? 'dgfy-pos-history-horizontal-scroll mt-1 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 touch-pan-x'
      : 'mt-1.5 grid min-w-0 max-w-full grid-cols-4 gap-2';
  const optionClassName = fillRow
    ? mobile
      ? 'h-9 w-full min-w-0 px-2 py-1 text-[11px]'
      : 'h-8 w-full min-w-0 px-2 py-1 text-[10px]'
    : mobile
      ? 'h-9 w-[6.5rem] min-w-[6.5rem] shrink-0 px-2 py-1 text-[11px]'
      : 'h-8 w-full min-w-0 px-2 py-1 text-[10px]';

  return (
    <fieldset className="min-w-0">
      <legend className="text-[13px] font-semibold text-[#334155]">{label}</legend>
      <div className={optionGroupClassName} role="group" aria-label={`${label} options`}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value || `${label}-all`}
              type="button"
              data-testid={testId ? `${testId}-${option.value || 'all'}` : undefined}
              aria-pressed={selected}
              aria-label={`${label}: ${option.label}`}
              title={option.label}
              onClick={() => onChange(option.value)}
              className={`inline-flex items-center justify-center rounded-lg border px-2 text-center font-extrabold leading-tight transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${optionClassName} ${selected
                ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'}`}
            >
              <span className="min-w-0 max-w-full whitespace-normal break-words text-center">{option.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
};

// Friendly copy for the domain-level reason codes voucherErrors.js emits. These arrive as an OBJECT
// (`errors: { reason_code, ...details }`), not the field-level array Joi validation failures use --
// see `getReasonCode`/`getFieldErrors` below, which read the two shapes differently.
const REASON_CODE_MESSAGES = Object.freeze({
  VOUCHER_CODE_ALREADY_EXISTS: 'This code is already used by another voucher.',
  VOUCHER_CODE_IMMUTABLE: 'The code can only be changed while the voucher is a draft with no redemptions.',
  VOUCHER_ARCHIVED_IMMUTABLE: 'Archived vouchers cannot be modified.',
  VOUCHER_INVALID_STATUS_TRANSITION: 'That status change is not allowed from this voucher’s current state.',
  VOUCHER_FIXED_PRICE_REQUIRES_SCOPE: 'Fixed-price vouchers need at least one item or folder scope.',
  VOUCHER_SCOPE_REF_NOT_FOUND: 'One or more selected items/folders could not be found.',
  VOUCHER_BENEFIT_CONFIG_INVALID: 'The discount amount for the selected benefit type is missing or invalid.',
  VOUCHER_VALIDITY_WINDOW_INVALID: 'The end date cannot be earlier than the start date.',
  VOUCHER_VALIDITY_WINDOW_ELAPSED: 'This voucher can’t be activated because its validity window has already passed. Move the end date forward first.',
  VOUCHER_TIME_WINDOW_INCOMPLETE: 'Set both a start time and an end time, or leave both blank.',
  VOUCHER_TIME_WINDOW_DEGENERATE: 'Start time and end time cannot be equal.',
  VOUCHER_PRICELIST_CONFLICT: 'A fixed-price voucher can carry a single price or a pricelist, not both.',
  VOUCHER_PRICELIST_REF_NOT_FOUND: 'The selected pricelist could not be found.',
  VOUCHER_PRICELIST_NOT_ACTIVE: 'Only a published (active) pricelist can be attached to a voucher.',
  // #1334/Phase 245:
  VOUCHER_BENEFIT_TARGET_MISMATCH: 'This code applies to items, not to the delivery fee (or vice versa).',
  VOUCHER_POS_REDEMPTION_DISABLED: 'POS voucher redemption is turned off for this business.',
  // #788/Phase 269:
  VOUCHER_ACCOUNT_RESTRICTED_NOT_PUBLICLY_LISTABLE: 'An account-restricted voucher cannot be listed on the public storefront — public listing shows its code to every visitor.'
});

// #1334/Phase 245 (plan §6 Layer 3): VOUCHER_BENEFIT_CONFIG_INVALID covers four distinct authoring
// guards in voucherUseCases.js's applyBenefitConfig/assertAutoApplyHasNoScope (fixed_price+delivery,
// auto_apply+non-delivery, auto_apply+scopes, an invalid free_delivery amount), each with its own
// human-readable server message -- more specific than any single static copy this file could write.
// Prefer the server's own `message` for these codes instead of the generic REASON_CODE_MESSAGES entry.
const PREFER_SERVER_MESSAGE_CODES = Object.freeze(new Set(['VOUCHER_BENEFIT_CONFIG_INVALID']));

const getReasonCode = (data) => String(data?.errors?.reason_code || '').trim();

const getFieldErrors = (data) => {
  if (!Array.isArray(data?.errors)) return {};
  return data.errors.reduce((accumulator, entry) => {
    if (entry?.field) accumulator[entry.field] = entry.message || 'Invalid value.';
    return accumulator;
  }, {});
};

const describeError = (error, fallback) => {
  const data = error?.response?.data;
  const reasonCode = getReasonCode(data);
  if (PREFER_SERVER_MESSAGE_CODES.has(reasonCode) && data?.message) return data.message;
  return REASON_CODE_MESSAGES[reasonCode] || data?.message || fallback;
};

export default function VoucherManagementPanel({ disabled = false, canManage = false, sectionId, onNavigateToPricelists }) {
  const [view, setView] = useState('list');

  const [vouchers, setVouchers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const VOUCHER_PAGE_SIZE_OPTIONS = [20, 40, 60];
  const [statusFilter, setStatusFilter] = useState('');
  const [benefitClassFilter, setBenefitClassFilter] = useState('');
  // #1334/Phase 245: a type filter over the SAME Vouchers list, rather than a second nav entry
  // (plan §4.6) -- 'delivery_campaign' also turns on `include_stats` for the two report columns.
  const [voucherKindFilter, setVoucherKindFilter] = useState('');
  const [autoApplyFilter, setAutoApplyFilter] = useState('');
  const [sort, setSort] = useState('created_at');
  const [direction, setDirection] = useState('asc');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showDesktopFilters, setShowDesktopFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState('');
  const [draftBenefitClassFilter, setDraftBenefitClassFilter] = useState('');
  const [draftVoucherKindFilter, setDraftVoucherKindFilter] = useState('');
  const [draftAutoApplyFilter, setDraftAutoApplyFilter] = useState('');
  const [draftSort, setDraftSort] = useState('created_at');
  const desktopFilterButtonRef = useRef(null);
  const [desktopFilterPosition, setDesktopFilterPosition] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [form, setForm] = useState(blankForm);
  const [formLoading, setFormLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  // #1334/Phase 245: GET /vouchers/:id already returns `redemption_stats` unconditionally -- this
  // just stops the panel from discarding it (plan §5.2).
  const [redemptionStats, setRedemptionStats] = useState(null);

  const [scopeCatalogLoaded, setScopeCatalogLoaded] = useState(false);
  const [scopeCatalogLoading, setScopeCatalogLoading] = useState(false);
  const [scopeItemOptions, setScopeItemOptions] = useState([]);
  const [scopeFolderOptions, setScopeFolderOptions] = useState([]);
  const [scopeTypeDraft, setScopeTypeDraft] = useState('item');
  const [scopeRefDraft, setScopeRefDraft] = useState('');

  // #696: active pricelists a fixed_price voucher may attach. Loaded the same lazy-on-demand way
  // as the scope catalog above.
  const [pricelistOptionsLoaded, setPricelistOptionsLoaded] = useState(false);
  const [pricelistOptionsLoading, setPricelistOptionsLoading] = useState(false);
  const [pricelistOptions, setPricelistOptions] = useState([]);
  // RF-6 (PR #762 review): #736's second acceptance criterion -- a merchant holding only a DRAFT
  // (unpublished) pricelist should see copy that says so, not the same "no pricelists yet" a
  // merchant with genuinely zero pricelists sees. null = not yet probed.
  const [hasDraftPricelist, setHasDraftPricelist] = useState(null);

  const [lifecycleBusyId, setLifecycleBusyId] = useState(null);
  const [confirmState, setConfirmState] = useState({ open: false, voucherId: null, action: null, label: '' });
  const [reloadPromptOpen, setReloadPromptOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const formDialogRef = useRef(null);
  const formCloseButtonRef = useRef(null);
  const formRestoreFocusRef = useRef(null);
  const savingRef = useRef(false);

  const loadVouchers = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setListLoading(true);
    setListError('');
    try {
      const isDeliveryCampaignFilter = voucherKindFilter === 'delivery_campaign';
      const params = {
        page,
        limit: pageSize,
        sort,
        direction,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(benefitClassFilter ? { benefit_class: benefitClassFilter } : {}),
        ...(voucherKindFilter ? { voucher_kind: voucherKindFilter } : {}),
        // #1332: only meaningful once the type filter narrows to delivery campaigns.
        ...(isDeliveryCampaignFilter && autoApplyFilter ? { auto_apply: autoApplyFilter === 'true' } : {}),
        // Plan §5.1: keep `include_stats` off for the all-vouchers view -- it costs an extra grouped
        // aggregate per page -- only pay for it when a merchant is actually looking at campaigns.
        ...(isDeliveryCampaignFilter ? { include_stats: true } : {}),
        ...(appliedSearch ? { search: appliedSearch } : {})
      };
      const result = await listVouchers(params);
      setVouchers(Array.isArray(result?.vouchers) ? result.vouchers : []);
      setPagination(result?.pagination || { page, limit: pageSize, total: 0, total_pages: 0 });
    } catch (error) {
      setListError(error?.response?.data?.message || 'Failed to load vouchers.');
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [page, pageSize, sort, direction, statusFilter, benefitClassFilter, voucherKindFilter, autoApplyFilter, appliedSearch]);

  useEffect(() => {
    if (disabled) return;
    loadVouchers();
  }, [disabled, loadVouchers]);

  const loadScopeCatalog = useCallback(async () => {
    setScopeCatalogLoading(true);
    try {
      const [itemsPayload, folders] = await Promise.all([
        getItems({ fields: 'dropdown', limit: 10000 }),
        getFolders()
      ]);
      const items = Array.isArray(itemsPayload?.items) ? itemsPayload.items : [];
      setScopeItemOptions(items
        .map((item) => ({ id: Number(item?.item_id), name: String(item?.name || '').trim() }))
        .filter((item) => Number.isInteger(item.id) && item.id > 0 && item.name)
        .sort((a, b) => a.name.localeCompare(b.name)));
      setScopeFolderOptions((Array.isArray(folders) ? folders : [])
        .map((folder) => ({ id: Number(folder?.folder_id), name: String(folder?.name || '').trim() }))
        .filter((folder) => Number.isInteger(folder.id) && folder.id > 0 && folder.name)
        .sort((a, b) => a.name.localeCompare(b.name)));
      setScopeCatalogLoaded(true);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load items/folders for the scope picker.');
    } finally {
      setScopeCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'form' && form.benefitClass === 'fixed_price' && !scopeCatalogLoaded && !scopeCatalogLoading) {
      loadScopeCatalog();
    }
  }, [view, form.benefitClass, scopeCatalogLoaded, scopeCatalogLoading, loadScopeCatalog]);

  const loadPricelistOptions = useCallback(async () => {
    setPricelistOptionsLoading(true);
    try {
      // Only `active` pricelists are attachable -- assertPricelistRef rejects a draft/archived
      // reference server-side; filtering here just avoids offering a choice that would 422.
      const result = await listPricelists({ status: 'active', limit: 100 });
      const activeOptions = Array.isArray(result?.pricelists) ? result.pricelists : [];
      setPricelistOptions(activeOptions);
      setPricelistOptionsLoaded(true);
      // RF-6: only probe for a draft when the active list came back empty -- no extra request in
      // the common case where the merchant already has an attachable pricelist.
      if (activeOptions.length === 0) {
        try {
          const draftResult = await listPricelists({ status: 'draft', limit: 1 });
          setHasDraftPricelist((Array.isArray(draftResult?.pricelists) ? draftResult.pricelists : []).length > 0);
        } catch {
          setHasDraftPricelist(false);
        }
      } else {
        setHasDraftPricelist(false);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load pricelists.');
    } finally {
      setPricelistOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      view === 'form' && form.benefitClass === 'fixed_price' && form.fixedPriceSource === 'pricelist'
      && !pricelistOptionsLoaded && !pricelistOptionsLoading
    ) {
      loadPricelistOptions();
    }
  }, [view, form.benefitClass, form.fixedPriceSource, pricelistOptionsLoaded, pricelistOptionsLoading, loadPricelistOptions]);

  const scopeOptionsByType = { item: scopeItemOptions, item_folder: scopeFolderOptions };

  const resolveScopeLabel = useCallback((scope) => {
    const options = scopeOptionsByType[scope.scope_type] || [];
    const match = options.find((option) => option.id === Number(scope.scope_ref_id));
    if (match) return match.name;
    return `${scope.scope_type === 'item_folder' ? 'Folder' : 'Item'} #${scope.scope_ref_id}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeItemOptions, scopeFolderOptions]);

  const availableScopeOptions = useMemo(() => {
    const selectedIds = new Set(
      form.scopes.filter((scope) => scope.scope_type === scopeTypeDraft).map((scope) => Number(scope.scope_ref_id))
    );
    const options = scopeOptionsByType[scopeTypeDraft] || [];
    return options.filter((option) => !selectedIds.has(option.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.scopes, scopeTypeDraft, scopeItemOptions, scopeFolderOptions]);

  const openCreateForm = () => {
    setForm(blankForm());
    setFieldErrors({});
    setFormError('');
    setScopeRefDraft('');
    setRedemptionStats(null);
    setView('form');
  };

  const openEditForm = async (voucherSummary) => {
    setFormLoading(true);
    setFieldErrors({});
    setFormError('');
    try {
      const detail = await getVoucher(voucherSummary.voucher_id);
      setForm(voucherToForm(detail.voucher, detail.scopes, detail.account_grant_ids));
      setRedemptionStats(detail.redemption_stats || null);
      setScopeRefDraft('');
      setView('form');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load voucher details.');
    } finally {
      setFormLoading(false);
    }
  };

  const closeForm = useCallback(() => {
    setView('list');
    setFieldErrors({});
    setFormError('');
  }, []);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (view !== 'form' || typeof document === 'undefined') return undefined;

    formRestoreFocusRef.current = document.activeElement;
    formCloseButtonRef.current?.focus();

    const handleFormKeyDown = (event) => {
      // A date/time picker may be open above this form. Its shared Dialog owns Escape and Tab.
      if (document.querySelector('[data-dialog-root="true"]')) return;

      if (event.key === 'Escape') {
        if (savingRef.current) return;
        event.preventDefault();
        closeForm();
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = formDialogRef.current;
      if (!dialog) return;
      const focusableElements = Array.from(dialog.querySelectorAll(VOUCHER_FORM_FOCUSABLE_SELECTOR));
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastFocusable : firstFocusable).focus();
      } else if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleFormKeyDown);
    return () => {
      document.removeEventListener('keydown', handleFormKeyDown);
      const previousFocus = formRestoreFocusRef.current;
      formRestoreFocusRef.current = null;
      const restoreFocus = () => {
        const fallback = document.querySelector('[data-testid="pos-vouchers-new-button"]');
        const target = previousFocus && previousFocus !== document.body && previousFocus.isConnected
          ? previousFocus
          : fallback;
        target?.focus?.();
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreFocus);
      } else {
        restoreFocus();
      }
    };
  }, [closeForm, view]);

  // #1334/Phase 245: create-time only -- voucher_kind is read-only once a voucher exists (plan
  // §4.2/R8). applyVoucherKindDefaults resets the kind-dependent slice of the form so an invalid
  // combination (e.g. a leftover fixed-price scope on a delivery campaign) can never be saved.
  const handleVoucherKindChange = (voucherKind) => {
    setForm((current) => applyVoucherKindDefaults(current, voucherKind));
  };

  // #1334/Phase 245 (plan §4.4): an auto-applied campaign has no shopper-facing code, so prefill a
  // suggestion derived from the title -- kept editable, never generated silently. Only on the
  // create form; only while the code field is still untouched.
  useEffect(() => {
    if (form.voucherId) return; // edit -- code is either set or intentionally left as-is
    if (form.voucherKind !== 'delivery_campaign' || !form.autoApply) return;
    if (form.code !== '') return;
    const suggestion = suggestVoucherCode(form.title);
    if (!suggestion) return;
    setForm((current) => (current.code === '' ? { ...current, code: suggestion } : current));
  }, [form.voucherId, form.voucherKind, form.autoApply, form.title, form.code]);

  const handleSaveError = (error, fallback) => {
    const data = error?.response?.data;
    const reasonCode = getReasonCode(data);
    if (reasonCode === 'VOUCHER_VERSION_CONFLICT') {
      setReloadPromptOpen(true);
      return;
    }
    const fieldErrs = getFieldErrors(data);
    if (Object.keys(fieldErrs).length > 0) {
      setFieldErrors(fieldErrs);
      setFormError(data?.message || 'Please fix the highlighted fields.');
      return;
    }
    const message = describeError(error, fallback);
    setFormError(message);
    toast.error(message);
  };

  const handleSave = async () => {
    const localErrors = validateFormLocally(form);
    if (localErrors.length > 0) {
      setFieldErrors(localErrors.reduce((acc, { field, message }) => ({ ...acc, [field]: message }), {}));
      setFormError('Fix the highlighted fields before saving.');
      return;
    }
    setFieldErrors({});
    setFormError('');
    setSaving(true);
    try {
      const payload = buildVoucherPayload(form);
      if (form.voucherId) {
        await updateVoucher(form.voucherId, { ...payload, version: form.version });
        toast.success('Voucher updated.');
      } else {
        await createVoucher(payload);
        toast.success('Voucher created.');
      }
      setView('list');
      await loadVouchers();
    } catch (error) {
      handleSaveError(error, form.voucherId ? 'Failed to update the voucher.' : 'Failed to create the voucher.');
    } finally {
      setSaving(false);
    }
  };

  const handleReloadConflict = async () => {
    if (!form.voucherId) {
      setReloadPromptOpen(false);
      return;
    }
    setReloading(true);
    try {
      const detail = await getVoucher(form.voucherId);
      setForm(voucherToForm(detail.voucher, detail.scopes, detail.account_grant_ids));
      toast.warning('Reloaded the latest version. Your unsaved edits were discarded.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reload the voucher.');
    } finally {
      setReloading(false);
      setReloadPromptOpen(false);
    }
  };

  const openLifecycleConfirm = (voucher, action) => {
    setConfirmState({
      open: true,
      voucherId: voucher.voucher_id,
      action,
      label: voucher.code || voucher.title || `Voucher #${voucher.voucher_id}`
    });
  };

  const performLifecycleTransition = async () => {
    const { voucherId, action } = confirmState;
    const fn = LIFECYCLE_ACTION_FN[action];
    if (!fn || !voucherId) return false;
    setLifecycleBusyId(voucherId);
    try {
      const result = await fn(voucherId);
      toast.success(`Voucher ${action}d.`);
      await loadVouchers({ silent: true });
      if (form.voucherId === voucherId && result?.voucher) {
        setForm((current) => ({
          ...current,
          status: result.voucher.status,
          derivedStatus: result.voucher.derived_status,
          version: Number(result.voucher.version)
        }));
      }
      return true;
    } catch (error) {
      const message = describeError(error, `Failed to ${action} the voucher.`);
      toast.error(message);
      return { success: false, message };
    } finally {
      setLifecycleBusyId(null);
    }
  };

  const handleAddScope = () => {
    if (!scopeRefDraft) return;
    const id = Number(scopeRefDraft);
    if (!Number.isInteger(id) || id <= 0) return;
    setForm((current) => ({
      ...current,
      scopes: [...current.scopes, { scope_type: scopeTypeDraft, scope_ref_id: id }]
    }));
    setScopeRefDraft('');
  };

  const handleRemoveScope = (scopeType, id) => {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.filter((scope) => !(scope.scope_type === scopeType && Number(scope.scope_ref_id) === id))
    }));
  };

  const handleSearchSubmit = () => {
    setPage(1);
    setAppliedSearch(searchInput.trim());
  };

  useEffect(() => {
    if (searchInput.trim() === appliedSearch) return undefined;
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setAppliedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [appliedSearch, searchInput]);

  const syncFilterDraft = () => {
    setDraftStatusFilter(statusFilter);
    setDraftBenefitClassFilter(benefitClassFilter);
    setDraftVoucherKindFilter(voucherKindFilter);
    setDraftAutoApplyFilter(autoApplyFilter);
    setDraftSort(sort);
  };

  const openDesktopFilters = () => {
    syncFilterDraft();
    setShowDesktopFilters((visible) => !visible);
  };

  const openMobileFilters = () => {
    syncFilterDraft();
    setShowMobileFilters(true);
  };

  const applyFilterDraft = () => {
    setPage(1);
    setStatusFilter(draftStatusFilter);
    setBenefitClassFilter(draftBenefitClassFilter);
    setVoucherKindFilter(draftVoucherKindFilter);
    setAutoApplyFilter(draftVoucherKindFilter === 'delivery_campaign' ? draftAutoApplyFilter : '');
    setSort(draftSort);
  };

  const applyDesktopFilters = () => {
    applyFilterDraft();
    setShowDesktopFilters(false);
  };

  const applyMobileFilters = () => {
    applyFilterDraft();
    setShowMobileFilters(false);
  };

  const resetFilterDraft = () => {
    setDraftStatusFilter('');
    setDraftBenefitClassFilter('');
    setDraftVoucherKindFilter('');
    setDraftAutoApplyFilter('');
    setDraftSort('created_at');
  };

  useLayoutEffect(() => {
    if (!showDesktopFilters || typeof window === 'undefined') {
      setDesktopFilterPosition(null);
      return undefined;
    }

    const updateDesktopFilterPosition = () => {
      const buttonRect = desktopFilterButtonRef.current?.getBoundingClientRect?.();
      if (!buttonRect) return;

      const viewportPadding = 16;
      const dialogWidth = Math.min(
        VOUCHER_DESKTOP_FILTER_WIDTH,
        Math.max(360, window.innerWidth - (viewportPadding * 2))
      );
      const left = Math.max(
        viewportPadding,
        Math.min(
          buttonRect.right - dialogWidth,
          window.innerWidth - viewportPadding - dialogWidth
        )
      );
      const preferredTop = buttonRect.bottom + 8;
      const maxHeight = Math.min(
        768,
        Math.max(240, window.innerHeight - preferredTop - viewportPadding)
      );
      const top = preferredTop + 480 > window.innerHeight - viewportPadding
        ? Math.max(viewportPadding, buttonRect.top - Math.min(480, maxHeight) - 8)
        : preferredTop;

      setDesktopFilterPosition({
        left,
        top,
        width: dialogWidth,
        maxWidth: dialogWidth,
        maxHeight: Math.min(768, Math.max(240, window.innerHeight - top - viewportPadding)),
        boxSizing: 'border-box'
      });
    };

    updateDesktopFilterPosition();
    window.addEventListener('resize', updateDesktopFilterPosition);
    window.addEventListener('scroll', updateDesktopFilterPosition, true);
    return () => {
      window.removeEventListener('resize', updateDesktopFilterPosition);
      window.removeEventListener('scroll', updateDesktopFilterPosition, true);
    };
  }, [showDesktopFilters]);

  const hasActiveVoucherFilters = Boolean(statusFilter || benefitClassFilter || voucherKindFilter || autoApplyFilter)
    || sort !== 'created_at';
  const sortDirectionLabel = direction === 'asc' ? 'ascending' : 'descending';
  const toggleSortDirection = () => {
    setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
  };

  if (disabled) {
  return (
      <div id={sectionId} className="p-1 text-sm text-slate-500">
        Unlock the terminal to manage vouchers.
      </div>
    );
  }

  const renderListView = () => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <div className="relative">
          <div className="pos-items-desktop-toolbar hidden items-center gap-2 sm:flex">
          <PosSearchField
              id="pos-vouchers-search"
              ariaLabel="Search vouchers"
              variant="catalog"
              inputClassName={POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS}
              className="min-w-0 flex-1"
              placeholder="Code or title"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onClear={() => setSearchInput('')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
          />
          <div className="pos-items-desktop-actions flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="default"
              ref={desktopFilterButtonRef}
              onClick={openDesktopFilters}
              className="pos-filter-trigger pos-items-primary-action h-9 rounded-lg bg-[#1A4E8D] px-3 text-[13px] text-white hover:bg-[#143F73] active:bg-[#143F73]"
              aria-expanded={showDesktopFilters}
              aria-pressed={showDesktopFilters || hasActiveVoucherFilters}
              aria-controls="pos-vouchers-desktop-filters"
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Filter
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={toggleSortDirection}
              aria-label={`Sort vouchers ${sortDirectionLabel}`}
              aria-pressed={direction === 'desc'}
              title={`Sort vouchers ${sortDirectionLabel}`}
              data-testid="pos-vouchers-sort-direction-toggle"
              className="pos-items-primary-action grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#1A4E8D] p-0 text-white hover:bg-[#143F73] active:bg-[#143F73]"
            >
              {direction === 'asc'
                ? <SortAsc className="h-4 w-4" aria-hidden="true" />
                : <SortDesc className="h-4 w-4" aria-hidden="true" />}
            </Button>
            {canManage && (
            <Button
              type="button"
              variant="default"
              onClick={openCreateForm}
              data-testid="pos-vouchers-new-button"
              className="pos-items-primary-action h-9 rounded-lg border-[#1A4E8D] bg-[#1A4E8D] px-3 text-[13px] text-white shadow-none hover:bg-[#143F73] active:bg-[#143F73]"
            >
              <VoucherPlusIcon className="mr-1.5 h-4 w-4" /> New Voucher
            </Button>
            )}
          </div>
          </div>

        <div className="pos-items-mobile-controls sm:hidden">
          <div className="pos-items-mobile-toolbar">
          <PosSearchField
              id="pos-vouchers-search-mobile"
              ariaLabel="Search vouchers"
              variant="catalog"
              inputClassName={POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS}
              className="min-w-0 flex-1"
              placeholder="Code or title"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onClear={() => setSearchInput('')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
          />
          <button
            type="button"
            onClick={openMobileFilters}
            aria-label="Filter vouchers"
            aria-expanded={showMobileFilters}
            aria-pressed={showMobileFilters || hasActiveVoucherFilters}
            aria-controls="pos-vouchers-mobile-filter-dialog"
            className={`pos-items-mobile-icon-button pos-items-mobile-primary-button ${showMobileFilters || hasActiveVoucherFilters ? 'pos-items-mobile-icon-button--active' : ''}`}
          >
            <Filter aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleSortDirection}
            aria-label={`Sort vouchers ${sortDirectionLabel}`}
            aria-pressed={direction === 'desc'}
            title={`Sort vouchers ${sortDirectionLabel}`}
            data-testid="pos-vouchers-sort-direction-toggle"
            className="pos-items-mobile-icon-button pos-items-mobile-primary-button"
          >
            {direction === 'asc'
              ? <SortAsc aria-hidden="true" />
              : <SortDesc aria-hidden="true" />}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openCreateForm}
              aria-label="New voucher"
              data-testid="pos-vouchers-new-button"
              className="pos-items-mobile-icon-button pos-items-mobile-primary-button"
            >
            <VoucherPlusIcon />
            </button>
          )}
          </div>
        </div>

        {showDesktopFilters ? (
          <PosFilterDialogShell
            open={showDesktopFilters}
            onClose={() => setShowDesktopFilters(false)}
            position={desktopFilterPosition}
            id="pos-vouchers-desktop-filters"
            ariaLabelledBy="pos-vouchers-filter-title"
            ariaDescribedBy="pos-vouchers-filter-description"
            className="pos-filter-surface--extended dgfy-pos-history-filter-surface"
          >
            <PosFilterDialogHeader
              title="Filter"
              description="Refine your Voucher list"
              titleId="pos-vouchers-filter-title"
              descriptionId="pos-vouchers-filter-description"
              onClose={() => setShowDesktopFilters(false)}
              closeLabel="Close voucher filters"
              className="dgfy-pos-history-dialog-header"
              titleClassName="text-xl font-black text-[#0F172A]"
              descriptionClassName="mt-0.5 text-[12px] text-slate-500"
            />

            <div className="pos-filter-surface-body dgfy-pos-history-dialog-body min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-2">
              <div className="grid min-w-0 gap-3">
                <VoucherFilterChoiceGroup label="Status" value={draftStatusFilter} options={VOUCHER_STATUS_OPTIONS} onChange={setDraftStatusFilter} testId="pos-vouchers-filter-status" />
                <VoucherFilterChoiceGroup
                  label="Type"
                  value={draftVoucherKindFilter}
                  options={VOUCHER_TYPE_OPTIONS}
                  onChange={(value) => {
                    setDraftVoucherKindFilter(value);
                    if (value !== 'delivery_campaign') setDraftAutoApplyFilter('');
                  }}
                  testId="pos-vouchers-filter-type"
                />
                {draftVoucherKindFilter === 'delivery_campaign' && (
                  <VoucherFilterChoiceGroup label="Auto-apply" value={draftAutoApplyFilter} options={VOUCHER_AUTO_APPLY_OPTIONS} onChange={setDraftAutoApplyFilter} testId="pos-vouchers-filter-auto-apply" />
                )}
                <VoucherFilterChoiceGroup label="Benefit Type" value={draftBenefitClassFilter} options={VOUCHER_BENEFIT_OPTIONS} onChange={setDraftBenefitClassFilter} testId="pos-vouchers-filter-benefit" />
                <VoucherFilterChoiceGroup label="Sort" value={draftSort} options={VOUCHER_SORT_OPTIONS} onChange={setDraftSort} testId="pos-vouchers-filter-sort" />
              </div>
            </div>

            <PosFilterDialogFooter
              onReset={resetFilterDraft}
              onApply={applyDesktopFilters}
              resetLabel="Reset All"
              applyLabel="Apply Filters"
              resetTestId="pos-vouchers-reset-filters"
              applyTestId="pos-vouchers-apply-filters"
              className="gap-2 px-4 py-2 dgfy-pos-history-dialog-footer"
              leftButtonClassName="pos-items-reset-action h-10"
              applyButtonClassName="h-10"
            />
          </PosFilterDialogShell>
        ) : null}

        <PosFilterDialogShell
          open={showMobileFilters}
          onClose={() => setShowMobileFilters(false)}
          mobile
          id="pos-vouchers-mobile-filter-dialog"
          ariaLabelledBy="pos-vouchers-mobile-filter-title"
          ariaDescribedBy="pos-vouchers-mobile-filter-description"
          className="dgfy-pos-history-filter-surface"
        >
          <PosFilterDialogHeader
            title="Filter"
            description="Refine your Voucher list"
            titleId="pos-vouchers-mobile-filter-title"
            descriptionId="pos-vouchers-mobile-filter-description"
            onClose={() => setShowMobileFilters(false)}
            closeLabel="Close voucher filters"
            mobile
            className="dgfy-pos-history-dialog-header"
            titleClassName="text-xl font-black text-[#0F172A]"
            descriptionClassName="mt-0.5 text-[12px] text-slate-500"
          />

          <div className="pos-filter-surface-body dgfy-pos-history-dialog-body min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-3">
            <div className="grid min-w-0 gap-3">
                <VoucherFilterChoiceGroup label="Status" value={draftStatusFilter} options={VOUCHER_STATUS_OPTIONS} onChange={setDraftStatusFilter} mobile testId="pos-vouchers-mobile-filter-status" />
                <VoucherFilterChoiceGroup
                  label="Type"
                  value={draftVoucherKindFilter}
                  options={VOUCHER_TYPE_OPTIONS}
                  onChange={(value) => {
                    setDraftVoucherKindFilter(value);
                    if (value !== 'delivery_campaign') setDraftAutoApplyFilter('');
                  }}
                  mobile
                  testId="pos-vouchers-mobile-filter-type"
                />
                {draftVoucherKindFilter === 'delivery_campaign' && (
                  <VoucherFilterChoiceGroup label="Auto-apply" value={draftAutoApplyFilter} options={VOUCHER_AUTO_APPLY_OPTIONS} onChange={setDraftAutoApplyFilter} mobile testId="pos-vouchers-mobile-filter-auto-apply" />
                )}
                <VoucherFilterChoiceGroup label="Benefit Type" value={draftBenefitClassFilter} options={VOUCHER_BENEFIT_OPTIONS} onChange={setDraftBenefitClassFilter} mobile testId="pos-vouchers-mobile-filter-benefit" />
                <VoucherFilterChoiceGroup label="Sort" value={draftSort} options={VOUCHER_SORT_OPTIONS} onChange={setDraftSort} mobile testId="pos-vouchers-mobile-filter-sort" />
            </div>
          </div>

          <PosFilterDialogFooter
            onReset={resetFilterDraft}
            onApply={applyMobileFilters}
            resetLabel="Reset All"
            applyLabel="Apply Filters"
            resetTestId="pos-vouchers-mobile-reset-filters"
            applyTestId="pos-vouchers-mobile-apply-filters"
            mobile
            className="gap-3 px-4 py-3 dgfy-pos-history-dialog-footer"
            leftButtonClassName="h-9"
            applyButtonClassName="h-9"
          />
        </PosFilterDialogShell>
      </div>
      </div>

      <div data-testid="pos-vouchers-content" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {listLoading && <p className="text-sm text-slate-500">Loading vouchers...</p>}
        {!listLoading && listError && (
          <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <span>{listError}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => loadVouchers()}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Retry
            </Button>
          </div>
        )}

        {!listLoading && !listError && vouchers.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm shadow-slate-200/70">
            No vouchers match these filters yet.
          </div>
        )}

        {!listLoading && !listError && vouchers.length > 0 && (
          <div data-testid="pos-vouchers-results" className="dgfy-pos-scroll-region min-h-0 min-w-0 flex-1 content-start overflow-y-auto overscroll-contain pr-1 touch-pan-y space-y-2">
          {vouchers.map((voucher) => {
            const allowedTargets = ALLOWED_STATUS_TRANSITIONS[voucher.derived_status] || [];
            const busy = lifecycleBusyId === voucher.voucher_id;
            const benefitLabel = BENEFIT_CLASS_LABEL[voucher.benefit_class] || voucher.benefit_class;
            const benefitValue = voucher.benefit_class === 'percent_off'
              ? `${bpsToPercentString(voucher.percent_off_bps)}% off`
              : voucher.benefit_class === 'amount_off'
                ? `${peso(voucher.amount_off_centavos)} off`
                : voucher.benefit_class === 'fixed_price'
                  ? voucher.pricelist_id != null ? 'Pricelist' : peso(voucher.fixed_unit_price_centavos)
                  : voucher.benefit_class === 'free_delivery'
                    ? voucher.delivery_amount_off_centavos == null ? 'Whole fee waived' : `up to ${peso(voucher.delivery_amount_off_centavos)} waived`
                    : '';
            const statusBadgeClass = STATUS_BADGE_CLASS[voucher.derived_status] || STATUS_BADGE_CLASS.draft;
            const statusLabel = STATUS_LABEL[voucher.derived_status] || voucher.derived_status;
            return (
              <div key={voucher.voucher_id} className="rounded-xl border border-slate-300 bg-white p-2 shadow-none">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pos-voucher-card-row">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <div className="hidden h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#EEF4FF] text-[#1A4E8D] ring-1 ring-[#D7E3F4] sm:grid pos-voucher-card-icon">
                      <Ticket className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Ticket className="h-3.5 w-3.5 shrink-0 text-[#1A4E8D] sm:hidden" aria-hidden="true" />
                          <p className="min-w-0 max-w-full shrink break-words text-[13px] font-black uppercase leading-tight tracking-[0.06em] text-[#0F172A]">{voucher.code}</p>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusBadgeClass}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${voucher.derived_status === 'active' ? 'bg-emerald-500' : 'bg-current'}`} aria-hidden="true" />
                            {statusLabel}
                          </span>
                        </div>
                        <p
                          className="mt-1 min-w-0 max-w-full overflow-hidden break-words line-clamp-2 text-[13px] font-bold uppercase leading-tight tracking-[0.02em] text-[#334155] sm:mt-0.5"
                          title={voucher.title || undefined}
                        >
                          {voucher.title}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
                        <span className="rounded-lg border border-[#D7E3F4] bg-[#F4F7FD] px-2 py-0.5 text-[11px] font-bold text-[#475569]">{benefitLabel}</span>
                        {benefitValue && (
                          <span className="rounded-lg border border-[#D7E3F4] bg-[#F4F7FD] px-2 py-0.5 text-[11px] font-bold text-[#1A4E8D]">{benefitValue}</span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-lg border border-[#D7E3F4] bg-[#F4F7FD] px-2 py-0.5 text-[11px] font-bold text-[#475569]">
                          <BarChart3 className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" />
                          Redeemed {voucher.redeemed_count || 0}{voucher.max_redemptions ? ` / ${voucher.max_redemptions}` : ''}
                        </span>
                        {voucher.auto_apply === true && (
                          <span className="rounded-lg border border-[#D7E3F4] bg-[#F4F7FD] px-2 py-0.5 text-[11px] font-bold text-[#475569]">Auto-applied</span>
                        )}
                      </div>
                      {voucher.redemption_stats && (
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                          Redemptions {voucher.redemption_stats.redemption_count} · Waived {peso(voucher.redemption_stats.total_discount_centavos)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex w-full min-w-0 items-center gap-1 border-t border-slate-100 pt-2 sm:w-auto sm:flex-wrap sm:justify-end sm:gap-1.5 sm:border-t-0 sm:pt-0">
                    <Button type="button" variant="outline" onClick={() => openEditForm(voucher)} className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] shadow-sm sm:w-[6.5rem] sm:flex-none sm:text-xs">
                      <Pencil className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> {canManage ? 'Edit' : 'View'}
                    </Button>
                    {canManage && allowedTargets.includes('active') && (
                      <Button type="button" variant="outline" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'activate')} className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] shadow-sm hover:bg-[#F0F6FF] sm:w-[6.5rem] sm:flex-none sm:text-xs">
                        <Play className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> Activate
                      </Button>
                    )}
                    {canManage && allowedTargets.includes('paused') && (
                      <Button type="button" variant="outline" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'pause')} className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] shadow-sm hover:bg-[#F0F6FF] sm:w-[6.5rem] sm:flex-none sm:text-xs">
                        <Pause className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> Pause
                      </Button>
                    )}
                    {canManage && allowedTargets.includes('archived') && (
                      <Button type="button" variant="outline" className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-rose-300 px-2 text-[11px] font-bold text-rose-600 shadow-sm hover:bg-rose-50 sm:w-[6.5rem] sm:flex-none sm:text-xs" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'archive')}>
                         <Archive className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> Archive
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {!listError && (
        <GlobalPagination
          testId="pos-vouchers-pagination"
          ariaLabel="Voucher pagination"
          currentPage={page}
          totalPages={Math.max(1, Number(pagination.total_pages || 1))}
          totalItems={Number(pagination.total || vouchers.length || 0)}
          pageSize={pageSize}
          pageSizeOptions={VOUCHER_PAGE_SIZE_OPTIONS}
          hidePageSizeSuffixOnMobile
          itemLabel="vouchers"
          loading={listLoading}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPage(1);
            setPageSize(nextPageSize);
          }}
          accentColor="#1A4E8D"
          className="dgfy-pos-history-pagination-footer mt-auto shrink-0 rounded-none border-0 border-t border-slate-200 px-6 py-2.5 shadow-none"
        />
      )}
    </div>
  );

  const renderForm = () => (
    <VoucherFormModal
      form={form}
      canManage={canManage}
      formLoading={formLoading}
      saving={saving}
      fieldErrors={fieldErrors}
      formError={formError}
      redemptionStats={redemptionStats}
      formDialogRef={formDialogRef}
      formCloseButtonRef={formCloseButtonRef}
      savingRef={savingRef}
      closeForm={closeForm}
      handleVoucherKindChange={handleVoucherKindChange}
      setForm={setForm}
      handleAddScope={handleAddScope}
      availableScopeOptions={availableScopeOptions}
      scopeTypeDraft={scopeTypeDraft}
      setScopeTypeDraft={setScopeTypeDraft}
      scopeRefDraft={scopeRefDraft}
      setScopeRefDraft={setScopeRefDraft}
      scopeCatalogLoading={scopeCatalogLoading}
      resolveScopeLabel={resolveScopeLabel}
      handleRemoveScope={handleRemoveScope}
      pricelistOptionsLoading={pricelistOptionsLoading}
      pricelistOptions={pricelistOptions}
      hasDraftPricelist={hasDraftPricelist}
      onNavigateToPricelists={onNavigateToPricelists}
      handleSave={handleSave}
    />
  );
  return (
    <div id={sectionId} className="pos-voucher-catalog-workspace flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-hidden">
      {view === 'list' ? renderListView() : renderForm()}

      <ConfirmActionDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((current) => ({ ...current, open }))}
        title={`${LIFECYCLE_ACTION_LABEL[confirmState.action] || 'Update'} ${confirmState.label}?`}
        description={
          confirmState.action === 'archive'
            ? 'Archiving is permanent -- an archived voucher can never be reactivated or edited again.'
            : confirmState.action === 'activate'
              ? 'This will activate the voucher immediately and make it available for redemption wherever its configured eligibility rules apply.'
              : confirmState.action === 'pause'
                ? 'This will pause the voucher immediately and stop it from being redeemed until it is activated again.'
                : 'This changes the voucher’s status immediately.'
        }
        confirmLabel={LIFECYCLE_ACTION_LABEL[confirmState.action] || 'Confirm'}
        variant={confirmState.action === 'archive' ? 'destructive' : 'default'}
        stackedActions={confirmState.action === 'activate' || confirmState.action === 'pause' || confirmState.action === 'archive'}
        showIcon={false}
        confirmClassName={
          confirmState.action === 'activate' || confirmState.action === 'pause'
            ? 'bg-[#1A4E8D] text-white hover:bg-[#143F73] focus:ring-[#1A4E8D]'
            : confirmState.action === 'archive'
              ? 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600'
              : ''
        }
        onConfirm={performLifecycleTransition}
      />

      <ConfirmActionDialog
        open={reloadPromptOpen}
        onOpenChange={setReloadPromptOpen}
        title="This voucher changed"
        description="Someone else saved a change to this voucher since it was loaded. Reload to see the latest version -- your unsaved edits here will be discarded."
        confirmLabel={reloading ? 'Reloading...' : 'Reload'}
        cancelLabel="Keep editing"
        onConfirm={handleReloadConflict}
      />
    </div>
  );
}
