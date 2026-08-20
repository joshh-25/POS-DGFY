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

// Voucher merchant authoring UI (#614, Phase 103). Governed by ADR 0066.
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
// its whole form draft into an outgoing payload -- `buildVoucherPayload` below builds the request
// body field-by-field from exactly the writable columns, so a server-owned counter can never leak
// into a PUT/POST no matter what ends up in local state, and every update always resends the last
// known `version`.

const PAGE_SIZE = 20;
// #667 Phase 110: capped at 40, not the server column's full 64, to match
// apps/dgfy-api/src/validators/voucherValidator.js's narrower cap -- see that file's comment for
// why (the fiscal audit-row column a voucher redemption now writes into is VARCHAR(40)).
const VOUCHER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,39}$/;

// Bitmask <-> checkbox-triad conversion. Bit meanings mirror
// `voucherEligibilityPolicy.js`'s VOUCHER_CHANNEL_BITS / VOUCHER_FULFILLMENT_BITS /
// VOUCHER_ORDER_TIMING_BITS / VOUCHER_WEEKDAY_BITS exactly -- duplicated here (small, frozen,
// read-only maps) because the API module tree isn't importable from the web bundle.
const CHANNEL_BITS = Object.freeze({ storefront: 1, pos: 2 });
const FULFILLMENT_BITS = Object.freeze({ delivery: 1, pickup: 2 });
const TIMING_BITS = Object.freeze({ asap: 1, scheduled: 2 });
const WEEKDAY_BITS = Object.freeze([1, 2, 4, 8, 16, 32, 64]);
const WEEKDAY_LABELS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const WEEKDAY_MASK_ALL = 127;

const hasMaskBit = (mask, bit) => {
  const numericMask = Number(mask) || 0;
  return (numericMask & bit) === bit;
};

const maskToFlags = (mask, bitsMap) => Object.fromEntries(
  Object.entries(bitsMap).map(([key, bit]) => [key, hasMaskBit(mask, bit)])
);

const flagsToMask = (flags, bitsMap) => Object.entries(bitsMap).reduce(
  (accumulator, [key, bit]) => (flags?.[key] ? accumulator | bit : accumulator),
  0
);

const maskToWeekdayFlags = (mask) => WEEKDAY_BITS.map((bit) => hasMaskBit(mask, bit));
const weekdayFlagsToMask = (flags) => WEEKDAY_BITS.reduce(
  (accumulator, bit, index) => (flags?.[index] ? accumulator | bit : accumulator),
  0
);

// Money/percent <-> string helpers, same shape as AffiliatesWorkspacePanel.jsx's.
const centavosToPesoString = (centavos) => (centavos === null || centavos === undefined ? '' : String(Number(centavos) / 100));
const pesoStringToCentavos = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
};
const bpsToPercentString = (bps) => (bps === null || bps === undefined ? '' : String(Number(bps) / 100));
const percentStringToBps = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
};

const peso = (centavos) => `PHP ${(Number(centavos || 0) / 100).toFixed(2)}`;

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

const BENEFIT_CLASS_LABEL = Object.freeze({
  percent_off: 'Percent off',
  amount_off: 'Amount off',
  fixed_price: 'Fixed price'
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
  VOUCHER_PRICELIST_NOT_ACTIVE: 'Only a published (active) pricelist can be attached to a voucher.'
});

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
  return REASON_CODE_MESSAGES[reasonCode] || data?.message || fallback;
};

// Exported alongside buildVoucherPayload (#716) so the regression test can start from a known-good
// form shape rather than hand-duplicating every field.
export const blankForm = () => ({
  voucherId: null,
  version: null,
  status: 'draft',
  derivedStatus: 'draft',
  code: '',
  title: '',
  subtitle: '',
  badge: '',
  validityText: '',
  benefitClass: 'percent_off',
  percentOffPercent: '',
  amountOffPesos: '',
  fixedUnitPricePesos: '',
  // #696/#698: fixed_price carries EITHER fixedUnitPricePesos OR pricelistId, never both --
  // fixedPriceSource picks which the form is currently expressing.
  fixedPriceSource: 'single',
  pricelistId: '',
  maxDiscountPesos: '',
  minSpendPesos: '',
  minQuantity: '',
  allowBelowCost: false,
  stackableWithStatutory: false,
  validFrom: '',
  validUntil: '',
  validTimeStart: '',
  validTimeEnd: '',
  weekdayFlags: maskToWeekdayFlags(WEEKDAY_MASK_ALL),
  channelFlags: { storefront: true, pos: false },
  fulfillmentFlags: { delivery: true, pickup: true },
  orderTimingFlags: { asap: true, scheduled: true },
  maxRedemptions: '',
  maxTotalDiscountPesos: '',
  maxBenefitQuantity: '',
  scopes: [],
  redeemedCount: 0,
  redeemedValueCentavos: 0,
  redeemedQuantity: 0
});

