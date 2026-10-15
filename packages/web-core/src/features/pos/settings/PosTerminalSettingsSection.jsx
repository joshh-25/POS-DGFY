import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, BarChart3, Check, ChevronLeft, ChevronRight, Database, Monitor, Pencil, Plus, Search, Settings2, Star, Users
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { createSuggestedTerminalId, normalizeTerminalCashierIds } from '@/src/features/pos/utils/terminalIdentity.js';
import { toPositiveInt } from './posSettingsModels.js';
import PosAddTerminalModal from './PosAddTerminalModal.jsx';
import PosTerminalAdvancedSettingsModal, { TerminalPolicyFields } from './PosTerminalAdvancedSettingsModal.jsx';
import PosTerminalCashierAccessTable from './PosTerminalCashierAccessTable.jsx';

const cloneTerminal = (terminal = {}) => ({
  ...terminal,
  terminal_id: String(terminal?.terminal_id || ''),
  label: String(terminal?.label || ''),
  location_id: terminal?.location_id ?? '',
  is_active: terminal?.is_active !== false,
  is_default: terminal?.is_default === true,
  ...(Array.isArray(terminal?.cashier_user_ids)
    ? { cashier_user_ids: normalizeTerminalCashierIds(terminal.cashier_user_ids) }
    : {}),
  pairing_version: String(terminal?.pairing_version || ''),
  rotate_pairing: terminal?.rotate_pairing === true
});

