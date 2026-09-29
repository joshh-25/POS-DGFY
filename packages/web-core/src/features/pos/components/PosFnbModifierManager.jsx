import React, { useState } from 'react';
import { Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import PosFnbSelect from './PosFnbSelect.jsx';

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
  <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[11px] font-medium text-[#0F172A]">
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="peer sr-only"
    />
    <span
      aria-hidden="true"
      className="relative h-4 w-7 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[#1A4E8D] peer-checked:after:translate-x-3 peer-disabled:opacity-50"
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

export default function PosFnbModifierManager({
  groups = [],
  locations = [],
  appliedFoldersByGroup = {},
  busy = false,
  canManage = true,
  onCreate,
  onUpdate
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyGroup);
  const [initialDraft, setInitialDraft] = useState(emptyGroup);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);

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
    setEditingId(modifierGroupId);
    setDraft(nextDraft);
    setInitialDraft(nextDraft);
    setEditorOpen(true);
  };

  const openCreate = () => openEditor(emptyGroup());

  const openEdit = (group) => openEditor(group, group.modifier_group_id);

  const closeEditor = () => {
    if (!busy) setEditorOpen(false);
  };

  const resetDraft = () => setDraft(normalizeGroup(initialDraft));

  const submit = async () => {
    const payload = buildPayload(draft);
    if (editingId) await onUpdate(editingId, payload);
    else await onCreate(payload);
    setEditorOpen(false);
    setEditingId(null);
    setDraft(emptyGroup());
    setInitialDraft(emptyGroup());
  };

  const softDelete = (group) => {
    setDeleteCandidate(group);
  };

  const confirmSoftDelete = async () => {
    if (!deleteCandidate) return;
    await onUpdate(deleteCandidate.modifier_group_id, buildPayload({ ...deleteCandidate, is_active: false }));
    setDeleteCandidate(null);
  };

  return (
    <>
      <section className="pos-items-options-panel pos-items-options-manager flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70 sm:p-4" aria-labelledby="pos-fnb-option-groups-heading">
        <div className="pos-items-options-panel-header flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#1A4E8D]">Configuration</p>
            <h2 id="pos-fnb-option-groups-heading" className="mt-1 break-words text-sm font-black text-[#0F172A]">Option Groups</h2>
            <p className="mt-1 break-words text-xs leading-5 text-[#64748B]">Add customization and modifiers for POS items.</p>
          </div>
          {canManage ? (
            <button type="button" onClick={openCreate} disabled={busy} aria-label="Add an Option Group" title="Add an Option Group" aria-pressed={editorOpen && !editingId} className={`pos-items-mobile-icon-button pos-items-options-add-button inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#1A4E8D] px-3 text-[13px] font-bold active:border-[#1A4E8D] active:bg-[#1A4E8D] active:text-white disabled:cursor-not-allowed disabled:opacity-60 ${editorOpen && !editingId ? 'pos-items-mobile-icon-button--active bg-[#1A4E8D] text-white hover:bg-[#143F73]' : 'bg-white text-[#1A4E8D] hover:bg-blue-50'}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="pos-items-options-add-label">Add an Option Group</span>
            </button>
          ) : null}
        </div>

        <div data-testid="pos-fnb-option-groups-list" className="pos-items-options-list pos-items-options-group-list dgfy-pos-scroll-region mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 touch-pan-y">
          {groups.map((group) => {
            const groupName = group.display_name || group.name || 'Unnamed option group';
            const folderNames = appliedFoldersByGroup[String(group.modifier_group_id)] || [];
            const required = isRequiredGroup(group);
            return (
              <article key={group.modifier_group_id} className="pos-items-options-group-card min-w-0 rounded-lg border border-slate-300 bg-white px-2.5 py-2.5 shadow-[0_4px_12px_rgba(148,163,184,0.06)] sm:px-3">
                <div className="pos-items-options-group-card-header flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <p className="min-w-0 truncate text-sm font-black text-[#0F172A]">{groupName}</p>
                      <p className="pos-items-options-count whitespace-nowrap text-[10px] font-bold text-[#64748B]">{(group.options || []).length} Options</p>
                    </div>
                    <p className="mt-1 break-words text-[10px] leading-4 text-[#64748B]">Inventory Link</p>
                    <p className="break-words text-[10px] leading-4 text-[#64748B]">Applied in: {folderNames.length ? folderNames.join(', ') : 'No categories assigned'}</p>
                    <div className="pos-items-options-statuses mt-2 flex flex-wrap gap-x-3 gap-y-1">
                      {statusBadge(group.is_active === false ? 'Inactive' : 'Active', group.is_active === false ? 'red' : 'green')}
                      {statusBadge(required ? 'Required' : 'Optional', required ? 'red' : 'blue')}
                      {statusBadge(group.visible_in_pos === false ? 'Hidden in POS' : 'Show in POS')}
                      {statusBadge(group.visible_in_storefront === false ? 'Hidden Online' : 'Show Online')}
                    </div>
                  </div>
                  {canManage ? (
                    <div className="pos-items-options-group-actions flex shrink-0 flex-col gap-1.5">
                      <button type="button" onClick={() => openEdit(group)} disabled={busy} aria-label={`Edit option group ${groupName}`} title={`Edit option group ${groupName}`} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#1A4E8D] bg-white px-2.5 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50 active:border-[#1A4E8D] active:bg-[#1A4E8D] active:text-white disabled:cursor-not-allowed disabled:opacity-60">
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="pos-items-options-edit-label-desktop">Edit</span>
                        <span className="pos-items-options-edit-label-mobile">Edit Group</span>
                      </button>
                      <button type="button" onClick={() => softDelete(group)} disabled={busy} aria-label={`Delete option group ${groupName}`} title={`Delete option group ${groupName}`} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-50 active:border-rose-600 active:bg-rose-600 active:text-white disabled:cursor-not-allowed disabled:opacity-60">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!groups.length ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">No option groups yet. Add an option group to configure POS choices.</p> : null}
        </div>
      </section>

      {deleteCandidate ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-fnb-option-group-delete-title"
          onClick={() => { if (!busy) setDeleteCandidate(null); }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="pos-fnb-option-group-delete-title" className="text-lg font-black text-[#0F172A]">Delete Option Group</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Delete {deleteCandidate.display_name || deleteCandidate.name || 'this option group'}? This will deactivate the group and preserve existing item assignments.
              </p>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={confirmSoftDelete} disabled={busy} className="order-1 h-10 w-full rounded-lg bg-rose-600 font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">Delete Option Group</button>
              <button type="button" onClick={() => setDeleteCandidate(null)} disabled={busy} className="order-2 h-10 w-full rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen && canManage ? (
        <div className="pos-items-options-editor pos-items-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/30 px-3 py-4 backdrop-blur-[1px] sm:px-6" role="dialog" aria-modal="true" aria-labelledby="pos-fnb-option-group-editor-title" onClick={closeEditor}>
          <div className="pos-items-options-editor-dialog pos-items-mobile-sheet-panel flex max-h-[calc(100vh-2rem)] w-full max-w-[630px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="pos-fnb-option-group-editor-header -mx-px -mt-px flex shrink-0 items-start justify-between gap-3 rounded-t-[11px] bg-[#1A4E8D] px-4 py-3 text-white sm:px-5">
              <div className="min-w-0">
                <h2 id="pos-fnb-option-group-editor-title" className="text-sm font-black">Add/Edit Option Name</h2>
                <p className="mt-0.5 text-[10px] text-blue-100">Create a new option or configure an existing option group.</p>
              </div>
              <button type="button" onClick={closeEditor} disabled={busy} aria-label="Close option group editor" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-blue-100 hover:bg-white/15 hover:text-white disabled:opacity-50">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div data-testid="fnb-option-group-editor-scroll" className="pos-fnb-option-group-editor-body min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-4 sm:px-5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="pos-fnb-option-group-name" className="text-[10px] font-bold text-[#334155]">Option Group Name <span className="text-rose-500">*</span></label>
                  <input id="pos-fnb-option-group-name" aria-label="Group name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Option Name" className="h-9 w-full rounded-lg border border-[#1A4E8D] px-3 text-[13px] text-[#0F172A] outline-none placeholder:text-slate-300 focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pos-fnb-option-group-kind" className="text-[10px] font-bold text-[#334155]">Option Group Category</label>
                  <PosFnbSelect
                    id="pos-fnb-option-group-kind"
                    aria-label="Group type"
                    value={draft.group_kind}
                    onChange={(event) => setDraft({ ...draft, group_kind: event.target.value, ...(event.target.value === 'combo_choice' ? { required: true, min_select: Math.max(1, Number(draft.min_select || 0)) } : {}) })}
                    options={[
                      { value: 'modifier', label: 'Menu Modifier' },
                      { value: 'combo_choice', label: 'Combo Choice' }
                    ]}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pos-fnb-option-group-condition" className="text-[10px] font-bold text-[#334155]">Required Modifiers</label>
                  <PosFnbSelect
                    id="pos-fnb-option-group-condition"
                    aria-label="Show only after option"
                    value={draft.parent_modifier_option_id || ''}
                    onChange={(event) => setDraft({ ...draft, parent_modifier_option_id: event.target.value })}
                    options={[
                      { value: '', label: 'Always show this Group' },
                      ...groups.filter((group) => Number(group.modifier_group_id) !== Number(editingId)).flatMap((group) => (group.options || []).filter((option) => option.is_active !== false).map((option) => ({
                        value: option.modifier_option_id,
                        label: `After: ${group.display_name || group.name} — ${option.name}`
                      })))
                    ]}
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 pb-4 sm:grid-cols-4">
                  <Toggle label="Active" checked={draft.is_active} onChange={(value) => setDraft({ ...draft, is_active: value })} disabled={busy} />
                  <Toggle label="POS" checked={draft.visible_in_pos} onChange={(value) => setDraft({ ...draft, visible_in_pos: value })} disabled={busy} />
                  <Toggle label="Online" checked={draft.visible_in_storefront} onChange={(value) => setDraft({ ...draft, visible_in_storefront: value })} disabled={busy} />
                  <Toggle label="Required" checked={isRequiredGroup(draft)} disabled={busy || draft.group_kind === 'combo_choice'} onChange={(value) => setDraft((current) => ({ ...current, required: value, min_select: value ? Math.max(1, Number(current.min_select || 0)) : 0 }))} />
                </div>

                {locations.length > 0 ? <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#334155]">Location availability</p><div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">{locations.map((location) => { const row = draft.location_availability.find((entry) => Number(entry.location_id) === Number(location.location_id)); return <Toggle key={location.location_id} label={location.name} checked={row?.is_available !== false} onChange={(value) => setGroupLocation(location.location_id, value)} disabled={busy} />; })}</div></div> : null}

                <div className="min-w-0 space-y-2 pb-2">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black text-[#0F172A]">Add/Edit Option</h3>
                      <p className="mt-0.5 text-[10px] leading-4 text-[#64748B]">Add choices and optional price adjustments.</p>
                    </div>
                    <button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, emptyOption()] })} disabled={busy} className="shrink-0 text-[11px] font-bold text-[#1A4E8D] hover:underline disabled:opacity-50">+ Add Option</button>
                  </div>

                  <div data-testid="fnb-modifier-options-list" className="pos-items-options-list dgfy-pos-scroll-region max-h-[32rem] min-w-0 space-y-2 overflow-y-auto pr-1">
                    {draft.options.map((option, index) => (
                      <div key={option.modifier_option_id || `new-${index}`} className="min-w-0 overflow-hidden rounded-lg border border-slate-300 p-2.5">
                        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                          <div className="min-w-0 space-y-1">
                            <label htmlFor={`fnb-option-${index}-name`} className="text-[10px] font-bold text-[#334155]">Option Name</label>
                            <input id={`fnb-option-${index}-name`} aria-label={`Option ${index + 1} name`} value={option.name} onChange={(event) => updateOption(index, { name: event.target.value })} placeholder="Option Name" className="h-8 min-w-0 w-full rounded-lg border border-[#1A4E8D] px-2.5 text-[12px] text-[#0F172A] outline-none placeholder:text-slate-300 focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <label htmlFor={`fnb-option-${index}-price`} className="text-[10px] font-bold text-[#334155]">Option Price (₱)</label>
                            <input id={`fnb-option-${index}-price`} aria-label={`Option ${index + 1} price`} type="number" step="0.01" value={option.price_delta} onChange={(event) => updateOption(index, { price_delta: event.target.value })} placeholder="100.00" className="h-8 w-full min-w-0 rounded-lg border border-[#1A4E8D] px-2.5 text-[12px] text-[#0F172A] outline-none placeholder:text-slate-300 focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20" />
                          </div>
                          <button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => removeOption(index)} disabled={busy} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50 sm:mb-0.5">
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                        <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                          <Toggle label="Default" checked={option.is_default} onChange={(value) => updateOption(index, { is_default: value })} disabled={busy} />
                          <Toggle label="POS" checked={option.visible_in_pos} onChange={(value) => updateOption(index, { visible_in_pos: value })} disabled={busy} />
                          <Toggle label="Online" checked={option.visible_in_storefront} onChange={(value) => updateOption(index, { visible_in_storefront: value })} disabled={busy} />
                          <Toggle label="Sold Out" checked={option.is_sold_out} onChange={(value) => updateOption(index, { is_sold_out: value })} disabled={busy} />
                        </div>
                      </div>
                    ))}
                    {!draft.options.length ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-[11px] text-slate-500">No options added yet.</p> : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="pos-fnb-option-group-editor-footer grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-4 py-2.5 sm:px-5">
              <button type="button" onClick={resetDraft} disabled={busy} className="inline-flex h-9 min-w-0 w-full items-center justify-center gap-1.5 rounded-lg border border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50 disabled:opacity-60">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset All
              </button>
              <button type="button" onClick={submit} disabled={busy || !draft.name.trim() || !draft.options.some((option) => option.name.trim())} className="inline-flex h-9 min-w-0 w-full items-center justify-center gap-1.5 rounded-lg bg-[#1A4E8D] px-2 text-[11px] font-bold text-white transition-colors hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-50">
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