const voucherToForm = (voucher, scopes = []) => ({
  voucherId: voucher.voucher_id,
  version: Number(voucher.version),
  status: voucher.status,
  derivedStatus: voucher.derived_status,
  code: voucher.code || '',
  title: voucher.title || '',
  subtitle: voucher.subtitle || '',
  badge: voucher.badge || '',
  validityText: voucher.validity_text || '',
  benefitClass: voucher.benefit_class,
  percentOffPercent: voucher.benefit_class === 'percent_off' ? bpsToPercentString(voucher.percent_off_bps) : '',
  amountOffPesos: voucher.benefit_class === 'amount_off' ? centavosToPesoString(voucher.amount_off_centavos) : '',
  fixedUnitPricePesos: voucher.benefit_class === 'fixed_price' ? centavosToPesoString(voucher.fixed_unit_price_centavos) : '',
  fixedPriceSource: voucher.pricelist_id != null ? 'pricelist' : 'single',
  pricelistId: voucher.pricelist_id != null ? String(voucher.pricelist_id) : '',
  maxDiscountPesos: voucher.max_discount_centavos != null ? centavosToPesoString(voucher.max_discount_centavos) : '',
  minSpendPesos: voucher.min_spend_centavos != null ? centavosToPesoString(voucher.min_spend_centavos) : '',
  minQuantity: voucher.min_quantity != null ? String(voucher.min_quantity) : '',
  allowBelowCost: voucher.allow_below_cost === true,
  stackableWithStatutory: voucher.stackable_with_statutory === true,
  validFrom: voucher.valid_from || '',
  validUntil: voucher.valid_until || '',
  validTimeStart: voucher.valid_time_start || '',
  validTimeEnd: voucher.valid_time_end || '',
  weekdayFlags: maskToWeekdayFlags(voucher.weekday_mask),
  channelFlags: maskToFlags(voucher.channels_mask, CHANNEL_BITS),
  fulfillmentFlags: maskToFlags(voucher.fulfillment_methods_mask, FULFILLMENT_BITS),
  orderTimingFlags: maskToFlags(voucher.order_timings_mask, TIMING_BITS),
  maxRedemptions: voucher.max_redemptions != null ? String(voucher.max_redemptions) : '',
  maxTotalDiscountPesos: voucher.max_total_discount_centavos != null ? centavosToPesoString(voucher.max_total_discount_centavos) : '',
  maxBenefitQuantity: voucher.max_benefit_quantity != null ? String(voucher.max_benefit_quantity) : '',
  scopes: (Array.isArray(scopes) ? scopes : []).map((scope) => ({
    scope_type: scope.scope_type,
    scope_ref_id: Number(scope.scope_ref_id)
  })),
  redeemedCount: Number(voucher.redeemed_count || 0),
  redeemedValueCentavos: Number(voucher.redeemed_value_centavos || 0),
  redeemedQuantity: Number(voucher.redeemed_quantity || 0)
});