function TerminalToggle({ label, enabled, onChange, disabled }) {
  const toggleContent = (
    <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 p-0.5 transition-colors motion-reduce:transition-none ${
      enabled ? 'border-[#1A4E8D] bg-[#1A4E8D]' : 'border-slate-300 bg-slate-300'
    }`}>
      <span className={`flex h-4 w-4 items-center justify-center rounded-full bg-white text-[#1A4E8D] shadow-sm transition-transform motion-reduce:transition-none ${enabled ? 'translate-x-5' : 'translate-x-0'}`} aria-hidden="true">
        {enabled ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
    </span>
  );

  if (!onChange) return <span aria-label={`${label}: ${enabled ? 'Enabled' : 'Disabled'}`}>{toggleContent}</span>;

  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={enabled}
      onClick={(event) => { event.stopPropagation(); onChange(!enabled); }}
      disabled={disabled}
      className="pointer-events-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9 sm:min-w-[2.75rem]"
    >
      {toggleContent}
    </button>
  );
}

function ReadinessMetric({ icon: Icon, label, value }) {
  return (
    <div className="col-span-1 flex min-w-0 items-center gap-2.5 border-b border-slate-100 py-1.5 last:border-b-0 md:border-b-0 md:py-0">
      <div className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50/70 text-[#46658F] md:grid">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <span className="block text-[11px] font-medium leading-4 text-[#536B8C]">{label}</span>
        <strong className="mt-0.5 block text-[14px] font-extrabold leading-5 text-[#0F172A]">{value}</strong>
      </div>
    </div>
  );
}

function TerminalCarouselPagination({ terminalCount, activeIndex, canScrollPrevious, canScrollNext, onPrevious, onNext, onSelect }) {
  if (terminalCount < 2) return null;

  return (
    <div className="mt-4 flex items-center justify-center gap-1.5" aria-label="Terminal list pagination">
      <button
        type="button"
        aria-label="Show previous terminals"
        onClick={onPrevious}
        disabled={!canScrollPrevious}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${canScrollPrevious ? 'border-blue-100 bg-blue-50 text-[#1A4E8D] hover:bg-blue-100' : 'border-transparent bg-slate-50 text-slate-300'}`}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div role="tablist" aria-label="Terminal list pages" className="flex min-w-0 max-w-[min(55vw,20rem)] flex-wrap items-center justify-center gap-0.5">
        {Array.from({ length: terminalCount }, (_, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={`terminal-page-${index}`}
              type="button"
              role="tab"
              aria-label={`Show terminal ${index + 1}`}
              aria-selected={active}
              onClick={() => onSelect(index)}
              className="group grid h-9 w-9 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 focus-visible:ring-offset-2"
            >
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full transition-colors ${active ? 'bg-[#1A4E8D]' : 'bg-slate-300 group-hover:bg-slate-400'}`} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Show more terminals"
        onClick={onNext}
        disabled={!canScrollNext}
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${canScrollNext ? 'border-blue-100 bg-blue-50 text-[#1A4E8D] hover:bg-blue-100' : 'border-transparent bg-slate-50 text-slate-300'}`}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function PosTerminalSettingsSection({
  locked, canEditSettings = true, loading, savingTab, posForm, locations,
  handleTerminalRegistrySave, handleTerminalAdvancedSettingsSave,
  showTerminalRegistryEditor = true,
  editorSection = '',
  readiness, canManageCashiers, canRemoveCashiers, setCashierRemoveUser, cashiersLoading,
  cashiersLoaded, getCashiersForLocation, setCashierInvitationOpen,
  discountApprovers, discountApproversLoading, canManageDiscountApprovalPins,
  updateDiscountAuthorization, discountAuthorizationSavingUserId,
  dayCloseOperators, dayCloseOperatorsLoading, canManageDayClosePins, updateDayCloseAccess,
  dayCloseAccessSavingUserId, cashierVoidAccessSavingUserId,
  updateCashierVoidAccess, updateCashierDrawerAccess, cashierPinSavingUserId,
  onOpenCashierPin = async () => {}
}) {
  const terminalRegistry = Array.isArray(posForm.terminalRegistry) ? posForm.terminalRegistry : [];
  const [selectedTerminalIndex, setSelectedTerminalIndex] = useState(0);
  const [editingTerminalIndex, setEditingTerminalIndex] = useState(null);
  const [editingTerminalDraft, setEditingTerminalDraft] = useState(null);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [advancedSettingsDraft, setAdvancedSettingsDraft] = useState(null);
  const terminalCarouselRef = useRef(null);
  const terminalCardRefs = useRef(new Map());
  const [terminalHint, setTerminalHint] = useState(null);
  const [terminalCarouselState, setTerminalCarouselState] = useState({ canScrollPrevious: false, canScrollNext: false });
  const advancedSettingsValues = advancedSettingsDraft || {
    terminalRegistryMode: posForm?.terminalRegistryMode || 'warn',
    terminalLocationBindingEnforced: posForm?.terminalLocationBindingEnforced === true,
    voucherPosRedemptionEnabled: posForm?.voucherPosRedemptionEnabled === true
  };
  const policyLocked = locked || canEditSettings === false;

  const openTerminalHint = useCallback((index, pointer = null) => {
    const card = terminalCardRefs.current.get(index);
    if (!card || typeof window === 'undefined') return;

    const anchor = card.getBoundingClientRect();
    const tooltipWidth = Math.min(220, Math.max(0, window.innerWidth - 32));
    const estimatedHeight = 32;
    const left = pointer
      ? Math.min(
        Math.max(12, pointer.x + 12),
        Math.max(12, window.innerWidth - tooltipWidth - 12)
      )
      : Math.min(
        Math.max(16, anchor.left + (anchor.width - tooltipWidth) / 2),
        Math.max(16, window.innerWidth - tooltipWidth - 16)
      );
    const top = pointer
      ? (pointer.y + 14 + estimatedHeight <= window.innerHeight - 12
        ? pointer.y + 14
        : Math.max(12, pointer.y - estimatedHeight - 14))
      : (() => {
        const belowTop = anchor.bottom + 8;
        return belowTop + estimatedHeight <= window.innerHeight - 16
          ? belowTop
          : Math.max(16, anchor.top - estimatedHeight - 8);
      })();

    setTerminalHint({ index, left, top, width: tooltipWidth, pointer });
  }, []);

  const updateTerminalCarouselState = useCallback(() => {
    const node = terminalCarouselRef.current;
    if (!node) return;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const canScrollPrevious = node.scrollLeft > 2;
    const canScrollNext = node.scrollLeft < maxScrollLeft - 2;
    setTerminalCarouselState((current) => (
      current.canScrollPrevious === canScrollPrevious && current.canScrollNext === canScrollNext
        ? current
        : { canScrollPrevious, canScrollNext }
    ));
  }, []);

  const scrollToTerminal = useCallback((index) => {
    const node = terminalCarouselRef.current;
    const card = terminalCardRefs.current.get(index);
    if (!node || !card) return;
    setSelectedTerminalIndex(index);
    const nodeRect = node.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const centeredLeft = node.scrollLeft + (cardRect.left - nodeRect.left) - Math.max(0, (node.clientWidth - cardRect.width) / 2);
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    node.scrollTo({
      left: Math.min(maxScrollLeft, Math.max(0, centeredLeft)),
      behavior: 'smooth'
    });
  }, []);

  const scrollTerminalCarousel = useCallback((direction) => {
    const nextIndex = Math.min(
      terminalRegistry.length - 1,
      Math.max(0, selectedTerminalIndex + direction)
    );
    scrollToTerminal(nextIndex);
  }, [selectedTerminalIndex, scrollToTerminal, terminalRegistry.length]);

  useEffect(() => {
    setSelectedTerminalIndex((current) => (
      terminalRegistry.length === 0 ? 0 : Math.min(current, terminalRegistry.length - 1)
    ));
    setEditingTerminalIndex((current) => (
      current != null && current >= terminalRegistry.length ? null : current
    ));
    setTerminalHint((current) => (
      current && current.index >= terminalRegistry.length ? null : current
    ));
  }, [terminalRegistry.length]);

  const terminalHintIndex = terminalHint?.index;
  const terminalHintIsPointerAnchored = Boolean(terminalHint?.pointer);
  useEffect(() => {
    if (terminalHintIndex == null || terminalHintIsPointerAnchored) return undefined;
    const reposition = () => openTerminalHint(terminalHintIndex);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [openTerminalHint, terminalHintIndex, terminalHintIsPointerAnchored]);

  useEffect(() => {
    const node = terminalCarouselRef.current;
    if (!node) return undefined;
    const update = () => updateTerminalCarouselState();
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [terminalRegistry.length, updateTerminalCarouselState]);

  if (!showTerminalRegistryEditor) return null;

  const beginEditing = (index) => {
    setSelectedTerminalIndex(index);
    setEditingTerminalIndex(index);
    setEditingTerminalDraft(cloneTerminal(terminalRegistry[index]));
  };

  const beginAdding = () => {
    if (editingTerminalIndex != null) return;
    setEditingTerminalIndex(terminalRegistry.length);
    setEditingTerminalDraft({
      terminal_id: createSuggestedTerminalId(terminalRegistry),
      label: '',
      location_id: '',
      is_active: true,
      is_default: terminalRegistry.length === 0,
      cashier_user_ids: [],
      pairing_version: '',
      rotate_pairing: false
    });
  };

  const closeEditor = () => {
    if (savingTab === 'terminal_registry') return;
    setEditingTerminalIndex(null);
    setEditingTerminalDraft(null);
  };

  const updateDraft = (key, value) => {
    setEditingTerminalDraft((current) => {
      if (!current) return current;
      if (key === 'is_default' && value === true) return { ...current, is_default: true, is_active: true };
      if (key === 'is_active' && value === false) return { ...current, is_active: false, is_default: false };
      if (key === 'location_id' && toPositiveInt(current.location_id) !== toPositiveInt(value)) {
        return { ...current, location_id: value, cashier_user_ids: [] };
      }
      return { ...current, [key]: value };
    });
  };

  const toggleTerminalFlag = async (index, key, value) => {
    if (locked || loading || savingTab === 'terminal_registry') return;
    const nextRegistry = terminalRegistry.map(cloneTerminal);
    if (!nextRegistry[index]) return;

    if (key === 'is_default' && value === true) {
      nextRegistry[index].is_default = true;
      nextRegistry[index].is_active = true;
      nextRegistry.forEach((entry, entryIndex) => {
        if (entryIndex !== index) entry.is_default = false;
      });
    } else if (key === 'is_default') {
      nextRegistry[index].is_default = value === true;
    } else if (key === 'is_active') {
      nextRegistry[index].is_active = value === true;
      if (value !== true) {
        nextRegistry[index].is_default = false;
        if (!nextRegistry.some((entry) => entry.is_default === true && entry.is_active !== false)) {
          const fallbackIndex = nextRegistry.findIndex((entry) => entry.is_active !== false);
          if (fallbackIndex >= 0) nextRegistry[fallbackIndex].is_default = true;
        }
      }
    }

    const statusMessage = key === 'is_active'
      ? `Active terminal ${value === true ? 'enabled' : 'disabled'}.`
      : 'Default terminal updated.';
    await handleTerminalRegistrySave?.(nextRegistry, {
      successMessage: statusMessage,
      errorMessage: `Failed to update ${key === 'is_active' ? 'active terminal status' : 'default terminal'}.`
    });
  };

  const getAssignedCashierIds = (terminal) => {
    const locationCashiers = getCashiersForLocation(terminal?.location_id);
    if (Array.isArray(terminal?.cashier_user_ids)) {
      return normalizeTerminalCashierIds(terminal.cashier_user_ids);
    }
    // Existing registries predate terminal assignments. Keep their current
    // location-wide view until the owner makes the first assignment change.
    return locationCashiers
      .map((cashier) => Number(cashier?.user_id))
      .filter((userId) => Number.isInteger(userId) && userId > 0);
  };

  const getCashiersForTerminal = (terminal) => {
    const locationCashiers = getCashiersForLocation(terminal?.location_id);
    const assignedIds = new Set(getAssignedCashierIds(terminal));
    return locationCashiers.filter((cashier) => assignedIds.has(Number(cashier?.user_id)));
  };

  const assignmentTerminals = terminalRegistry
    .map((entry, index) => ({
      index,
      terminalId: entry?.terminal_id || `Terminal ${index + 1}`,
      label: entry?.label || '',
      isActive: entry?.is_active !== false,
      locationId: toPositiveInt(entry?.location_id)
    }))
    .filter((entry) => entry.locationId > 0 && entry.locationId === toPositiveInt(terminalRegistry[selectedTerminalIndex]?.location_id));

  const getAssignedTerminalIndexes = (cashier) => {
    const cashierId = Number(cashier?.user_id);
    if (!Number.isInteger(cashierId) || cashierId <= 0) return [];
    return assignmentTerminals
      .filter((entry) => getAssignedCashierIds(terminalRegistry[entry.index]).includes(cashierId))
      .map((entry) => entry.index);
  };

  const updateCashierTerminalAssignments = async (cashier, terminalIndexes = []) => {
    if (locked || loading || savingTab === 'terminal_registry') return;
    const cashierId = Number(cashier?.user_id);
    if (!Number.isInteger(cashierId) || cashierId <= 0 || assignmentTerminals.length === 0) return;

    const eligibleIndexes = new Set(assignmentTerminals.map((entry) => entry.index));
    const selectedIndexes = new Set(
      (Array.isArray(terminalIndexes) ? terminalIndexes : [])
        .map((index) => Number(index))
        .filter((index) => eligibleIndexes.has(index))
    );
    const nextRegistry = terminalRegistry.map(cloneTerminal);
    assignmentTerminals.forEach(({ index }) => {
      const assignedIds = new Set(getAssignedCashierIds(terminalRegistry[index]));
      if (selectedIndexes.has(index)) assignedIds.add(cashierId);
      else assignedIds.delete(cashierId);
      nextRegistry[index].cashier_user_ids = normalizeTerminalCashierIds(Array.from(assignedIds));
    });
    await handleTerminalRegistrySave?.(nextRegistry, {
      successMessage: 'Cashier terminal assignments updated.',
      errorMessage: 'Failed to update cashier terminal assignments.'
    });
  };

  const buildRegistryForSave = () => {
    if (editingTerminalIndex == null || !editingTerminalDraft) return terminalRegistry;
    const nextRegistry = terminalRegistry.map(cloneTerminal);
    if (editingTerminalIndex >= nextRegistry.length) nextRegistry.push(cloneTerminal(editingTerminalDraft));
    else nextRegistry[editingTerminalIndex] = cloneTerminal(editingTerminalDraft);

    const editedEntry = nextRegistry[editingTerminalIndex];
    if (editedEntry?.is_default === true) {
      editedEntry.is_active = true;
      nextRegistry.forEach((entry, index) => { if (index !== editingTerminalIndex) entry.is_default = false; });
    }
    if (editedEntry?.is_active === false) {
      editedEntry.is_default = false;
      if (!nextRegistry.some((entry) => entry.is_default === true && entry.is_active !== false)) {
        const fallbackIndex = nextRegistry.findIndex((entry) => entry.is_active !== false);
        if (fallbackIndex >= 0) nextRegistry[fallbackIndex].is_default = true;
      }
    }
    return nextRegistry;
  };

  const saveTerminal = async () => {
    if (editingTerminalIndex == null || !editingTerminalDraft || savingTab === 'terminal_registry') return;
    const editingExistingTerminal = editingTerminalIndex < terminalRegistry.length;
    const saved = await handleTerminalRegistrySave?.(buildRegistryForSave(), {
      successMessage: editingExistingTerminal ? 'Terminal updated.' : 'Terminal added.',
      errorMessage: editingExistingTerminal ? 'Failed to update terminal.' : 'Failed to add terminal.'
    });
    if (saved !== false) closeEditor();
  };

  const deleteTerminal = async () => {
    if (editingTerminalIndex == null || editingTerminalIndex >= terminalRegistry.length) return;
    const terminalLabel = terminalRegistry[editingTerminalIndex]?.terminal_id || 'this terminal';
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${terminalLabel}? This removes it from the managed terminal registry.`)) return;
    const nextRegistry = terminalRegistry.filter((_, index) => index !== editingTerminalIndex).map(cloneTerminal);
    if (!nextRegistry.some((entry) => entry.is_default === true && entry.is_active !== false)) {
      const fallbackIndex = nextRegistry.findIndex((entry) => entry.is_active !== false);
      if (fallbackIndex >= 0) nextRegistry[fallbackIndex].is_default = true;
    }
    const saved = await handleTerminalRegistrySave?.(nextRegistry, {
      successMessage: 'Terminal removed.',
      errorMessage: 'Failed to remove terminal.'
    });
    if (saved !== false) {
      setSelectedTerminalIndex((current) => Math.max(0, Math.min(current, nextRegistry.length - 1)));
      closeEditor();
    }
  };

  const openAdvancedSettings = () => {
    setAdvancedSettingsDraft(advancedSettingsValues);
    setAdvancedSettingsOpen(true);
  };

  const closeAdvancedSettings = () => {
    if (savingTab === 'terminal_advanced_settings') return;
    setAdvancedSettingsDraft(null);
    setAdvancedSettingsOpen(false);
  };

  const saveAdvancedSettings = async () => {
    const saved = await handleTerminalAdvancedSettingsSave?.(advancedSettingsValues, {
      successMessage: editorSection === 'registers' ? 'Terminal registry saved.' : undefined
    });
    if (saved === true) {
      setAdvancedSettingsDraft(null);
      setAdvancedSettingsOpen(false);
    }
  };

  const selectedTerminal = terminalRegistry[selectedTerminalIndex];
  const activeTerminalCount = terminalRegistry.filter((terminal) => terminal.is_active !== false).length;
  const inactiveTerminalCount = terminalRegistry.length - activeTerminalCount;
  const editingLocationName = locations.find((location) => (
    toPositiveInt(location.location_id) === toPositiveInt(editingTerminalDraft?.location_id)
  ))?.name;

  return (
    <>
      {editorSection === 'registers' ? (
        <section aria-labelledby="pos-terminal-policy-title" className="w-full min-w-0 border-b border-slate-200 pb-6">
          <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 id="pos-terminal-policy-title" className="text-[16px] font-extrabold text-[#0F172A]">Terminal policy</h3>
              <p className="mt-1 text-[12px] leading-5 text-[#64748B]">Branch binding and registry enforcement apply to terminals in this business.</p>
            </div>
            <Button
              type="button"
              className="min-h-9 w-full rounded-lg bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto"
              onClick={saveAdvancedSettings}
              disabled={policyLocked || loading || savingTab === 'terminal_advanced_settings'}
            >
              {savingTab === 'terminal_advanced_settings' ? 'Saving...' : 'Save'}
            </Button>
          </div>
          <div className="grid gap-3">
            <TerminalPolicyFields
              values={advancedSettingsValues}
              locked={policyLocked || loading}
              saving={savingTab === 'terminal_advanced_settings'}
              idPrefix="business-admin-terminal"
              onChange={(key, value) => setAdvancedSettingsDraft((current) => ({ ...advancedSettingsValues, ...current, [key]: value }))}
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="pos-terminal-registry-title" className="w-full min-w-0 border-b border-slate-200 pb-6 last:border-b-0">
        <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]"><Monitor className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h3 id="pos-terminal-registry-title" className="text-[16px] font-extrabold text-[#0F172A]">Terminal Registry</h3>
              <p className="mt-1 text-[12px] leading-5 text-[#64748B]">Manage terminals and their cashier assignments. Select a terminal to review its cashiers.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {editorSection !== 'registers' ? (
              <Button type="button" variant="outline" className="min-h-9 gap-1.5 rounded-lg border-[#B9D5F7] bg-blue-50 px-3 text-[13px] font-extrabold text-[#1A4E8D] shadow-sm hover:border-[#1A4E8D] hover:bg-blue-100 sm:text-[14px]" onClick={openAdvancedSettings} disabled={policyLocked || loading || savingTab === 'terminal_advanced_settings' || editingTerminalIndex != null}><Settings2 className="h-4 w-4" />Advanced Settings</Button>
            ) : null}
          </div>
        </div>

        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-1 md:grid-cols-3 md:gap-3 xl:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(8rem,1fr))] xl:gap-5">
            <div className="col-span-1 flex min-w-0 items-center gap-3 border-b border-slate-100 pb-3 md:col-span-3 md:border-b-0 md:pb-0 xl:col-span-1">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]"><Search className="h-5 w-5" /></div>
              <div className="min-w-0">
                <span className="block text-[14px] font-extrabold leading-5 text-[#0F172A]">Location Binding Readiness</span>
                <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${readiness?.ready_for_strict_mode ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  <span className={`h-2 w-2 rounded-full ${readiness?.ready_for_strict_mode ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
                  {readiness?.ready_for_strict_mode ? 'Ready' : 'Needs Review'}
                </span>
              </div>
            </div>
            <ReadinessMetric icon={Database} label="Migration" value={readiness?.migration_tag || '-'} />
            <ReadinessMetric icon={AlertCircle} label="Unresolved" value={Number(readiness?.unresolved_count || 0)} />
            <ReadinessMetric icon={BarChart3} label="Low confidence" value={Number(readiness?.low_confidence_count || 0)} />
          </div>
        </div>

        <div className="mt-6 flex min-w-0 flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h4 className="text-[16px] font-extrabold text-[#0F172A]">Terminal list</h4>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Terminal status summary">
              <span aria-label={`${activeTerminalCount} Active`} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {activeTerminalCount} Active
              </span>
              <span aria-label={`${inactiveTerminalCount} Inactive`} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
                {inactiveTerminalCount} Inactive
              </span>
            </div>
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <Button type="button" className="min-h-9 min-w-0 flex-1 gap-1.5 rounded-lg border border-[#1A4E8D] bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:flex-none sm:text-[14px]" onClick={beginAdding} disabled={locked || loading || editingTerminalIndex != null}>
              <Plus className="h-4 w-4" />Add Terminal
            </Button>
          </div>
        </div>

        {terminalRegistry.length > 0 || editingTerminalIndex != null ? (
          <>
            <div ref={terminalCarouselRef} onScroll={updateTerminalCarouselState} className="mt-3 min-w-0 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="list" aria-label="Registered POS terminals">
                {terminalRegistry.map((terminal, index) => {
                const selected = index === selectedTerminalIndex;
                const terminalLabel = terminal.terminal_id || `Terminal ${index + 1}`;
                const locationName = locations.find((location) => toPositiveInt(location.location_id) === toPositiveInt(terminal.location_id))?.name;
                const assignedCashierCount = getCashiersForTerminal(terminal).length;
                return (
                  <div
                    key={`terminal-selector-${index}`}
                    ref={(node) => { if (node) terminalCardRefs.current.set(index, node); else terminalCardRefs.current.delete(index); }}
                    role="listitem"
                    onMouseEnter={(event) => openTerminalHint(index, { x: event.clientX, y: event.clientY })}
                    onMouseMove={(event) => {
                      if (terminalHint?.index === index) openTerminalHint(index, { x: event.clientX, y: event.clientY });
                    }}
                    onMouseLeave={() => setTerminalHint(null)}
                    className={`relative w-[min(86vw,22rem)] shrink-0 snap-start rounded-xl border bg-white p-4 text-left transition sm:w-[calc((100%-0.75rem)/2)] min-[1200px]:w-[calc((100%-1.5rem)/3)] ${selected ? 'border-[#1A4E8D] shadow-sm shadow-blue-100' : 'border-[#C7D8EB] shadow-sm shadow-slate-100/60 hover:border-[#9BBBE0]'}`}
                  >
                    <button
                      type="button"
                      aria-label={`Select ${terminalLabel} to view assigned cashiers`}
                      aria-pressed={selected}
                      aria-describedby={terminalHint?.index === index ? `pos-terminal-selection-help-${index}` : undefined}
                      onClick={() => { setSelectedTerminalIndex(index); setTerminalHint(null); }}
                      onFocus={() => openTerminalHint(index)}
                      onBlur={() => setTerminalHint(null)}
                      className="absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1A4E8D]/50"
                    />
                    <div className="pointer-events-none relative z-10">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3 rounded-lg text-left">
                          <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]">
                            <Monitor className="h-5 w-5" />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${terminal.is_active !== false ? 'bg-emerald-500' : 'bg-red-500'}`}
                              aria-label={`${terminal.is_active !== false ? 'Active' : 'Inactive'} terminal`}
                              title={`${terminal.is_active !== false ? 'Active' : 'Inactive'} terminal`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="truncate text-[14px] font-extrabold tracking-[-0.01em] text-[#0F172A]">{terminalLabel}</h4>
                            </div>
                            <p className="mt-1 truncate text-[11px] font-semibold text-[#64748B]">{terminal.label || 'No terminal label'} <span className="px-1 text-slate-300" aria-hidden="true">·</span> {locationName || 'Location unassigned'}</p>
                          </div>
                        </div>
                        <Button type="button" variant="outline" aria-label={`Edit ${terminalLabel}`} title={`Edit ${terminalLabel}`} className="pointer-events-auto h-11 w-11 shrink-0 rounded-lg border-blue-200 bg-white p-0 text-[#1A4E8D] shadow-sm hover:border-[#1A4E8D] hover:bg-blue-50 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-2.5 sm:text-[12px] sm:font-extrabold" onClick={() => beginEditing(index)} disabled={locked || loading || editingTerminalIndex != null}><Pencil className="h-3.5 w-3.5 sm:h-3 sm:w-3" /><span className="hidden sm:inline">Edit</span></Button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-[minmax(0,1fr)_1px_minmax(7rem,auto)] sm:items-center sm:gap-3">
                        <div className="grid gap-1 sm:gap-2">
                          <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#334155]"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />Active terminal</span><TerminalToggle label="Active terminal" enabled={terminal.is_active !== false} onChange={(value) => toggleTerminalFlag(index, 'is_active', value)} disabled={locked || loading || savingTab === 'terminal_registry' || editingTerminalIndex != null} /></div>
                          <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#334155]"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />Default terminal</span><TerminalToggle label="Default terminal" enabled={terminal.is_default === true} onChange={(value) => toggleTerminalFlag(index, 'is_default', value)} disabled={locked || loading || savingTab === 'terminal_registry' || editingTerminalIndex != null} /></div>
                        </div>
                        <div className="hidden h-12 w-px bg-slate-200 sm:block" aria-hidden="true" />
                        <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] font-semibold text-[#64748B] sm:justify-center sm:border-t-0 sm:pt-0">
                          <Users className="h-4 w-4 shrink-0 text-[#1A4E8D]" />
                          <span className="whitespace-nowrap"><span className="font-extrabold text-[#1A4E8D]">{assignedCashierCount}</span> cashier{assignedCashierCount === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                    </div>
                    {terminalHint?.index === index && typeof document !== 'undefined'
                      ? createPortal(
                        <span
                          id={`pos-terminal-selection-help-${index}`}
                          role="tooltip"
                          style={{ left: terminalHint.left, top: terminalHint.top, width: terminalHint.width }}
                          className="pointer-events-none fixed z-[60] rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-center text-[11px] font-medium leading-4 text-white shadow-lg shadow-slate-400/40"
                        >
                          Select to view assigned cashiers
                        </span>,
                        document.body
                      )
                      : null}
                  </div>
                );
                })}
            </div>

            <TerminalCarouselPagination
              terminalCount={terminalRegistry.length}
              activeIndex={selectedTerminalIndex}
              canScrollPrevious={terminalCarouselState.canScrollPrevious}
              canScrollNext={terminalCarouselState.canScrollNext}
              onPrevious={() => scrollTerminalCarousel(-1)}
              onNext={() => scrollTerminalCarousel(1)}
              onSelect={scrollToTerminal}
            />

            {selectedTerminal ? <PosTerminalCashierAccessTable terminal={selectedTerminal} locationName={locations.find((location) => toPositiveInt(location.location_id) === toPositiveInt(selectedTerminal.location_id))?.name} assignmentTerminals={assignmentTerminals} getAssignedTerminalIndexes={getAssignedTerminalIndexes} onAssignCashier={updateCashierTerminalAssignments} cashiers={getCashiersForTerminal(selectedTerminal)} locationCashiers={getCashiersForLocation(selectedTerminal.location_id)} terminalRegistrySaving={savingTab === 'terminal_registry'} cashiersLoading={cashiersLoading} cashiersLoaded={cashiersLoaded} setCashierInvitationOpen={setCashierInvitationOpen} canRemoveCashiers={canRemoveCashiers} setCashierRemoveUser={setCashierRemoveUser} locked={locked} loading={loading} canManageCashiers={canManageCashiers} discountApprovers={discountApprovers} discountApproversLoading={discountApproversLoading} canManageDiscountApprovalPins={canManageDiscountApprovalPins} updateDiscountAuthorization={updateDiscountAuthorization} discountAuthorizationSavingUserId={discountAuthorizationSavingUserId} dayCloseOperators={dayCloseOperators} dayCloseOperatorsLoading={dayCloseOperatorsLoading} canManageDayClosePins={canManageDayClosePins} updateDayCloseAccess={updateDayCloseAccess} dayCloseAccessSavingUserId={dayCloseAccessSavingUserId} cashierVoidAccessSavingUserId={cashierVoidAccessSavingUserId} updateCashierVoidAccess={updateCashierVoidAccess} updateCashierDrawerAccess={updateCashierDrawerAccess} cashierPinSavingUserId={cashierPinSavingUserId} onOpenCashierPin={onOpenCashierPin} /> : null}
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-[12px] text-[#64748B]">{(posForm.terminalRegistryMode || 'warn') === 'enforce' ? 'No terminals configured yet. Add at least one active terminal before enabling enforce mode.' : 'No terminals configured yet. Add a terminal to replace manual terminal IDs with managed registry entries.'}</div>
        )}
      </section>

      <PosAddTerminalModal
        open={editingTerminalIndex != null && editingTerminalDraft != null}
        draft={editingTerminalDraft}
        locations={locations}
        editingLocationName={editingLocationName}
        locked={locked}
        loading={loading}
        saving={savingTab === 'terminal_registry'}
        editing={editingTerminalIndex != null && editingTerminalIndex < terminalRegistry.length}
        onOpenChange={(open) => { if (!open) closeEditor(); }}
        onChange={updateDraft}
        onSave={saveTerminal}
        onDelete={deleteTerminal}
      />
      <PosTerminalAdvancedSettingsModal open={advancedSettingsOpen} values={advancedSettingsDraft} locked={policyLocked || loading} saving={savingTab === 'terminal_advanced_settings'} onOpenChange={(open) => { if (!open) closeAdvancedSettings(); }} onChange={(key, value) => setAdvancedSettingsDraft((current) => ({ ...current, [key]: value }))} onSave={saveAdvancedSettings} />
    </>
  );
}
