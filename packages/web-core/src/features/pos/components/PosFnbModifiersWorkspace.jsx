import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Eye, FolderOpen, ImagePlus, ListChecks, ListPlus, Package, RefreshCcw, RotateCcw, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { GlobalPagination, POS_PAGINATION_FOOTER_CLASS } from '@/components/ui/pagination';
import {
  createFnbModifierGroup,
  listFnbFolderModifierGroups,
  listFnbItemModifierGroups,
  listFnbModifierGroups,
  replaceFnbFolderModifierGroups,
  replaceFnbItemModifierGroups,
  updateFnbModifierGroup
} from '@/src/features/fnb/api/fnbApi.js';
import { fetchPosCatalogPage } from '../services/posService.js';
import { POS_HISTORY_PAGE_SIZE_OPTIONS } from '../utils/posHistoryQuery.js';
import { getFolders } from '@/services/itemService.js';
import PosFnbModifierManager from './PosFnbModifierManager.jsx';
import PosItemImage from './PosItemImage.jsx';
import PosTableSurface from './PosTableSurface.jsx';
import PosSearchField from './PosSearchField.jsx';
import PosFnbStorefrontModifierPreview from './PosFnbStorefrontModifierPreview.jsx';
import PosSubtabNavigation from './PosSubtabNavigation.jsx';
import { PosResponsiveFormDrawer, usePosFormFocusScroll, usePosVisualViewportMetrics, usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import { POS_TOOLBAR_CONTROL_HEIGHT_CLASS } from './posToolbarSizing.js';

const byName = (left, right) => String(left?.name || '').localeCompare(String(right?.name || ''));
const ASSIGNMENT_PAGE_SIZE = 20;
const CATEGORY_PAGE_SIZE = 10;

const sameIds = (left = [], right = []) => left.length === right.length && left.every((value, index) => String(value) === String(right[index]));

const itemAssignmentIds = (assignments = [], itemId, excluded = false) => assignments
  .filter((assignment) => Number(assignment.item_id) === Number(itemId) && (excluded ? assignment.is_excluded === true : assignment.is_excluded !== true))
  .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
  .map((assignment) => String(assignment.modifier_group_id));

const hasEffectiveItemGroup = (assignments, folderAssignments, item, modifierGroupId) => {
  const groupId = String(modifierGroupId);
  const itemRows = assignments.filter((entry) => Number(entry.item_id) === Number(item?.item_id));
  const direct = itemRows.some((entry) => String(entry.modifier_group_id) === groupId && entry.is_excluded !== true);
  if (direct) return true;
  const excluded = itemRows.some((entry) => String(entry.modifier_group_id) === groupId && entry.is_excluded === true);
  if (excluded) return false;
  return folderAssignments.some((entry) => Number(entry.folder_id) === Number(item?.folder_id || item?.folder?.folder_id)
    && String(entry.modifier_group_id) === groupId);
};

function SelectionCheckbox({ checked, indeterminate = false, onChange, disabled = false, ariaLabel }) {
  const checkboxRef = useRef(null);

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      aria-label={ariaLabel}
      aria-checked={indeterminate ? 'mixed' : checked}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#1A4E8D] focus:ring-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function AssignmentEntityTable({
  kind,
  rows,
  total,
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  search,
  onSearchChange,
  onAssign,
  canManage,
  disabled = false,
  selectedId = '',
  assignmentOpen = false,
  showAssignmentButton = false,
  onExpandAssignment,
  selectedTargetIds = [],
  onToggleTarget,
  onToggleVisibleTargets,
  onClearTargetSelection,
  onBulkAssign
}) {
  const viewportMode = usePosViewportMode();
  const useCompactCards = viewportMode !== 'desktop';
  const isCategory = kind === 'category';
  const entityName = isCategory ? 'category' : 'item';
  const selectedTargetSet = new Set(selectedTargetIds.map(String));
  const selectedVisibleCount = rows.filter((row) => selectedTargetSet.has(String(isCategory ? row.folder_id : row.item_id))).length;
  const allVisibleSelected = rows.length > 0 && selectedVisibleCount === rows.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const renderSummary = (row) => isCategory
    ? `${row.assignedGroupCount || 0} option groups configured`
    : `${row.directGroupCount || 0} direct · ${row.inheritedGroupCount || 0} inherited`;
  const renderName = (row) => isCategory ? row.name : row.name || 'Unnamed item';
  const renderDetail = (row) => isCategory
    ? 'Items in this category inherit its groups.'
    : [row.sku || row.item_code, row.folder?.name || row.product_folder].filter(Boolean).join(' · ') || 'No category assigned';
  const renderIdentity = (row, asHeading = false) => {
    const Name = asHeading ? 'h3' : 'p';
    return (
      <div className={isCategory ? 'min-w-0' : 'flex min-w-0 items-center gap-2.5'}>
        {!isCategory ? (
          <div data-testid="pos-fnb-item-thumbnail" className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            <ImagePlus aria-hidden="true" className="h-4 w-4 text-slate-300" />
            <PosItemImage item={row} alt="" sizes="44px" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0">
          <Name className={`${asHeading ? 'text-sm ' : ''}truncate font-black text-[#0F172A]`}>{renderName(row)}</Name>
          <p className="mt-1 truncate text-[10px] text-slate-500">{renderDetail(row)}</p>
        </div>
      </div>
    );
  };

  return (
    <section className="pos-items-options-panel flex min-h-0 min-w-0 flex-1 flex-col max-[767px]:w-full" aria-labelledby={`pos-fnb-${entityName}-assignments-heading`}>
      <div className="flex min-w-0 shrink-0 flex-col gap-3 px-4 py-3 max-[767px]:px-0 sm:flex-row sm:items-end sm:justify-between max-[767px]:w-full">
        <div className="min-w-0">
          <h2 id={`pos-fnb-${entityName}-assignments-heading`} className="mt-1 text-sm font-black text-[#0F172A]">{isCategory ? 'Category assignments' : 'Item assignments'}</h2>
          <p className="mt-1 hidden text-xs leading-5 text-[#64748B] min-[1200px]:block">{isCategory ? 'Groups assigned here are inherited by items in the category.' : 'Review direct and inherited groups for each item.'}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:w-[min(100%,30rem)] max-[767px]:w-full">
          {showAssignmentButton ? <Button type="button" variant="outline" onClick={onExpandAssignment} aria-label="Show form" title="Show form" className="h-10 w-10 shrink-0 rounded-full border-slate-200 bg-slate-100 p-0 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></Button> : null}
          <PosSearchField
            ariaLabel={`Search ${isCategory ? 'categories' : 'items'}`}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onClear={() => onSearchChange('')}
            placeholder={`Search ${isCategory ? 'categories' : 'items'}...`}
            disabled={disabled}
            inputClassName={POS_TOOLBAR_CONTROL_HEIGHT_CLASS}
            className="min-w-0 flex-1"
          />
        </div>
      </div>

      {canManage && selectedTargetIds.length > 0 ? (
        <div className="mb-2 flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2" role="status" aria-live="polite">
          <p className="text-xs font-bold text-[#17477F]">{selectedTargetIds.length} {isCategory ? 'categories' : 'items'} selected</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" onClick={onBulkAssign} disabled={disabled} className="h-9 rounded-lg bg-[#1A4E8D] px-3 text-xs font-bold text-white hover:bg-[#143F73]">
              Assign groups to {selectedTargetIds.length} {isCategory ? 'categories' : 'items'}
            </Button>
            <Button type="button" variant="outline" onClick={onClearTargetSelection} disabled={disabled} className="h-9 rounded-lg border-rose-200 bg-[#fff1f2]/70 px-3 text-xs font-bold text-[#9f1239] hover:bg-[#fff1f2] hover:text-[#9f1239]">Clear selection</Button>
          </div>
        </div>
      ) : null}

      <PosTableSurface data-testid="pos-fnb-assignment-table-surface" className="pos-items-options-assignment-table-surface flex min-h-0 flex-1 flex-col max-[767px]:w-full max-[767px]:rounded-none max-[767px]:border-0 max-[767px]:shadow-none">
        <div data-testid="pos-fnb-assignment-table-scroll-region" className="dgfy-pos-scroll-region min-h-0 flex-1 overflow-auto max-[767px]:w-full">
          {rows.length ? useCompactCards ? (
            <div className="space-y-2 p-3 max-[767px]:w-full max-[767px]:px-0">
              {rows.map((row) => {
                const id = String(isCategory ? row.folder_id : row.item_id);
                const isAssignmentTarget = assignmentOpen && id === String(selectedId);
                return (
                  <article key={id} className={`min-w-0 rounded-xl border p-3 ${isAssignmentTarget ? 'border-[#8AA8CD] bg-blue-50/70' : 'border-slate-200 bg-white'}`}>
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        {canManage ? <SelectionCheckbox ariaLabel={`Select ${entityName} ${renderName(row)}`} checked={selectedTargetSet.has(id)} disabled={disabled} onChange={(event) => onToggleTarget(row, event.target.checked)} /> : null}
                        <div className="min-w-0 flex-1">{renderIdentity(row, true)}</div>
                      </div>
                      {!isCategory ? <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${row.is_active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{row.is_active === false ? 'Inactive' : 'Active'}</span> : null}
                    </div>
                    <p className="mt-3 text-xs font-semibold text-slate-700">{renderSummary(row)}</p>
                    <button type="button" onClick={() => onAssign(row)} disabled={disabled} aria-label={canManage ? 'Assign groups' : 'View groups'} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#1A4E8D] bg-white px-3 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
                      {canManage ? <ListPlus className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}{canManage ? 'Assign' : 'View groups'}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-[1] bg-[#F2F7FD] text-[11px] font-bold text-[#17477F]">
                <tr>
                  {canManage ? <th scope="col" className="w-10 px-3 py-3"><SelectionCheckbox ariaLabel={`Select all ${isCategory ? 'categories' : 'items'} on this page`} checked={allVisibleSelected} indeterminate={someVisibleSelected} disabled={disabled || !rows.length} onChange={(event) => onToggleVisibleTargets(rows, event.target.checked)} /></th> : null}
                  <th scope="col" className="px-4 py-3">{isCategory ? 'Category' : 'Item'}</th>
                  <th scope="col" className="px-4 py-3">{isCategory ? 'Configured groups' : 'Effective groups'}</th>
                  {!isCategory ? <th scope="col" className="px-4 py-3">Status</th> : null}
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const id = String(isCategory ? row.folder_id : row.item_id);
                  const isAssignmentTarget = assignmentOpen && id === String(selectedId);
                  return (
                    <tr key={id} className={`border-t border-slate-100 ${isAssignmentTarget ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'}`}>
                      {canManage ? <td className="w-10 px-3 py-3"><SelectionCheckbox ariaLabel={`Select ${entityName} ${renderName(row)}`} checked={selectedTargetSet.has(id)} disabled={disabled} onChange={(event) => onToggleTarget(row, event.target.checked)} /></td> : null}
                      <td className="max-w-[24rem] px-4 py-3">{renderIdentity(row)}</td>
                      <td className="px-4 py-3 text-slate-700">{renderSummary(row)}</td>
                      {!isCategory ? <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.is_active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{row.is_active === false ? 'Inactive' : 'Active'}</span></td> : null}
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => onAssign(row)} disabled={disabled} aria-label={canManage ? 'Assign groups' : 'View groups'} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#1A4E8D] bg-white px-3 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
                          {canManage ? <ListPlus className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}{canManage ? 'Assign' : 'View groups'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="m-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <p className="text-sm font-bold text-slate-700">No {isCategory ? 'categories' : 'items'} found</p>
              <p className="mt-1 text-xs text-slate-500">Try another search or check that the catalog has {isCategory ? 'categories' : 'items'}.</p>
            </div>
          )}
        </div>
      </PosTableSurface>

      <GlobalPagination
        testId={`pos-fnb-${entityName}-assignment-pagination`}
        ariaLabel={`${isCategory ? 'Category' : 'Item'} assignment pagination`}
        currentPage={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={pageSize}
        pageSizeOptions={POS_HISTORY_PAGE_SIZE_OPTIONS}
        pageSizeLabel={`${isCategory ? 'Categories' : 'Items'} per page`}
        pageInputLabel={`Go to ${entityName} page`}
        previousLabel={`Previous ${entityName} page`}
        nextLabel={`Next ${entityName} page`}
        itemLabel={isCategory ? 'categories' : 'items'}
        hidePageSizeSuffixOnMobile
        disabled={disabled}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        className={`${POS_PAGINATION_FOOTER_CLASS} mt-3 max-[767px]:mt-0`}
      />
    </section>
  );
}

function AssignmentPanel({
  title,
  description,
  panelId,
  leadingIcon,
  searchLabel,
  searchValue,
  onSearchChange,
  groups,
  selectedIds,
  groupSelectionStates = null,
  selectionTargetLabel = '',
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
  totalGroupCount = 0,
  inactiveGroupCount = 0,
  showInactive = false,
  onToggleShowInactive,
  hasUnsavedChanges = false,
  hasInvalidSelection = false,
  invalidSelectionMessage = '',
  isOverlayViewport = false,
  onClose,
  onCollapse,
  closeDisabled = false,
  notice = '',
  children
}) {
  const Icon = leadingIcon || Package;
  const viewportMetrics = usePosVisualViewportMetrics(isOverlayViewport);
  const { formBodyRef, handleFocusCapture } = usePosFormFocusScroll(isOverlayViewport);
  const panelHeadingId = `${panelId}-heading`;
  const panelDescriptionId = `${panelId}-description`;
  const searchId = `${panelId}-search`;
  const panelClassName = isOverlayViewport
    ? 'relative z-auto flex h-auto max-h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-[0_-12px_30px_rgba(0,0,0,0.16)]'
    : 'relative z-auto flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] min-[1200px]:overflow-visible min-[1200px]:min-h-[34rem] min-[1200px]:rounded-2xl min-[1200px]:border min-[1200px]:border-slate-200';

  return (
    <aside role={isOverlayViewport ? 'dialog' : undefined} aria-modal={isOverlayViewport ? 'true' : undefined} aria-labelledby={panelHeadingId} aria-describedby={panelDescriptionId} className={panelClassName}>
      <Button type="button" variant="ghost" onClick={onClose} disabled={closeDisabled} aria-label="Close assignment form" title="Close assignment form" className="absolute left-3 top-3 z-10 h-9 w-9 rounded-full p-0 text-slate-700 hover:bg-slate-100 hover:text-slate-950 min-[1200px]:hidden">
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </Button>
      <Button type="button" variant="outline" onClick={onCollapse} disabled={closeDisabled} aria-label="Hide form" title="Hide form" className="absolute right-4 top-4 z-10 hidden h-8 w-8 rounded-full border-slate-200 bg-slate-100 p-0 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950 min-[1200px]:left-[-1rem] min-[1200px]:right-auto min-[1200px]:top-1/2 min-[1200px]:-translate-y-1/2 min-[1200px]:flex">
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </Button>

      <div className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="min-w-0 pl-10 text-center min-[1200px]:flex min-[1200px]:items-center min-[1200px]:gap-3 min-[1200px]:pl-0 min-[1200px]:pr-10 min-[1200px]:text-left">
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 min-[1200px]:flex"><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 id={panelHeadingId} className="text-[16px] font-extrabold text-slate-950">{title}</h2>
            <p id={panelDescriptionId} className="mx-auto mt-0.5 max-w-[18rem] text-[11px] font-medium leading-4 text-slate-500 min-[1200px]:mx-0 min-[1200px]:max-w-none">{description}</p>
            {selectionTargetLabel || hasUnsavedChanges ? (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-bold min-[1200px]:justify-start">
                {selectionTargetLabel ? <span className="rounded-full bg-blue-100 px-2 py-1 text-[#17477F]">{selectionTargetLabel}</span> : null}
                {hasUnsavedChanges ? <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Unsaved changes</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={formBodyRef} onFocusCapture={handleFocusCapture} style={viewportMetrics ? { maxHeight: `${viewportMetrics.formBodyMaxHeight}px` } : undefined} data-testid={`${panelId}-editor-scroll`} className={isOverlayViewport ? 'pos-items-options-assignment-body min-h-0 max-h-[calc(100vh-10rem)] max-h-[calc(100dvh-10rem)] flex-none overflow-y-auto overscroll-contain px-5 py-5 sm:px-6' : 'pos-items-options-assignment-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6'}>
        <div className="space-y-3">
          {notice ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-900">{notice}</p> : null}
          <div className="space-y-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <label htmlFor={searchId} className="min-w-0 flex-1 text-[10px] font-bold text-[#334155]">{searchLabel}</label>
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-slate-600">{selectedIds.length} selected</span>
            </div>
            <PosSearchField id={searchId} ariaLabel={searchLabel} value={searchValue} onChange={(event) => onSearchChange(event.target.value)} onClear={() => onSearchChange('')} placeholder={searchLabel} disabled={disabled} inputClassName="h-9" />
          </div>

          {inactiveGroupCount > 0 && onToggleShowInactive ? (
            <label className="inline-flex min-h-8 items-center gap-2 text-[11px] font-semibold text-slate-600">
              <input type="checkbox" checked={showInactive} onChange={(event) => onToggleShowInactive(event.target.checked)} disabled={disabled} className="h-4 w-4 rounded border-slate-300 text-[#1A4E8D]" />
              Show inactive groups ({inactiveGroupCount})
            </label>
          ) : null}

          <div data-testid={`${panelId}-groups-list`} className="pos-items-options-list pos-items-options-assignment-list dgfy-pos-scroll-region max-h-48 space-y-1 overflow-y-auto pr-1">
            {groups.map((group) => {
              const groupId = String(group.modifier_group_id);
              const groupName = group.display_name || group.name || 'Unnamed option group';
              const inactive = group.is_active === false;
              const selectionState = groupSelectionStates?.[groupId] || (selectedIds.includes(groupId) ? 'checked' : 'unchecked');
              const selected = selectionState === 'checked';
              return (
                <label key={group.modifier_group_id} className={['pos-items-options-option-row flex min-h-9 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors', inactive ? 'border-amber-200 bg-amber-50/70 text-amber-950' : 'border-slate-300 bg-white text-[#0F172A] hover:border-[#8AA8CD] hover:shadow-[0_4px_12px_rgba(148,163,184,0.08)]'].join(' ')}>
                  <SelectionCheckbox
                    ariaLabel={groupName}
                    checked={selected}
                    indeterminate={selectionState === 'mixed'}
                    onChange={(event) => onToggle(groupId, inactive && selectionState === 'mixed' ? false : event.target.checked)}
                    disabled={disabled || !canManage || (inactive && selectionState === 'unchecked')}
                  />
                  <span className="min-w-0 flex-1 truncate">{groupName}</span>
                  {inactive ? <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800">Inactive</span> : null}
                  <span className="shrink-0 text-[10px] font-bold text-[#64748B]">{(group.options || []).length} options</span>
                </label>
              );
            })}
            {inheritedGroupIds.length > 0 && onToggleExcluded ? (
              <div className="space-y-1 border-t border-slate-200 pt-2">
                <p className="px-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Inherited from category</p>
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
            {!groups.length ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500">{totalGroupCount ? 'No active option groups match this search.' : 'No option groups found. Create one in Option Groups first.'}</p> : null}
          </div>

          {hasInvalidSelection ? (
            <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{invalidSelectionMessage || 'Remove inactive groups before saving.'}</span>
            </p>
          ) : null}
          {children}
        </div>
      </div>

      {canManage ? (
        <div className="pos-items-options-actions sticky bottom-0 grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:px-6">
          <Button type="button" variant="outline" onClick={reset} disabled={disabled} className="pos-items-reset-action h-10 min-w-0 rounded-lg px-2 text-[13px] font-bold hover:bg-[#fff1f2] hover:text-[#9f1239]">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Discard changes
          </Button>
          <Button type="button" onClick={apply} disabled={disabled || !hasUnsavedChanges || hasInvalidSelection} className="h-10 min-w-0 rounded-lg bg-[#1A4E8D] px-2 text-[13px] font-bold text-white hover:bg-[#143F73]">
            {applyBusy ? 'Saving…' : applyLabel}
          </Button>
        </div>
      ) : (
        <div className="sticky bottom-0 flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
          <p role="status" className="text-[11px] leading-4 text-slate-600">You can review assignments, but your role cannot change them.</p>
          <Button type="button" variant="outline" onClick={onClose} disabled={closeDisabled} className="shrink-0">Close</Button>
        </div>
      )}
    </aside>
  );
}

function EffectiveOptionsPreview({
  item,
  operatingLocationId,
  groups,
  inheritedGroupIds = [],
  selectedGroupIds = [],
  selectedExcludedGroupIds = [],
  hasUnsavedChanges = false
}) {
  const groupById = new Map(groups.map((group) => [String(group.modifier_group_id), group]));
  const excluded = new Set(selectedExcludedGroupIds);
  const direct = selectedGroupIds.map((id) => groupById.get(String(id))).filter(Boolean);
  const inherited = inheritedGroupIds
    .filter((id) => !excluded.has(String(id)) && !selectedGroupIds.includes(String(id)))
    .map((id) => groupById.get(String(id)))
    .filter(Boolean);
  const effectiveGroups = [...inherited, ...direct];

  return (
    <section className="min-w-0 rounded-xl border border-[#C9D9EC] bg-[#F8FBFF] p-3 sm:p-4" aria-labelledby="pos-fnb-effective-options-heading">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm">
          <Eye className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1A4E8D]">Preview</p>
          <h2 id="pos-fnb-effective-options-heading" className="mt-1 break-words text-sm font-black text-[#0F172A]">What appears at checkout</h2>
          <p className="mt-1 text-xs leading-5 text-[#64748B]">{item ? String(item.name || '') + ' uses these effective option groups.' : 'Select an item to preview its effective options.'}</p>
        </div>
      </div>

      {hasUnsavedChanges ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-900">Preview includes unsaved assignment changes.</p> : null}

      {effectiveGroups.length ? (
        <PosFnbStorefrontModifierPreview
          key={`${item?.item_id || 'item'}:${operatingLocationId ?? 'location'}:${effectiveGroups.map((group) => `${group.modifier_group_id}-${(group.options || []).map((option) => option.modifier_option_id).join(',')}`).join('|')}`}
          groups={effectiveGroups}
          operatingLocationId={operatingLocationId}
        />
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-500">No effective option groups are assigned to this item yet.</p>
      )}
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
  const viewportMode = usePosViewportMode();
  const isOverlayViewport = viewportMode !== 'desktop';
  const [activeView, setActiveView] = useState('groups');
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentCollapsed, setAssignmentCollapsed] = useState(false);
  const [assignmentType, setAssignmentType] = useState('category');
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [folderAssignments, setFolderAssignments] = useState([]);
  const [savedFolderAssignments, setSavedFolderAssignments] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedFolderTargetIds, setSelectedFolderTargetIds] = useState([]);
  const [selectedItemTargetIds, setSelectedItemTargetIds] = useState([]);
  const [selectedItemRecords, setSelectedItemRecords] = useState({});
  const [bulkAssignmentDraft, setBulkAssignmentDraft] = useState(null);
  const [bulkSaveNotice, setBulkSaveNotice] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [selectedExcludedGroupIds, setSelectedExcludedGroupIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [modifierEditorOpen, setModifierEditorOpen] = useState(false);
  const [error, setError] = useState('');
  const [folderGroupSearch, setFolderGroupSearch] = useState('');
  const [itemGroupSearch, setItemGroupSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const deferredItemSearch = useDeferredValue(itemSearch);
  const [categoryPage, setCategoryPage] = useState(1);
  const [categoryPageSize, setCategoryPageSize] = useState(CATEGORY_PAGE_SIZE);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(ASSIGNMENT_PAGE_SIZE);
  const [itemPagination, setItemPagination] = useState({ page: 1, page_size: ASSIGNMENT_PAGE_SIZE, total: 0, total_pages: 1 });
  const [showInactiveGroups, setShowInactiveGroups] = useState(false);
  const scopedCatalogCache = useRef(new Map());
  const workspaceReadSequence = useRef(0);
  const workspaceRefreshInFlight = useRef(false);
  const backgroundRefreshAllowedRef = useRef(false);

  const loadWorkspace = useCallback(async ({ silent = false, background = false } = {}) => {
    if (background && workspaceRefreshInFlight.current) return;
    const sequence = ++workspaceReadSequence.current;
    if (!isOnline) {
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError('');
    }
    const scopedLocationId = Number(operatingLocationId || 0);
    const hasLocationId = Number.isInteger(scopedLocationId) && scopedLocationId > 0;
    const availableLocations = Array.isArray(locations) ? locations : [];
    const hasAuthorizedLocation = hasLocationId && (
      availableLocations.length === 0
      || availableLocations.some((location) => Number(location?.location_id) === scopedLocationId)
    );
    const hasValidLocation = !locationsLoading && hasAuthorizedLocation;
    const catalogCacheKey = JSON.stringify([scopedLocationId, itemPage, itemPageSize, deferredItemSearch]);
    const cachedCatalog = hasValidLocation
      ? scopedCatalogCache.current.get(catalogCacheKey)
      : null;

    if (!hasValidLocation) {
      if (background) return;
      setItems([]);
      setFolders([]);
      setSelectedItemId('');
      setSelectedFolderId('');
      setLoading(locationsLoading);
      setError(locationsLoading ? '' : 'Select an authorized location to load item options.');
      return;
    }

    if (background) workspaceRefreshInFlight.current = true;
    try {
      const [groupPayload, assignmentPayload, folderAssignmentPayload, folderPayload, catalogPayload] = await Promise.all([
        listFnbModifierGroups({ include_inactive: true }),
        listFnbItemModifierGroups(),
        listFnbFolderModifierGroups(),
        getFolders(),
        fetchPosCatalogPage({
          search: deferredItemSearch,
          page: itemPage,
          page_size: itemPageSize,
          category_filter: 'all',
          stock_filter: 'all',
          location_id: scopedLocationId
        })
      ]);
      if (workspaceReadSequence.current !== sequence) return;
      if (background && (document.visibilityState !== 'visible' || !backgroundRefreshAllowedRef.current)) return;
      const nextGroups = Array.isArray(groupPayload?.modifier_groups) ? groupPayload.modifier_groups : [];
      const nextAssignments = Array.isArray(assignmentPayload?.item_modifier_groups) ? assignmentPayload.item_modifier_groups : [];
      const nextFolderAssignments = Array.isArray(folderAssignmentPayload?.folder_modifier_groups) ? folderAssignmentPayload.folder_modifier_groups : [];
      const nextItems = (Array.isArray(catalogPayload?.items) ? catalogPayload.items : []).slice().sort(byName);
      const nextFolders = (Array.isArray(folderPayload) ? folderPayload : Array.isArray(folderPayload?.folders) ? folderPayload.folders : [])
        .map((folder) => ({ ...folder, name: String(folder.name || folder.folder_name || `Category ${folder.folder_id}`) }))
        .filter((folder) => Number.isInteger(Number(folder.folder_id)) && Number(folder.folder_id) > 0)
        .sort(byName);
      const nextPagination = catalogPayload?.pagination || { page: itemPage, page_size: itemPageSize, total: nextItems.length, total_pages: 1 };
      setError('');
      setGroups(nextGroups);
      setAssignments(nextAssignments);
      setFolderAssignments(nextFolderAssignments);
      setSavedFolderAssignments(nextFolderAssignments);
      setItems(nextItems);
      setFolders(nextFolders);
      setItemPagination(nextPagination);
      scopedCatalogCache.current.set(catalogCacheKey, { items: nextItems, folders: nextFolders, pagination: nextPagination });
      setSelectedItemId((current) => (nextItems.some((item) => String(item.item_id) === String(current)) ? current : String(nextItems[0]?.item_id || '')));
      setSelectedFolderId((current) => (nextFolders.some((folder) => String(folder.folder_id) === String(current)) ? current : String(nextFolders[0]?.folder_id || '')));
    } catch (loadError) {
      if (workspaceReadSequence.current !== sequence) return;
      if (silent) return;
      if (cachedCatalog) {
        setItems(cachedCatalog.items);
        setFolders(cachedCatalog.folders);
        setItemPagination(cachedCatalog.pagination || { page: itemPage, page_size: itemPageSize, total: cachedCatalog.items.length, total_pages: 1 });
        setError('');
      } else {
        setItems([]);
        setFolders([]);
        setError(loadError?.response?.data?.message || 'Unable to load F&B item options in POS.');
      }
    } finally {
      if (workspaceReadSequence.current === sequence && !silent) setLoading(false);
      if (background) workspaceRefreshInFlight.current = false;
    }
  }, [deferredItemSearch, isOnline, itemPage, itemPageSize, locations, locationsLoading, operatingLocationId]);

  useEffect(() => {
    loadWorkspace();
    return () => {
      workspaceReadSequence.current += 1;
    };
  }, [loadWorkspace]);

  useEffect(() => {
    if (!isOnline) return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'visible' || !backgroundRefreshAllowedRef.current) return;
      void loadWorkspace({ silent: true, background: true });
    };
    const intervalId = window.setInterval(refreshIfVisible, 60_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('online', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('online', refreshIfVisible);
    };
  }, [isOnline, loadWorkspace]);

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

  useEffect(() => {
    if (!selectedItemTargetIds.length) return;
    setSelectedItemRecords((current) => {
      let changed = false;
      const next = { ...current };
      items.forEach((item) => {
        const itemId = String(item.item_id);
        if (selectedItemTargetIds.includes(itemId) && next[itemId] !== item) {
          next[itemId] = item;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [items, selectedItemTargetIds]);

  const selectedItem = useMemo(() => items.find((item) => String(item.item_id) === String(selectedItemId)) || null, [items, selectedItemId]);

  const selectedFolderGroupIds = useMemo(() => folderAssignments
    .filter((assignment) => Number(assignment.folder_id) === Number(selectedFolderId))
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
    .map((assignment) => String(assignment.modifier_group_id)), [folderAssignments, selectedFolderId]);

  const inheritedGroupIds = useMemo(() => selectedItem?.folder_id
    ? folderAssignments.filter((assignment) => Number(assignment.folder_id) === Number(selectedItem.folder_id)).map((assignment) => String(assignment.modifier_group_id))
    : [], [folderAssignments, selectedItem]);

  const savedFolderGroupIds = useMemo(() => savedFolderAssignments
    .filter((assignment) => Number(assignment.folder_id) === Number(selectedFolderId))
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
    .map((assignment) => String(assignment.modifier_group_id)), [savedFolderAssignments, selectedFolderId]);
  const savedItemGroupIds = useMemo(() => itemAssignmentIds(assignments, selectedItemId), [assignments, selectedItemId]);
  const savedExcludedGroupIds = useMemo(() => itemAssignmentIds(assignments, selectedItemId, true), [assignments, selectedItemId]);
  const folderAssignmentsDirty = !sameIds(selectedFolderGroupIds, savedFolderGroupIds);
  const itemAssignmentsDirty = !sameIds(selectedGroupIds, savedItemGroupIds) || !sameIds(selectedExcludedGroupIds, savedExcludedGroupIds);
  backgroundRefreshAllowedRef.current = !loading
    && !busy
    && !assignmentOpen
    && !folderAssignmentsDirty
    && !itemAssignmentsDirty
    && !modifierEditorOpen;
  const groupById = useMemo(() => new Map(groups.map((group) => [String(group.modifier_group_id), group])), [groups]);
  const inactiveGroupCount = groups.filter((group) => group.is_active === false).length;
  const folderHasInactiveSelection = selectedFolderGroupIds.some((groupId) => groupById.get(groupId)?.is_active === false);
  const itemHasInactiveSelection = [...selectedGroupIds, ...selectedExcludedGroupIds].some((groupId) => groupById.get(groupId)?.is_active === false);

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

  const assignedItemsByGroup = useMemo(() => assignments.reduce((result, assignment) => {
    if (assignment.is_excluded === true) return result;
    const key = String(assignment.modifier_group_id);
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {}), [assignments]);

  const filteredCategories = useMemo(() => {
    const normalized = categorySearch.trim().toLowerCase();
    return folders.filter((folder) => !normalized || String(folder.name || '').toLowerCase().includes(normalized));
  }, [categorySearch, folders]);
  const categoryTotalPages = Math.max(1, Math.ceil(filteredCategories.length / categoryPageSize));
  const visibleCategories = filteredCategories.slice((categoryPage - 1) * categoryPageSize, categoryPage * categoryPageSize).map((folder) => ({
    ...folder,
    assignedGroupCount: folderAssignments.filter((assignment) => Number(assignment.folder_id) === Number(folder.folder_id)).length
  }));

  const itemRows = useMemo(() => items.map((item) => {
    const direct = itemAssignmentIds(assignments, item.item_id);
    const excluded = new Set(itemAssignmentIds(assignments, item.item_id, true));
    const inherited = folderAssignments
      .filter((assignment) => Number(assignment.folder_id) === Number(item.folder_id || item?.folder?.folder_id))
      .map((assignment) => String(assignment.modifier_group_id));
    return {
      ...item,
      directGroupCount: direct.length,
      inheritedGroupCount: inherited.filter((id) => !excluded.has(id) && !direct.includes(id)).length
    };
  }), [assignments, folderAssignments, items]);

  const bulkTargetHasGroup = (kind, targetId, modifierGroupId) => {
    if (kind === 'category') {
      return folderAssignments.some((entry) => Number(entry.folder_id) === Number(targetId)
        && String(entry.modifier_group_id) === String(modifierGroupId));
    }
    const item = selectedItemRecords[String(targetId)] || items.find((entry) => String(entry.item_id) === String(targetId));
    return hasEffectiveItemGroup(assignments, folderAssignments, item, modifierGroupId);
  };

  const getBulkGroupState = (kind, targetIds, modifierGroupId) => {
    if (!targetIds.length) return 'unchecked';
    const assignedCount = targetIds.filter((targetId) => bulkTargetHasGroup(kind, targetId, modifierGroupId)).length;
    if (assignedCount === targetIds.length) return 'checked';
    return assignedCount > 0 ? 'mixed' : 'unchecked';
  };

  const bulkGroupSelectionStates = bulkAssignmentDraft
    ? groups.reduce((result, group) => {
      const groupId = String(group.modifier_group_id);
      result[groupId] = Object.prototype.hasOwnProperty.call(bulkAssignmentDraft.groupStates, groupId)
        ? (bulkAssignmentDraft.groupStates[groupId] ? 'checked' : 'unchecked')
        : getBulkGroupState(bulkAssignmentDraft.kind, bulkAssignmentDraft.targetIds, groupId);
      return result;
    }, {})
    : null;

  const bulkChangedGroupIds = bulkAssignmentDraft
    ? Object.entries(bulkAssignmentDraft.groupStates)
      .filter(([groupId, desired]) => getBulkGroupState(bulkAssignmentDraft.kind, bulkAssignmentDraft.targetIds, groupId) !== (desired ? 'checked' : 'unchecked'))
      .map(([groupId]) => groupId)
    : [];
  const bulkAssignmentDirty = bulkChangedGroupIds.length > 0;
  const bulkHasInactiveSelection = bulkChangedGroupIds.some((groupId) => bulkAssignmentDraft?.groupStates[groupId] === true
    && groupById.get(groupId)?.is_active === false);

  const filteredFolderGroups = useMemo(() => {
    const normalized = folderGroupSearch.trim().toLowerCase();
    const selected = new Set(selectedFolderGroupIds);
    return groups.filter((group) => {
      const selectedInBulk = bulkAssignmentDraft?.kind === 'category'
        && bulkAssignmentDraft.targetIds.some((targetId) => folderAssignments.some((entry) => Number(entry.folder_id) === Number(targetId)
          && String(entry.modifier_group_id) === String(group.modifier_group_id)));
      const isVisible = showInactiveGroups || group.is_active !== false || selected.has(String(group.modifier_group_id)) || selectedInBulk;
      return isVisible && (!normalized || String(group.display_name || group.name || '').toLowerCase().includes(normalized));
    });
  }, [bulkAssignmentDraft, folderAssignments, folderGroupSearch, groups, selectedFolderGroupIds, showInactiveGroups]);

  const filteredItemGroups = useMemo(() => {
    const normalized = itemGroupSearch.trim().toLowerCase();
    const selected = new Set([...selectedGroupIds, ...selectedExcludedGroupIds, ...inheritedGroupIds]);
    return groups.filter((group) => {
      const selectedInBulk = bulkAssignmentDraft?.kind === 'item'
        && bulkAssignmentDraft.targetIds.some((targetId) => {
          const item = selectedItemRecords[String(targetId)] || items.find((entry) => String(entry.item_id) === String(targetId));
          return hasEffectiveItemGroup(assignments, folderAssignments, item, group.modifier_group_id);
        });
      const isVisible = showInactiveGroups || group.is_active !== false || selected.has(String(group.modifier_group_id)) || selectedInBulk;
      return isVisible && (!normalized || String(group.display_name || group.name || '').toLowerCase().includes(normalized));
    });
  }, [assignments, bulkAssignmentDraft, folderAssignments, groups, inheritedGroupIds, itemGroupSearch, items, selectedExcludedGroupIds, selectedGroupIds, selectedItemRecords, showInactiveGroups]);

  const runMutation = async (key, action, successMessage) => {
    setBusy(key);
    try {
      await action();
      await loadWorkspace({ silent: true });
      toast.success(successMessage);
      return true;
    } catch (mutationError) {
      toast.error(mutationError?.response?.data?.message || 'Unable to save item option changes.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const toggleTargetSelection = (kind, row, checked) => {
    const isCategory = kind === 'category';
    const targetId = String(isCategory ? row.folder_id : row.item_id);
    const setTargetIds = isCategory ? setSelectedFolderTargetIds : setSelectedItemTargetIds;
    setTargetIds((current) => checked
      ? [...new Set([...current, targetId])]
      : current.filter((id) => id !== targetId));
    if (!isCategory) {
      setSelectedItemRecords((current) => {
        if (checked) return { ...current, [targetId]: row };
        const next = { ...current };
        delete next[targetId];
        return next;
      });
    }
  };

  const toggleVisibleTargetSelection = (kind, rows, checked) => {
    const isCategory = kind === 'category';
    const targetIds = rows.map((row) => String(isCategory ? row.folder_id : row.item_id));
    const setTargetIds = isCategory ? setSelectedFolderTargetIds : setSelectedItemTargetIds;
    setTargetIds((current) => checked
      ? [...new Set([...current, ...targetIds])]
      : current.filter((id) => !targetIds.includes(id)));
    if (!isCategory) {
      setSelectedItemRecords((current) => {
        const next = { ...current };
        rows.forEach((row) => {
          const targetId = String(row.item_id);
          if (checked) next[targetId] = row;
          else delete next[targetId];
        });
        return next;
      });
    }
  };

  const clearTargetSelection = (kind) => {
    if (kind === 'category') setSelectedFolderTargetIds([]);
    else {
      setSelectedItemTargetIds([]);
      setSelectedItemRecords({});
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

  const folderPayloadForBulkTarget = (folderId, changes) => {
    const nextRows = folderAssignments
      .filter((entry) => Number(entry.folder_id) === Number(folderId))
      .map((entry) => ({ ...entry }));
    let nextSortOrder = nextRows.reduce((maximum, entry) => Math.max(maximum, Number(entry.sort_order) || 0), -1) + 1;

    changes.forEach(([modifierGroupId, shouldAssign]) => {
      const index = nextRows.findIndex((entry) => String(entry.modifier_group_id) === modifierGroupId);
      if (shouldAssign && index < 0) {
        nextRows.push({ folder_id: Number(folderId), modifier_group_id: Number(modifierGroupId), sort_order: nextSortOrder });
        nextSortOrder += 1;
      } else if (!shouldAssign && index >= 0) {
        nextRows.splice(index, 1);
      }
    });

    return nextRows.map((entry, index) => ({
      modifier_group_id: Number(entry.modifier_group_id),
      sort_order: Number.isInteger(Number(entry.sort_order)) && Number(entry.sort_order) >= 0 ? Number(entry.sort_order) : index,
      ...(Object.prototype.hasOwnProperty.call(entry, 'is_required_override') ? { is_required_override: entry.is_required_override } : {})
    }));
  };

  const itemPayloadForBulkTarget = (itemId, changes) => {
    const item = selectedItemRecords[String(itemId)] || items.find((entry) => String(entry.item_id) === String(itemId));
    const nextRows = assignments
      .filter((entry) => Number(entry.item_id) === Number(itemId))
      .map((entry) => ({ ...entry }));
    let nextSortOrder = nextRows.reduce((maximum, entry) => Math.max(maximum, Number(entry.sort_order) || 0), -1) + 1;

    changes.forEach(([modifierGroupId, shouldAssign]) => {
      const currentlyAssigned = hasEffectiveItemGroup(assignments, folderAssignments, item, modifierGroupId);
      if (currentlyAssigned === shouldAssign) return;

      const inherited = folderAssignments.some((entry) => Number(entry.folder_id) === Number(item?.folder_id || item?.folder?.folder_id)
        && String(entry.modifier_group_id) === modifierGroupId);
      const index = nextRows.findIndex((entry) => String(entry.modifier_group_id) === modifierGroupId);
      if (shouldAssign) {
        if (index >= 0 && nextRows[index].is_excluded === true && inherited) {
          nextRows.splice(index, 1);
        } else if (index >= 0) {
          nextRows[index] = { ...nextRows[index], is_excluded: false };
        } else {
          nextRows.push({ item_id: Number(itemId), modifier_group_id: Number(modifierGroupId), is_excluded: false, sort_order: nextSortOrder });
          nextSortOrder += 1;
        }
      } else if (inherited) {
        if (index >= 0) nextRows[index] = { ...nextRows[index], is_excluded: true };
        else {
          nextRows.push({ item_id: Number(itemId), modifier_group_id: Number(modifierGroupId), is_excluded: true, sort_order: nextSortOrder });
          nextSortOrder += 1;
        }
      } else if (index >= 0) {
        nextRows.splice(index, 1);
      }
    });

    return nextRows.map((entry, index) => ({
      modifier_group_id: Number(entry.modifier_group_id),
      is_excluded: entry.is_excluded === true,
      sort_order: Number.isInteger(Number(entry.sort_order)) && Number(entry.sort_order) >= 0 ? Number(entry.sort_order) : index,
      ...(Object.prototype.hasOwnProperty.call(entry, 'is_required_override') ? { is_required_override: entry.is_required_override } : {})
    }));
  };

  const bulkTargetName = (kind, targetId) => kind === 'category'
    ? folders.find((folder) => String(folder.folder_id) === String(targetId))?.name || `Category ${targetId}`
    : (selectedItemRecords[String(targetId)] || items.find((item) => String(item.item_id) === String(targetId)))?.name || `Item ${targetId}`;

  const saveBulkAssignments = async () => {
    if (!bulkAssignmentDraft || !bulkChangedGroupIds.length) return false;
    const { kind, targetIds } = bulkAssignmentDraft;
    const changes = bulkChangedGroupIds.map((groupId) => [groupId, bulkAssignmentDraft.groupStates[groupId]]);
    const changedTargets = targetIds.filter((targetId) => changes.some(([groupId, desired]) => bulkTargetHasGroup(kind, targetId, groupId) !== desired));
    if (!changedTargets.length) return false;

    setBusy('bulk-assignments');
    setBulkSaveNotice('');
    const savedTargetIds = [];
    const failedTargetIds = [];
    try {
      for (const targetId of changedTargets) {
        try {
          if (kind === 'category') {
            await replaceFnbFolderModifierGroups(Number(targetId), { modifier_groups: folderPayloadForBulkTarget(targetId, changes) });
          } else {
            await replaceFnbItemModifierGroups(Number(targetId), { modifier_groups: itemPayloadForBulkTarget(targetId, changes) });
          }
          savedTargetIds.push(String(targetId));
        } catch {
          failedTargetIds.push(String(targetId));
        }
      }

      if (savedTargetIds.length) await loadWorkspace({ silent: true });

      if (failedTargetIds.length) {
        const remainingTargetIds = failedTargetIds;
        const failedNames = remainingTargetIds.map((id) => bulkTargetName(kind, id));
        const names = failedNames.length > 3 ? `${failedNames.slice(0, 3).join(', ')} and ${failedNames.length - 3} more` : failedNames.join(', ');
        setBulkAssignmentDraft((current) => current ? { ...current, targetIds: remainingTargetIds } : current);
        if (kind === 'category') setSelectedFolderTargetIds(remainingTargetIds);
        else {
          setSelectedItemTargetIds(remainingTargetIds);
          setSelectedItemRecords((current) => Object.fromEntries(remainingTargetIds.filter((id) => current[id]).map((id) => [id, current[id]])));
        }
        const savedCount = targetIds.length - failedTargetIds.length;
        setBulkSaveNotice(`${savedCount} of ${targetIds.length} ${kind === 'category' ? 'categories' : 'items'} are saved. Could not save: ${names}. Failed targets remain selected so you can retry.`);
        toast.error(`Some assignments could not be saved. Retry the remaining ${failedTargetIds.length} ${kind === 'category' ? 'categories' : 'items'}.`);
        return false;
      }

      setBulkAssignmentDraft(null);
      setBulkSaveNotice('');
      setAssignmentOpen(false);
      setAssignmentCollapsed(false);
      if (kind === 'category') setSelectedFolderTargetIds([]);
      else {
        setSelectedItemTargetIds([]);
        setSelectedItemRecords({});
      }
      setFolderGroupSearch('');
      setItemGroupSearch('');
      toast.success(`Option groups saved for ${targetIds.length} ${kind === 'category' ? 'categories' : 'items'}.`);
      return true;
    } finally {
      setBusy('');
    }
  };

  const resetFolderAssignments = () => {
    setFolderGroupSearch('');
    setFolderAssignments((current) => [
      ...current.filter((entry) => Number(entry.folder_id) !== Number(selectedFolderId)),
      ...savedFolderAssignments.filter((entry) => Number(entry.folder_id) === Number(selectedFolderId))
    ]);
  };

  const resetItemAssignments = () => {
    setItemGroupSearch('');
    setSelectedGroupIds(savedItemGroupIds);
    setSelectedExcludedGroupIds(savedExcludedGroupIds);
  };

  const toggleBulkAssignment = (groupId, checked) => {
    setBulkSaveNotice('');
    setBulkAssignmentDraft((current) => current ? {
      ...current,
      groupStates: { ...current.groupStates, [groupId]: checked }
    } : current);
  };

  const resetBulkAssignments = () => {
    setBulkSaveNotice('');
    setBulkAssignmentDraft((current) => current ? { ...current, groupStates: {} } : current);
    if (assignmentType === 'category') setFolderGroupSearch('');
    else setItemGroupSearch('');
  };

  const activeAssignmentDirty = bulkAssignmentDraft
    ? bulkAssignmentDirty
    : assignmentType === 'category' ? folderAssignmentsDirty : itemAssignmentsDirty;
  const closeAssignment = () => {
    if (busy) return;
    if (activeAssignmentDirty && typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('Discard unsaved assignment changes?')) return;
    if (bulkAssignmentDraft) {
      setBulkAssignmentDraft(null);
      setBulkSaveNotice('');
    } else if (assignmentType === 'category') {
      resetFolderAssignments();
    } else {
      resetItemAssignments();
    }
    setAssignmentOpen(false);
    setAssignmentCollapsed(false);
  };
  const selectView = (nextView) => {
    if (assignmentOpen && activeAssignmentDirty) {
      toast.error('Save or discard assignment changes before changing sections.');
      return;
    }
    setBulkAssignmentDraft(null);
    setBulkSaveNotice('');
    setAssignmentOpen(false);
    setAssignmentCollapsed(false);
    setActiveView(nextView);
  };
  const openCategoryAssignment = (folder) => {
    if (assignmentOpen && activeAssignmentDirty) {
      if (!bulkAssignmentDraft && assignmentType === 'category' && String(folder.folder_id) === String(selectedFolderId)) return;
      toast.error('Save or discard the current assignment changes before selecting another category.');
      return;
    }
    setBulkAssignmentDraft(null);
    setBulkSaveNotice('');
    setSelectedFolderId(String(folder.folder_id));
    setAssignmentType('category');
    setAssignmentCollapsed(false);
    setAssignmentOpen(true);
  };
  const openItemAssignment = (item) => {
    if (assignmentOpen && activeAssignmentDirty) {
      if (!bulkAssignmentDraft && assignmentType === 'item' && String(item.item_id) === String(selectedItemId)) return;
      toast.error('Save or discard the current assignment changes before selecting another item.');
      return;
    }
    setBulkAssignmentDraft(null);
    setBulkSaveNotice('');
    const nextId = String(item.item_id);
    setSelectedItemId(nextId);
    setSelectedGroupIds(itemAssignmentIds(assignments, nextId));
    setSelectedExcludedGroupIds(itemAssignmentIds(assignments, nextId, true));
    setAssignmentType('item');
    setAssignmentCollapsed(false);
    setAssignmentOpen(true);
  };
  const openBulkAssignment = (kind) => {
    const targetIds = (kind === 'category' ? selectedFolderTargetIds : selectedItemTargetIds).slice();
    if (!targetIds.length) return;
    if (assignmentOpen && activeAssignmentDirty) {
      toast.error('Save or discard the current assignment changes before opening another assignment.');
      return;
    }
    setAssignmentType(kind);
    setBulkAssignmentDraft({ kind, targetIds, groupStates: {} });
    setBulkSaveNotice('');
    setFolderGroupSearch('');
    setItemGroupSearch('');
    setAssignmentCollapsed(false);
    setAssignmentOpen(true);
  };
  const collapseAssignment = () => {
    if (!busy) setAssignmentCollapsed(true);
  };
  const expandAssignment = () => setAssignmentCollapsed(false);

  const isBulkEditor = Boolean(bulkAssignmentDraft && bulkAssignmentDraft.kind === assignmentType);
  const bulkSelectionIds = isBulkEditor
    ? Object.entries(bulkGroupSelectionStates || {}).filter(([, state]) => state !== 'unchecked').map(([groupId]) => groupId)
    : [];
  const bulkTargetCountLabel = isBulkEditor
    ? `${bulkAssignmentDraft.targetIds.length} ${assignmentType === 'category'
      ? (bulkAssignmentDraft.targetIds.length === 1 ? 'category' : 'categories')
      : (bulkAssignmentDraft.targetIds.length === 1 ? 'item' : 'items')}`
    : '';
  const assignmentEditor = assignmentType === 'category' ? (
    <AssignmentPanel
      title={isBulkEditor ? `Assign groups to ${bulkTargetCountLabel}` : `Assign groups to ${folders.find((folder) => String(folder.folder_id) === String(selectedFolderId))?.name || 'category'}`}
      description={isBulkEditor ? 'Unchanged category groups stay assigned.' : 'Items in this category inherit these option groups.'}
      panelId="pos-fnb-option-category"
      leadingIcon={Store}
      searchLabel="Search option groups"
      searchValue={folderGroupSearch}
      onSearchChange={setFolderGroupSearch}
      groups={filteredFolderGroups}
      selectedIds={isBulkEditor ? bulkSelectionIds : selectedFolderGroupIds}
      groupSelectionStates={isBulkEditor ? bulkGroupSelectionStates : null}
      selectionTargetLabel={bulkTargetCountLabel}
      onToggle={isBulkEditor ? toggleBulkAssignment : toggleFolderAssignment}
      reset={isBulkEditor ? resetBulkAssignments : resetFolderAssignments}
      apply={isBulkEditor ? saveBulkAssignments : saveFolderAssignments}
      applyLabel="Save assignments"
      applyBusy={busy === (isBulkEditor ? 'bulk-assignments' : 'folder-assignments')}
      canManage={canManage}
      disabled={Boolean(busy)}
      totalGroupCount={groups.length}
      inactiveGroupCount={inactiveGroupCount}
      showInactive={showInactiveGroups}
      onToggleShowInactive={setShowInactiveGroups}
      hasUnsavedChanges={isBulkEditor ? bulkAssignmentDirty : folderAssignmentsDirty}
      hasInvalidSelection={isBulkEditor ? bulkHasInactiveSelection : folderHasInactiveSelection}
      invalidSelectionMessage="Remove inactive groups before saving these categories."
      isOverlayViewport={isOverlayViewport}
      onClose={closeAssignment}
      onCollapse={collapseAssignment}
      closeDisabled={Boolean(busy)}
      notice={isBulkEditor ? bulkSaveNotice : ''}
    />
  ) : (
    <AssignmentPanel
      title={isBulkEditor ? `Assign groups to ${bulkTargetCountLabel}` : `Assign groups to ${selectedItem?.name || 'item'}`}
      description={isBulkEditor ? 'Inherited and unchanged groups stay assigned.' : 'Add direct groups or exclude a group inherited from the item’s category.'}
      panelId="pos-fnb-option-item"
      leadingIcon={Package}
      searchLabel="Search option groups"
      searchValue={itemGroupSearch}
      onSearchChange={setItemGroupSearch}
      groups={filteredItemGroups}
      selectedIds={isBulkEditor ? bulkSelectionIds : selectedGroupIds}
      groupSelectionStates={isBulkEditor ? bulkGroupSelectionStates : null}
      selectionTargetLabel={bulkTargetCountLabel}
      onToggle={isBulkEditor ? toggleBulkAssignment : toggleAssignment}
      inheritedGroupIds={isBulkEditor ? [] : inheritedGroupIds}
      excludedGroupIds={isBulkEditor ? [] : selectedExcludedGroupIds}
      onToggleExcluded={isBulkEditor ? undefined : toggleExclusion}
      reset={isBulkEditor ? resetBulkAssignments : resetItemAssignments}
      apply={isBulkEditor ? saveBulkAssignments : saveAssignments}
      applyLabel="Save assignments"
      applyBusy={busy === (isBulkEditor ? 'bulk-assignments' : 'assignments')}
      canManage={canManage}
      disabled={Boolean(busy)}
      totalGroupCount={groups.length}
      inactiveGroupCount={inactiveGroupCount}
      showInactive={showInactiveGroups}
      onToggleShowInactive={setShowInactiveGroups}
      hasUnsavedChanges={isBulkEditor ? bulkAssignmentDirty : itemAssignmentsDirty}
      hasInvalidSelection={isBulkEditor ? bulkHasInactiveSelection : itemHasInactiveSelection}
      invalidSelectionMessage="Remove inactive groups before saving these items."
      isOverlayViewport={isOverlayViewport}
      onClose={closeAssignment}
      onCollapse={collapseAssignment}
      closeDisabled={Boolean(busy)}
      notice={isBulkEditor ? bulkSaveNotice : ''}
    >
      {isBulkEditor ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-4 text-[#17477F]">A checked group will be enabled for every selected item; clearing a group also excludes it where it is inherited. Groups you do not change keep each item’s current assignment.</p>
      ) : (
        <EffectiveOptionsPreview
          item={selectedItem}
          operatingLocationId={operatingLocationId}
          groups={groups}
          inheritedGroupIds={inheritedGroupIds}
          selectedGroupIds={selectedGroupIds}
          selectedExcludedGroupIds={selectedExcludedGroupIds}
          hasUnsavedChanges={itemAssignmentsDirty}
        />
      )}
    </AssignmentPanel>
  );

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
      {error ? <div role="alert" className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"><span className="min-w-0 break-words">{error}</span><Button type="button" variant="outline" onClick={() => loadWorkspace()} disabled={loading || Boolean(busy)} className="h-8 shrink-0 rounded-lg border-rose-300 px-3 text-xs text-rose-800"><RefreshCcw className="mr-1.5 h-3.5 w-3.5" />Retry</Button></div> : null}

      <PosSubtabNavigation
        tabs={[
          { id: 'groups', label: 'Option Groups', icon: ListChecks },
          { id: 'categories', label: 'Category Assignments', icon: FolderOpen },
          { id: 'items', label: 'Item Assignments', icon: Package }
        ]}
        activeTab={activeView}
        onTabChange={selectView}
        ariaLabel="Option group management"
        idPrefix="pos-fnb-option-management"
        desktopColumns={3}
        viewportClassName="sm:!mt-0"
      />

      {loading ? <p role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center text-xs text-slate-500">Loading item options…</p> : null}

      {!loading && !error ? (
        <div className="pos-items-options-content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {activeView === 'groups' ? (
            <PosFnbModifierManager
              groups={groups}
              items={items}
              locations={locations}
              appliedFoldersByGroup={appliedFoldersByGroup}
              assignedItemsByGroup={assignedItemsByGroup}
              busy={Boolean(busy)}
              canManage={canManage}
              onInteractionChange={setModifierEditorOpen}
              onCreate={(payload) => runMutation('create', () => createFnbModifierGroup(payload), 'Option group created in POS.')}
              onUpdate={(groupId, payload) => runMutation('update', () => updateFnbModifierGroup(groupId, payload), 'Option group updated in POS.')}
            />
          ) : (
            <div className={`grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 ${assignmentOpen && !assignmentCollapsed && !isOverlayViewport ? 'min-[1200px]:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.85fr)]' : 'grid-cols-1'}`}>
              {activeView === 'categories' ? (
                <AssignmentEntityTable
                  kind="category"
                  rows={visibleCategories}
                  total={filteredCategories.length}
                  page={categoryPage}
                  totalPages={categoryTotalPages}
                  pageSize={categoryPageSize}
                  onPageChange={setCategoryPage}
                  onPageSizeChange={(nextPageSize) => {
                    setCategoryPageSize(nextPageSize);
                    setCategoryPage(1);
                  }}
                  search={categorySearch}
                  onSearchChange={(value) => { setCategorySearch(value); setCategoryPage(1); }}
                  onAssign={openCategoryAssignment}
                  canManage={canManage}
                  disabled={Boolean(busy) || (assignmentOpen && (activeAssignmentDirty || Boolean(bulkAssignmentDraft)))}
                  selectedId={selectedFolderId}
                  assignmentOpen={assignmentOpen && assignmentType === 'category' && !bulkAssignmentDraft}
                  showAssignmentButton={assignmentOpen && assignmentCollapsed && !isOverlayViewport && assignmentType === 'category'}
                  onExpandAssignment={expandAssignment}
                  selectedTargetIds={selectedFolderTargetIds}
                  onToggleTarget={(folder, checked) => toggleTargetSelection('category', folder, checked)}
                  onToggleVisibleTargets={(rows, checked) => toggleVisibleTargetSelection('category', rows, checked)}
                  onClearTargetSelection={() => clearTargetSelection('category')}
                  onBulkAssign={() => openBulkAssignment('category')}
                />
              ) : (
                <AssignmentEntityTable
                  kind="item"
                  rows={itemRows}
                  total={Number(itemPagination.total || 0)}
                  page={itemPage}
                  totalPages={Number(itemPagination.total_pages || 1)}
                  pageSize={itemPageSize}
                  onPageChange={setItemPage}
                  onPageSizeChange={(nextPageSize) => {
                    setItemPageSize(nextPageSize);
                    setItemPage(1);
                  }}
                  search={itemSearch}
                  onSearchChange={(value) => { setItemSearch(value); setItemPage(1); }}
                  onAssign={openItemAssignment}
                  canManage={canManage}
                  disabled={Boolean(busy) || (assignmentOpen && (activeAssignmentDirty || Boolean(bulkAssignmentDraft)))}
                  selectedId={selectedItemId}
                  assignmentOpen={assignmentOpen && assignmentType === 'item' && !bulkAssignmentDraft}
                  showAssignmentButton={assignmentOpen && assignmentCollapsed && !isOverlayViewport && assignmentType === 'item'}
                  onExpandAssignment={expandAssignment}
                  selectedTargetIds={selectedItemTargetIds}
                  onToggleTarget={(item, checked) => toggleTargetSelection('item', item, checked)}
                  onToggleVisibleTargets={(rows, checked) => toggleVisibleTargetSelection('item', rows, checked)}
                  onClearTargetSelection={() => clearTargetSelection('item')}
                  onBulkAssign={() => openBulkAssignment('item')}
                />
              )}
              {assignmentOpen && !assignmentCollapsed && activeView === `${assignmentType === 'category' ? 'categories' : 'items'}` ? (
                isOverlayViewport
                  ? <PosResponsiveFormDrawer viewportMode={viewportMode} onClose={closeAssignment}>{assignmentEditor}</PosResponsiveFormDrawer>
                  : assignmentEditor
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
