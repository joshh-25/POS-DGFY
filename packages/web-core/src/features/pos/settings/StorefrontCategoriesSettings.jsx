import React, { useMemo, useState } from 'react';
import {
  List,
  Plus,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { STOREFRONT_TYPOGRAPHY, StorefrontEmptyState, StorefrontSectionHeader } from './StorefrontSectionPrimitives.jsx';

export const MAX_STOREFRONT_CATEGORIES = 10;

const normalizeCategories = (value) => (Array.isArray(value)
  ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  : []);

function CategoryNameDialog({ mode, open, value, onChange, onClose, onSubmit }) {
  const editing = mode === 'edit';
  const inputId = `storefront-category-${editing ? 'edit' : 'add'}-name`;
  const normalizedValue = String(value || '').trim();

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} overlayClassName="bg-black/30 backdrop-blur-none">
      <DialogContent aria-labelledby="storefront-category-dialog-title" aria-describedby="storefront-category-dialog-description" className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
        <form onSubmit={(event) => { event.preventDefault(); if (normalizedValue) onSubmit(normalizedValue); }}>
          <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
            <DialogTitle id="storefront-category-dialog-title" className="text-[16px] font-extrabold text-[#0F172A]">{editing ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription id="storefront-category-dialog-description" className="mt-1 text-[12px] leading-5 text-[#64748B]">
              {editing ? 'Update the category name customers see on your storefront.' : 'Add a category to help customers browse your products.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-5 py-5 sm:px-6">
            <Label htmlFor={inputId} className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Category Name</Label>
            <Input
              id={inputId}
              autoFocus
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="Enter category name"
              maxLength={60}
              className="h-9 rounded-lg border-slate-200 text-[13px] text-[#0F172A]"
            />
          </div>
          <DialogFooter className="flex-row items-center gap-2 border-t border-slate-100 px-5 py-4 sm:justify-end sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-9 min-w-0 flex-1 text-[13px] font-bold sm:flex-none sm:text-[14px]">Cancel</Button>
            <Button type="submit" disabled={!normalizedValue} className="min-h-9 min-w-0 flex-1 bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73] sm:flex-none sm:text-[14px]">
              {editing ? 'Save Changes' : 'Add Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({ category, index, disabled, editing, editValue, onEdit, onEditChange, onSaveEdit, onCancelEdit, onDelete }) {
  return (
    <div
      role="listitem"
      aria-label={`${index + 1}. ${category}`}
      className="flex min-w-0 items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 sm:gap-2.5 sm:px-3.5 sm:py-2.5"
    >
      <span className="w-5 shrink-0 text-[12px] font-semibold tabular-nums text-[#64748B] sm:w-6 sm:text-[13px]" aria-hidden="true">{index + 1}</span>
      {editing ? (
        <div className="min-w-0 flex-1 space-y-2">
          <span className={`block truncate ${STOREFRONT_TYPOGRAPHY.itemLabel}`}>{category}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Input
              value={editValue}
              onChange={(event) => onEditChange(event.target.value)}
              aria-label={`Edit category ${category}`}
              autoFocus
              maxLength={60}
              className="h-9 min-w-[12rem] flex-1 rounded-lg border-blue-200 text-[13px]"
            />
            <Button type="button" onClick={onSaveEdit} disabled={!String(editValue || '').trim()} className="min-h-9 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]">Save</Button>
            <Button type="button" variant="outline" onClick={onCancelEdit} className="min-h-9 rounded-lg px-3 text-[12px] font-bold text-[#1A4E8D]">Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onEdit(index)}
          disabled={disabled}
          className={`min-w-0 flex-1 truncate text-left ${STOREFRONT_TYPOGRAPHY.itemLabel} transition-colors hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-1 disabled:cursor-default`}
          aria-label={`Edit category ${category}`}
          title={`Edit ${category}`}
        >
          {category}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(index)}
        disabled={disabled}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-default disabled:opacity-50"
        aria-label={`Remove category ${category}`}
        title={`Remove ${category}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function CategoryColumn({ categories, startIndex, disabled, editingIndex, editValue, onEdit, onEditChange, onSaveEdit, onCancelEdit, onDelete }) {
  return (
    <div
      role="list"
      aria-label={`Store categories ${startIndex + 1} to ${startIndex + categories.length}`}
      className="min-w-0 overflow-hidden bg-white"
    >
      {categories.map((category, columnIndex) => {
        const index = startIndex + columnIndex;
        return (
          <CategoryRow
            key={`${category}-${index}`}
            category={category}
            index={index}
            disabled={disabled}
            editing={editingIndex === index}
            editValue={editValue}
            onEdit={onEdit}
            onEditChange={onEditChange}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}

function splitIntoBalancedColumns(items) {
  if (items.length <= 1) return items.length > 0 ? [items] : [];
  const firstColumnCount = Math.ceil(items.length / 2);
  return [items.slice(0, firstColumnCount), items.slice(firstColumnCount)];
}

export default function StorefrontCategoriesSettings({ categories = [], onChange, disabled = false, className = '' }) {
  const normalizedCategories = useMemo(() => normalizeCategories(categories), [categories]);
  const [nameDialog, setNameDialog] = useState({ mode: null, index: null, value: '' });
  const [deleteIndex, setDeleteIndex] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const emitCategories = (nextCategories) => onChange?.(nextCategories);

  const handleAdd = (value) => {
    if (normalizedCategories.length >= MAX_STOREFRONT_CATEGORIES) return;
    emitCategories([...normalizedCategories, value]);
    setAnnouncement(`${value} added.`);
    setNameDialog({ mode: null, index: null, value: '' });
  };

  const handleEdit = (value) => {
    const index = nameDialog.index;
    if (index == null || !value) return;
    const nextCategories = [...normalizedCategories];
    nextCategories[index] = value;
    emitCategories(nextCategories);
    setAnnouncement(`${value} updated.`);
    setNameDialog({ mode: null, index: null, value: '' });
  };

  const handleDelete = () => {
    if (deleteIndex == null) return;
    emitCategories(normalizedCategories.filter((_, index) => index !== deleteIndex));
    setAnnouncement(`${deleteCategory} removed.`);
    setDeleteIndex(null);
  };

  const openAddDialog = () => {
    if (disabled || normalizedCategories.length >= MAX_STOREFRONT_CATEGORIES) return;
    setNameDialog({ mode: 'add', index: null, value: '' });
  };

  const columns = splitIntoBalancedColumns(normalizedCategories);
  const categoriesUseTwoColumns = columns.length > 1;
  const firstColumnCount = columns[0]?.length || 0;
  const deleteCategory = deleteIndex == null ? '' : normalizedCategories[deleteIndex];
  const atMaximum = normalizedCategories.length >= MAX_STOREFRONT_CATEGORIES;

  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 ${className}`} aria-labelledby="storefront-categories-heading">
      <StorefrontSectionHeader
        title="Store Categories"
        titleId="storefront-categories-heading"
        description="Organize the categories customers can browse on your storefront."
        info={<><p className="font-extrabold text-[#0F172A]">Category order</p><p className="mt-1">Categories display in the order shown. On larger screens, they are distributed as evenly as possible across two columns. Maximum of 10 categories.</p></>}
        infoLabel="Store Categories"
        infoPanelId="storefront-categories-info"
        hasData={normalizedCategories.length > 0}
        action={(
          <Button
            type="button"
            onClick={openAddDialog}
            disabled={disabled || atMaximum}
            aria-label={atMaximum ? 'Add category (maximum of 10 reached)' : 'Add category'}
            title={atMaximum ? 'Maximum of 10 categories reached' : 'Add category'}
            className="min-h-9 w-full shrink-0 gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:text-[13px]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />Add Category
          </Button>
        )}
        actionNote={atMaximum ? <span className="text-right text-[11px] font-semibold text-[#64748B]">Maximum of 10 categories reached.</span> : null}
      />

      {columns.length > 0 ? (
        <div className={`mt-4 grid min-w-0 grid-cols-1 gap-3 ${categoriesUseTwoColumns ? 'lg:grid-cols-2 lg:gap-x-4' : ''}`} aria-label="Store categories">
          {columns.map((column, columnIndex) => (
            <CategoryColumn
              key={`storefront-category-column-${columnIndex}`}
              categories={column}
              startIndex={columnIndex === 0 ? 0 : firstColumnCount}
              disabled={disabled}
              editingIndex={nameDialog.mode === 'edit' ? nameDialog.index : null}
              editValue={nameDialog.mode === 'edit' ? nameDialog.value : ''}
              onEdit={(index) => setNameDialog({ mode: 'edit', index, value: normalizedCategories[index] })}
              onEditChange={(value) => setNameDialog((current) => ({ ...current, value }))}
              onSaveEdit={() => handleEdit(nameDialog.value)}
              onCancelEdit={() => setNameDialog({ mode: null, index: null, value: '' })}
              onDelete={(index) => setDeleteIndex(index)}
            />
          ))}
        </div>
      ) : (
        <StorefrontEmptyState
          className="mt-4 py-8"
          icon={List}
          iconClassName="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-[#64748B]"
          title="No categories yet"
          description="Add categories to help customers browse your products."
          action={<Button type="button" onClick={openAddDialog} disabled={disabled} aria-label="Add category" className="mt-4 min-h-9 gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]"><Plus className="h-4 w-4" aria-hidden="true" />Add Category</Button>}
        />
      )}

      <p className="sr-only" aria-live="polite">{announcement}</p>

      <CategoryNameDialog
        mode={nameDialog.mode}
        open={nameDialog.mode === 'add'}
        value={nameDialog.value}
        onChange={(value) => setNameDialog((current) => ({ ...current, value }))}
        onClose={() => setNameDialog({ mode: null, index: null, value: '' })}
        onSubmit={nameDialog.mode === 'edit' ? handleEdit : handleAdd}
      />

      <ConfirmActionDialog
        open={deleteIndex != null}
        onOpenChange={(open) => { if (!open) setDeleteIndex(null); }}
        title="Remove Category"
        description={`Are you sure you want to remove “${deleteCategory}”? This action cannot be undone.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
        overlayClassName="bg-black/30 backdrop-blur-none"
      />
    </section>
  );
}
