import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { createPortal } from 'react-dom';
import { ArrowUpDown, Check, CircleSlash, FolderPlus, GripVertical, Loader2, Pencil, RefreshCcw, Tags, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PosTableActionButton from './PosTableActionButton.jsx';
import PosFnbSelect from './PosFnbSelect.jsx';
import PosSearchField from './PosSearchField.jsx';
import {
  createFolder,
  deleteFolder,
  getFolders,
  reorderFolders,
  updateFolder
} from '@/services/itemService.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';

function PosCategoryCard({ folder, position, total, reorderEnabled, actionsDisabled, onEdit, onLifecycleAction }) {
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableNodeRef,
    setActivatorNodeRef,
    isDragging
  } = useDraggable({ id: folder.folder_id, disabled: !reorderEnabled });
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({ id: folder.folder_id, disabled: !reorderEnabled });
  const setNodeRef = useCallback((node) => {
    setDraggableNodeRef(node);
    setDroppableNodeRef(node);
  }, [setDraggableNodeRef, setDroppableNodeRef]);
  const handleDragProps = reorderEnabled ? { ...listeners, ...attributes } : {};

  return (
    <div
      ref={setNodeRef}
      data-testid={`pos-category-card-${folder.folder_id}`}
      className={`pos-categories-mobile-card box-border flex min-w-0 flex-col gap-2 rounded-xl border bg-white p-3 shadow-none transition-colors sm:flex-row sm:items-center sm:justify-between ${folder.is_active ? '' : 'bg-slate-50'} ${isOver ? 'border-[#1A4E8D] ring-2 ring-blue-100' : 'border-slate-300'} ${isDragging ? 'relative z-10 opacity-70' : ''}`}
    >
      <div className="flex min-w-0 items-start gap-3 sm:flex-1">
        {reorderEnabled ? (
          <>
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...handleDragProps}
              aria-label={`Reorder ${folder.name}, priority ${position} of ${total}`}
              title={`Priority ${position}. Drag or use the keyboard to change category order.`}
              className="pos-category-priority-handle mt-0.5 grid h-11 w-11 shrink-0 touch-none place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-[#1A4E8D] hover:bg-blue-50 hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-2 active:cursor-grabbing enabled:cursor-grab"
            >
              <GripVertical className="h-5 w-5" aria-hidden="true" />
            </button>
            <span aria-hidden="true" className="mt-1 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 px-1.5 text-xs font-bold text-[#1A4E8D]">{position}</span>
          </>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="pos-categories-mobile-card-title break-words text-[14px] font-black leading-5 tracking-tight text-[#0F172A]">{folder.name}</p>
          <p className="pos-categories-mobile-card-description mt-1 break-words text-[10.5px] font-medium leading-4 text-[#64748B]">{folder.description || 'No description provided.'}</p>
          <p className="pos-categories-mobile-card-count mt-1 text-[10.5px] font-bold leading-4 text-[#64748B]">{folder.item_count} Items Assigned</p>
        </div>
      </div>
      <div
        className="pos-categories-mobile-card-actions flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 pt-2 sm:justify-start sm:self-center sm:border-0 sm:pt-0"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <PosTableActionButton
          icon={Pencil}
          onClick={() => onEdit(folder)}
          disabled={actionsDisabled}
          aria-label={`Edit category ${folder.name}`}
          title={`Edit category ${folder.name}`}
        />
        <PosTableActionButton
          icon={CircleSlash}
          tone={folder.is_active ? 'warning' : 'primary'}
          onClick={() => onLifecycleAction({ type: folder.is_active ? 'deactivate' : 'activate', folder })}
          disabled={actionsDisabled}
          aria-label={`${folder.is_active ? 'Deactivate' : 'Activate'} category ${folder.name}`}
          title={`${folder.is_active ? 'Deactivate' : 'Activate'} category ${folder.name}`}
        />
        <PosTableActionButton
          icon={Trash2}
          tone="danger"
          onClick={() => onLifecycleAction({ type: 'delete', folder, replacementFolderId: '' })}
          disabled={actionsDisabled}
          aria-label={`Delete category ${folder.name}`}
          title={folder.item_count > 0 ? 'Delete and reassign assigned items.' : `Delete category ${folder.name}`}
        />
      </div>
    </div>
  );
}

export default function CategoryManagementWorkspace() {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [isReordering, setIsReordering] = useState(false);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [pendingAction, setPendingAction] = useState(null);

  const categorySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const loadFolders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await getFolders();
      setFolders(
        (Array.isArray(response) ? response : [])
          .map((folder, index) => ({
            ...folder,
            folder_id: Number(folder?.folder_id),
            sort_order: Number.isFinite(Number(folder?.sort_order)) ? Number(folder.sort_order) : index,
            name: String(folder?.name || '').trim(),
            description: String(folder?.description || '').trim(),
            item_count: Number(folder?.item_count || 0),
            // #1318 follow-up (ADR 0080 Consequences item 4) — items that list this
            // folder only as a secondary category, invisible to item_count above.
            secondary_item_count: Number(folder?.secondary_item_count || 0),
            is_active: folder?.is_active !== false
          }))
          .filter((folder) => Number.isInteger(folder.folder_id) && folder.folder_id > 0 && folder.name)
          .sort((left, right) => left.sort_order - right.sort_order)
      );
    } catch (loadError) {
      setFolders([]);
      setError(loadError?.response?.data?.message || 'Failed to load categories.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const filteredFolders = useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    return folders.filter((folder) => !normalizedQuery || `${folder.name} ${folder.description}`.toLowerCase().includes(normalizedQuery));
  }, [folders, query]);
  const categoryReorderDisabled = !isReordering || Boolean(query.trim()) || busy || loading;
  const categoryActionsDisabled = Boolean(query.trim()) || busy || loading || isReordering;

  const replacementFolders = useMemo(() => folders
    .filter((folder) => folder.is_active && Number(folder.folder_id) !== Number(pendingAction?.folder?.folder_id))
    .sort((left, right) => left.name.localeCompare(right.name)), [folders, pendingAction?.folder?.folder_id]);

  const openCreate = () => {
    setEditor({ mode: 'create', folder: null });
    setForm({ name: '', description: '' });
  };

  const openEdit = (folder) => {
    setEditor({ mode: 'edit', folder });
    setForm({ name: folder.name, description: folder.description || '' });
  };

  const saveFolder = async () => {
    const name = String(form.name || '').trim();
    const description = String(form.description || '').trim();
    if (!name) {
      toast.error('Category name is required.');
      return;
    }

    setBusy(true);
    try {
      if (editor?.mode === 'edit' && editor.folder?.folder_id) {
        await updateFolder(editor.folder.folder_id, { name, description });
        toast.success('Category updated.');
      } else {
        await createFolder({ name, description });
        toast.success('Category created.');
      }
      setEditor(null);
      await loadFolders({ silent: true });
    } catch (saveError) {
      toast.error(saveError?.response?.data?.message || 'Unable to save this category.');
    } finally {
      setBusy(false);
    }
  };

  const handleCategoryDragEnd = async ({ active, over }) => {
    if (categoryReorderDisabled || !active?.id || !over?.id || String(active.id) === String(over.id)) return;

    const activeIndex = folders.findIndex((folder) => String(folder.folder_id) === String(active.id));
    const overIndex = folders.findIndex((folder) => String(folder.folder_id) === String(over.id));
    if (activeIndex < 0 || overIndex < 0) return;

    const previousFolders = folders;
    const nextFolders = [...folders];
    const [movedFolder] = nextFolders.splice(activeIndex, 1);
    nextFolders.splice(overIndex, 0, movedFolder);
    const orderedFolders = nextFolders.map((folder, index) => ({ ...folder, sort_order: index }));
    setFolders(orderedFolders);
    setBusy(true);
    try {
      await reorderFolders(orderedFolders.map((folder) => folder.folder_id));
      toast.success('Category order saved.');
    } catch (reorderError) {
      if (reorderError?.response?.status === 409) {
        await loadFolders({ silent: true });
        toast.error(reorderError?.response?.data?.message || 'Categories changed elsewhere. The latest order has been loaded.');
      } else {
        setFolders(previousFolders);
        toast.error(reorderError?.response?.data?.message || 'Unable to save the category order. The previous order was restored.');
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmLifecycleAction = async () => {
    const folder = pendingAction?.folder;
    if (!folder?.folder_id) return;
    const replacementFolderId = String(pendingAction?.replacementFolderId || '').trim();
    const replacementFolderIdNumber = Number(replacementFolderId);

    if (pendingAction.type === 'delete' && folder.item_count > 0 && (!Number.isInteger(replacementFolderIdNumber) || replacementFolderIdNumber <= 0)) {
      toast.error('Select an active replacement category before deleting this category.');
      return;
    }

    setBusy(true);
    try {
      if (pendingAction.type === 'delete') {
        const payload = replacementFolderId && Number.isInteger(replacementFolderIdNumber) && replacementFolderIdNumber > 0
          ? { replacement_folder_id: replacementFolderIdNumber }
          : {};
        const result = await deleteFolder(folder.folder_id, payload);
        toast.success(result?.data?.message || 'Category deleted.');
      } else {
        await updateFolder(folder.folder_id, { is_active: pendingAction.type === 'activate' });
        toast.success(pendingAction.type === 'activate' ? 'Category activated.' : 'Category deactivated.');
      }
      setPendingAction(null);
      await loadFolders({ silent: true });
    } catch (actionError) {
      toast.error(actionError?.response?.data?.message || 'Unable to update this category.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-hidden">
      <h2 className="sr-only">Category Management</h2>
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <p id="pos-category-reorder-instructions" className="sr-only">
          When reorder mode is active, focus a category handle and press Space or Enter. Use the arrow keys to move it, then press Space or Enter to place it; Escape cancels. This order controls the Storefront category selector and menu. Products remain alphabetical within each category.
        </p>
        <div className="relative">
          <div className="pos-categories-mobile-toolbar pos-items-mobile-toolbar flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="pos-categories-mobile-search pos-items-mobile-search relative min-w-0 flex-1">
              <PosSearchField
                id="pos-categories-search"
                ariaLabel="Search Categories"
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  if (nextQuery.trim()) setIsReordering(false);
                }}
                onClear={() => setQuery('')}
                inputClassName="h-9"
                placeholder="Search Categories"
              />
            </div>
            <div className="pos-categories-mobile-actions flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={openCreate} disabled={busy || loading || isReordering} aria-pressed={editor?.mode === 'create'} aria-label="Add Categories" title="Add Categories" className={`pos-items-category-add-action pos-items-mobile-icon-button h-9 rounded-lg border-[#1A4E8D] px-3 text-[13px] ${editor?.mode === 'create' ? 'pos-items-mobile-icon-button--active bg-[#1A4E8D] text-white' : 'bg-white text-[#1A4E8D]'}`}>
                <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="pos-categories-mobile-action-label ml-1.5">Add Categories</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsReordering((current) => !current)}
                disabled={Boolean(query.trim()) || busy || loading}
                aria-pressed={isReordering}
                aria-label={busy && isReordering ? 'Saving category order' : isReordering ? 'Done reordering categories' : 'Reorder categories'}
                title={busy && isReordering ? 'Saving category order' : isReordering ? 'Done reordering categories' : 'Reorder categories'}
                className={`pos-items-category-reorder-button pos-items-mobile-icon-button h-9 rounded-lg border-[#1A4E8D] px-3 text-[13px] ${isReordering ? 'pos-items-mobile-icon-button--active bg-[#1A4E8D] text-white hover:bg-[#143F73]' : 'bg-blue-50 text-[#1A4E8D] hover:bg-blue-100'}`}
              >
                {busy && isReordering ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : isReordering ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="pos-categories-mobile-action-label ml-1.5">{busy && isReordering ? 'Saving…' : isReordering ? 'Done reordering' : 'Reorder categories'}</span>
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={() => { setIsReordering(false); loadFolders(); }}
                disabled={loading || busy || isReordering}
                aria-label="Refresh categories"
                title="Refresh categories"
                className="pos-items-category-refresh-button pos-items-mobile-icon-button pos-items-mobile-icon-button--active h-9 w-9 rounded-lg bg-[#1A4E8D] p-0 text-white hover:bg-[#143F73]"
              >
                <RefreshCcw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-2" aria-live="polite" aria-atomic="true">
        {query.trim() ? <p role="status" className="text-xs text-amber-800">Clear the search to reorder the full category list.</p> : null}
      </div>

      <div data-testid="pos-categories-results" className="pos-categories-mobile-results dgfy-pos-scroll-region min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 touch-pan-y">
        <div className="pos-categories-mobile-list space-y-2">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
          ) : loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading categories...</div>
          ) : filteredFolders.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
              <Tags className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 font-bold text-slate-800">No categories found</p>
              <p className="mt-1 text-sm text-slate-500">Create a category before adding POS items.</p>
            </div>
          ) : (
            <DndContext sensors={categorySensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
              <ol aria-label="Storefront category priority order" aria-describedby="pos-category-reorder-instructions" aria-busy={busy && isReordering} className="pos-categories-priority-list grid grid-cols-1 gap-2">
                {filteredFolders.map((folder) => (
                  <li key={folder.folder_id} className="min-w-0">
                    <PosCategoryCard
                      folder={folder}
                      position={folders.findIndex((candidate) => candidate.folder_id === folder.folder_id) + 1}
                      total={folders.length}
                      reorderEnabled={!categoryReorderDisabled}
                      actionsDisabled={categoryActionsDisabled}
                      onEdit={openEdit}
                      onLifecycleAction={setPendingAction}
                    />
                  </li>
                ))}
              </ol>
            </DndContext>
          )}
        </div>
      </div>

      {editor && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/30 px-4 py-6 backdrop-blur-[1px] sm:px-6 lg:px-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-category-editor-title"
          onClick={() => { if (!busy) setEditor(null); }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20" onClick={(event) => event.stopPropagation()}>
            <div className="-mx-px -mt-px flex shrink-0 items-center justify-between gap-3 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D] px-4 py-2.5 text-white sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm ring-1 ring-[#C7DCF3]">
                  <Tags className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="pos-category-editor-title" className="truncate text-sm font-black">Category Details</h2>
                  <p className="mt-0.5 max-w-full break-words text-[10px] leading-3 text-blue-100">Configure category name and catalog description</p>
                </div>
              </div>
              <button type="button" onClick={() => setEditor(null)} disabled={busy} aria-label="Close category details" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-60">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="pos-category-name" className="text-[11px] font-black leading-4 text-[#0F172A]">Category Name <span className="text-rose-500">*</span></Label>
                  <span className="text-[10px] font-medium text-slate-400">Required</span>
                </div>
                <Input id="pos-category-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} disabled={busy} maxLength={100} autoFocus aria-required="true" placeholder="Classic Milk Tea" className="h-10 rounded-lg border-slate-300 px-3 text-sm font-medium placeholder:text-slate-300 focus:border-[#1A4E8D] focus:ring-blue-100" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="pos-category-description" className="text-[11px] font-black leading-4 text-[#0F172A]">Description/Notes</Label>
                  <span className="text-[10px] font-medium text-slate-400">Optional ({String(form.description || '').length}/1000)</span>
                </div>
                <textarea id="pos-category-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} disabled={busy} maxLength={1000} placeholder="Optional description for the category" className="min-h-20 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-5 text-[#0F172A] shadow-sm outline-none placeholder:text-slate-300 focus:border-[#1A4E8D] focus:ring-1 focus:ring-blue-100" />
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={busy} className="h-10 w-full rounded-lg border-[#1A4E8D] px-4 text-xs font-bold text-[#1A4E8D] hover:bg-blue-50">Cancel</Button>
              <Button type="button" onClick={saveFolder} disabled={busy} className="h-10 w-full rounded-lg bg-[#1A4E8D] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#143F73]">{busy ? 'Saving...' : 'Save Category'}</Button>
            </div>
          </div>
        </div>
      ), document.body)}

      {pendingAction && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-category-action-title"
          onClick={() => { if (!busy) setPendingAction(null); }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="pos-category-action-title" className="text-lg font-black text-[#0F172A]">{pendingAction.type === 'delete' ? 'Delete Category' : (pendingAction.type === 'activate' ? 'Activate Category' : 'Deactivate Category')}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {pendingAction.type === 'delete'
                  ? (pendingAction.folder?.item_count > 0
                    ? `Delete ${pendingAction.folder?.name || 'this category'}? Its ${pendingAction.folder.item_count} assigned item(s) must move to another active category first.`
                    : `Delete ${pendingAction.folder?.name || 'this category'}? It has no assigned active items, so no reassignment is required.`)
                  : (pendingAction.type === 'activate'
                    ? `Make ${pendingAction.folder?.name || 'this category'} available again for new POS items?`
                    : `Remove ${pendingAction.folder?.name || 'this category'} from new item selection while retaining existing item assignments?`)}
              </p>
              {pendingAction.type === 'delete' && pendingAction.folder?.secondary_item_count > 0 ? (
                <p className="mt-2 text-sm leading-6 text-amber-700">
                  {pendingAction.folder.secondary_item_count} item(s) also list this as a secondary category and will lose that link — no reassignment is offered for those, since each keeps its primary category elsewhere.
                </p>
              ) : null}
            </div>
            {pendingAction.type === 'delete' && pendingAction.folder?.item_count > 0 ? (
              <div className="space-y-2 px-5 py-4">
                <Label htmlFor="pos-category-replacement">Move assigned items to <span className="font-normal text-slate-400">(required only when items are assigned)</span></Label>
                {replacementFolders.length > 0 ? (
                  <PosFnbSelect
                    id="pos-category-replacement"
                    value={pendingAction.replacementFolderId || ''}
                    options={replacementFolders.map((folder) => ({
                      value: folder.folder_id,
                      label: folder.name
                    }))}
                    onChange={(event) => setPendingAction((current) => ({ ...current, replacementFolderId: event.target.value }))}
                    placeholder="Select an active category"
                    aria-label="Move assigned items to"
                    className="pos-items-category-replacement-select"
                    menuClassName="pos-items-category-replacement-menu"
                    disabled={busy}
                  />
                ) : (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">No active replacement category is available. You can delete this category only when it has no assigned items.</p>
                )}
              </div>
            ) : null}
            <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4">
              <Button
                type="button"
                onClick={confirmLifecycleAction}
                disabled={busy}
                className={`order-1 h-10 w-full rounded-lg font-bold ${pendingAction.type === 'activate' ? 'bg-[#1A4E8D] text-white hover:bg-[#143F73]' : 'bg-rose-600 text-white hover:bg-rose-700'}`}
              >
                {busy ? 'Working...' : (pendingAction.type === 'delete' ? 'Delete Category' : (pendingAction.type === 'activate' ? 'Activate Category' : 'Deactivate Category'))}
              </Button>
              <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={busy} className="order-2 h-10 w-full rounded-lg border-slate-300 font-bold text-slate-700">Cancel</Button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
