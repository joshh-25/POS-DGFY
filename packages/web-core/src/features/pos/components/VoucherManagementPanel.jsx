import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  BadgePercent,
  BarChart3,
  CalendarClock,
  Filter,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Ticket,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination } from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import StorefrontSectionInfo from '../settings/StorefrontSectionInfo.jsx';
import { PosFilterDialogFooter, PosFilterDialogHeader } from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
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
  WEEKDAY_LABELS,
  applyVoucherKindDefaults,
  blankForm,
  bpsToPercentString,
  buildVoucherPayload,
  peso,
  pesoStringToCentavos,
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

const VOUCHER_DIRECTION_OPTIONS = Object.freeze([
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' }
]);

const VOUCHER_AUTO_APPLY_OPTIONS = Object.freeze([
  { value: '', label: 'Any' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' }
]);

const VOUCHER_MODAL_CHECKBOX_CLASS = 'pos-voucher-checkbox';
const VOUCHER_MODAL_SELECT_CLASS = 'pos-voucher-form-select';
const WEEKDAY_FULL_LABELS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

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

const FieldError = ({ message }) => (message ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{message}</p> : null);

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
  const [direction, setDirection] = useState('desc');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showDesktopFilters, setShowDesktopFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = useState('');
  const [draftBenefitClassFilter, setDraftBenefitClassFilter] = useState('');
  const [draftVoucherKindFilter, setDraftVoucherKindFilter] = useState('');
  const [draftAutoApplyFilter, setDraftAutoApplyFilter] = useState('');
  const [draftSort, setDraftSort] = useState('created_at');
  const [draftDirection, setDraftDirection] = useState('desc');
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
  const [scopeSearch, setScopeSearch] = useState('');

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
    const query = scopeSearch.trim().toLowerCase();
    return options.filter((option) => !selectedIds.has(option.id) && (!query || option.name.toLowerCase().includes(query)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.scopes, scopeTypeDraft, scopeItemOptions, scopeFolderOptions, scopeSearch]);

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

  const closeForm = () => {
    setView('list');
    setFieldErrors({});
    setFormError('');
  };

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
    setDraftDirection(direction);
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
    setDirection(draftDirection);
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
    setDraftDirection('desc');
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
    || sort !== 'created_at'
    || direction !== 'desc';

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
          <div className="relative min-w-0 flex-1">
            <Label htmlFor="pos-vouchers-search" className="sr-only">Search vouchers</Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A4E8D]" aria-hidden="true" />
            <Input
              id="pos-vouchers-search"
              className="h-9 rounded-lg border-[#1A4E8D] bg-white pl-9 pr-3 text-[13px] placeholder:text-slate-300 focus:border-[#1A4E8D] focus:ring-blue-100"
              placeholder="Code or title"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
            />
          </div>
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
            {canManage && (
            <Button
              type="button"
              variant="default"
              onClick={openCreateForm}
              className="pos-items-primary-action h-9 rounded-lg border-[#1A4E8D] bg-[#1A4E8D] px-3 text-[13px] text-white shadow-none hover:bg-[#143F73] active:bg-[#143F73]"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> New Voucher
            </Button>
            )}
          </div>
          </div>

        <div className="pos-items-mobile-controls sm:hidden">
          <div className="pos-items-mobile-toolbar">
            <div className="pos-items-mobile-search">
            <Label htmlFor="pos-vouchers-search-mobile" className="sr-only">Search vouchers</Label>
            <Input
              id="pos-vouchers-search-mobile"
              className="h-11 w-full rounded-2xl border-[#1A4E8D] bg-white pl-9 pr-3 text-base text-[#0F172A] placeholder:text-slate-300 shadow-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100"
              placeholder="Code or title"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A4E8D]" aria-hidden="true" />
            </div>
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
          {canManage && (
            <button
              type="button"
              onClick={openCreateForm}
              aria-label="New voucher"
              className="pos-items-mobile-icon-button pos-items-mobile-primary-button"
            >
            <Plus aria-hidden="true" />
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
                <VoucherFilterChoiceGroup label="Direction" value={draftDirection} options={VOUCHER_DIRECTION_OPTIONS} onChange={setDraftDirection} fillRow testId="pos-vouchers-filter-direction" />
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
                <VoucherFilterChoiceGroup label="Direction" value={draftDirection} options={VOUCHER_DIRECTION_OPTIONS} onChange={setDraftDirection} mobile fillRow testId="pos-vouchers-mobile-filter-direction" />
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
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
                          <p className="min-w-0 max-w-full shrink break-words text-base font-black uppercase leading-tight tracking-[0.06em] text-[#0F172A] sm:text-[13px]">{voucher.code}</p>
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
                    <Button type="button" variant="outline" onClick={() => openEditForm(voucher)} className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] shadow-sm sm:h-8 sm:w-[6.5rem] sm:flex-none sm:text-xs">
                      <Pencil className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> {canManage ? 'Edit' : 'View'}
                    </Button>
                    {canManage && allowedTargets.includes('active') && (
                      <Button type="button" variant="outline" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'activate')} className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] shadow-sm hover:bg-[#F0F6FF] sm:h-8 sm:w-[6.5rem] sm:flex-none sm:text-xs">
                        <Play className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> Activate
                      </Button>
                    )}
                    {canManage && allowedTargets.includes('paused') && (
                      <Button type="button" variant="outline" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'pause')} className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] shadow-sm hover:bg-[#F0F6FF] sm:h-8 sm:w-[6.5rem] sm:flex-none sm:text-xs">
                        <Pause className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> Pause
                      </Button>
                    )}
                    {canManage && allowedTargets.includes('archived') && (
                      <Button type="button" variant="outline" className="h-9 min-w-0 w-auto flex-1 justify-center whitespace-nowrap rounded-lg border-rose-300 px-2 text-[11px] font-bold text-rose-600 shadow-sm hover:bg-rose-50 sm:h-8 sm:w-[6.5rem] sm:flex-none sm:text-xs" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'archive')}>
                         <Archive className="mr-1 h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" /> Archive
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

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

  const renderForm = () => {
    const isEdit = Boolean(form.voucherId);
    const codeEditable = canManage && (!isEdit || (form.status === 'draft' && form.redeemedCount === 0));
    const formLocked = !canManage || form.status === 'archived';
    // #1334/Phase 245:
    const isDeliveryCampaign = form.voucherKind === 'delivery_campaign';

    const formModal = (
      <div
        className="pos-items-modal-overlay pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-700/30 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-vouchers-form-modal-title"
        onClick={closeForm}
      >
        <div
          className="pos-items-modal-panel pos-items-catalog-form-modal pos-items-mobile-sheet-panel pos-voucher-form-modal relative flex h-[calc(100dvh-1.5rem)] w-full max-w-[64rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:h-auto sm:max-h-[calc(100dvh-2rem)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="pos-voucher-form-modal-header -mx-px -mt-px flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D] px-4 py-2.5 sm:flex-nowrap sm:gap-3 sm:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm ring-1 ring-[#C7DCF3]">
                <Ticket className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="pos-vouchers-form-modal-title" className="text-sm font-black text-white">
                  {isEdit ? 'Edit Voucher' : 'New Voucher'}
                </h2>
                <p className="mt-0.5 max-w-full break-words text-[10px] leading-3 text-blue-100">
                  {isEdit ? 'Update POS catalog voucher & redemption rules' : 'Create and configure POS catalog voucher & redemption rules'}
                </p>
              </div>
            </div>
            <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label={`Close ${isEdit ? 'Edit' : 'New'} Voucher`}
                className="grid h-8 w-8 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1A4E8D]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="pos-items-modal-body pos-items-modal-scroll-region min-h-0 flex-1 overflow-y-auto bg-[#F8FAFC] px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">

          {/* #1494: read-only audit meta -- accountable creating/modifying officer. Never part of
              buildVoucherPayload's outgoing request body. */}
          {isEdit && (form.createdByUsername || form.updatedByUsername) && (
            <p className="pos-voucher-audit-meta max-w-full text-[11px] leading-tight text-slate-400 sm:leading-normal">
              {form.createdByUsername && (
                <span className="block max-w-full break-words sm:inline">
                  Created by {form.createdByUsername}
                  {form.createdAt && ` on ${new Date(form.createdAt).toLocaleDateString()}`}
                </span>
              )}
              {form.updatedByUsername && form.updatedAt && (
                <>
                  {form.createdByUsername && <span className="hidden sm:inline" aria-hidden="true"> · </span>}
                  <span className="block max-w-full break-words sm:inline">
                    Last modified by {form.updatedByUsername} on {new Date(form.updatedAt).toLocaleDateString()}
                  </span>
                </>
              )}
            </p>
          )}

        {formLoading && <p className="text-sm text-slate-500">Loading voucher...</p>}

        {!formLoading && (
          <>
            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{formError}</div>
            )}
            {form.status === 'archived' && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> Archived vouchers are read-only.
              </div>
            )}
            {!canManage && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> You have view-only access to vouchers.
              </div>
            )}

            <fieldset disabled={formLocked} className="space-y-3">
              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <Ticket className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Basics</h4>
                </div>

                {/* #1334/Phase 245 (plan §4.2): voucher_kind/benefit_class/benefit_target are never
                    raw enum pickers -- picking "Delivery campaign" here is the only control that
                    sets all three, so every rejectable server combination becomes unrepresentable
                    from this UI rather than merely validated (plan §6 Layer 1). Read-only once a
                    voucher exists (R8) -- converting an existing voucher's kind is out of scope. */}
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Voucher type <span className="text-rose-600" aria-hidden="true">*</span></Label>
                    {isEdit ? (
                      <StorefrontSectionInfo label="Voucher type" panelId="pos-vouchers-voucher-type-info" portal>
                        <p>Voucher type cannot be changed after the voucher is created.</p>
                      </StorefrontSectionInfo>
                    ) : null}
                  </div>
                  {isEdit ? (
                    <div>
                      <div className="flex flex-wrap gap-4">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <input type="radio" name="voucherKind" checked={form.voucherKind === 'promo_code'} disabled readOnly />
                          Promo code
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <input type="radio" name="voucherKind" checked={form.voucherKind === 'delivery_campaign'} disabled readOnly />
                          Delivery campaign
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <input type="radio" name="voucherKind" checked={form.voucherKind === 'promo_code'}
                          onChange={() => handleVoucherKindChange('promo_code')} />
                        Promo code
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <input type="radio" name="voucherKind" checked={form.voucherKind === 'delivery_campaign'}
                          onChange={() => handleVoucherKindChange('delivery_campaign')} />
                        Delivery campaign
                      </label>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Code <span className="text-rose-600" aria-hidden="true">*</span></Label>
                      {isEdit && !codeEditable ? (
                        <StorefrontSectionInfo label="Code" panelId="pos-vouchers-code-info" portal>
                          <p>Code is locked once a voucher leaves draft or has a redemption.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                      {!isEdit && form.voucherKind === 'delivery_campaign' && form.autoApply ? (
                        <StorefrontSectionInfo label="Code" panelId="pos-vouchers-code-info" portal>
                          <p>Suggested from the campaign name. Shoppers never type this code, but it still appears in reports.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    <Input
                      className="h-8 text-xs uppercase"
                      value={form.code}
                      maxLength={40}
                      disabled={!codeEditable}
                      onChange={(e) => setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))}
                    />
                    <FieldError message={fieldErrors.code} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">
                      {form.voucherKind === 'delivery_campaign' ? 'Campaign name' : 'Title'} <span className="text-rose-600" aria-hidden="true">*</span>
                    </Label>
                    <Input className="h-8 text-xs" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} />
                    <FieldError message={fieldErrors.title} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Subtitle</Label>
                      <StorefrontSectionInfo label="Subtitle" panelId="pos-vouchers-subtitle-info" portal>
                        <p>Subtitle is saved with the voucher but is not displayed anywhere yet.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <Input className="h-8 text-xs" value={form.subtitle} onChange={(e) => setForm((current) => ({ ...current, subtitle: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Badge</Label>
                      <StorefrontSectionInfo label="Badge" panelId="pos-vouchers-badge-info" portal>
                        <p>Shown as the discount label once applied, if set. It falls back to the voucher title otherwise.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <Input className="h-8 text-xs" value={form.badge} onChange={(e) => setForm((current) => ({ ...current, badge: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Validity text</Label>
                      <StorefrontSectionInfo label="Validity text" panelId="pos-vouchers-validity-text-info" portal>
                        <p>Validity text is saved with the voucher but is not displayed anywhere yet.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <Input className="h-8 text-xs" value={form.validityText} onChange={(e) => setForm((current) => ({ ...current, validityText: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <BadgePercent className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Benefit</h4>
                </div>

                {/* #1334/Phase 245 (plan §4.2/§4.3): benefit_class/benefit_target are implicit for a
                    delivery campaign -- always free_delivery/delivery, never a raw picker. Item-
                    voucher scopes and the percent/amount/fixed-price fields don't apply and are
                    never rendered here, so the three server-rejectable combinations (fixed_price
                    targeting delivery, auto_apply on a non-delivery target, auto_apply carrying
                    scopes) are unrepresentable from this branch of the form. */}
                {form.voucherKind === 'delivery_campaign' ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-semibold text-[#0F172A]">Waiver amount <span className="text-rose-600" aria-hidden="true">*</span></Label>
                        <div className="flex flex-wrap gap-4">
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <input type="radio" name="deliveryWaiverMode" checked={form.deliveryWaiverMode === 'whole'}
                              onChange={() => setForm((current) => ({ ...current, deliveryWaiverMode: 'whole', deliveryAmountOffPesos: '' }))} />
                            Waive the whole delivery fee
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <input type="radio" name="deliveryWaiverMode" checked={form.deliveryWaiverMode === 'partial'}
                              onChange={() => setForm((current) => ({ ...current, deliveryWaiverMode: 'partial' }))} />
                            Waive up to a set amount
                          </label>
                        </div>
                      </div>
                      {form.deliveryWaiverMode === 'partial' && (
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-[#0F172A]">Waive up to (₱) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                          <Input type="number" min="0.01" step="0.01" className="h-8 text-xs" value={form.deliveryAmountOffPesos}
                            onChange={(e) => setForm((current) => ({ ...current, deliveryAmountOffPesos: e.target.value }))} />
                          <FieldError message={fieldErrors.delivery_amount_off_centavos} />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3">
                      <div className="flex items-center gap-1">
                        <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                          <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.autoApply} onCheckedChange={(checked) => setForm((current) => ({ ...current, autoApply: checked === true }))} />
                          Apply automatically -- shoppers get this without typing a code
                        </label>
                        <StorefrontSectionInfo label="Apply automatically" panelId="pos-vouchers-auto-apply-info" portal>
                          <p>
                            {form.autoApply
                              ? 'Applies automatically at storefront checkout once the order qualifies. The code is only used internally for reports and audit.'
                              : `When off, shoppers must enter the code${form.code ? ` "${form.code}"` : ''} at checkout, like a regular promo code.`}
                          </p>
                        </StorefrontSectionInfo>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Benefit type <span className="text-rose-600" aria-hidden="true">*</span></Label>
                    <Select value={form.benefitClass} onValueChange={(value) => setForm((current) => ({ ...current, benefitClass: value }))}>
                      <SelectTrigger className={`${VOUCHER_MODAL_SELECT_CLASS} h-8 w-full px-3 text-xs font-semibold`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent_off">Percent off</SelectItem>
                        <SelectItem value="amount_off">Amount off</SelectItem>
                        <SelectItem value="fixed_price">Fixed price</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.benefitClass === 'percent_off' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-[#0F172A]">Percent off (%) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                        <Input type="number" min="0.01" max="100" step="0.01" className="h-8 text-xs" value={form.percentOffPercent}
                          onChange={(e) => setForm((current) => ({ ...current, percentOffPercent: e.target.value }))} />
                        <FieldError message={fieldErrors.percent_off_bps} />
                      </div>
                      <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Max discount cap (₱)</Label>
                        <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.maxDiscountPesos}
                          onChange={(e) => setForm((current) => ({ ...current, maxDiscountPesos: e.target.value }))} />
                      </div>
                    </>
                  )}
                  {form.benefitClass === 'amount_off' && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Amount off (₱) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                      <Input type="number" min="0.01" step="0.01" className="h-8 text-xs" value={form.amountOffPesos}
                        onChange={(e) => setForm((current) => ({ ...current, amountOffPesos: e.target.value }))} />
                      <FieldError message={fieldErrors.amount_off_centavos} />
                    </div>
                  )}
                  {form.benefitClass === 'fixed_price' && form.fixedPriceSource === 'single' && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Fixed price (₱) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                      <Input type="number" min="0" step="0.01" className="h-8 text-xs" value={form.fixedUnitPricePesos}
                        onChange={(e) => setForm((current) => ({ ...current, fixedUnitPricePesos: e.target.value }))} />
                      <FieldError message={fieldErrors.fixed_unit_price_centavos} />
                    </div>
                  )}
                  {form.benefitClass === 'fixed_price' && form.fixedPriceSource === 'pricelist' && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Pricelist {pricelistOptionsLoading ? '(loading...)' : ''}</Label>
                      <Select value={form.pricelistId} onValueChange={(value) => setForm((current) => ({ ...current, pricelistId: value }))}>
                        <SelectTrigger className={`${VOUCHER_MODAL_SELECT_CLASS} h-8 w-full px-3 text-xs font-semibold`}>
                          <SelectValue placeholder="Select a pricelist..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Select a pricelist...</SelectItem>
                          {pricelistOptions.map((option) => (
                            <SelectItem key={option.pricelist_id} value={String(option.pricelist_id)}>{option.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError message={fieldErrors.pricelist_id} />
                      {/* #736: was a dead-end ("...on the Pricelists tab first") -- Pricelists
                          isn't a tab anymore (#732 promoted it to its own top-level nav mode), and
                          this now navigates there directly instead of just naming where to go. */}
                      {pricelistOptions.length === 0 && !pricelistOptionsLoading && (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
                          {/* RF-6: a draft pricelist exists but isn't attachable yet -- distinct
                              copy from "you have none at all", per #736's own acceptance. */}
                          <p className="text-[11px] text-slate-500">
                            {hasDraftPricelist
                              ? 'You have a draft pricelist -- publish it to use it here.'
                              : 'No active pricelists yet.'}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 text-[11px]"
                            onClick={() => onNavigateToPricelists?.()}
                          >
                            {hasDraftPricelist ? 'Go to Pricelists' : 'Create a pricelist'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {form.benefitClass === 'fixed_price' && (
                  <div className="mt-3 space-y-1.5">
                    <Label className="text-xs font-semibold text-[#0F172A]">Price source</Label>
                    <div className="flex flex-wrap gap-4">
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <input type="radio" name="fixedPriceSource" checked={form.fixedPriceSource === 'single'}
                          onChange={() => setForm((current) => ({ ...current, fixedPriceSource: 'single' }))} />
                        Single price for the whole scope
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <input type="radio" name="fixedPriceSource" checked={form.fixedPriceSource === 'pricelist'}
                          onChange={() => setForm((current) => ({ ...current, fixedPriceSource: 'pricelist' }))} />
                        Pricelist (a different price per item)
                      </label>
                    </div>
                  </div>
                )}

                {form.benefitClass === 'fixed_price' && form.fixedPriceSource === 'single' && (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-3">
                    <FieldError message={fieldErrors.scopes} />
                    <div className="flex flex-wrap items-end gap-1.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-[11px] font-semibold text-[#0F172A]">Scope type</Label>
                          <StorefrontSectionInfo label="Scope type" panelId="pos-vouchers-scope-info" portal>
                            <p>Fixed-price vouchers apply only to the items or folders selected here.</p>
                          </StorefrontSectionInfo>
                        </div>
                        <Select value={scopeTypeDraft} onValueChange={(value) => { setScopeTypeDraft(value); setScopeRefDraft(''); }}>
                          <SelectTrigger className={`${VOUCHER_MODAL_SELECT_CLASS} h-8 px-3 text-xs font-semibold`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="item">Item</SelectItem>
                            <SelectItem value="item_folder">Folder</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-[11px] font-semibold text-[#0F172A]">
                          {scopeTypeDraft === 'item' ? 'Item' : 'Folder'} {scopeCatalogLoading ? '(loading...)' : ''}
                        </Label>
                        <Select value={scopeRefDraft} onValueChange={setScopeRefDraft}>
                          <SelectTrigger className={`${VOUCHER_MODAL_SELECT_CLASS} h-8 w-full px-3 text-xs font-semibold`}>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Select...</SelectItem>
                            {availableScopeOptions.map((option) => (
                              <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={handleAddScope} disabled={!scopeRefDraft}>
                        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Add
                      </Button>
                    </div>
                    {form.scopes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {form.scopes.map((scope) => (
                          <span key={`${scope.scope_type}-${scope.scope_ref_id}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                            {resolveScopeLabel(scope)}
                            <button type="button" onClick={() => handleRemoveScope(scope.scope_type, scope.scope_ref_id)} className="text-slate-400 hover:text-rose-600">
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                  </>
                )}
              </div>

              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Minimums &amp; limits</h4>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">
                        {isDeliveryCampaign ? 'Minimum item subtotal (₱)' : 'Min spend (₱)'}
                      </Label>
                      {isDeliveryCampaign ? (
                        <StorefrontSectionInfo label="Minimum item subtotal" panelId="pos-vouchers-min-subtotal-info" portal>
                          <p>Free delivery applies when the items in the cart total at least this amount. The delivery fee itself does not count toward it.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.minSpendPesos}
                      onChange={(e) => setForm((current) => ({ ...current, minSpendPesos: e.target.value }))} />
                    <FieldError message={fieldErrors.min_spend_centavos} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">
                        {isDeliveryCampaign ? 'Maximum item subtotal (₱)' : 'Max order value (₱)'}
                      </Label>
                      <StorefrontSectionInfo label="Maximum item subtotal" panelId="pos-vouchers-max-order-value-info" portal>
                        <p>Voucher redemption is refused above this amount. The delivery fee itself does not count toward it.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.maxOrderValuePesos}
                      onChange={(e) => setForm((current) => ({ ...current, maxOrderValuePesos: e.target.value }))} />
                    <FieldError message={fieldErrors.max_order_value_centavos} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Min quantity</Label>
                    <Input type="number" min="1" step="1" className="h-8 text-xs" value={form.minQuantity}
                      onChange={(e) => setForm((current) => ({ ...current, minQuantity: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Max redemptions</Label>
                    <Input type="number" min="1" step="1" className="h-8 text-xs" value={form.maxRedemptions}
                      onChange={(e) => setForm((current) => ({ ...current, maxRedemptions: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">
                        {isDeliveryCampaign ? 'Campaign budget (₱)' : 'Max total discount budget (₱)'}
                      </Label>
                      {isDeliveryCampaign && form.autoApply ? (
                        <StorefrontSectionInfo label="Campaign budget" panelId="pos-vouchers-budget-info" portal>
                          <p>Stops auto-applying once the total waived delivery fees reach this amount.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.maxTotalDiscountPesos}
                      onChange={(e) => setForm((current) => ({ ...current, maxTotalDiscountPesos: e.target.value }))} />
                  </div>
                  {/* A delivery waiver has no per-line quantity component -- hidden for a delivery
                      campaign (always sent as null, see buildVoucherPayload). */}
                  {!isDeliveryCampaign && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Max benefit quantity</Label>
                      <Input type="number" min="1" step="1" className="h-8 text-xs" value={form.maxBenefitQuantity}
                        onChange={(e) => setForm((current) => ({ ...current, maxBenefitQuantity: e.target.value }))} />
                    </div>
                  )}
                  <div className="flex flex-col justify-end gap-2 pb-1">
                    {/* Item-COGS guard (#697) -- no meaning against a delivery fee, hidden for a
                        delivery campaign. */}
                    {!isDeliveryCampaign && (
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                        <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.allowBelowCost} onCheckedChange={(checked) => setForm((current) => ({ ...current, allowBelowCost: checked === true }))} />
                        Allow selling below cost
                      </label>
                    )}
                    {/* #734: 'Stackable with statutory discounts' removed -- the stored
                        stackable_with_statutory column had zero policy readers anywhere in the
                        codebase and, if actually wired up, would contradict ADR 0066 Decision 8
                        (a single governed discount slot per POS transaction). Whether a
                        fixed-price voucher may combine with the statutory Senior/PWD 20% is an
                        open policy question tracked in #605 -- that's where this gets decided,
                        not here. Form state/mapper/submit payload below are left untouched so the
                        API contract and an existing voucher's stored value round-trip unchanged
                        (always sends stackable_with_statutory: false for a new voucher). */}
                    {/* R6 (plan §4.3/§9, open question -- see the PR body): advertising a card for a
                        code nobody needs to type is, at best, an unaudited storefront-discovery
                        interaction -- forced off for auto-apply campaigns in v1. Still offered for
                        a code-entered delivery campaign and for every promo code, unchanged. */}
                    {!(isDeliveryCampaign && form.autoApply) && (
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                        <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.isPubliclyListed} onCheckedChange={(checked) => setForm((current) => ({ ...current, isPubliclyListed: checked === true }))} />
                        List on public storefront
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* #788 (Phase 269): account-restricted issuance. Its own card rather than a field in
                  "Eligibility" above, because it answers a different question -- every control up
                  there narrows WHEN or WHERE a shared code works; this one narrows WHO may use it at
                  all, which is the one restriction that changes what the code fundamentally is.
                  A plain textarea of account IDs, not a picker: a DGFY account that has never
                  ordered from this store has no tenant-local row to search, and that unshopped B2B
                  account is exactly the case #788 exists for. An email->ID lookup is a real UX gap,
                  named in the PR body rather than papered over. */}
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Account restriction (optional)</h4>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#0F172A]">Restrict to specific DGFY accounts</Label>
                  <textarea
                    value={form.accountGrantIdsText}
                    onChange={(event) => setForm((current) => ({ ...current, accountGrantIdsText: event.target.value }))}
                    rows={3}
                    spellCheck={false}
                    placeholder={'One DGFY account ID per line. Leave blank for a shared code anyone may use.'}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <FieldError message={fieldErrors.account_grant_ids} />
                  <p className="text-[11px] leading-snug text-slate-500">
                    Leave blank for a shared code. When set, only these accounts may redeem it, and
                    only on the storefront while signed in — a guest checkout is refused, and POS
                    cannot redeem it at all (a terminal captures a customer name, not an account).
                    An account-restricted voucher also cannot be listed on the public storefront.
                  </p>
                </div>
              </div>

              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Validity window</h4>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-[#0F172A]">Valid from</Label>
                    <Input type="date" className="h-8 text-xs focus:border-[#1A4E8D] focus-visible:ring-[#C7DCF3]" value={form.validFrom} onChange={(e) => setForm((current) => ({ ...current, validFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-[#0F172A]">Valid until</Label>
                    <Input type="date" className="h-8 text-xs focus:border-[#1A4E8D] focus-visible:ring-[#C7DCF3]" value={form.validUntil} onChange={(e) => setForm((current) => ({ ...current, validUntil: e.target.value }))} />
                    <FieldError message={fieldErrors.valid_until} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-[#0F172A]">Daily start time</Label>
                    <Input type="time" className="h-8 text-xs focus:border-[#1A4E8D] focus-visible:ring-[#C7DCF3]" value={form.validTimeStart} onChange={(e) => setForm((current) => ({ ...current, validTimeStart: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-[#0F172A]">Daily end time</Label>
                    <Input type="time" className="h-8 text-xs focus:border-[#1A4E8D] focus-visible:ring-[#C7DCF3]" value={form.validTimeEnd} onChange={(e) => setForm((current) => ({ ...current, validTimeEnd: e.target.value }))} />
                    <FieldError message={fieldErrors.valid_time_end} />
                  </div>
                </div>
                <div className="mt-2.5 space-y-1">
                  <Label className="text-[11px] font-semibold text-[#0F172A]">Days of the week</Label>
                  <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-7 pos-voucher-weekday-grid">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <label key={label} className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[#0F172A] pos-voucher-weekday-option">
                        <Checkbox
                          className={VOUCHER_MODAL_CHECKBOX_CLASS}
                          checked={form.weekdayFlags[index]}
                          onCheckedChange={(checked) => setForm((current) => ({
                            ...current,
                            weekdayFlags: current.weekdayFlags.map((flag, i) => (i === index ? checked === true : flag))
                          }))}
                        />
                        <span className="truncate">{WEEKDAY_FULL_LABELS[index] || label}</span>
                      </label>
                    ))}
                  </div>
                  <FieldError message={fieldErrors.weekday_mask} />
                </div>
              </div>

              <div className="pos-voucher-form-section rounded-lg border border-[#D9E4F2] bg-white p-3 shadow-none">
                <div className="mb-2 flex items-center gap-1.5">
                  <ListChecks className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Eligibility</h4>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-4 lg:gap-x-8 pos-voucher-eligibility-grid">
                  <div className="space-y-1.5 pos-voucher-eligibility-group">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-bold tracking-wide text-[#0F172A] pos-voucher-eligibility-label">Channels</Label>
                      {isDeliveryCampaign && form.autoApply ? (
                        <StorefrontSectionInfo label="Channels" panelId="pos-vouchers-channels-info" portal>
                          <p>Auto-applied campaigns only ever fire at storefront checkout.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    {/* R2: auto_apply only ever fires from storefront checkout
                        (storeUseCases.js's resolveCheckoutContext) -- a merchant who unchecked
                        Storefront on an auto-apply campaign would author something that can never
                        fire, and nothing server-side rejects a channels_mask that omits it. Locked
                        on, POS hidden, whenever auto-apply is on. */}
                    <div className="block max-sm:grid max-sm:grid-cols-2 max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1.5 sm:block sm:space-y-1 pos-voucher-eligibility-options">
                      {isDeliveryCampaign && form.autoApply ? (
                        <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                          <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked disabled />
                          Storefront
                        </label>
                      ) : (
                        <>
                          <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                            <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.channelFlags.storefront} onCheckedChange={(checked) => setForm((current) => ({ ...current, channelFlags: { ...current.channelFlags, storefront: checked === true } }))} />
                            Storefront
                          </label>
                          <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                            <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.channelFlags.pos} onCheckedChange={(checked) => setForm((current) => ({ ...current, channelFlags: { ...current.channelFlags, pos: checked === true } }))} />
                            POS
                          </label>
                        </>
                      )}
                    </div>
                    <FieldError message={fieldErrors.channels_mask} />
                  </div>
                  <div className="space-y-1.5 pos-voucher-eligibility-group">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs font-bold tracking-wide text-[#0F172A] pos-voucher-eligibility-label">Fulfillment methods</Label>
                      {isDeliveryCampaign ? (
                        <StorefrontSectionInfo label="Fulfillment methods" panelId="pos-vouchers-fulfillment-info" portal>
                          <p>Delivery campaigns only apply to delivery orders.</p>
                        </StorefrontSectionInfo>
                      ) : null}
                    </div>
                    {/* R3: a pickup order has no delivery fee -- the pickup bit is a guaranteed
                        no-op for a delivery campaign, so it's locked to delivery-only rather than
                        offered as a free triad (plan §4.5). */}
                    <div className="block max-sm:grid max-sm:grid-cols-2 max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1.5 sm:block sm:space-y-1 pos-voucher-eligibility-options">
                      {isDeliveryCampaign ? (
                        <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                          <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked disabled />
                          Delivery
                        </label>
                      ) : (
                        <>
                          <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                            <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.fulfillmentFlags.delivery} onCheckedChange={(checked) => setForm((current) => ({ ...current, fulfillmentFlags: { ...current.fulfillmentFlags, delivery: checked === true } }))} />
                            Delivery
                          </label>
                          <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                            <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.fulfillmentFlags.pickup} onCheckedChange={(checked) => setForm((current) => ({ ...current, fulfillmentFlags: { ...current.fulfillmentFlags, pickup: checked === true } }))} />
                            Pickup
                          </label>
                        </>
                      )}
                    </div>
                    <FieldError message={fieldErrors.fulfillment_methods_mask} />
                  </div>
                  <div className="space-y-1.5 pos-voucher-eligibility-group">
                    <Label className="text-xs font-bold tracking-wide text-[#0F172A] pos-voucher-eligibility-label">Order timing</Label>
                    <div className="block max-sm:grid max-sm:grid-cols-2 max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1.5 sm:block sm:space-y-1 pos-voucher-eligibility-options">
                      <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                        <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.orderTimingFlags.asap} onCheckedChange={(checked) => setForm((current) => ({ ...current, orderTimingFlags: { ...current.orderTimingFlags, asap: checked === true } }))} />
                        ASAP
                      </label>
                      <label className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-700 pos-voucher-eligibility-option">
                        <Checkbox className={VOUCHER_MODAL_CHECKBOX_CLASS} checked={form.orderTimingFlags.scheduled} onCheckedChange={(checked) => setForm((current) => ({ ...current, orderTimingFlags: { ...current.orderTimingFlags, scheduled: checked === true } }))} />
                        Scheduled
                      </label>
                    </div>
                    <FieldError message={fieldErrors.order_timings_mask} />
                  </div>
                </div>
              </div>

              {/* #1334/Phase 245 (plan §5.2): GET /vouchers/:id already returns redemption_stats
                  unconditionally -- for a delivery campaign, show the LEDGER figures
                  (redemption_count / total_discount_centavos), not the cached redeemed_* columns
                  the promo-code block below still uses. ADR 0066 Decision 4 makes the ledger
                  authoritative; cache_in_sync is deliberately never surfaced here -- it's EXPECTED
                  false once reversal rows exist (Phase 243), so showing it would be a permanent
                  false alarm (voucherUseCases.js's own buildRedemptionStats comment). */}
              {isEdit && isDeliveryCampaign && (
                <div className="rounded-lg border border-[#D9E4F2] bg-[#F8FAFC] p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <BarChart3 className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Campaign performance (read-only)</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-slate-500">Redemptions</span>
                      <p className="font-bold text-[#0F172A]">{redemptionStats?.redemption_count ?? 0}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Delivery fees waived</span>
                      <p className="font-bold text-[#0F172A]">{peso(redemptionStats?.total_discount_centavos ?? 0)}</p>
                      <p className="text-[11px] text-slate-400">Net of cancelled orders</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Last redeemed</span>
                      <p className="font-bold text-[#0F172A]">
                        {redemptionStats?.last_redeemed_at ? new Date(redemptionStats.last_redeemed_at).toLocaleString() : 'Never'}
                      </p>
                    </div>
                    {form.maxTotalDiscountPesos !== '' && (
                      <div>
                        <span className="text-slate-500">Budget remaining</span>
                        <p className="font-bold text-[#0F172A]">
                          {peso(Math.max(0, pesoStringToCentavos(form.maxTotalDiscountPesos) - (redemptionStats?.total_discount_centavos ?? 0)))}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isEdit && !isDeliveryCampaign && (
                <div className="rounded-lg border border-[#D9E4F2] bg-[#F8FAFC] p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <ListChecks className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-500">Redemptions (read-only)</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-slate-500">Redeemed</span><p className="font-bold text-[#0F172A]">{form.redeemedCount}</p></div>
                    <div><span className="text-slate-500">Discount value</span><p className="font-bold text-[#0F172A]">{peso(form.redeemedValueCentavos)}</p></div>
                    <div><span className="text-slate-500">Benefit quantity</span><p className="font-bold text-[#0F172A]">{form.redeemedQuantity}</p></div>
                  </div>
                </div>
              )}

            </fieldset>
          </>
        )}
      </div>
          {!formLoading && canManage && form.status !== 'archived' && (
            <div className="pos-voucher-form-modal-footer grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4">
              <Button type="button" variant="outline" onClick={closeForm} disabled={saving} className="h-10 min-w-0 w-full rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50">
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving} className="h-10 min-w-0 w-full rounded-lg bg-[#1A4E8D] px-2 text-[11px] font-bold text-white hover:bg-[#143F73]">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Voucher'}
              </Button>
            </div>
          )}
        </div>
      </div>
    );

    return typeof document !== 'undefined' ? createPortal(formModal, document.body) : formModal;
  };

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