// Builds the outgoing request body field-by-field from exactly the writable columns -- never a
// spread of the local draft -- so a server-owned/forbidden field can never leak into a PUT/POST.
// Exported for #716's regression test — buildVoucherPayload is a pure function of `form`, and no
// frontend test previously existed for this panel (how the create-schema null rejection shipped
// undetected).
export const buildVoucherPayload = (form) => {
  const payload = {
    code: form.code.trim().toUpperCase(),
    voucher_kind: 'promo_code',
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    badge: form.badge.trim() || null,
    validity_text: form.validityText.trim() || null,
    benefit_class: form.benefitClass,
    min_spend_centavos: form.minSpendPesos === '' ? null : pesoStringToCentavos(form.minSpendPesos),
    min_quantity: form.minQuantity === '' ? null : Math.max(1, parseInt(form.minQuantity, 10) || 1),
    allow_below_cost: form.allowBelowCost === true,
    stackable_with_statutory: form.stackableWithStatutory === true,
    valid_from: form.validFrom || null,
    valid_until: form.validUntil || null,
    valid_time_start: form.validTimeStart || null,
    valid_time_end: form.validTimeEnd || null,
    weekday_mask: weekdayFlagsToMask(form.weekdayFlags),
    channels_mask: flagsToMask(form.channelFlags, CHANNEL_BITS),
    fulfillment_methods_mask: flagsToMask(form.fulfillmentFlags, FULFILLMENT_BITS),
    order_timings_mask: flagsToMask(form.orderTimingFlags, TIMING_BITS),
    max_redemptions: form.maxRedemptions === '' ? null : Math.max(1, parseInt(form.maxRedemptions, 10) || 1),
    max_total_discount_centavos: form.maxTotalDiscountPesos === '' ? null : pesoStringToCentavos(form.maxTotalDiscountPesos),
    max_benefit_quantity: form.maxBenefitQuantity === '' ? null : Math.max(1, parseInt(form.maxBenefitQuantity, 10) || 1),
    scopes: form.scopes.map(({ scope_type, scope_ref_id }) => ({ scope_type, scope_ref_id: Number(scope_ref_id) }))
  };

  if (form.benefitClass === 'percent_off') {
    payload.percent_off_bps = percentStringToBps(form.percentOffPercent);
    payload.max_discount_centavos = form.maxDiscountPesos === '' ? null : pesoStringToCentavos(form.maxDiscountPesos);
  } else if (form.benefitClass === 'amount_off') {
    payload.amount_off_centavos = pesoStringToCentavos(form.amountOffPesos);
  } else if (form.benefitClass === 'fixed_price') {
    // #696: EITHER a single pinned price OR a pricelist, never both -- the server enforces this
    // XOR authoritatively (voucherUseCases.js's applyBenefitConfig); mirrored here so a merchant
    // never even builds a payload that would be rejected.
    if (form.fixedPriceSource === 'pricelist') {
      payload.pricelist_id = form.pricelistId ? Number(form.pricelistId) : null;
      payload.fixed_unit_price_centavos = null;
      // A pricelist IS the scope (#696) -- no voucher_scopes rows needed.
      payload.scopes = [];
    } else {
      payload.fixed_unit_price_centavos = pesoStringToCentavos(form.fixedUnitPricePesos);
      payload.pricelist_id = null;
    }
  }

  return payload;
};

const validateFormLocally = (form) => {
  const errors = [];
  const addError = (field, message) => errors.push({ field, message });

  if (form.title.trim().length < 2) addError('title', 'Title must be at least 2 characters.');
  const normalizedCode = form.code.trim().toUpperCase();
  if (!normalizedCode) addError('code', 'Code is required.');
  else if (!VOUCHER_CODE_PATTERN.test(normalizedCode)) {
    addError('code', 'Code must be 3-40 characters: A-Z, 0-9, dot, underscore or hyphen, starting with a letter or digit.');
  }

  if (form.benefitClass === 'percent_off') {
    const bps = percentStringToBps(form.percentOffPercent);
    if (!Number.isFinite(bps) || bps < 1 || bps > 10000) addError('percent_off_bps', 'Enter a percentage between 0.01% and 100%.');
  } else if (form.benefitClass === 'amount_off') {
    const centavos = pesoStringToCentavos(form.amountOffPesos);
    if (!Number.isFinite(centavos) || centavos < 1) addError('amount_off_centavos', 'Enter an amount greater than 0.');
  } else if (form.benefitClass === 'fixed_price') {
    if (form.fixedPriceSource === 'pricelist') {
      if (!form.pricelistId) addError('pricelist_id', 'Select a pricelist.');
    } else {
      const centavos = pesoStringToCentavos(form.fixedUnitPricePesos);
      if (!Number.isFinite(centavos) || centavos < 0) addError('fixed_unit_price_centavos', 'Enter a fixed price of 0 or more.');
      if (form.scopes.length === 0) addError('scopes', 'Add at least one item or folder scope for a fixed-price voucher.');
    }
  }

  if (form.weekdayFlags.every((flag) => !flag)) addError('weekday_mask', 'Select at least one day of the week.');
  if (!form.channelFlags.storefront && !form.channelFlags.pos) addError('channels_mask', 'Select at least one channel.');
  if (!form.fulfillmentFlags.delivery && !form.fulfillmentFlags.pickup) addError('fulfillment_methods_mask', 'Select at least one fulfillment method.');
  if (!form.orderTimingFlags.asap && !form.orderTimingFlags.scheduled) addError('order_timings_mask', 'Select at least one order timing.');

  if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) {
    addError('valid_until', 'End date cannot be earlier than the start date.');
  }
  const hasStart = Boolean(form.validTimeStart);
  const hasEnd = Boolean(form.validTimeEnd);
  if (hasStart !== hasEnd) addError('valid_time_end', 'Set both a start and end time, or leave both blank.');
  else if (hasStart && hasEnd && form.validTimeStart === form.validTimeEnd) {
    addError('valid_time_end', 'Start time and end time cannot be equal.');
  }

  return errors;
};

const FieldError = ({ message }) => (message ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{message}</p> : null);

