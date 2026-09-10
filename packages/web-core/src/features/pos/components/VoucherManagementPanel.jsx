import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  ShieldAlert,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
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
        limit: PAGE_SIZE,
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
      setPagination(result?.pagination || { page, limit: PAGE_SIZE, total: 0, total_pages: 0 });
    } catch (error) {
      setListError(error?.response?.data?.message || 'Failed to load vouchers.');
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [page, sort, direction, statusFilter, benefitClassFilter, voucherKindFilter, autoApplyFilter, appliedSearch]);

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

  if (disabled) {
    return (
      <div id={sectionId} className="p-1 text-sm text-slate-500">
        Unlock the terminal to manage vouchers.
      </div>
    );
  }

  const renderListView = () => (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-[#0F172A]">Vouchers</h3>
          {canManage && (
            <Button type="button" size="sm" onClick={openCreateForm}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New Voucher
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-[11px] font-semibold text-[#0F172A]">Search</Label>
            <div className="flex gap-1.5">
              <Input
                className="h-8 text-xs"
                placeholder="Code or title"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearchSubmit(); }}
              />
              <Button type="button" size="sm" variant="outline" onClick={handleSearchSubmit}>Go</Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-[#0F172A]">Status</Label>
            <select
              className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
              value={statusFilter}
              onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          {/* #1334/Phase 245 (plan §4.6): a type filter on the existing Vouchers list rather than a
              second nav entry -- two file-content-asserting tests read TerminalOperationsWorkspace.jsx
              as text (R7), so this stays inside the panel rather than touching that file. */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-[#0F172A]">Type</Label>
            <select
              className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
              value={voucherKindFilter}
              onChange={(e) => { setPage(1); setVoucherKindFilter(e.target.value); setAutoApplyFilter(''); }}
            >
              <option value="">All voucher types</option>
              <option value="promo_code">Promo codes</option>
              <option value="delivery_campaign">Delivery campaigns</option>
            </select>
          </div>
          {voucherKindFilter === 'delivery_campaign' && (
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-[#0F172A]">Auto-apply</Label>
              <select
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                value={autoApplyFilter}
                onChange={(e) => { setPage(1); setAutoApplyFilter(e.target.value); }}
              >
                <option value="">Any</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-[#0F172A]">Benefit type</Label>
            <select
              className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
              value={benefitClassFilter}
              onChange={(e) => { setPage(1); setBenefitClassFilter(e.target.value); }}
            >
              <option value="">All types</option>
              <option value="percent_off">Percent off</option>
              <option value="amount_off">Amount off</option>
              <option value="fixed_price">Fixed price</option>
              <option value="free_delivery">Free delivery</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-[#0F172A]">Sort</Label>
            <div className="flex gap-1.5">
              <select
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="created_at">Created</option>
                <option value="code">Code</option>
                <option value="valid_until">Valid until</option>
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
                title={direction === 'asc' ? 'Ascending' : 'Descending'}
              >
                {direction === 'asc' ? '↑' : '↓'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {listLoading && <p className="text-sm text-slate-500">Loading vouchers...</p>}
      {!listLoading && listError && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <span>{listError}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => loadVouchers()}>
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {!listLoading && !listError && vouchers.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm shadow-slate-200/70">
          No vouchers match these filters yet.
        </div>
      )}

      {!listLoading && !listError && vouchers.length > 0 && (
        <div className="space-y-2">
          {vouchers.map((voucher) => {
            const allowedTargets = ALLOWED_STATUS_TRANSITIONS[voucher.derived_status] || [];
            const busy = lifecycleBusyId === voucher.voucher_id;
            return (
              <div key={voucher.voucher_id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-extrabold text-[#0F172A]">{voucher.code}</p>
                      <Badge className={STATUS_BADGE_CLASS[voucher.derived_status] || STATUS_BADGE_CLASS.draft}>
                        {voucher.derived_status}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-slate-600">{voucher.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {BENEFIT_CLASS_LABEL[voucher.benefit_class] || voucher.benefit_class}
                      {voucher.benefit_class === 'percent_off' && ` · ${bpsToPercentString(voucher.percent_off_bps)}% off`}
                      {voucher.benefit_class === 'amount_off' && ` · ${peso(voucher.amount_off_centavos)} off`}
                      {voucher.benefit_class === 'fixed_price' && voucher.pricelist_id != null && ' · Pricelist'}
                      {voucher.benefit_class === 'fixed_price' && voucher.pricelist_id == null && ` · ${peso(voucher.fixed_unit_price_centavos)}`}
                      {voucher.benefit_class === 'free_delivery' && voucher.delivery_amount_off_centavos == null && ' · Whole fee waived'}
                      {voucher.benefit_class === 'free_delivery' && voucher.delivery_amount_off_centavos != null && ` · up to ${peso(voucher.delivery_amount_off_centavos)} waived`}
                      {voucher.auto_apply === true && ' · Auto-applied'}
                      {' · Redeemed '}{voucher.redeemed_count || 0}{voucher.max_redemptions ? ` / ${voucher.max_redemptions}` : ''}
                      {voucher.created_by_username && ` · Created by ${voucher.created_by_username}`}
                    </p>
                    {/* #1334/Phase 245 (plan §5.1): only fetched (include_stats: true) when the
                        Type filter is narrowed to delivery campaigns -- an extra grouped aggregate
                        per page isn't worth paying for on the all-vouchers view. */}
                    {voucher.redemption_stats && (
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                        Redemptions {voucher.redemption_stats.redemption_count} · Waived {peso(voucher.redemption_stats.total_discount_centavos)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEditForm(voucher)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> {canManage ? 'Edit' : 'View'}
                    </Button>
                    {canManage && allowedTargets.includes('active') && (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'activate')}>
                        <Play className="mr-1 h-3.5 w-3.5" /> Activate
                      </Button>
                    )}
                    {canManage && allowedTargets.includes('paused') && (
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'pause')}>
                        <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                      </Button>
                    )}
                    {canManage && allowedTargets.includes('archived') && (
                      <Button type="button" size="sm" variant="outline" className="text-rose-600" disabled={busy} onClick={() => openLifecycleConfirm(voucher, 'archive')}>
                        <Archive className="mr-1 h-3.5 w-3.5" /> Archive
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!listLoading && !listError && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
          <span>Page {pagination.page} of {pagination.total_pages} &middot; {pagination.total} vouchers</span>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={page >= pagination.total_pages} onClick={() => setPage((current) => current + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const renderForm = () => {
    const isEdit = Boolean(form.voucherId);
    const codeEditable = canManage && (!isEdit || (form.status === 'draft' && form.redeemedCount === 0));
    const allowedTargets = ALLOWED_STATUS_TRANSITIONS[form.derivedStatus] || [];
    const formLocked = !canManage || form.status === 'archived';
    // #1334/Phase 245:
    const isDeliveryCampaign = form.voucherKind === 'delivery_campaign';

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={closeForm}>Back to list</Button>
            <h3 className="text-sm font-black text-[#0F172A]">{isEdit ? `Edit ${form.code || 'Voucher'}` : 'New Voucher'}</h3>
            {isEdit && (
              <Badge className={STATUS_BADGE_CLASS[form.derivedStatus] || STATUS_BADGE_CLASS.draft}>{form.derivedStatus}</Badge>
            )}
          </div>
          {isEdit && canManage && (
            <div className="flex flex-wrap items-center gap-1.5">
              {allowedTargets.includes('active') && (
                <Button type="button" size="sm" variant="outline" onClick={() => openLifecycleConfirm({ voucher_id: form.voucherId, code: form.code }, 'activate')}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Activate
                </Button>
              )}
              {allowedTargets.includes('paused') && (
                <Button type="button" size="sm" variant="outline" onClick={() => openLifecycleConfirm({ voucher_id: form.voucherId, code: form.code }, 'pause')}>
                  <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                </Button>
              )}
              {allowedTargets.includes('archived') && (
                <Button type="button" size="sm" variant="outline" className="text-rose-600" onClick={() => openLifecycleConfirm({ voucher_id: form.voucherId, code: form.code }, 'archive')}>
                  <Archive className="mr-1 h-3.5 w-3.5" /> Archive
                </Button>
              )}
            </div>
          )}
        </div>

        {/* #1494: read-only audit meta -- accountable creating/modifying officer. Never part of
            buildVoucherPayload's outgoing request body. */}
        {isEdit && (form.createdByUsername || form.updatedByUsername) && (
          <p className="text-[11px] text-slate-400">
            {form.createdByUsername && `Created by ${form.createdByUsername}`}
            {form.createdByUsername && form.createdAt && ` on ${new Date(form.createdAt).toLocaleDateString()}`}
            {form.updatedByUsername && form.updatedAt && (form.createdByUsername ? ' · ' : '')}
            {form.updatedByUsername && form.updatedAt && `Last modified by ${form.updatedByUsername} on ${new Date(form.updatedAt).toLocaleDateString()}`}
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
                <ShieldAlert className="h-4 w-4 shrink-0" /> Archived vouchers are read-only.
              </div>
            )}
            {!canManage && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-600">
                <ShieldAlert className="h-4 w-4 shrink-0" /> You have view-only access to vouchers.
              </div>
            )}

            {/* RF-5 (PR #762 review): an asterisk with no key is only half a convention. */}
            <p className="text-[11px] font-semibold text-slate-500">
              <span className="text-rose-600" aria-hidden="true">*</span> required
            </p>
            <fieldset disabled={formLocked} className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Basics</h4>

                {/* #1334/Phase 245 (plan §4.2): voucher_kind/benefit_class/benefit_target are never
                    raw enum pickers -- picking "Delivery campaign" here is the only control that
                    sets all three, so every rejectable server combination becomes unrepresentable
                    from this UI rather than merely validated (plan §6 Layer 1). Read-only once a
                    voucher exists (R8) -- converting an existing voucher's kind is out of scope. */}
                <div className="mb-3 space-y-1.5">
                  <Label className="text-xs font-semibold text-[#0F172A]">Voucher type <span className="text-rose-600" aria-hidden="true">*</span></Label>
                  {isEdit ? (
                    <div>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                        {form.voucherKind === 'delivery_campaign' ? 'Delivery campaign' : 'Promo code'}
                      </Badge>
                      <p className="mt-1 text-[11px] text-slate-400">Voucher type can’t be changed after creation.</p>
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Code <span className="text-rose-600" aria-hidden="true">*</span></Label>
                    <Input
                      className="h-8 text-xs uppercase"
                      value={form.code}
                      maxLength={40}
                      disabled={!codeEditable}
                      onChange={(e) => setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))}
                    />
                    <FieldError message={fieldErrors.code} />
                    {isEdit && !codeEditable && (
                      <p className="text-[11px] text-slate-400">Code is locked once a voucher leaves draft or has a redemption.</p>
                    )}
                    {!isEdit && form.voucherKind === 'delivery_campaign' && form.autoApply && (
                      <p className="text-[11px] text-slate-400">Suggested from the campaign name -- shoppers never type this, but it still appears in reports.</p>
                    )}
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold text-[#0F172A]">
                      {form.voucherKind === 'delivery_campaign' ? 'Campaign name' : 'Title'} <span className="text-rose-600" aria-hidden="true">*</span>
                    </Label>
                    <Input className="h-8 text-xs" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} />
                    <FieldError message={fieldErrors.title} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Subtitle</Label>
                    <Input className="h-8 text-xs" value={form.subtitle} onChange={(e) => setForm((current) => ({ ...current, subtitle: e.target.value }))} />
                    {/* #733: optional, and honestly stated as such -- this field has no consumer
                        anywhere in the codebase today, not merely "not shown yet". */}
                    <p className="text-[11px] text-slate-400">Optional. Not displayed anywhere yet.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Badge</Label>
                    <Input className="h-8 text-xs" value={form.badge} onChange={(e) => setForm((current) => ({ ...current, badge: e.target.value }))} />
                    <p className="text-[11px] text-slate-400">Optional. Shown as the discount label once applied, if set -- falls back to Title otherwise.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Validity text</Label>
                    <Input className="h-8 text-xs" value={form.validityText} onChange={(e) => setForm((current) => ({ ...current, validityText: e.target.value }))} />
                    <p className="text-[11px] text-slate-400">Optional. Not displayed anywhere yet.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Benefit</h4>

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
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                        <Checkbox checked={form.autoApply} onCheckedChange={(checked) => setForm((current) => ({ ...current, autoApply: checked === true }))} />
                        Apply automatically -- shoppers get this without typing a code
                      </label>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {form.autoApply
                          ? 'Applies automatically at storefront checkout once the order qualifies. The code below is only used internally (reports, audit) -- no one types it.'
                          : `Off -- shoppers must enter the code${form.code ? ` "${form.code}"` : ''} at checkout, same as a regular promo code.`}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Benefit type <span className="text-rose-600" aria-hidden="true">*</span></Label>
                    <select
                      className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                      value={form.benefitClass}
                      onChange={(e) => setForm((current) => ({ ...current, benefitClass: e.target.value }))}
                    >
                      <option value="percent_off">Percent off</option>
                      <option value="amount_off">Amount off</option>
                      <option value="fixed_price">Fixed price</option>
                    </select>
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
                        <Label className="text-xs font-semibold text-[#0F172A]">Max discount cap (₱, optional)</Label>
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
                      <select
                        className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                        value={form.pricelistId}
                        onChange={(e) => setForm((current) => ({ ...current, pricelistId: e.target.value }))}
                      >
                        <option value="">Select a pricelist...</option>
                        {pricelistOptions.map((option) => (
                          <option key={option.pricelist_id} value={option.pricelist_id}>{option.name}</option>
                        ))}
                      </select>
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
                    <p className="mb-2 text-[11px] font-semibold text-slate-500">
                      Fixed-price vouchers apply only to the items/folders selected here (required).
                    </p>
                    <FieldError message={fieldErrors.scopes} />
                    <div className="flex flex-wrap items-end gap-1.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-[#0F172A]">Scope type</Label>
                        <select
                          className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                          value={scopeTypeDraft}
                          onChange={(e) => { setScopeTypeDraft(e.target.value); setScopeRefDraft(''); }}
                        >
                          <option value="item">Item</option>
                          <option value="item_folder">Folder</option>
                        </select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-[11px] font-semibold text-[#0F172A]">
                          {scopeTypeDraft === 'item' ? 'Item' : 'Folder'} {scopeCatalogLoading ? '(loading...)' : ''}
                        </Label>
                        <select
                          className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold"
                          value={scopeRefDraft}
                          onChange={(e) => setScopeRefDraft(e.target.value)}
                        >
                          <option value="">Select...</option>
                          {availableScopeOptions.map((option) => (
                            <option key={option.id} value={option.id}>{option.name}</option>
                          ))}
                        </select>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={handleAddScope} disabled={!scopeRefDraft}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                    {form.scopes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {form.scopes.map((scope) => (
                          <span key={`${scope.scope_type}-${scope.scope_ref_id}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                            {resolveScopeLabel(scope)}
                            <button type="button" onClick={() => handleRemoveScope(scope.scope_type, scope.scope_ref_id)} className="text-slate-400 hover:text-rose-600">
                              <X className="h-3 w-3" />
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

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Minimums &amp; limits</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">
                      {isDeliveryCampaign ? 'Minimum item subtotal (₱, optional)' : 'Min spend (₱, optional)'}
                    </Label>
                    <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.minSpendPesos}
                      onChange={(e) => setForm((current) => ({ ...current, minSpendPesos: e.target.value }))} />
                    <FieldError message={fieldErrors.min_spend_centavos} />
                    {/* R4: min_spend_centavos is compared against the ITEM subtotal
                        (voucherEligibilityPolicy.js), which excludes the delivery fee -- a generic
                        "min spend" label here would be a real merchant-comprehension bug, since a
                        merchant would reasonably read it as "order total including delivery." */}
                    {isDeliveryCampaign && (
                      <p className="text-[11px] text-slate-400">
                        Free delivery when the items in the cart total at least this amount -- the delivery fee itself doesn’t count toward it.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">
                      {isDeliveryCampaign ? 'Maximum item subtotal (PHP, optional)' : 'Max order value (PHP, optional)'}
                    </Label>
                    <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.maxOrderValuePesos}
                      onChange={(e) => setForm((current) => ({ ...current, maxOrderValuePesos: e.target.value }))} />
                    <FieldError message={fieldErrors.max_order_value_centavos} />
                    {/* #1490: same ITEM-subtotal comparison min_spend_centavos already documents
                        above (R4) -- excludes the delivery fee. */}
                    <p className="text-[11px] text-slate-400">
                      Voucher is refused above this amount -- the delivery fee itself doesn't count toward it.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Min quantity (optional)</Label>
                    <Input type="number" min="1" step="1" className="h-8 text-xs" value={form.minQuantity}
                      onChange={(e) => setForm((current) => ({ ...current, minQuantity: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Max redemptions (optional)</Label>
                    <Input type="number" min="1" step="1" className="h-8 text-xs" value={form.maxRedemptions}
                      onChange={(e) => setForm((current) => ({ ...current, maxRedemptions: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">
                      {isDeliveryCampaign ? 'Campaign budget (₱, optional)' : 'Max total discount budget (₱, optional)'}
                    </Label>
                    <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.maxTotalDiscountPesos}
                      onChange={(e) => setForm((current) => ({ ...current, maxTotalDiscountPesos: e.target.value }))} />
                    {/* For an auto-applied campaign, this is the merchant's actual spend cap and the
                        most important guard rail on the screen -- relabelled accordingly. */}
                    {isDeliveryCampaign && form.autoApply && (
                      <p className="text-[11px] text-slate-400">Stops auto-applying once total waived fees reach this amount.</p>
                    )}
                  </div>
                  {/* A delivery waiver has no per-line quantity component -- hidden for a delivery
                      campaign (always sent as null, see buildVoucherPayload). */}
                  {!isDeliveryCampaign && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Max benefit quantity (optional)</Label>
                      <Input type="number" min="1" step="1" className="h-8 text-xs" value={form.maxBenefitQuantity}
                        onChange={(e) => setForm((current) => ({ ...current, maxBenefitQuantity: e.target.value }))} />
                    </div>
                  )}
                  <div className="flex flex-col justify-end gap-2 pb-1">
                    {/* Item-COGS guard (#697) -- no meaning against a delivery fee, hidden for a
                        delivery campaign. */}
                    {!isDeliveryCampaign && (
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                        <Checkbox checked={form.allowBelowCost} onCheckedChange={(checked) => setForm((current) => ({ ...current, allowBelowCost: checked === true }))} />
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
                        <Checkbox checked={form.isPubliclyListed} onCheckedChange={(checked) => setForm((current) => ({ ...current, isPubliclyListed: checked === true }))} />
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

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Validity window</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Valid from (optional)</Label>
                    <Input type="date" className="h-8 text-xs" value={form.validFrom} onChange={(e) => setForm((current) => ({ ...current, validFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Valid until (optional)</Label>
                    <Input type="date" className="h-8 text-xs" value={form.validUntil} onChange={(e) => setForm((current) => ({ ...current, validUntil: e.target.value }))} />
                    <FieldError message={fieldErrors.valid_until} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Daily start time (optional)</Label>
                    <Input type="time" className="h-8 text-xs" value={form.validTimeStart} onChange={(e) => setForm((current) => ({ ...current, validTimeStart: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Daily end time (optional)</Label>
                    <Input type="time" className="h-8 text-xs" value={form.validTimeEnd} onChange={(e) => setForm((current) => ({ ...current, validTimeEnd: e.target.value }))} />
                    <FieldError message={fieldErrors.valid_time_end} />
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Label className="text-xs font-semibold text-[#0F172A]">Days of the week</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <label key={label} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-[#0F172A]">
                        <Checkbox
                          checked={form.weekdayFlags[index]}
                          onCheckedChange={(checked) => setForm((current) => ({
                            ...current,
                            weekdayFlags: current.weekdayFlags.map((flag, i) => (i === index ? checked === true : flag))
                          }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <FieldError message={fieldErrors.weekday_mask} />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Eligibility</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#0F172A]">Channels</Label>
                    {/* R2: auto_apply only ever fires from storefront checkout
                        (storeUseCases.js's resolveCheckoutContext) -- a merchant who unchecked
                        Storefront on an auto-apply campaign would author something that can never
                        fire, and nothing server-side rejects a channels_mask that omits it. Locked
                        on, POS hidden, whenever auto-apply is on. */}
                    {isDeliveryCampaign && form.autoApply ? (
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                        <Checkbox checked disabled />
                        Storefront
                      </label>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <Checkbox checked={form.channelFlags.storefront} onCheckedChange={(checked) => setForm((current) => ({ ...current, channelFlags: { ...current.channelFlags, storefront: checked === true } }))} />
                          Storefront
                        </label>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <Checkbox checked={form.channelFlags.pos} onCheckedChange={(checked) => setForm((current) => ({ ...current, channelFlags: { ...current.channelFlags, pos: checked === true } }))} />
                          POS
                        </label>
                      </>
                    )}
                    <FieldError message={fieldErrors.channels_mask} />
                    {isDeliveryCampaign && form.autoApply && (
                      <p className="text-[11px] text-slate-400">Auto-applied campaigns only ever fire at storefront checkout.</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#0F172A]">Fulfillment methods</Label>
                    {/* R3: a pickup order has no delivery fee -- the pickup bit is a guaranteed
                        no-op for a delivery campaign, so it's locked to delivery-only rather than
                        offered as a free triad (plan §4.5). */}
                    {isDeliveryCampaign ? (
                      <>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <Checkbox checked disabled />
                          Delivery
                        </label>
                        <p className="text-[11px] text-slate-400">Delivery campaigns only apply to delivery orders.</p>
                      </>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <Checkbox checked={form.fulfillmentFlags.delivery} onCheckedChange={(checked) => setForm((current) => ({ ...current, fulfillmentFlags: { ...current.fulfillmentFlags, delivery: checked === true } }))} />
                          Delivery
                        </label>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <Checkbox checked={form.fulfillmentFlags.pickup} onCheckedChange={(checked) => setForm((current) => ({ ...current, fulfillmentFlags: { ...current.fulfillmentFlags, pickup: checked === true } }))} />
                          Pickup
                        </label>
                      </>
                    )}
                    <FieldError message={fieldErrors.fulfillment_methods_mask} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#0F172A]">Order timing</Label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <Checkbox checked={form.orderTimingFlags.asap} onCheckedChange={(checked) => setForm((current) => ({ ...current, orderTimingFlags: { ...current.orderTimingFlags, asap: checked === true } }))} />
                      ASAP
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <Checkbox checked={form.orderTimingFlags.scheduled} onCheckedChange={(checked) => setForm((current) => ({ ...current, orderTimingFlags: { ...current.orderTimingFlags, scheduled: checked === true } }))} />
                      Scheduled
                    </label>
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
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Campaign performance (read-only)</h4>
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
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Redemptions (read-only)</h4>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-slate-500">Redeemed</span><p className="font-bold text-[#0F172A]">{form.redeemedCount}</p></div>
                    <div><span className="text-slate-500">Discount value</span><p className="font-bold text-[#0F172A]">{peso(form.redeemedValueCentavos)}</p></div>
                    <div><span className="text-slate-500">Benefit quantity</span><p className="font-bold text-[#0F172A]">{form.redeemedQuantity}</p></div>
                  </div>
                </div>
              )}

              {canManage && form.status !== 'archived' && (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>Cancel</Button>
                  <Button type="button" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create voucher'}
                  </Button>
                </div>
              )}
            </fieldset>
          </>
        )}
      </div>
    );
  };

  return (
    <div id={sectionId} className="space-y-3">
      {view === 'list' ? renderListView() : renderForm()}

      <ConfirmActionDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((current) => ({ ...current, open }))}
        title={`${LIFECYCLE_ACTION_LABEL[confirmState.action] || 'Update'} ${confirmState.label}?`}
        description={
          confirmState.action === 'archive'
            ? 'Archiving is permanent -- an archived voucher can never be reactivated or edited again.'
            : 'This changes the voucher’s status immediately.'
        }
        confirmLabel={LIFECYCLE_ACTION_LABEL[confirmState.action] || 'Confirm'}
        variant={confirmState.action === 'archive' ? 'destructive' : 'default'}
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
