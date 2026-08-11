import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  createFnbModifierGroup,
  listFnbFolderModifierGroups,
  listFnbItemModifierGroups,
  listFnbModifierGroups,
  replaceFnbFolderModifierGroups,
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
  const [folderAssignments, setFolderAssignments] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedExcludedGroupIds, setSelectedExcludedGroupIds] = useState([]);
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
      const [groupPayload, assignmentPayload, folderAssignmentPayload, catalogPayload] = await Promise.all([
        listFnbModifierGroups({ include_inactive: true }),
        listFnbItemModifierGroups(),
        listFnbFolderModifierGroups(),
        fetchPosCatalog({ limit: 500 })
      ]);
      const nextGroups = Array.isArray(groupPayload?.modifier_groups) ? groupPayload.modifier_groups : [];
      const nextAssignments = Array.isArray(assignmentPayload?.item_modifier_groups) ? assignmentPayload.item_modifier_groups : [];
      const nextFolderAssignments = Array.isArray(folderAssignmentPayload?.folder_modifier_groups) ? folderAssignmentPayload.folder_modifier_groups : [];
      const nextItems = (Array.isArray(catalogPayload) ? catalogPayload : []).slice().sort(byName);
      setGroups(nextGroups);
      setAssignments(nextAssignments);
      setFolderAssignments(nextFolderAssignments);
      setItems(nextItems);
      setSelectedItemId((current) => (
        nextItems.some((item) => String(item.item_id) === String(current))
          ? current
          : String(nextItems[0]?.item_id || '')
      ));
      const nextFolderIds = new Set(nextItems.map((item) => Number(item.folder_id)).filter((id) => Number.isInteger(id) && id > 0));
      setSelectedFolderId((current) => (nextFolderIds.has(Number(current)) ? current : String([...nextFolderIds][0] || '')));
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
      .filter((assignment) => assignment.is_excluded !== true)
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
      .map((assignment) => String(assignment.modifier_group_id)));
    setSelectedExcludedGroupIds(assignments
      .filter((assignment) => Number(assignment.item_id) === Number(selectedItemId) && assignment.is_excluded === true)
      .map((assignment) => String(assignment.modifier_group_id)));
  }, [assignments, selectedItemId]);

  const selectedItem = useMemo(
    () => items.find((item) => String(item.item_id) === String(selectedItemId)) || null,
    [items, selectedItemId]
  );

  const folders = useMemo(() => {
    const seen = new Map();
    items.forEach((item) => {
      const folderId = Number(item.folder_id || item?.folder?.folder_id);
      if (Number.isInteger(folderId) && folderId > 0 && !seen.has(folderId)) {
        seen.set(folderId, { folder_id: folderId, name: item?.folder?.name || item.product_folder || `Folder ${folderId}` });
      }
    });
    return [...seen.values()].sort(byName);
  }, [items]);

  const selectedFolderGroupIds = useMemo(() => folderAssignments
    .filter((assignment) => Number(assignment.folder_id) === Number(selectedFolderId))
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
    .map((assignment) => String(assignment.modifier_group_id)), [folderAssignments, selectedFolderId]);

  const inheritedGroupIds = useMemo(() => selectedItem?.folder_id
    ? folderAssignments
      .filter((assignment) => Number(assignment.folder_id) === Number(selectedItem.folder_id))
      .map((assignment) => String(assignment.modifier_group_id))
    : [], [folderAssignments, selectedItem]);

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
    if (checked) {
      setSelectedExcludedGroupIds((current) => current.filter((entry) => entry !== normalizedId));
    }
  };

  const toggleExclusion = (groupId, checked) => {
    const normalizedId = String(groupId);
    setSelectedExcludedGroupIds((current) => checked
      ? [...new Set([...current, normalizedId])]
      : current.filter((entry) => entry !== normalizedId));
    if (checked) {
      setSelectedGroupIds((current) => current.filter((entry) => entry !== normalizedId));
    }
  };

  const toggleFolderAssignment = (groupId, checked) => {
    const normalizedId = String(groupId);
    setFolderAssignments((current) => {
      const withoutFolder = current.filter((entry) => Number(entry.folder_id) !== Number(selectedFolderId));
      const currentFolder = current.filter((entry) => Number(entry.folder_id) === Number(selectedFolderId));
      const nextIds = checked
        ? [...new Set([...currentFolder.map((entry) => String(entry.modifier_group_id)), normalizedId])]
        : currentFolder.map((entry) => String(entry.modifier_group_id)).filter((entry) => entry !== normalizedId);
      return [...withoutFolder, ...nextIds.map((modifierGroupId, index) => ({
        folder_id: Number(selectedFolderId), modifier_group_id: Number(modifierGroupId), sort_order: index
      }))];
    });
  };

  const saveFolderAssignments = () => runMutation('folder-assignments', () => replaceFnbFolderModifierGroups(Number(selectedFolderId), {
    modifier_groups: selectedFolderGroupIds.map((modifierGroupId, index) => ({
      modifier_group_id: Number(modifierGroupId),
      sort_order: index
    }))
  }), `Add-ons saved for ${folders.find((folder) => Number(folder.folder_id) === Number(selectedFolderId))?.name || 'folder'}.`);

  const saveAssignments = () => runMutation('assignments', () => replaceFnbItemModifierGroups(Number(selectedItemId), {
    modifier_groups: [
      ...selectedGroupIds.map((modifierGroupId, index) => ({
        modifier_group_id: Number(modifierGroupId),
        sort_order: index,
        is_excluded: false
      })),
      ...selectedExcludedGroupIds.map((modifierGroupId, index) => ({
        modifier_group_id: Number(modifierGroupId),
        sort_order: selectedGroupIds.length + index,
        is_excluded: true
      }))
    ]
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
              <p className="mt-1 text-sm text-slate-600">Create F&amp;B add-ons here, assign them to a folder, then override individual menu items only when needed.</p>
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

          <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-5 shadow-sm">
            <h2 className="text-lg font-black text-[#0F172A]">Assign add-ons to a folder</h2>
            <p className="mt-1 text-sm text-slate-600">Every active menu item in the folder inherits these groups. Item-level assignments can override or exclude one later.</p>
            <div className="mt-4 max-w-xl">
              <label htmlFor="pos-fnb-modifier-folder" className="text-xs font-black uppercase tracking-wide text-slate-600">POS folder</label>
              <select id="pos-fnb-modifier-folder" value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0F172A]">
                {folders.length ? folders.map((folder) => <option key={folder.folder_id} value={folder.folder_id}>{folder.name}</option>) : <option value="">No POS folders found</option>}
              </select>
            </div>
            <fieldset className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" disabled={!canManage || Boolean(busy) || !selectedFolderId}>
              <legend className="mb-2 text-sm font-bold text-slate-800">Inherited modifier groups</legend>
              {groups.map((group) => (
                <label key={group.modifier_group_id} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={selectedFolderGroupIds.includes(String(group.modifier_group_id))} onChange={(event) => toggleFolderAssignment(group.modifier_group_id, event.target.checked)} />
                  {group.display_name || group.name}
                </label>
              ))}
              {!groups.length ? <p className="text-sm text-slate-500">Create a modifier group before assigning add-ons.</p> : null}
            </fieldset>
            {canManage ? (
              <Button type="button" onClick={saveFolderAssignments} disabled={Boolean(busy) || !selectedFolderId} className="mt-4 rounded-xl bg-[#0F766E] text-white hover:bg-[#0B5F59]">
                {busy === 'folder-assignments' ? 'Saving…' : 'Save folder add-ons'}
              </Button>
            ) : <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">You can review folder inheritance, but your role cannot change it.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-[#0F172A]">Override add-ons for an item</h2>
            <p className="mt-1 text-sm text-slate-600">Choose one menu item for direct assignments. Folder groups are inherited automatically; use the exclusion controls to opt out for this item.</p>
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
            {inheritedGroupIds.length ? (
              <fieldset className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" disabled={!canManage || Boolean(busy) || !selectedItemId}>
                <legend className="mb-2 text-sm font-bold text-slate-800">Exclude inherited groups for this item</legend>
                {groups.filter((group) => inheritedGroupIds.includes(String(group.modifier_group_id))).map((group) => (
                  <label key={`exclude-${group.modifier_group_id}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                    <input type="checkbox" checked={selectedExcludedGroupIds.includes(String(group.modifier_group_id))} onChange={(event) => toggleExclusion(group.modifier_group_id, event.target.checked)} />
                    Exclude {group.display_name || group.name}
                  </label>
                ))}
              </fieldset>
            ) : null}
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