export default function VoucherManagementPanel({ disabled = false, canManage = false, sectionId, onNavigateToPricelists }) {
  const [view, setView] = useState('list');

  const [vouchers, setVouchers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [benefitClassFilter, setBenefitClassFilter] = useState('');
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
      const params = {
        page,
        limit: PAGE_SIZE,
        sort,
        direction,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(benefitClassFilter ? { benefit_class: benefitClassFilter } : {}),
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
  }, [page, sort, direction, statusFilter, benefitClassFilter, appliedSearch]);

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
    setView('form');
  };

  const openEditForm = async (voucherSummary) => {
    setFormLoading(true);
    setFieldErrors({});
    setFormError('');
    try {
      const detail = await getVoucher(voucherSummary.voucher_id);
      setForm(voucherToForm(detail.voucher, detail.scopes));
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
      setForm(voucherToForm(detail.voucher, detail.scopes));
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
                      {' · Redeemed '}{voucher.redeemed_count || 0}{voucher.max_redemptions ? ` / ${voucher.max_redemptions}` : ''}
                    </p>
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
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold text-[#0F172A]">Title <span className="text-rose-600" aria-hidden="true">*</span></Label>
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
                        <Label className="text-xs font-semibold text-[#0F172A]">Max discount cap (PHP, optional)</Label>
                        <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.maxDiscountPesos}
                          onChange={(e) => setForm((current) => ({ ...current, maxDiscountPesos: e.target.value }))} />
                      </div>
                    </>
                  )}
                  {form.benefitClass === 'amount_off' && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Amount off (PHP) <span className="text-rose-600" aria-hidden="true">*</span></Label>
                      <Input type="number" min="0.01" step="0.01" className="h-8 text-xs" value={form.amountOffPesos}
                        onChange={(e) => setForm((current) => ({ ...current, amountOffPesos: e.target.value }))} />
                      <FieldError message={fieldErrors.amount_off_centavos} />
                    </div>
                  )}
                  {form.benefitClass === 'fixed_price' && form.fixedPriceSource === 'single' && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-[#0F172A]">Fixed price (PHP) <span className="text-rose-600" aria-hidden="true">*</span></Label>
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
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Minimums &amp; limits</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Min spend (PHP, optional)</Label>
                    <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.minSpendPesos}
                      onChange={(e) => setForm((current) => ({ ...current, minSpendPesos: e.target.value }))} />
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
                    <Label className="text-xs font-semibold text-[#0F172A]">Max total discount budget (PHP, optional)</Label>
                    <Input type="number" min="0" step="1" className="h-8 text-xs" value={form.maxTotalDiscountPesos}
                      onChange={(e) => setForm((current) => ({ ...current, maxTotalDiscountPesos: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Max benefit quantity (optional)</Label>
                    <Input type="number" min="1" step="1" className="h-8 text-xs" value={form.maxBenefitQuantity}
                      onChange={(e) => setForm((current) => ({ ...current, maxBenefitQuantity: e.target.value }))} />
                  </div>
                  <div className="flex flex-col justify-end gap-2 pb-1">
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                      <Checkbox checked={form.allowBelowCost} onCheckedChange={(checked) => setForm((current) => ({ ...current, allowBelowCost: checked === true }))} />
                      Allow selling below cost
                    </label>
                    {/* #734: 'Stackable with statutory discounts' removed -- the stored
                        stackable_with_statutory column had zero policy readers anywhere in the
                        codebase and, if actually wired up, would contradict ADR 0066 Decision 8
                        (a single governed discount slot per POS transaction). Whether a
                        fixed-price voucher may combine with the statutory Senior/PWD 20% is an
                        open policy question tracked in #605 -- that's where this gets decided,
                        not here. Form state/mapper/submit payload below are left untouched so the
                        API contract and an existing voucher's stored value round-trip unchanged
                        (always sends stackable_with_statutory: false for a new voucher). */}
                  </div>
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
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <Checkbox checked={form.channelFlags.storefront} onCheckedChange={(checked) => setForm((current) => ({ ...current, channelFlags: { ...current.channelFlags, storefront: checked === true } }))} />
                      Storefront
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <Checkbox checked={form.channelFlags.pos} onCheckedChange={(checked) => setForm((current) => ({ ...current, channelFlags: { ...current.channelFlags, pos: checked === true } }))} />
                      POS
                    </label>
                    <FieldError message={fieldErrors.channels_mask} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-[#0F172A]">Fulfillment methods</Label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <Checkbox checked={form.fulfillmentFlags.delivery} onCheckedChange={(checked) => setForm((current) => ({ ...current, fulfillmentFlags: { ...current.fulfillmentFlags, delivery: checked === true } }))} />
                      Delivery
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <Checkbox checked={form.fulfillmentFlags.pickup} onCheckedChange={(checked) => setForm((current) => ({ ...current, fulfillmentFlags: { ...current.fulfillmentFlags, pickup: checked === true } }))} />
                      Pickup
                    </label>
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

              {isEdit && (
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
