import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Filter, ListPlus, Pencil, Plus, PowerOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination, POS_PAGINATION_FOOTER_CLASS } from '@/components/ui/pagination';
import { POS_HISTORY_PAGE_SIZE_OPTIONS } from '../utils/posHistoryQuery.js';
import PosFnbSelect from './PosFnbSelect.jsx';
import { POS_MODAL_FOOTER_SURFACE_CLASS, POS_MODAL_HEADER_ICON_CLASS, POS_MODAL_HEADER_SURFACE_CLASS } from './posModalStyles.js';
import { PosResponsiveFormDrawer, usePosFormFocusScroll, usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import PosSearchField from './PosSearchField.jsx';
import { POS_TOOLBAR_CONTROL_HEIGHT_CLASS } from './posToolbarSizing.js';

const emptyOption = () => ({
  name: '',
  price_delta: 0,
  sku_item_id: '',
  is_default: false,
  is_active: true,
  visible_in_pos: true,
  visible_in_storefront: true,
  is_sold_out: false,
  location_availability: []
});

const emptyGroup = () => ({
  name: '',
  display_name: '',
  group_kind: 'modifier',
  parent_modifier_option_id: '',
  min_select: 0,
  max_select: 1,
  required: false,
  is_active: true,
  visible_in_pos: true,
  visible_in_storefront: true,
  sort_order: 0,
  location_availability: [],
  options: [emptyOption()]
});

const isRequiredGroup = (group = {}) => group.group_kind === 'combo_choice' || group.required === true;

const selectionMode = (group = {}) => Number(group.max_select || 1) > 1 ? 'multiple' : 'single';

const selectionSummary = (group = {}) => {
  const min = Math.max(0, Number(group.min_select || 0));
  const max = Math.max(1, Number(group.max_select || 1));
  if (max === 1) return isRequiredGroup(group) ? 'Choose 1' : 'Choose up to 1';
  if (min === max) return 'Choose ' + max;
  return 'Choose ' + min + '–' + max;
};

const normalizeGroup = (group = {}) => {
  const merged = { ...emptyGroup(), ...group };
  const required = isRequiredGroup(merged);
  return {
    ...merged,
    required,
    min_select: required ? Math.max(1, Number(merged.min_select || 0)) : 0,
    options: Array.isArray(group.options)
      ? group.options.map((option) => ({
        ...emptyOption(),
        ...option,
        sku_item_id: option.sku_item_id || '',
        location_availability: option.locationAvailability || option.location_availability || []
      }))
      : [],
    location_availability: group.locationAvailability || group.location_availability || []
  };
};

const buildPayload = (source = {}) => {
  const draft = normalizeGroup(source);
  const required = isRequiredGroup(draft);
  return {
    name: draft.name.trim(),
    display_name: draft.display_name?.trim() || draft.name.trim(),
    group_kind: draft.group_kind,
    parent_modifier_option_id: draft.parent_modifier_option_id ? Number(draft.parent_modifier_option_id) : null,
    min_select: required ? Math.max(1, Number(draft.min_select || 0)) : 0,
    max_select: Math.max(1, Number(draft.max_select || 1)),
    required,
    is_active: draft.is_active,
    visible_in_pos: draft.visible_in_pos,
    visible_in_storefront: draft.visible_in_storefront,
    sort_order: Number(draft.sort_order || 0),
    location_availability: draft.location_availability,
    options: draft.options
      .filter((option) => option.name.trim())
      .map((option, index) => ({
        ...option,
        price_delta: Number(option.price_delta || 0),
        sku_item_id: option.sku_item_id ? Number(option.sku_item_id) : null,
        sort_order: index
      }))
  };
};

const Toggle = ({ label, checked, onChange, disabled = false }) => (
  <label className="relative flex min-w-0 cursor-pointer items-center gap-2 text-[11px] font-medium text-[#0F172A]">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="peer absolute left-0 top-0 z-10 h-4 w-7 cursor-pointer opacity-0 disabled:cursor-not-allowed"
    />
    <span
      aria-hidden="true"
      className="relative h-4 w-7 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[#1A4E8D] peer-checked:after:translate-x-3 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#1A4E8D] peer-disabled:opacity-50"
    />
    <span className="min-w-0 break-words">{label}</span>
  </label>
);

const statusBadge = (label, tone = 'blue') => {
  const tones = {
    green: 'bg-emerald-500',
    red: 'bg-rose-500',
    blue: 'bg-[#1A4E8D]'
  };
  return <span className={`pos-items-options-status-badge pos-items-options-status-badge--${tone} inline-flex items-center gap-1 text-[10px] font-bold text-[#64748B]`}><span aria-hidden="true" className={`pos-items-options-status-dot h-1.5 w-1.5 rounded-full ${tones[tone] || tones.blue}`} />{label}</span>;
};

function OptionGroupEditorPanel({
  draft,
  editingId,
  groups,
  locations,
  busy,
  isOverlayViewport,
  invalidSelectionRange,
  onDraftChange,
  onUpdateOption,
  onRemoveOption,
  onSetLocation,
  onSetSelectionMode,
  onSetSelectionLimit,
  onClose,
  onCollapse,
  onSave
}) {
  const { formBodyRef, handleFocusCapture } = usePosFormFocusScroll(isOverlayViewport);
  useEffect(() => {
    if (formBodyRef.current) formBodyRef.current.scrollTop = 0;
  }, [editingId, formBodyRef]);
  const panelClassName = isOverlayViewport
    ? 'relative z-auto flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-[0_-12px_30px_rgba(0,0,0,0.16)]'
    : 'relative z-auto flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] min-[1200px]:rounded-2xl min-[1200px]:border min-[1200px]:border-slate-200';

  return (
    <aside role={isOverlayViewport ? 'dialog' : undefined} aria-modal={isOverlayViewport ? 'true' : undefined} aria-labelledby="pos-fnb-option-group-editor-title" className={panelClassName}>
      <Button
        type="button"
        variant="ghost"
        onClick={onClose}
        disabled={busy}
        aria-label="Close option group form"
        title="Close option group form"
        className="absolute left-3 top-3 z-10 h-9 w-9 rounded-full p-0 text-slate-700 hover:bg-slate-100 hover:text-slate-950 min-[1200px]:hidden"
      >
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onCollapse}
        disabled={busy}
        aria-label="Hide form"
        title="Hide form"
        className="absolute right-4 top-4 z-10 hidden h-8 w-8 rounded-full border-slate-200 bg-slate-100 p-0 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950 min-[1200px]:left-0 min-[1200px]:right-auto min-[1200px]:top-1/2 min-[1200px]:-translate-y-1/2 min-[1200px]:flex"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </Button>

      <div className={['shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6', POS_MODAL_HEADER_SURFACE_CLASS].join(' ')}>
        <div className="min-w-0 pl-10 text-center min-[1200px]:flex min-[1200px]:items-center min-[1200px]:gap-3 min-[1200px]:pl-0 min-[1200px]:pr-10 min-[1200px]:text-left">
          <span className={`${POS_MODAL_HEADER_ICON_CLASS} hidden min-[1200px]:grid`}><Pencil className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h3 id="pos-fnb-option-group-editor-title" className="text-base font-extrabold text-slate-950">{editingId ? 'Edit Option Group' : 'Create Option Group'}</h3>
            <p className="mx-auto mt-0.5 max-w-[18rem] text-[11px] font-medium leading-4 text-slate-500 min-[1200px]:mx-0 min-[1200px]:max-w-none">Configure the choices and selection rules used at checkout.</p>
          </div>
        </div>
      </div>

      <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <div ref={formBodyRef} onFocusCapture={handleFocusCapture} data-testid="fnb-option-group-editor-scroll" role="region" aria-label="Option group editor fields" tabIndex={0} className="pos-fnb-option-group-editor-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1A4E8D]/35 sm:px-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="pos-fnb-option-group-name" className="text-[12px] font-bold text-slate-700">Group name <span className="text-rose-500">*</span></label>
              <input id="pos-fnb-option-group-name" aria-label="Group name" autoFocus={!isOverlayViewport && !editingId} maxLength={120} value={draft.name} onChange={(event) => onDraftChange((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Extra toppings" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[16px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 min-[1200px]:text-sm" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pos-fnb-option-group-kind" className="text-[12px] font-bold text-slate-700">Group type <span className="text-rose-500">*</span></label>
              <PosFnbSelect id="pos-fnb-option-group-kind" aria-label="Group type" value={draft.group_kind} onChange={(event) => onDraftChange((current) => ({ ...current, group_kind: event.target.value, ...(event.target.value === 'combo_choice' ? { required: true, min_select: Math.max(1, Number(current.min_select || 0)) } : {}) }))} options={[{ value: 'modifier', label: 'Menu Modifier' }, { value: 'combo_choice', label: 'Combo Choice' }]} />
              <p className="text-[10px] leading-4 text-slate-500">Menu modifiers let the customer choose add-ons. Combo choice groups require at least one choice.</p>
            </div>

            <div className="rounded-xl border border-[#D9E5F3] bg-[#F8FBFF] p-3 sm:p-4">
              <h4 className="text-sm font-black text-[#0F172A]">Selection rules</h4>
              <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">Set the number of choices the cashier or customer may select.</p>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                <div className="min-w-0 space-y-1"><label htmlFor="pos-fnb-option-group-selection-mode" className="text-[11px] font-bold text-slate-700">Selection mode</label><PosFnbSelect id="pos-fnb-option-group-selection-mode" aria-label="Selection mode" value={selectionMode(draft)} onChange={(event) => onSetSelectionMode(event.target.value)} options={[{ value: 'single', label: 'Single choice' }, { value: 'multiple', label: 'Multiple choices' }]} /></div>
                <div className="min-w-0 space-y-1"><label htmlFor="pos-fnb-option-group-min-select" className="text-[11px] font-bold text-slate-700">Minimum</label><input id="pos-fnb-option-group-min-select" aria-label="Minimum selections" type="number" min="0" max={draft.max_select} value={draft.min_select} onChange={(event) => onSetSelectionLimit('min_select', event.target.value)} disabled={busy || !isRequiredGroup(draft)} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 disabled:bg-slate-100 disabled:text-slate-400 min-[1200px]:text-sm" /></div>
                <div className="min-w-0 space-y-1"><label htmlFor="pos-fnb-option-group-max-select" className="text-[11px] font-bold text-slate-700">Maximum</label><input id="pos-fnb-option-group-max-select" aria-label="Maximum selections" type="number" min="1" value={draft.max_select} onChange={(event) => onSetSelectionLimit('max_select', event.target.value)} disabled={busy} className="h-9 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 disabled:bg-slate-100 disabled:text-slate-400 min-[1200px]:text-sm" /></div>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[#1A4E8D]">{selectionSummary(draft)}{isRequiredGroup(draft) ? ' required.' : ' optional.'}</p>
              {invalidSelectionRange ? <p role="alert" className="mt-1 text-[11px] font-bold text-rose-700">Minimum selections cannot exceed maximum selections.</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 pb-4 sm:grid-cols-4">
              <Toggle label="Active" checked={draft.is_active} onChange={(value) => onDraftChange((current) => ({ ...current, is_active: value }))} disabled={busy} />
              <Toggle label="Visible in POS" checked={draft.visible_in_pos} onChange={(value) => onDraftChange((current) => ({ ...current, visible_in_pos: value }))} disabled={busy} />
              <Toggle label="Visible online" checked={draft.visible_in_storefront} onChange={(value) => onDraftChange((current) => ({ ...current, visible_in_storefront: value }))} disabled={busy} />
              <Toggle label="Required" checked={isRequiredGroup(draft)} disabled={busy || draft.group_kind === 'combo_choice'} onChange={(value) => onDraftChange((current) => ({ ...current, required: value, min_select: value ? Math.max(1, Number(current.min_select || 0)) : 0 }))} />
            </div>

            <details className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-800">Advanced settings</summary>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Optional conditional display and location availability.</p>
              <div className="mt-3 space-y-4">
                <div className="space-y-1.5"><label htmlFor="pos-fnb-option-group-condition" className="text-[11px] font-bold text-slate-700">Show group after</label><PosFnbSelect id="pos-fnb-option-group-condition" aria-label="Show only after option" value={draft.parent_modifier_option_id || ''} onChange={(event) => onDraftChange((current) => ({ ...current, parent_modifier_option_id: event.target.value }))} options={[{ value: '', label: 'Always show this group' }, ...groups.filter((group) => Number(group.modifier_group_id) !== Number(editingId)).flatMap((group) => (group.options || []).filter((option) => option.is_active !== false).map((option) => ({ value: option.modifier_option_id, label: `After: ${group.display_name || group.name} — ${option.name}` })))]} /></div>
                {locations.length ? <div><p className="text-[11px] font-bold text-slate-700">Available at locations</p><div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">{locations.map((location) => { const row = draft.location_availability.find((entry) => Number(entry.location_id) === Number(location.location_id)); return <Toggle key={location.location_id} label={location.name} checked={row?.is_available !== false} onChange={(value) => onSetLocation(location.location_id, value)} disabled={busy} />; })}</div></div> : null}
              </div>
            </details>

            <div className="space-y-2 pb-2">
              <div className="flex min-w-0 items-start justify-between gap-3"><div><h4 className="text-sm font-black text-[#0F172A]">Choices</h4><p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">Add the values and optional price adjustments.</p></div><button type="button" onClick={() => onDraftChange((current) => ({ ...current, options: [...current.options, emptyOption()] }))} disabled={busy} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#1A4E8D] px-2.5 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50 disabled:opacity-50"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Add choice</button></div>
              <div data-testid="fnb-modifier-options-list" className="pos-fnb-modifier-choice-list min-w-0 space-y-2">
                {draft.options.map((option, index) => <div key={option.modifier_option_id || `new-${index}`} className="min-w-0 rounded-xl border border-slate-200 p-3">
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(7rem,0.65fr)_auto] sm:items-end">
                    <div className="min-w-0 space-y-1"><label htmlFor={`fnb-option-${index}-name`} className="text-[11px] font-bold text-slate-700">Choice name <span className="text-rose-500">*</span></label><input id={`fnb-option-${index}-name`} aria-label={`Choice ${index + 1} name`} maxLength={120} value={option.name} onChange={(event) => onUpdateOption(index, { name: event.target.value })} placeholder="e.g. Extra cheese" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 min-[1200px]:text-sm" /></div>
                    <div className="min-w-0 space-y-1"><label htmlFor={`fnb-option-${index}-price`} className="text-[11px] font-bold text-slate-700">Price adjustment (₱)</label><input id={`fnb-option-${index}-price`} aria-label={`Choice ${index + 1} price adjustment`} type="number" min="0" step="0.01" value={option.price_delta} onChange={(event) => onUpdateOption(index, { price_delta: event.target.value })} placeholder="0.00" className="h-9 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 min-[1200px]:text-sm" /></div>
                    <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => onRemoveOption(index)} disabled={busy || draft.options.length <= 1} title={draft.options.length <= 1 ? 'A group must keep at least one option' : `Remove option ${index + 1}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                  <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
                    <Toggle label="Default" checked={option.is_default} onChange={(value) => onUpdateOption(index, { is_default: value })} disabled={busy} />
                    <Toggle label="Active" checked={option.is_active} onChange={(value) => onUpdateOption(index, { is_active: value })} disabled={busy} />
                    <Toggle label="Visible in POS" checked={option.visible_in_pos} onChange={(value) => onUpdateOption(index, { visible_in_pos: value })} disabled={busy} />
                    <Toggle label="Visible online" checked={option.visible_in_storefront} onChange={(value) => onUpdateOption(index, { visible_in_storefront: value })} disabled={busy} />
                    <Toggle label="Sold out" checked={option.is_sold_out} onChange={(value) => onUpdateOption(index, { is_sold_out: value })} disabled={busy} />
                  </div>
                </div>)}
              </div>
            </div>
          </div>
        </div>
        <div className="pos-fnb-option-group-editor-footer sticky bottom-0 grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:flex sm:items-center sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:w-auto">Cancel</button>
          <button type="submit" disabled={busy || !draft.name.trim() || !draft.options.some((option) => option.name.trim()) || invalidSelectionRange} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1A4E8D] px-4 text-sm font-bold text-white hover:bg-[#123B6D] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{busy ? 'Saving…' : editingId ? 'Save Changes' : 'Save Group'}</button>
        </div>
      </form>
    </aside>
  );
}

export default function PosFnbModifierManager({
  groups = [],
  assignedItemsByGroup = {},
  locations = [],
  appliedFoldersByGroup = {},
  busy = false,
  canManage = true,
  onCreate,
  onUpdate,
  onInteractionChange
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyGroup);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [pendingStatusFilter, setPendingStatusFilter] = useState('all');
  const [pendingKindFilter, setPendingKindFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filterContainerRef = useRef(null);
  const filterButtonRef = useRef(null);
  const editorBaselineRef = useRef('');
  const viewportMode = usePosViewportMode();
  const isOverlayViewport = viewportMode !== 'desktop';

  useEffect(() => {
    onInteractionChange?.(editorOpen || Boolean(deleteCandidate));
  }, [deleteCandidate, editorOpen, onInteractionChange]);

  useEffect(() => {
    if (!filtersOpen) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (!filterContainerRef.current?.contains(event.target)) setFiltersOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      const focusWasInFilter = filterContainerRef.current?.contains(document.activeElement);
      setFiltersOpen(false);
      if (focusWasInFilter) filterButtonRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filtersOpen]);

  const updateOption = (index, patch) => setDraft((current) => ({
    ...current,
    options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option)
  }));

  const removeOption = (index) => setDraft((current) => ({
    ...current,
    options: current.options.filter((_, optionIndex) => optionIndex !== index)
  }));

  const setGroupLocation = (locationId, isAvailable) => setDraft((current) => ({
    ...current,
    location_availability: [
      ...current.location_availability.filter((row) => Number(row.location_id) !== Number(locationId)),
      { location_id: Number(locationId), is_available: isAvailable }
    ]
  }));

  const openEditor = (group, modifierGroupId = null) => {
    const nextDraft = normalizeGroup(group);
    editorBaselineRef.current = JSON.stringify(nextDraft);
    setEditingId(modifierGroupId);
    setDraft(nextDraft);
    setEditorCollapsed(false);
    setEditorOpen(true);
  };

  const openCreate = () => openEditor(emptyGroup());

  const openEdit = (group) => openEditor(group, group.modifier_group_id);

  const closeEditor = () => {
    if (busy) return;
    const hasChanges = JSON.stringify(draft) !== editorBaselineRef.current;
    if (hasChanges && typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('Discard unsaved option group changes?')) return;
    const emptyDraft = emptyGroup();
    editorBaselineRef.current = JSON.stringify(emptyDraft);
    setEditorOpen(false);
    setEditorCollapsed(false);
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const collapseEditor = () => {
    if (!busy) setEditorCollapsed(true);
  };

  const expandEditor = () => setEditorCollapsed(false);

  const setSelectionMode = (mode) => setDraft((current) => {
    const required = isRequiredGroup(current);
    if (mode === 'single') {
      return { ...current, min_select: required ? 1 : 0, max_select: 1 };
    }
    const max = Math.max(2, Number(current.max_select || 1));
    return { ...current, min_select: Math.min(Math.max(0, Number(current.min_select || 0)), max), max_select: max };
  });

  const setSelectionLimit = (field, value) => setDraft((current) => {
    const numericValue = Math.max(0, Number(value || 0));
    const next = { ...current, [field]: field === 'max_select' ? Math.max(1, numericValue) : numericValue };
    const max = Math.max(1, Number(next.max_select || 1));
    const min = isRequiredGroup(next) ? Math.max(1, Number(next.min_select || 0)) : Math.max(0, Number(next.min_select || 0));
    return { ...next, min_select: Math.min(min, max), max_select: max };
  });

  const draftHasInvalidSelectionRange = Number(draft.min_select || 0) > Number(draft.max_select || 1);

  const submit = async () => {
    const payload = buildPayload(draft);
    const result = editingId ? await onUpdate(editingId, payload) : await onCreate(payload);
    if (result === false) return;
    const emptyDraft = emptyGroup();
    editorBaselineRef.current = JSON.stringify(emptyDraft);
    setEditorOpen(false);
    setEditorCollapsed(false);
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const softDelete = (group) => {
    setDeleteCandidate(group);
  };

  const confirmSoftDelete = async () => {
    if (!deleteCandidate) return;
    const result = await onUpdate(deleteCandidate.modifier_group_id, buildPayload({ ...deleteCandidate, is_active: false }));
    if (result === false) return;
    setDeleteCandidate(null);
  };

  const filteredGroups = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return groups.filter((group) => {
      const isActive = group.is_active !== false;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? isActive : !isActive);
      const matchesKind = kindFilter === 'all' || group.group_kind === kindFilter;
      const searchable = [group.name, group.display_name, group.group_kind, ...(group.options || []).map((option) => option.name)];
      return matchesStatus && matchesKind && (!normalized || searchable.some((value) => String(value || '').toLowerCase().includes(normalized)));
    });
  }, [groups, kindFilter, search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const visibleGroups = filteredGroups.slice((page - 1) * pageSize, page * pageSize);
  const toggleFilters = () => {
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    setPendingStatusFilter(statusFilter);
    setPendingKindFilter(kindFilter);
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    setStatusFilter(pendingStatusFilter);
    setKindFilter(pendingKindFilter);
    setPage(1);
    setFiltersOpen(false);
    filterButtonRef.current?.focus();
  };
  const clearPendingFilters = () => {
    setPendingStatusFilter('all');
    setPendingKindFilter('all');
  };
  const statusFilterOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];
  const kindFilterOptions = [
    { value: 'all', label: 'All types' },
    { value: 'modifier', label: 'Menu modifier' },
    { value: 'combo_choice', label: 'Combo choice' }
  ];
  const renderFilterOptions = (label, options, selectedValue, onSelect, id, columnsClass = 'sm:grid-cols-3') => (
    <div className="space-y-2">
      <p id={id} className="text-[12px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <div role="group" aria-labelledby={id} className={`grid gap-2 ${columnsClass}`}>
        {options.map((option) => {
          const selected = selectedValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(option.value)}
              className={`flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${selected ? 'border-[#1A4E8D] bg-[#F5F9FF] text-[#1A4E8D]' : 'border-slate-200 bg-white text-slate-700 hover:border-[#9BBBE0] hover:bg-[#F5F9FF]'}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {selected ? (
                  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1A4E8D] text-white"><Check className="h-3.5 w-3.5" /></span>
                ) : (
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" />
                )}
                <span className="truncate">{option.label}</span>
              </span>
              {selected ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
  const filterPopover = filtersOpen ? (
    <div id="pos-fnb-option-group-filters" role="region" aria-labelledby="pos-fnb-option-group-filter-title" className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] top-auto z-[70] max-h-[calc(100dvh-1rem)] w-auto max-w-none overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-[calc(100%+0.5rem)] sm:max-h-none sm:w-[min(26rem,calc(100vw-2rem))] sm:overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D]"><Filter aria-hidden="true" className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h4 id="pos-fnb-option-group-filter-title" className="text-[14px] font-extrabold text-slate-950">Filter option groups</h4>
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">Choose which statuses and group types appear in the table.</p>
          </div>
        </div>
      </div>
      <div className="space-y-4 px-5 py-4 sm:px-6">
        {renderFilterOptions('Status', statusFilterOptions, pendingStatusFilter, setPendingStatusFilter, 'pos-fnb-option-group-filter-status')}
        {renderFilterOptions('Group type', kindFilterOptions, pendingKindFilter, setPendingKindFilter, 'pos-fnb-option-group-filter-kind', 'sm:grid-cols-2')}
      </div>
      <div className="flex flex-col-reverse items-stretch gap-2 border-t border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Button type="button" variant="ghost" onClick={clearPendingFilters} disabled={pendingStatusFilter === 'all' && pendingKindFilter === 'all'} className="h-9 w-full px-1 text-[12px] font-medium text-slate-500 hover:bg-transparent hover:text-[#1A4E8D] sm:w-auto">Clear filters</Button>
        <Button type="button" onClick={applyFilters} className="h-9 w-full bg-[#1A4E8D] px-4 text-[12px] font-bold text-white hover:bg-[#123B6D] sm:w-auto">Done</Button>
      </div>
    </div>
  ) : null;
  const showEditorPanel = editorOpen && !isOverlayViewport && !editorCollapsed;
  const editorPanel = editorOpen && canManage ? (
    <OptionGroupEditorPanel
      draft={draft}
      editingId={editingId}
      groups={groups}
      locations={locations}
      busy={busy}
      isOverlayViewport={isOverlayViewport}
      invalidSelectionRange={draftHasInvalidSelectionRange}
      onDraftChange={setDraft}
      onUpdateOption={updateOption}
      onRemoveOption={removeOption}
      onSetLocation={setGroupLocation}
      onSetSelectionMode={setSelectionMode}
      onSetSelectionLimit={setSelectionLimit}
      onClose={closeEditor}
      onCollapse={collapseEditor}
      onSave={submit}
    />
  ) : null;

  return (
    <>
      <section className={`pos-items-options-manager relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${showEditorPanel ? 'min-[1200px]:grid min-[1200px]:grid-cols-[minmax(0,1.58fr)_minmax(19rem,1fr)] min-[1200px]:grid-rows-[minmax(0,1fr)] min-[1200px]:items-stretch min-[1200px]:gap-4' : ''}`} aria-labelledby="pos-fnb-option-groups-heading">
        <div className="pos-items-options-manager-content flex min-h-0 min-w-0 flex-1 flex-col py-3 sm:py-4">
          <div className="pos-items-options-panel-header flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="pos-fnb-option-groups-heading" className="mt-1 break-words text-sm font-black text-[#0F172A]">Option groups</h2>
              <p className="mt-1 hidden break-words text-xs leading-5 text-[#64748B] min-[1200px]:block">Create reusable menu choices, then assign groups to categories or items.</p>
            </div>
            {editorOpen && editorCollapsed && !isOverlayViewport ? <Button type="button" variant="outline" onClick={expandEditor} disabled={busy} aria-label="Show form" title="Show form" className="h-8 w-8 shrink-0 rounded-full border-slate-200 bg-slate-100 p-0 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></Button> : null}
          </div>

          <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 min-[1200px]:mt-5 min-[1200px]:flex min-[1200px]:items-center">
            <PosSearchField
              inputClassName={POS_TOOLBAR_CONTROL_HEIGHT_CLASS}
              ariaLabel="Search option groups"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              onClear={() => { setSearch(''); setPage(1); }}
              placeholder="Search groups, type, or options..."
              className="min-w-0 min-[1200px]:flex-1"
            />
            <div ref={filterContainerRef} className="relative min-w-0">
              <Button type="button" ref={filterButtonRef} variant="outline" size="sm" onClick={toggleFilters} aria-label="Filters" aria-expanded={filtersOpen} aria-controls={filtersOpen ? 'pos-fnb-option-group-filters' : undefined} title="Filters" className={`${POS_TOOLBAR_CONTROL_HEIGHT_CLASS} w-11 shrink-0 p-0 min-[1200px]:w-auto min-[1200px]:px-4`}>
                <Filter aria-hidden="true" className="h-4 w-4 min-[1200px]:mr-2" /> <span className="sr-only min-[1200px]:not-sr-only">Filters</span>
              </Button>
              {filterPopover}
            </div>
            {canManage ? <Button type="button" onClick={openCreate} disabled={busy || editorOpen} aria-disabled={editorOpen || undefined} aria-label="Create option group" title={editorOpen ? 'Option group form is already open' : 'Create option group'} className={`${POS_TOOLBAR_CONTROL_HEIGHT_CLASS} w-11 shrink-0 justify-center p-0 bg-[#1A4E8D] text-white hover:bg-[#123B6D] active:bg-[#123B6D] min-[1200px]:w-auto min-[1200px]:px-4`}>
              <ListPlus className="h-4 w-4 min-[1200px]:mr-2" aria-hidden="true" /> <span className="sr-only min-[1200px]:not-sr-only">New Group</span>
            </Button> : null}
          </div>

          <div data-testid="pos-fnb-option-groups-list" className="pos-items-options-list pos-items-options-group-catalog-list dgfy-pos-scroll-region mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 max-[767px]:rounded-none max-[767px]:border-0">
            {visibleGroups.length ? isOverlayViewport ? (
              <div className="space-y-2 px-0 py-3">
                {visibleGroups.map((group) => {
                  const groupName = group.display_name || group.name || 'Unnamed option group';
                  const folderCount = (appliedFoldersByGroup[String(group.modifier_group_id)] || []).length;
                  const itemCount = assignedItemsByGroup[String(group.modifier_group_id)] || 0;
                  const isActive = group.is_active !== false;
                  const isPosVisible = group.visible_in_pos !== false;
                  const isOnlineVisible = group.visible_in_storefront !== false;
                  const selectionLabel = isRequiredGroup(group)
                    ? `${selectionSummary(group)} required`
                    : `Choose up to ${Math.max(1, Number(group.max_select || 1))} optional`;
                  return (
                    <article key={group.modifier_group_id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h3 className="min-w-0 truncate text-sm font-black text-[#0F172A]">{groupName}</h3>
                          <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-bold ${isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] font-semibold text-[#1A4E8D]">{selectionLabel}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                        <div><p className="text-[10px] font-semibold text-slate-500">Type</p><p className="mt-0.5 font-semibold text-slate-800">{group.group_kind === 'combo_choice' ? 'Combo choice' : 'Menu modifier'}</p></div>
                        <div><p className="text-[10px] font-semibold text-slate-500">Options</p><p className="mt-0.5 font-semibold text-slate-800">{(group.options || []).length}</p></div>
                        <div><p className="text-[10px] font-semibold text-slate-500">Assigned categories</p><p className="mt-0.5 font-semibold text-slate-800">{folderCount}</p></div>
                        <div><p className="text-[10px] font-semibold text-slate-500">Direct item assignments</p><p className="mt-0.5 font-semibold text-slate-800">{itemCount}</p></div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                        <span className={`rounded-full px-2 py-1 ${isPosVisible ? 'bg-blue-50 text-[#1A4E8D]' : 'bg-slate-100 text-slate-600'}`}>POS {isPosVisible ? 'visible' : 'hidden'}</span>
                        <span className={`rounded-full px-2 py-1 ${isOnlineVisible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>Online {isOnlineVisible ? 'visible' : 'hidden'}</span>
                      </div>
                      <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                        {canManage ? <>
                          <button type="button" onClick={() => openEdit(group)} disabled={busy} aria-label={`Edit option group ${groupName}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</button>
                          {group.is_active === false ? null : <button type="button" onClick={() => softDelete(group)} disabled={busy} aria-label={`Deactivate option group ${groupName}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><PowerOff className="h-3.5 w-3.5" aria-hidden="true" />Deactivate</button>}
                        </> : <span className="text-[10px] text-slate-500">View only</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <table className="w-full min-w-[48rem] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-[1] bg-[#F2F7FD] text-[10px] font-bold text-[#17477F]"><tr>
                <th scope="col" className="px-3 py-3">Group name</th><th scope="col" className="px-3 py-3">Type</th><th scope="col" className="px-3 py-3">Options</th><th scope="col" className="px-3 py-3">Assigned to</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3">Channels</th><th scope="col" className="px-3 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody>{visibleGroups.map((group) => {
                const groupName = group.display_name || group.name || 'Unnamed option group';
                const folderCount = (appliedFoldersByGroup[String(group.modifier_group_id)] || []).length;
                const itemCount = assignedItemsByGroup[String(group.modifier_group_id)] || 0;
                return <tr key={group.modifier_group_id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="max-w-[15rem] px-3 py-3"><p className="truncate font-black text-[#0F172A]">{groupName}</p><p className="mt-1 text-[10px] font-semibold text-[#1A4E8D]">{selectionSummary(group)}{isRequiredGroup(group) ? ' required' : ' optional'}</p></td>
                  <td className="px-3 py-3 text-slate-700">{group.group_kind === 'combo_choice' ? 'Combo choice' : 'Menu modifier'}</td>
                  <td className="px-3 py-3 text-slate-700">{(group.options || []).length}</td>
                  <td className="px-3 py-3 text-slate-700"><span className="block">{folderCount} {folderCount === 1 ? 'category' : 'categories'}</span><span className="mt-0.5 block text-[10px] text-slate-500">{itemCount} direct {itemCount === 1 ? 'item' : 'items'}</span></td>
                  <td className="px-3 py-3">{statusBadge(group.is_active === false ? 'Inactive' : 'Active', group.is_active === false ? 'red' : 'green')}</td>
                  <td className="px-3 py-3"><span className="block text-[10px] text-slate-700">POS {group.visible_in_pos === false ? 'hidden' : 'visible'}</span><span className="mt-1 block text-[10px] text-slate-700">Online {group.visible_in_storefront === false ? 'hidden' : 'visible'}</span></td>
                  <td className="px-3 py-3"><div className="flex justify-end gap-1.5">
                    {canManage ? <><button type="button" onClick={() => openEdit(group)} disabled={busy} aria-label={`Edit option group ${groupName}`} title={`Edit option group ${groupName}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-[#1A4E8D] hover:bg-blue-50 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                      {group.is_active === false ? null : <button type="button" onClick={() => softDelete(group)} disabled={busy} aria-label={`Deactivate option group ${groupName}`} title={`Deactivate option group ${groupName}`} className="grid h-8 w-8 place-items-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><PowerOff className="h-3.5 w-3.5" aria-hidden="true" /></button>}</> : <span className="text-[10px] text-slate-500">View only</span>}
                  </div></td>
                </tr>;
              })}</tbody>
            </table> : <div className="px-4 py-10 text-center"><p className="text-sm font-bold text-slate-700">{groups.length ? 'No matching option groups' : 'No option groups yet'}</p><p className="mt-1 text-xs text-slate-500">{groups.length ? 'Try a different search or filter.' : 'Create an option group to start configuring menu choices.'}</p></div>}
          </div>

          <GlobalPagination
            ariaLabel="Option group pagination"
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredGroups.length}
            itemLabel="option groups"
            pageSize={pageSize}
            pageSizeOptions={POS_HISTORY_PAGE_SIZE_OPTIONS}
            pageSizeLabel="Option groups per page"
            pageInputLabel="Go to option groups page"
            previousLabel="Previous option groups page"
            nextLabel="Next option groups page"
            hidePageSizeSuffixOnMobile
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
            className={`${POS_PAGINATION_FOOTER_CLASS} mt-3 max-[767px]:mt-0`}
          />
        </div>
        {showEditorPanel && editorPanel ? <div className="min-h-0 min-w-0 min-[1200px]:h-full">{editorPanel}</div> : null}
      </section>

      {deleteCandidate ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-fnb-option-group-delete-title"
          onClick={() => { if (!busy) setDeleteCandidate(null); }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#D9E5F3] bg-white shadow-2xl shadow-slate-950/15" onClick={(event) => event.stopPropagation()}>
            <div className={['px-5 py-4', POS_MODAL_HEADER_SURFACE_CLASS].join(' ')}>
              <h2 id="pos-fnb-option-group-delete-title" className="text-lg font-black text-[#0F172A]">Deactivate Option Group</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Deactivate {deleteCandidate.display_name || deleteCandidate.name || 'this option group'}? Existing assignments will be preserved, and you can reactivate it later.
              </p>
            </div>
            <div className={['flex flex-col gap-2 px-5 py-4', POS_MODAL_FOOTER_SURFACE_CLASS].join(' ')}>
              <button type="button" onClick={confirmSoftDelete} disabled={busy} className="order-1 h-10 w-full rounded-lg bg-rose-600 font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">Deactivate Option Group</button>
              <button type="button" onClick={() => setDeleteCandidate(null)} disabled={busy} className="order-2 h-10 w-full rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {editorPanel && isOverlayViewport ? (
        <PosResponsiveFormDrawer viewportMode={viewportMode} onClose={closeEditor} fillViewport>{editorPanel}</PosResponsiveFormDrawer>
      ) : null}
    </>
  );
}
