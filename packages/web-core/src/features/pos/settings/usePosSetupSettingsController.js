import { useCallback, useState } from 'react';
import {
  createDefaultPosForm,
  normalizeDiscountProfiles,
  TERMINAL_ID_PATTERN,
  TERMINAL_REGISTRY_MODE_OPTIONS,
  toPositiveInt
} from './posSettingsModels.js';
import {
  createSuggestedTerminalId,
  normalizeTerminalCashierIds,
  normalizeTerminalRegistry,
  sanitizeTerminalId
} from '@/src/features/pos/utils/terminalIdentity.js';

export default function usePosSetupSettingsController() {
  const [posForm, setPosForm] = useState(createDefaultPosForm);

  const hydrateFromSettings = useCallback((settingsPayload = {}, terminalMeta = null) => {
    const discountProfiles = settingsPayload?.pos_discount_profiles?.value || [];
    const activeDiscountCount = Array.isArray(discountProfiles)
      ? discountProfiles.filter((profile) => profile && profile.active !== false && String(profile.name || '').trim()).length
      : 0;

    const nextPosForm = {
      registeredName: String(settingsPayload?.pos_registered_name?.value || ''),
      businessName: String(settingsPayload?.pos_business_name?.value || ''),
      businessStyle: String(settingsPayload?.pos_business_style?.value || ''),
      taxpayerType: String(settingsPayload?.pos_taxpayer_type?.value || ''),
      tinBranch: String(settingsPayload?.pos_tin_branch?.value || ''),
      businessAddress: String(settingsPayload?.pos_address?.value || ''),
      ptuNumber: String(settingsPayload?.pos_ptu_number?.value || ''),
      minNumber: String(settingsPayload?.pos_min_number?.value || ''),
      accreditationNumber: String(settingsPayload?.pos_accreditation_number?.value || ''),
      fiscalBuyerDetailsRequired: settingsPayload?.pos_fiscal_buyer_details_required?.value === true,
      receiptFooterMessage: String(settingsPayload?.pos_receipt_footer_message?.value || ''),
      terminalRegistry: normalizeTerminalRegistry(settingsPayload?.pos_terminal_registry?.value || []),
      terminalRegistryMode: TERMINAL_REGISTRY_MODE_OPTIONS.includes(String(settingsPayload?.pos_terminal_registry_mode?.value || '').trim().toLowerCase())
        ? String(settingsPayload?.pos_terminal_registry_mode?.value || '').trim().toLowerCase()
        : 'warn',
      terminalLocationBindingEnforced: settingsPayload?.pos_terminal_location_binding_enforced?.value === true,
      voucherPosRedemptionEnabled: settingsPayload?.voucher_pos_redemption_enabled?.value === true,
      settingsAccessPinEnabled: settingsPayload?.pos_settings_access_pin_enabled?.value === true,
      settingsAccessPin: '',
      clearSettingsAccessPin: false,
      discountProfiles: normalizeDiscountProfiles(discountProfiles),
      employeeDiscountSelfApprovalEnabled: settingsPayload?.pos_employee_discount_self_approval_enabled?.value === true,
      posReceiptMetadataPendingReview: settingsPayload?.pos_receipt_metadata_pending_changes?.value?.status === 'pending_review'
        ? settingsPayload.pos_receipt_metadata_pending_changes.value
        : null,
      pettyCashSymbol: String(settingsPayload?.pos_petty_cash_symbol?.value || terminalMeta?.pettyCashSymbol || 'PHP'),
      pettyCashAmount: Number(settingsPayload?.pos_petty_cash_amount?.value ?? terminalMeta?.pettyCashAmount ?? 0) || 0,
      activeDiscountCount,
      posOpenStatus: settingsPayload?.pos_open_status?.value ?? true,
      posWaitTimeMinutes: Number(settingsPayload?.pos_wait_time_minutes?.value ?? 15) || 15,
      inventoryLowStockDisplayThreshold: Number(settingsPayload?.inventory_low_stock_display_threshold?.value ?? 5) || 5,
      bestSellerAutoTaggingEnabled: settingsPayload?.pos_best_seller_settings?.value?.enabled !== false,
      dailyTopBestSellerEnabled: settingsPayload?.pos_best_seller_settings?.value?.daily_top_enabled === true
    };
    setPosForm(nextPosForm);
    return nextPosForm;
  }, []);

  const handleDiscountProfileChange = useCallback((index, key, value) => {
    setPosForm((current) => {
      const nextProfiles = Array.isArray(current.discountProfiles) ? [...current.discountProfiles] : [];
      const existing = nextProfiles[index] || { name: '', percentage: 0, active: true };
      nextProfiles[index] = { ...existing, [key]: key === 'percentage' ? Number(value) : value };
      return {
        ...current,
        discountProfiles: nextProfiles,
        activeDiscountCount: nextProfiles.filter((profile) => profile && profile.active !== false && String(profile.name || '').trim()).length
      };
    });
  }, []);

  const addDiscountProfile = useCallback(() => {
    setPosForm((current) => {
      const nextProfiles = [...(Array.isArray(current.discountProfiles) ? current.discountProfiles : []), { name: '', percentage: 0, active: true }];
      return { ...current, discountProfiles: nextProfiles, activeDiscountCount: nextProfiles.length };
    });
  }, []);

  const removeDiscountProfile = useCallback((index) => {
    setPosForm((current) => {
      const nextProfiles = (Array.isArray(current.discountProfiles) ? current.discountProfiles : []).filter((_, profileIndex) => profileIndex !== index);
      return {
        ...current,
        discountProfiles: nextProfiles,
        activeDiscountCount: nextProfiles.filter((profile) => profile && profile.active !== false && String(profile.name || '').trim()).length
      };
    });
  }, []);

  const handleTerminalRegistryChange = useCallback((index, key, value) => {
    setPosForm((current) => {
      const entries = Array.isArray(current.terminalRegistry)
        ? current.terminalRegistry.map((entry) => ({
          terminal_id: sanitizeTerminalId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          ...(Array.isArray(entry?.cashier_user_ids)
            ? { cashier_user_ids: normalizeTerminalCashierIds(entry.cashier_user_ids) }
            : {}),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        : [];
      const previousLocationId = entries[index]?.location_id;
      const existing = entries[index] || {
        terminal_id: createSuggestedTerminalId(entries), label: '', location_id: null,
        cashier_user_ids: [],
        is_active: true, is_default: entries.length === 0, pairing_version: '', rotate_pairing: false
      };
      entries[index] = {
        ...existing,
        [key]: key === 'terminal_id' ? sanitizeTerminalId(value) : (key === 'location_id' ? toPositiveInt(value) : value)
      };
      if (key === 'location_id' && previousLocationId !== entries[index].location_id) {
        entries[index].cashier_user_ids = [];
      }
      if (key === 'is_active' && value === false && entries[index].is_default === true) {
        entries[index].is_default = false;
        const fallbackIndex = entries.findIndex((entry, entryIndex) => entryIndex !== index && entry.is_active);
        if (fallbackIndex >= 0) entries[fallbackIndex].is_default = true;
      }
      if (key === 'is_default' && value === true) {
        entries.forEach((entry, entryIndex) => { if (entryIndex !== index) entry.is_default = false; });
        entries[index].is_active = true;
      }
      return { ...current, terminalRegistry: entries };
    });
  }, []);

  const addTerminalRegistryEntry = useCallback(() => {
    setPosForm((current) => {
      const entries = (Array.isArray(current.terminalRegistry) ? current.terminalRegistry : []).map((entry) => ({
        terminal_id: sanitizeTerminalId(entry?.terminal_id), label: String(entry?.label || '').trim(),
        location_id: toPositiveInt(entry?.location_id), is_active: entry?.is_active !== false,
        is_default: entry?.is_default === true, pairing_version: String(entry?.pairing_version || '').trim(),
        ...(Array.isArray(entry?.cashier_user_ids)
          ? { cashier_user_ids: normalizeTerminalCashierIds(entry.cashier_user_ids) }
          : {}),
        rotate_pairing: entry?.rotate_pairing === true
      }));
      entries.push({ terminal_id: createSuggestedTerminalId(entries), label: '', location_id: null, cashier_user_ids: [], is_active: true, is_default: entries.length === 0, pairing_version: '', rotate_pairing: false });
      return { ...current, terminalRegistry: entries };
    });
  }, []);

  const removeTerminalRegistryEntry = useCallback((index) => {
    setPosForm((current) => {
      const entries = (Array.isArray(current.terminalRegistry) ? current.terminalRegistry : []).map((entry) => ({
        terminal_id: sanitizeTerminalId(entry?.terminal_id), label: String(entry?.label || '').trim(),
        location_id: toPositiveInt(entry?.location_id), is_active: entry?.is_active !== false,
        is_default: entry?.is_default === true, pairing_version: String(entry?.pairing_version || '').trim(), rotate_pairing: entry?.rotate_pairing === true,
        ...(Array.isArray(entry?.cashier_user_ids)
          ? { cashier_user_ids: normalizeTerminalCashierIds(entry.cashier_user_ids) }
          : {})
      })).filter((_, entryIndex) => entryIndex !== index);
      if (entries.length > 0 && !entries.some((entry) => entry.is_default === true && entry.is_active)) {
        const firstActiveIndex = entries.findIndex((entry) => entry.is_active);
        if (firstActiveIndex >= 0) entries[firstActiveIndex].is_default = true;
      }
      return { ...current, terminalRegistry: entries };
    });
  }, []);

  const buildTerminalRegistryPayload = useCallback((terminalRegistryOverride = posForm.terminalRegistry) => {
    const rawTerminalRegistry = Array.isArray(terminalRegistryOverride) ? terminalRegistryOverride : [];
    const candidateTerminalEntries = rawTerminalRegistry.map((entry) => ({
      terminal_id: sanitizeTerminalId(entry?.terminal_id), label: String(entry?.label || '').trim(), location_id: toPositiveInt(entry?.location_id),
      is_active: entry?.is_active !== false, is_default: entry?.is_default === true,
      pairing_version: String(entry?.pairing_version || '').trim(), rotate_pairing: entry?.rotate_pairing === true,
      ...(Array.isArray(entry?.cashier_user_ids)
        ? { cashier_user_ids: normalizeTerminalCashierIds(entry.cashier_user_ids) }
        : {})
    })).filter((entry) => entry.terminal_id || entry.label || entry.is_default || entry.is_active === false);
    const invalidTerminalEntry = candidateTerminalEntries.find((entry) => !entry.terminal_id || !TERMINAL_ID_PATTERN.test(entry.terminal_id));
    if (invalidTerminalEntry) throw new Error(`Invalid terminal ID: ${invalidTerminalEntry.terminal_id || '(empty)'}`);
    const seenTerminalIds = new Set();
    for (const entry of candidateTerminalEntries) {
      if (seenTerminalIds.has(entry.terminal_id)) throw new Error(`Duplicate terminal ID: ${entry.terminal_id}`);
      seenTerminalIds.add(entry.terminal_id);
    }
    if (candidateTerminalEntries.filter((entry) => entry.is_default === true).length > 1) throw new Error('Only one default terminal can be configured.');
    const posTerminalRegistry = candidateTerminalEntries.map((entry) => ({
      terminal_id: entry.terminal_id, label: entry.label, location_id: entry.location_id,
      is_active: entry.is_active !== false, is_default: entry.is_default === true,
      pairing_version: entry.pairing_version, rotate_pairing: entry.rotate_pairing === true,
      ...(Array.isArray(entry?.cashier_user_ids)
        ? { cashier_user_ids: normalizeTerminalCashierIds(entry.cashier_user_ids) }
        : {})
    }));
    const posTerminalRegistryMode = TERMINAL_REGISTRY_MODE_OPTIONS.includes(String(posForm.terminalRegistryMode || '').trim().toLowerCase())
      ? String(posForm.terminalRegistryMode || '').trim().toLowerCase() : 'warn';
    const normalizedRegistryState = normalizeTerminalRegistry(posTerminalRegistry);
    if (posTerminalRegistryMode === 'enforce' && normalizedRegistryState.filter((entry) => entry?.is_active !== false).length === 0) {
      throw new Error('Terminal registry mode "enforce" requires at least one active terminal entry.');
    }
    return { posTerminalRegistry, normalizedRegistryState, posTerminalRegistryMode };
  }, [posForm.terminalRegistry, posForm.terminalRegistryMode]);

  return {
    posForm,
    setPosForm,
    hydrateFromSettings,
    handleDiscountProfileChange,
    addDiscountProfile,
    removeDiscountProfile,
    handleTerminalRegistryChange,
    addTerminalRegistryEntry,
    removeTerminalRegistryEntry,
    buildTerminalRegistryPayload
  };
}
