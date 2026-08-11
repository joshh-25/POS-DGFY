import React, { useMemo, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';

const emptyOption = () => ({ name: '', price_delta: 0, sku_item_id: '', is_default: false, is_active: true, visible_in_pos: true, visible_in_storefront: true, is_sold_out: false, location_availability: [] });
const emptyGroup = () => ({ name: '', display_name: '', group_kind: 'modifier', parent_modifier_option_id: '', min_select: 0, max_select: 1, required: false, is_active: true, visible_in_pos: true, visible_in_storefront: true, sort_order: 0, location_availability: [], options: [emptyOption()] });

const normalizeGroup = (group) => ({
  ...emptyGroup(), ...group,
  options: (group.options || []).map((option) => ({ ...emptyOption(), ...option, sku_item_id: option.sku_item_id || '', location_availability: option.locationAvailability || option.location_availability || [] })),
  location_availability: group.locationAvailability || group.location_availability || []
});

const Toggle = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 text-xs text-slate-700">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="rounded border-slate-300 text-teal-600" />
    {label}
  </label>
);

export default function PosFnbModifierManager({ groups = [], items = [], locations = [], busy = false, canManage = true, onCreate, onUpdate }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyGroup);
  const itemOptions = useMemo(() => items.filter((item) => item.is_active !== false), [items]);

  const updateOption = (index, patch) => setDraft((current) => ({ ...current, options: current.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) }));
  const removeOption = (index) => setDraft((current) => ({ ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) }));
  const setGroupLocation = (locationId, isAvailable) => setDraft((current) => ({
    ...current,
    location_availability: [
      ...current.location_availability.filter((row) => Number(row.location_id) !== Number(locationId)),
      { location_id: Number(locationId), is_available: isAvailable }
    ]
  }));
  const submit = async () => {
    const payload = {
      ...draft,
      parent_modifier_option_id: draft.parent_modifier_option_id ? Number(draft.parent_modifier_option_id) : null,
      min_select: Number(draft.min_select), max_select: Number(draft.max_select), sort_order: Number(draft.sort_order),
      required: draft.required || Number(draft.min_select) > 0,
      options: draft.options.filter((option) => option.name.trim()).map((option, index) => ({ ...option, price_delta: Number(option.price_delta || 0), sku_item_id: option.sku_item_id ? Number(option.sku_item_id) : null, sort_order: index }))
    };
    if (editingId) await onUpdate(editingId, payload);
    else await onCreate(payload);
    setEditingId(null);
    setDraft(emptyGroup());
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-black text-[#0F172A]">F&amp;B menu modifiers</h2><p className="text-sm text-slate-500">Create restaurant choices, extras, and preparation options directly in this POS.</p></div>
          {canManage && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyGroup()); }} className="rounded-lg border px-3 py-2 text-sm font-semibold"><Plus className="mr-1 inline h-4 w-4" />New group</button>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {groups.map((group) => (
            <button type="button" key={group.modifier_group_id} disabled={!canManage} onClick={() => { setEditingId(group.modifier_group_id); setDraft(normalizeGroup(group)); }} className={`rounded-lg border p-3 text-left disabled:cursor-default ${Number(editingId) === Number(group.modifier_group_id) ? 'border-teal-500 ring-2 ring-teal-100' : 'border-slate-200'}`}>
              <div className="flex justify-between gap-2"><span className="font-semibold text-slate-900">{group.display_name || group.name}</span><span className={`text-xs ${group.is_active === false ? 'text-rose-600' : 'text-emerald-600'}`}>{group.is_active === false ? 'Inactive' : 'Active'}</span></div>
              <p className="mt-1 text-xs font-semibold text-teal-700">{group.group_kind === 'combo_choice' ? 'Combo choice' : 'Menu modifier'}</p>
              <p className="mt-1 text-xs text-slate-500">Select {group.min_select}–{group.max_select} · {(group.options || []).length} options</p>
              <div className="mt-2 flex flex-wrap gap-1">{(group.options || []).slice(0, 5).map((option) => <span key={option.modifier_option_id} className="rounded bg-slate-100 px-2 py-1 text-xs">{option.name} {Number(option.price_delta) ? `+₱${Number(option.price_delta).toFixed(2)}` : ''}</span>)}</div>
            </button>
          ))}
          {!groups.length && <p className="text-sm text-slate-500">No modifier groups yet.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {!canManage ? (
          <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <h2 className="font-semibold text-slate-900">Read-only menu modifiers</h2>
            <p className="mt-1">You can review modifier groups and options, but your role cannot create or change them.</p>
          </div>
        ) : (
        <>
        <h2 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit Modifier Group' : 'Create Modifier Group'}</h2>
        <div className="mt-3 space-y-3">
          <input aria-label="Group name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Group name" className="h-10 w-full rounded-lg border px-3 text-sm" />
          <input aria-label="Customer-facing name" value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="Customer-facing name" className="h-10 w-full rounded-lg border px-3 text-sm" />
          <select aria-label="Group type" value={draft.group_kind} onChange={(e) => setDraft({ ...draft, group_kind: e.target.value, ...(e.target.value === 'combo_choice' ? { required: true, min_select: Math.max(1, Number(draft.min_select || 0)) } : {}) })} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="modifier">Menu modifier</option><option value="combo_choice">Combo choice</option></select>
          <select aria-label="Show only after option" value={draft.parent_modifier_option_id || ''} onChange={(e) => setDraft({ ...draft, parent_modifier_option_id: e.target.value })} className="h-10 w-full rounded-lg border px-3 text-sm"><option value="">Always show this group</option>{groups.filter((group) => Number(group.modifier_group_id) !== Number(editingId)).flatMap((group) => (group.options || []).filter((option) => option.is_active !== false).map((option) => <option key={option.modifier_option_id} value={option.modifier_option_id}>After: {group.display_name || group.name} — {option.name}</option>))}</select>
          <div className="grid grid-cols-2 gap-2"><input aria-label="Minimum selections" type="number" min="0" value={draft.min_select} onChange={(e) => setDraft({ ...draft, min_select: e.target.value })} className="h-10 rounded-lg border px-3 text-sm" /><input aria-label="Maximum selections" type="number" min="1" value={draft.max_select} onChange={(e) => setDraft({ ...draft, max_select: e.target.value })} className="h-10 rounded-lg border px-3 text-sm" /></div>
          <div className="grid grid-cols-2 gap-2"><Toggle label="Active" checked={draft.is_active} onChange={(value) => setDraft({ ...draft, is_active: value })} /><Toggle label="Required" checked={draft.required} onChange={(value) => setDraft({ ...draft, required: value })} /><Toggle label="Show in POS" checked={draft.visible_in_pos} onChange={(value) => setDraft({ ...draft, visible_in_pos: value })} /><Toggle label="Show online" checked={draft.visible_in_storefront} onChange={(value) => setDraft({ ...draft, visible_in_storefront: value })} /></div>
          {locations.length > 0 && <div><p className="text-xs font-semibold text-slate-600">Location availability</p><div className="mt-2 grid grid-cols-2 gap-2">{locations.map((location) => { const row = draft.location_availability.find((entry) => Number(entry.location_id) === Number(location.location_id)); return <Toggle key={location.location_id} label={location.name} checked={row?.is_available !== false} onChange={(value) => setGroupLocation(location.location_id, value)} />; })}</div></div>}
           <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Options</p><button type="button" onClick={() => setDraft({ ...draft, options: [...draft.options, emptyOption()] })} className="text-xs font-semibold text-teal-700">+ Add option</button></div>
             <div data-testid="fnb-modifier-options-list" className="max-h-96 space-y-2 overflow-y-auto pr-1">
               {draft.options.map((option, index) => <div key={option.modifier_option_id || `new-${index}`} className="rounded-lg border p-3"><div className="flex gap-2"><input aria-label={`Option ${index + 1} name`} value={option.name} onChange={(e) => updateOption(index, { name: e.target.value })} placeholder="Option name" className="h-9 min-w-0 flex-1 rounded border px-2 text-sm" /><input aria-label={`Option ${index + 1} price`} type="number" step="0.01" value={option.price_delta} onChange={(e) => updateOption(index, { price_delta: e.target.value })} className="h-9 w-24 rounded border px-2 text-sm" /><button type="button" aria-label={`Remove option ${index + 1}`} onClick={() => removeOption(index)}><X className="h-4 w-4" /></button></div><select aria-label={`Option ${index + 1} inventory link`} value={option.sku_item_id} onChange={(e) => updateOption(index, { sku_item_id: e.target.value })} className="mt-2 h-9 w-full rounded border px-2 text-xs"><option value="">No inventory link</option>{itemOptions.map((item) => <option key={item.item_id} value={item.item_id}>{item.name}</option>)}</select><div className="mt-2 grid grid-cols-2 gap-1"><Toggle label="Default" checked={option.is_default} onChange={(value) => updateOption(index, { is_default: value })} /><Toggle label="Sold out" checked={option.is_sold_out} onChange={(value) => updateOption(index, { is_sold_out: value })} /><Toggle label="POS" checked={option.visible_in_pos} onChange={(value) => updateOption(index, { visible_in_pos: value })} /><Toggle label="Online" checked={option.visible_in_storefront} onChange={(value) => updateOption(index, { visible_in_storefront: value })} /></div></div>)}
             </div>
           </div>
          <button type="button" onClick={submit} disabled={busy || !draft.name.trim() || !draft.options.some((option) => option.name.trim())} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{editingId ? 'Save changes' : 'Create group'}</button>
        </div>
        </>
        )}
      </section>
    </div>
  );
}
