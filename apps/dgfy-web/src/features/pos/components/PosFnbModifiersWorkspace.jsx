import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  createFnbModifierGroup,
  listFnbItemModifierGroups,
  listFnbModifierGroups,
  replaceFnbItemModifierGroups,
  updateFnbModifierGroup
} from '@/src/features/fnb/api/fnbApi.js';
import { fetchPosCatalog } from '../services/posService.js';
import PosFnbModifierManager from './PosFnbModifierManager.jsx';

const byName = (left, right) => String(left?.name || '').localeCompare(String(right?.name || ''));

export default function PosFnbModifiersWorkspace({
  isOnline = true,
  canManage = false,
  locations = [],
  sectionId = 'pos-fnb-menu-modifiers'
}) {
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const loadWorkspace = useCallback(async () => {
    if (!isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [groupPayload, assignmentPayload, catalogPayload] = await Promise.all([
        listFnbModifierGroups({ include_inactive: true }),
        listFnbItemModifierGroups(),
        fetchPosCatalog({ limit: 500 })
      ]);
      const nextGroups = Array.isArray(groupPayload?.modifier_groups) ? groupPayload.modifier_groups : [];
      const nextAssignments = Array.isArray(assignmentPayload?.item_modifier_groups) ? assignmentPayload.item_modifier_groups : [];
      const nextItems = (Array.isArray(catalogPayload) ? catalogPayload : []).slice().sort(byName);
      setGroups(nextGroups);
      setAssignments(nextAssignments);
      setItems(nextItems);
      setSelectedItemId((current) => (
        nextItems.some((item) => String(item.item_id) === String(current))
          ? current
          : String(nextItems[0]?.item_id || '')
      ));
    } catch (loadError) {
      setError(loadError?.response?.data?.message || 'Unable to load F&B menu modifiers in POS.');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    setSelectedGroupIds(assignments
      .filter((assignment) => Number(assignment.item_id) === Number(selectedItemId))
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
      .map((assignment) => String(assignment.modifier_group_id)));
  }, [assignments, selectedItemId]);

  const selectedItem = useMemo(
    () => items.find((item) => String(item.item_id) === String(selectedItemId)) || null,
    [items, selectedItemId]
  );

  const runMutation = async (key, action, successMessage) => {
    setBusy(key);
    try {
      await action();
      await loadWorkspace();
      toast.success(successMessage);
    } catch (mutationError) {
      toast.error(mutationError?.response?.data?.message || 'Unable to save F&B menu modifier changes.');
    } finally {
      setBusy('');
    }
  };

  const toggleAssignment = (groupId, checked) => {
    const normalizedId = String(groupId);
    setSelectedGroupIds((current) => checked
      ? [...new Set([...current, normalizedId])]
      : current.filter((entry) => entry !== normalizedId));
  };

  const saveAssignments = () => runMutation('assignments', () => replaceFnbItemModifierGroups(Number(selectedItemId), {
    modifier_groups: selectedGroupIds.map((modifierGroupId, index) => ({
      modifier_group_id: Number(modifierGroupId),
      sort_order: index
    }))
  }), `Add-ons saved for ${selectedItem?.name || 'menu item'}.`);

  if (!isOnline) {
    return (
      <div id={sectionId} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-black">F&amp;B modifier management is available online only.</p>
        <p className="mt-1">Reconnect to create add-ons or assign them to menu items.</p>
      </div>
    );
  }

  return (
    <div id={sectionId} className="space-y-4">
      <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-teal-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-100 text-[#1A4E8D]">
              <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#0F172A]">Menu modifiers</h2>
              <p className="mt-1 text-sm text-slate-600">Create F&amp;B add-ons here, then assign them to a specific POS menu item.</p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={loadWorkspace} disabled={loading || Boolean(busy)} className="rounded-xl">
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div> : null}

      {!loading && !error ? (
        <>
          <PosFnbModifierManager
            groups={groups}
            items={items}
            locations={locations}
            busy={Boolean(busy)}
            canManage={canManage}
            onCreate={(payload) => runMutation('create', () => createFnbModifierGroup(payload), 'Modifier group created in POS.')}
            onUpdate={(groupId, payload) => runMutation('update', () => updateFnbModifierGroup(groupId, payload), 'Modifier group updated in POS.')}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-[#0F172A]">Assign add-ons to an item</h2>
            <p className="mt-1 text-sm text-slate-600">Choose one menu item and select every modifier group that should appear when it is ordered.</p>
            <div className="mt-4 max-w-xl">
              <label htmlFor="pos-fnb-modifier-item" className="text-xs font-black uppercase tracking-wide text-slate-600">Menu item</label>
              <select id="pos-fnb-modifier-item" value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0F172A]">
                {items.length ? items.map((item) => <option key={item.item_id} value={item.item_id}>{item.name}</option>) : <option value="">No POS menu items found</option>}
              </select>
            </div>
            <fieldset className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" disabled={!canManage || Boolean(busy) || !selectedItemId}>
              <legend className="mb-2 text-sm font-bold text-slate-800">Available modifier groups</legend>
              {groups.map((group) => (
                <label key={group.modifier_group_id} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={selectedGroupIds.includes(String(group.modifier_group_id))} onChange={(event) => toggleAssignment(group.modifier_group_id, event.target.checked)} />
                  {group.display_name || group.name}
                </label>
              ))}
              {!groups.length ? <p className="text-sm text-slate-500">Create a modifier group before assigning add-ons.</p> : null}
            </fieldset>
            {canManage ? (
              <Button type="button" onClick={saveAssignments} disabled={Boolean(busy) || !selectedItemId} className="mt-4 rounded-xl bg-[#1A4E8D] text-white hover:bg-[#143F73]">
                {busy === 'assignments' ? 'Saving…' : 'Save item add-ons'}
              </Button>
            ) : (
              <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">You can review item assignments, but your role cannot change them.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
