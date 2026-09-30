import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Package, RefreshCcw, RotateCcw, Store } from 'lucide-react';
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
import PosFnbSelect from './PosFnbSelect.jsx';
import PosSearchField from './PosSearchField.jsx';

const byName = (left, right) => String(left?.name || '').localeCompare(String(right?.name || ''));

function AssignmentPanel({
  title,
  description,
  selectorLabel,
  selectorId,
  selectorValue,
  selectorOptions,
  leadingIcon,
  onSelectorChange,
  searchLabel,
  searchValue,
  onSearchChange,
  groups,
  selectedIds,
  onToggle,
  inheritedGroupIds = [],
  excludedGroupIds = [],
  onToggleExcluded,
  reset,
  apply,
  applyLabel,
  applyBusy,
  canManage,
  disabled,
  emptySelectorText
}) {
  return (
    <section className="pos-items-options-panel pos-items-options-assignment-panel min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70 sm:p-4" aria-labelledby={`${selectorId}-heading`}>
      <div className="pos-items-options-panel-header min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#1A4E8D]">Assignment</p>
        <h2 id={`${selectorId}-heading`} className="mt-1 break-words text-sm font-black text-[#0F172A]">{title}</h2>
        <p className="mt-1 break-words text-xs leading-5 text-[#64748B]">{description}</p>
      </div>

      <div className="mt-3 space-y-1.5">
        <label htmlFor={selectorId} className="text-[10px] font-bold text-[#334155]">{selectorLabel}</label>
        <PosFnbSelect
          id={selectorId}
          value={selectorValue}
          onChange={onSelectorChange}
          disabled={disabled}
          options={selectorOptions}
          leadingIcon={leadingIcon}
          placeholder={emptySelectorText}
          aria-label={selectorLabel}
        />
      </div>

      <div className="mt-3 space-y-1.5">
        <label htmlFor={`${selectorId}-search`} className="text-[10px] font-bold text-[#334155]">Applicable {selectorId.includes('category') ? 'Option Groups' : 'Options'}</label>
        <PosSearchField id={`${selectorId}-search`} ariaLabel={searchLabel} value={searchValue} onChange={(event) => onSearchChange(event.target.value)} onClear={() => onSearchChange('')} placeholder={searchLabel} disabled={disabled} inputClassName="h-9" />
      </div>

      <div data-testid={`${selectorId}-groups-list`} className="pos-items-options-list pos-items-options-assignment-list dgfy-pos-scroll-region mt-3 max-h-48 space-y-1 overflow-y-auto pr-1">
        {groups.map((group) => {
          const groupId = String(group.modifier_group_id);
          const groupName = group.display_name || group.name || 'Unnamed option group';
          return (
            <label key={group.modifier_group_id} className="pos-items-options-option-row flex min-h-9 min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-[#0F172A] transition-colors hover:border-[#8AA8CD] hover:shadow-[0_4px_12px_rgba(148,163,184,0.08)]">
              <input type="checkbox" aria-label={groupName} checked={selectedIds.includes(groupId)} onChange={(event) => onToggle(groupId, event.target.checked)} disabled={disabled} className="h-4 w-4 shrink-0 rounded border-[#1A4E8D] text-[#1A4E8D]" />
              <span className="min-w-0 flex-1 truncate">{groupName}</span>
              <span className="shrink-0 text-[10px] font-bold text-[#64748B]">{(group.options || []).length} options</span>
            </label>
          );
        })}
        {inheritedGroupIds.length > 0 && onToggleExcluded ? (
          <div className="space-y-1 pt-1">
            {groups.filter((group) => inheritedGroupIds.includes(String(group.modifier_group_id))).map((group) => {
              const groupId = String(group.modifier_group_id);
              const groupName = group.display_name || group.name || 'Unnamed option group';
              return (
                <label key={`exclude-${group.modifier_group_id}`} className="flex min-h-9 min-w-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900">
                  <input type="checkbox" aria-label={`Exclude ${groupName}`} checked={excludedGroupIds.includes(groupId)} onChange={(event) => onToggleExcluded(groupId, event.target.checked)} disabled={disabled} className="h-4 w-4 shrink-0 rounded border-amber-500 text-amber-700" />
                  <span className="min-w-0 flex-1 truncate">Exclude inherited {groupName}</span>
                </label>
              );
            })}
          </div>
        ) : null}
        {!groups.length ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">No option groups found.</p> : null}
      </div>

      {canManage ? (
        <div className="pos-items-options-actions mt-3 grid min-w-0 grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={reset} disabled={disabled} className="pos-items-reset-action h-9 min-w-0 rounded-lg px-2 text-[13px] font-bold hover:bg-[#fff1f2] hover:text-[#9f1239]">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Reset All
          </Button>
          <Button type="button" onClick={apply} disabled={disabled} className="h-9 min-w-0 rounded-lg bg-[#1A4E8D] px-2 text-[13px] font-bold text-white hover:bg-[#143F73]">
            {applyBusy ? 'Saving…' : applyLabel}
          </Button>
        </div>
      ) : <p role="status" className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">You can review item options, but your role cannot change assignments.</p>}
    </section>
  );
}

export default function PosFnbModifiersWorkspace({
  isOnline = true,
  canManage = false,
  locations = [],
  operatingLocationId = null,
  locationsLoading = false,
  sectionId = 'pos-fnb-menu-modifiers'
}) {
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [folderAssignments, setFolderAssignments] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedExcludedGroupIds, setSelectedExcludedGroupIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [folderGroupSearch, setFolderGroupSearch] = useState('');
  const [itemGroupSearch, setItemGroupSearch] = useState('');
  const scopedCatalogCache = useRef(new Map());
  const workspaceReadSequence = useRef(0);

  const loadWorkspace = useCallback(async () => {
    const sequence = ++workspaceReadSequence.current;
    if (!isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const scopedLocationId = Number(operatingLocationId || 0);
    const hasLocationId = Number.isInteger(scopedLocationId) && scopedLocationId > 0;
    const availableLocations = Array.isArray(locations) ? locations : [];
    const hasAuthorizedLocation = hasLocationId && (
      availableLocations.length === 0
      || availableLocations.some((location) => Number(location?.location_id) === scopedLocationId)
    );
    const hasValidLocation = !locationsLoading && hasAuthorizedLocation;
    const cachedCatalog = hasValidLocation
      ? scopedCatalogCache.current.get(scopedLocationId)
      : null;

    if (!hasValidLocation) {
      setItems([]);
      setFolders([]);
      setSelectedItemId('');
      setSelectedFolderId('');
      setLoading(locationsLoading);
      setError(locationsLoading ? '' : 'Select an authorized location to load item options.');
      return;
    }

    try {
      const [groupPayload, assignmentPayload, folderAssignmentPayload, catalogPayload] = await Promise.all([
        listFnbModifierGroups({ include_inactive: true }),
        listFnbItemModifierGroups(),
        listFnbFolderModifierGroups(),
        fetchPosCatalog({ limit: 500, location_id: scopedLocationId })
      ]);
      if (workspaceReadSequence.current !== sequence) return;
      const nextGroups = Array.isArray(groupPayload?.modifier_groups) ? groupPayload.modifier_groups : [];
      const nextAssignments = Array.isArray(assignmentPayload?.item_modifier_groups) ? assignmentPayload.item_modifier_groups : [];
      const nextFolderAssignments = Array.isArray(folderAssignmentPayload?.folder_modifier_groups) ? folderAssignmentPayload.folder_modifier_groups : [];
      const nextItems = (Array.isArray(catalogPayload) ? catalogPayload : []).slice().sort(byName);
      const catalogFolders = nextItems.reduce((result, item) => {
        const folderId = Number(item.folder_id || item?.folder?.folder_id);
        if (Number.isInteger(folderId) && folderId > 0 && !result.some((folder) => folder.folder_id === folderId)) {
          result.push({ folder_id: folderId, name: item?.folder?.name || item.product_folder || `Folder ${folderId}` });
        }
        return result;
      }, []).sort(byName);
      const nextFolders = catalogFolders;
      setGroups(nextGroups);
      setAssignments(nextAssignments);
      setFolderAssignments(nextFolderAssignments);
      setItems(nextItems);
      setFolders(nextFolders);
      scopedCatalogCache.current.set(scopedLocationId, { items: nextItems, folders: nextFolders });
      setSelectedItemId((current) => (nextItems.some((item) => String(item.item_id) === String(current)) ? current : String(nextItems[0]?.item_id || '')));
      const nextFolderIds = new Set(nextItems.map((item) => Number(item.folder_id)).filter((id) => Number.isInteger(id) && id > 0));
      setSelectedFolderId((current) => (nextFolderIds.has(Number(current)) ? current : String([...nextFolderIds][0] || '')));
    } catch (loadError) {
      if (workspaceReadSequence.current !== sequence) return;
      if (cachedCatalog) {
        setItems(cachedCatalog.items);
        setFolders(cachedCatalog.folders);
        setError('');
      } else {
        setItems([]);
        setFolders([]);
        setError(loadError?.response?.data?.message || 'Unable to load F&B item options in POS.');
      }
    } finally {
      if (workspaceReadSequence.current === sequence) setLoading(false);
    }
  }, [isOnline, locations, locationsLoading, operatingLocationId]);

  useEffect(() => {
    loadWorkspace();
    return () => {
      workspaceReadSequence.current += 1;
    };
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

  const selectedItem = useMemo(() => items.find((item) => String(item.item_id) === String(selectedItemId)) || null, [items, selectedItemId]);

  const selectedFolderGroupIds = useMemo(() => folderAssignments
    .filter((assignment) => Number(assignment.folder_id) === Number(selectedFolderId))
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
    .map((assignment) => String(assignment.modifier_group_id)), [folderAssignments, selectedFolderId]);

  const inheritedGroupIds = useMemo(() => selectedItem?.folder_id
    ? folderAssignments.filter((assignment) => Number(assignment.folder_id) === Number(selectedItem.folder_id)).map((assignment) => String(assignment.modifier_group_id))
    : [], [folderAssignments, selectedItem]);

  const appliedFoldersByGroup = useMemo(() => {
    const namesById = new Map(folders.map((folder) => [Number(folder.folder_id), folder.name]));
    return folderAssignments.reduce((result, assignment) => {
      const folderName = namesById.get(Number(assignment.folder_id));
      if (!folderName) return result;
      const key = String(assignment.modifier_group_id);
      result[key] = [...new Set([...(result[key] || []), folderName])];
      return result;
    }, {});
  }, [folderAssignments, folders]);

  const filteredFolderGroups = useMemo(() => {
    const normalized = folderGroupSearch.trim().toLowerCase();
    return groups.filter((group) => !normalized || String(group.display_name || group.name || '').toLowerCase().includes(normalized));
  }, [folderGroupSearch, groups]);

  const filteredItemGroups = useMemo(() => {
    const normalized = itemGroupSearch.trim().toLowerCase();
    return groups.filter((group) => !normalized || String(group.display_name || group.name || '').toLowerCase().includes(normalized));
  }, [groups, itemGroupSearch]);

  const runMutation = async (key, action, successMessage) => {
    setBusy(key);
    try {
      await action();
      await loadWorkspace();
      toast.success(successMessage);
    } catch (mutationError) {
      toast.error(mutationError?.response?.data?.message || 'Unable to save item option changes.');
    } finally {
      setBusy('');
    }
  };

  const toggleAssignment = (groupId, checked) => {
    setSelectedGroupIds((current) => checked ? [...new Set([...current, groupId])] : current.filter((entry) => entry !== groupId));
    if (checked) setSelectedExcludedGroupIds((current) => current.filter((entry) => entry !== groupId));
  };

  const toggleExclusion = (groupId, checked) => {
    setSelectedExcludedGroupIds((current) => checked ? [...new Set([...current, groupId])] : current.filter((entry) => entry !== groupId));
    if (checked) setSelectedGroupIds((current) => current.filter((entry) => entry !== groupId));
  };

  const toggleFolderAssignment = (groupId, checked) => {
    setFolderAssignments((current) => {
      const withoutFolder = current.filter((entry) => Number(entry.folder_id) !== Number(selectedFolderId));
      const currentFolder = current.filter((entry) => Number(entry.folder_id) === Number(selectedFolderId));
      const nextIds = checked
        ? [...new Set([...currentFolder.map((entry) => String(entry.modifier_group_id)), groupId])]
        : currentFolder.map((entry) => String(entry.modifier_group_id)).filter((entry) => entry !== groupId);
      return [...withoutFolder, ...nextIds.map((modifierGroupId, index) => ({ folder_id: Number(selectedFolderId), modifier_group_id: Number(modifierGroupId), sort_order: index }))];
    });
  };

  const saveFolderAssignments = () => runMutation('folder-assignments', () => replaceFnbFolderModifierGroups(Number(selectedFolderId), {
    modifier_groups: selectedFolderGroupIds.map((modifierGroupId, index) => ({ modifier_group_id: Number(modifierGroupId), sort_order: index }))
  }), `Option groups saved for ${folders.find((folder) => Number(folder.folder_id) === Number(selectedFolderId))?.name || 'category'}.`);

  const saveAssignments = () => runMutation('assignments', () => replaceFnbItemModifierGroups(Number(selectedItemId), {
    modifier_groups: [
      ...selectedGroupIds.map((modifierGroupId, index) => ({ modifier_group_id: Number(modifierGroupId), sort_order: index, is_excluded: false })),
      ...selectedExcludedGroupIds.map((modifierGroupId, index) => ({ modifier_group_id: Number(modifierGroupId), sort_order: selectedGroupIds.length + index, is_excluded: true }))
    ]
  }), `Options saved for ${selectedItem?.name || 'item'}.`);

  const resetFolderFilters = () => {
    setFolderGroupSearch('');
    setFolderAssignments((current) => current.filter((entry) => Number(entry.folder_id) !== Number(selectedFolderId)));
  };

  const resetItemFilters = () => {
    setItemGroupSearch('');
    setSelectedGroupIds([]);
    setSelectedExcludedGroupIds([]);
  };

  if (!isOnline) {
    return (
      <div id={sectionId} className="pos-items-options-workspace min-w-0 max-w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:p-4">
        <p className="font-black">Item option management is available online only.</p>
        <p className="mt-1">Reconnect to create option groups or assign them to categories and items.</p>
      </div>
    );
  }

  return (
    <div id={sectionId} className="pos-items-options-workspace flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-hidden">
      {error ? <div role="alert" className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"><span className="min-w-0 break-words">{error}</span><Button type="button" variant="outline" onClick={loadWorkspace} disabled={loading || Boolean(busy)} className="h-8 shrink-0 rounded-lg border-rose-300 px-3 text-xs text-rose-800"><RefreshCcw className="mr-1.5 h-3.5 w-3.5" />Retry</Button></div> : null}

      {loading ? <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-xs text-slate-500">Loading item options…</p> : null}

      {!loading && !error ? (
        <div className="pos-items-options-grid grid min-h-0 min-w-0 flex-1 items-stretch gap-3 overflow-hidden lg:grid-cols-2">
          <PosFnbModifierManager
            groups={groups}
            items={items}
            locations={locations}
            appliedFoldersByGroup={appliedFoldersByGroup}
            busy={Boolean(busy)}
            canManage={canManage}
            onCreate={(payload) => runMutation('create', () => createFnbModifierGroup(payload), 'Option group created in POS.')}
            onUpdate={(groupId, payload) => runMutation('update', () => updateFnbModifierGroup(groupId, payload), 'Option group updated in POS.')}
          />

           <div className="pos-items-options-assignment-column dgfy-pos-scroll-region min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain pr-1 touch-pan-y">
            <AssignmentPanel
              title="Assign Option Groups to a Category"
              description="Assign an option group for a whole item category"
              selectorLabel="Select Category"
              selectorId="pos-fnb-option-category"
          selectorValue={selectedFolderId}
          selectorOptions={folders.map((folder) => ({ value: String(folder.folder_id), label: folder.name }))}
          leadingIcon={Store}
          onSelectorChange={(event) => setSelectedFolderId(event.target.value)}
              searchLabel="Search Option Groups"
              searchValue={folderGroupSearch}
              onSearchChange={setFolderGroupSearch}
              groups={filteredFolderGroups}
              selectedIds={selectedFolderGroupIds}
              onToggle={toggleFolderAssignment}
              reset={resetFolderFilters}
              apply={saveFolderAssignments}
              applyLabel="Apply Filters"
              applyBusy={busy === 'folder-assignments'}
              canManage={canManage}
              disabled={!canManage || Boolean(busy) || !selectedFolderId}
              emptySelectorText="No categories found"
            />

            <AssignmentPanel
              title="Assign Options to an Item"
              description="Directly assign an option group to the item"
              selectorLabel="Select Item"
              selectorId="pos-fnb-option-item"
          selectorValue={selectedItemId}
          selectorOptions={items.map((item) => ({ value: String(item.item_id), label: item.name }))}
          leadingIcon={Package}
          onSelectorChange={(event) => setSelectedItemId(event.target.value)}
              searchLabel="Search Option Group"
              searchValue={itemGroupSearch}
              onSearchChange={setItemGroupSearch}
              groups={filteredItemGroups}
              selectedIds={selectedGroupIds}
              onToggle={toggleAssignment}
              inheritedGroupIds={inheritedGroupIds}
              excludedGroupIds={selectedExcludedGroupIds}
              onToggleExcluded={toggleExclusion}
              reset={resetItemFilters}
              apply={saveAssignments}
              applyLabel="Apply Filters"
              applyBusy={busy === 'assignments'}
              canManage={canManage}
              disabled={!canManage || Boolean(busy) || !selectedItemId}
              emptySelectorText="No items found"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
