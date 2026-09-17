import React, { useMemo, useState } from 'react';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STOREFRONT_TYPOGRAPHY, StorefrontEmptyState, StorefrontSectionHeader } from './StorefrontSectionPrimitives.jsx';

export const MAX_STOREFRONT_WHY_CHOOSE_US = 4;
export const STOREFRONT_WHY_CHOOSE_US_MAX_LENGTH = 80;

const normalizePhrases = (value) => (Array.isArray(value)
  ? value.slice(0, MAX_STOREFRONT_WHY_CHOOSE_US).map((entry) => String(entry ?? '').trim()).filter(Boolean)
  : []);

function PhraseRow({
  phrase,
  index,
  disabled,
  modalMode,
  isDragging,
  isDropTarget,
  onChange,
  onDelete,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveWithKeyboard
}) {
  const trimmedPhrase = phrase.trim();
  const isInvalid = trimmedPhrase.length === 0;

  return (
    <div
      role="listitem"
      tabIndex={disabled ? -1 : 0}
      draggable={!disabled && !isInvalid}
      onDragStart={(event) => {
        if (isInvalid) {
          event.preventDefault();
          return;
        }
        onDragStart(event, index);
      }}
      onDragOver={(event) => onDragOver(event, index)}
      onDrop={(event) => { event.stopPropagation(); onDrop(event, index); }}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (!disabled && !isInvalid && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
          onMoveWithKeyboard(index, event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
      aria-label={`${index + 1}. ${trimmedPhrase || 'Empty phrase'}`}
      className={`group flex min-w-0 items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1A4E8D] sm:gap-3 sm:px-3.5 ${isDragging ? 'bg-blue-50/80 opacity-60' : ''} ${isDropTarget ? 'bg-[#F5F9FF] shadow-[inset_0_2px_0_#9BBBE0]' : ''}`}
    >
      <span className="grid h-9 w-5 shrink-0 place-items-center text-slate-400" aria-hidden="true">
        <GripVertical className="h-4 w-4" />
      </span>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-[12px] font-extrabold tabular-nums text-[#1A4E8D]" aria-hidden="true">{index + 1}</span>
      {modalMode ? (
        <span className={`min-w-0 flex-1 break-words whitespace-normal ${STOREFRONT_TYPOGRAPHY.itemLabel} leading-5`}>{phrase}</span>
      ) : (
        <Input
          value={phrase}
          onChange={(event) => onChange(index, event.target.value)}
          maxLength={STOREFRONT_WHY_CHOOSE_US_MAX_LENGTH}
          aria-label={`Phrase ${index + 1}`}
          aria-invalid={isInvalid}
          placeholder="Add a short reason"
          disabled={disabled}
          className={`h-9 min-w-0 flex-1 rounded-lg border-slate-200 px-2.5 text-[13px] font-medium text-[#0F172A] focus-visible:border-[#1A4E8D] focus-visible:ring-[#1A4E8D] ${isInvalid ? 'border-amber-300 focus-visible:border-amber-500 focus-visible:ring-amber-500' : ''}`}
        />
      )}
      {modalMode ? <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(index)} disabled={disabled} aria-label={`Edit phrase ${index + 1}`} title="Edit phrase" className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white text-[#536B8C] hover:border-blue-200 hover:bg-blue-50 hover:text-[#1A4E8D] focus-visible:ring-[#1A4E8D]"><Pencil className="h-4 w-4" aria-hidden="true" /></Button> : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(index)}
        disabled={disabled}
        aria-label={`Remove phrase ${trimmedPhrase || index + 1}`}
        title={`Remove phrase ${trimmedPhrase || index + 1}`}
        className="h-8 w-8 shrink-0 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 focus-visible:ring-rose-500"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {isInvalid ? <span className="sr-only" role="alert">Phrase cannot be empty.</span> : null}
    </div>
  );
}

function PhraseColumn({ phrases, startIndex, ...props }) {
  return (
    <div
      role="list"
      aria-label={`Why Choose Us phrases ${startIndex + 1} to ${startIndex + phrases.length}`}
      onDragOver={(event) => { if (!props.disabled) event.preventDefault(); }}
      onDrop={(event) => {
        if (props.disabled || props.dragOverIndex == null) return;
        props.onDrop(event, props.dragOverIndex);
      }}
      className="min-w-0 overflow-hidden bg-white"
    >
      {phrases.map((phrase, offset) => {
        const index = startIndex + offset;
        return (
          <PhraseRow
            key={`storefront-why-${index}`}
            phrase={phrase}
            index={index}
            isDragging={props.draggedIndex === index}
            isDropTarget={props.dragOverIndex === index && props.draggedIndex !== index}
            {...props}
          />
        );
      })}
    </div>
  );
}

function PhraseDialog({ mode, open, value, onChange, onClose, onSubmit }) {
  const editing = mode === 'edit';
  const normalizedValue = String(value || '').trim();
  const inputId = `storefront-why-${editing ? 'edit' : 'add'}-phrase`;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} overlayClassName="bg-black/30 backdrop-blur-none">
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
        <form onSubmit={(event) => { event.preventDefault(); if (normalizedValue) onSubmit(normalizedValue); }}>
          <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
            <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">{editing ? 'Edit Phrase' : 'Add Phrase'}</DialogTitle>
            <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">{editing ? 'Update the reason customers see on your storefront.' : 'Add a short reason customers should choose your store.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-5 py-5 sm:px-6">
            <Label htmlFor={inputId} className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Phrase</Label>
            <Input id={inputId} autoFocus value={value} onChange={(event) => onChange(event.target.value.slice(0, STOREFRONT_WHY_CHOOSE_US_MAX_LENGTH))} placeholder="Add a short reason" maxLength={STOREFRONT_WHY_CHOOSE_US_MAX_LENGTH} className="h-9 rounded-lg border-slate-200 text-[13px] text-[#0F172A]" />
            <p className="text-right text-[11px] text-[#64748B]">{String(value || '').length}/{STOREFRONT_WHY_CHOOSE_US_MAX_LENGTH}</p>
          </div>
          <DialogFooter className="flex-row items-center gap-2 border-t border-slate-100 px-5 py-4 sm:justify-end sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} className="min-h-9 min-w-0 flex-1 text-[13px] font-bold sm:flex-none sm:text-[14px]">Cancel</Button>
            <Button type="submit" disabled={!normalizedValue} className="min-h-9 min-w-0 flex-1 bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73] sm:flex-none sm:text-[14px]">{editing ? 'Save Changes' : 'Add Phrase'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function StorefrontWhyChooseUsSettings({ phrases = [], onChange, disabled = false, interactionMode = 'inline', className = '' }) {
  const normalizedPhrases = useMemo(() => normalizePhrases(phrases), [phrases]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [pendingPhrase, setPendingPhrase] = useState(false);
  const [phraseDialog, setPhraseDialog] = useState({ mode: null, index: null, value: '' });
  const [announcement, setAnnouncement] = useState('');

  const emitPhrases = (nextPhrases) => onChange?.(nextPhrases.slice(0, MAX_STOREFRONT_WHY_CHOOSE_US));

  const movePhrase = (fromIndex, toIndex) => {
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) return;
    if (toIndex < 0 || toIndex >= normalizedPhrases.length) return;
    const nextPhrases = [...normalizedPhrases];
    const [movedPhrase] = nextPhrases.splice(fromIndex, 1);
    nextPhrases.splice(toIndex, 0, movedPhrase);
    emitPhrases(nextPhrases);
    setAnnouncement(`${movedPhrase.trim() || 'Phrase'} moved to position ${toIndex + 1}.`);
  };

  const handleDrop = (event, targetIndex) => {
    event.preventDefault();
    movePhrase(draggedIndex, targetIndex);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleAdd = () => {
    if (disabled || normalizedPhrases.length >= MAX_STOREFRONT_WHY_CHOOSE_US) return;
    if (interactionMode === 'modal') {
      setPhraseDialog({ mode: 'add', index: null, value: '' });
      return;
    }
    setPendingPhrase(true);
    setAnnouncement(`Phrase ${normalizedPhrases.length + 1} added.`);
  };

  const handleDialogSubmit = (value) => {
    if (!value) return;
    if (phraseDialog.mode === 'edit' && phraseDialog.index != null) {
      const nextPhrases = [...normalizedPhrases];
      nextPhrases[phraseDialog.index] = value;
      emitPhrases(nextPhrases);
      setAnnouncement(`${value} updated.`);
    } else if (phraseDialog.mode === 'add' && normalizedPhrases.length < MAX_STOREFRONT_WHY_CHOOSE_US) {
      emitPhrases([...normalizedPhrases, value]);
      setAnnouncement(`${value} added.`);
    }
    setPhraseDialog({ mode: null, index: null, value: '' });
  };

  const handleChange = (index, value) => {
    const nextPhrases = [...normalizedPhrases];
    const nextValue = value.slice(0, STOREFRONT_WHY_CHOOSE_US_MAX_LENGTH);
    if (pendingPhrase && index === normalizedPhrases.length) {
      if (!nextValue.trim()) return;
      setPendingPhrase(false);
      nextPhrases.push(nextValue);
    } else {
      nextPhrases[index] = nextValue;
    }
    emitPhrases(nextPhrases);
  };

  const handleDelete = (index) => {
    if (pendingPhrase && index === normalizedPhrases.length) {
      setPendingPhrase(false);
      setAnnouncement(`Phrase ${index + 1} removed.`);
      return;
    }
    const removed = normalizedPhrases[index];
    emitPhrases(normalizedPhrases.filter((_, phraseIndex) => phraseIndex !== index));
    setAnnouncement(`${removed.trim() || `Phrase ${index + 1}`} removed.`);
  };

  const visiblePhrases = pendingPhrase ? [...normalizedPhrases, ''] : normalizedPhrases;
  const atMaximum = visiblePhrases.length >= MAX_STOREFRONT_WHY_CHOOSE_US;
  const sharedRowProps = {
    disabled,
    modalMode: interactionMode === 'modal',
    draggedIndex,
    dragOverIndex,
    onChange: handleChange,
    onDelete: handleDelete,
    onEdit: (index) => {
      if (interactionMode === 'modal' && !disabled) setPhraseDialog({ mode: 'edit', index, value: normalizedPhrases[index] || '' });
    },
    onDragStart: (event, index) => {
      if (disabled) return;
      setDraggedIndex(index);
      setDragOverIndex(index);
      event.dataTransfer?.setData('text/plain', String(index));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event, index) => {
      if (disabled || draggedIndex == null) return;
      event.preventDefault();
      setDragOverIndex(index);
    },
    onDrop: handleDrop,
    onDragEnd: () => { setDraggedIndex(null); setDragOverIndex(null); },
    onMoveWithKeyboard: (index, direction) => movePhrase(index, index + direction),
  };

  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 ${className}`} aria-labelledby="storefront-why-choose-us-heading">
      <StorefrontSectionHeader
        title="Why Choose Us"
        titleId="storefront-why-choose-us-heading"
        description="Add short reasons customers should choose your store."
        info={atMaximum ? <><p className="font-extrabold text-[#0F172A]">You have reached the maximum of 4 phrases.</p><p className="mt-1">Remove a phrase to add a new one.</p></> : <><p className="font-extrabold text-[#0F172A]">You can add up to 4 phrases.</p><p className="mt-1">These will be shown on your storefront to highlight what makes your store unique.</p></>}
        infoLabel="Why Choose Us"
        infoPanelId="storefront-why-choose-us-guidance"
        hasData={visiblePhrases.length > 0}
        action={(
          <Button
            type="button"
            onClick={handleAdd}
            disabled={disabled || atMaximum}
            aria-label={atMaximum ? 'Add phrase (maximum of 4 reached)' : 'Add phrase'}
            title={atMaximum ? 'Maximum of 4 phrases reached' : 'Add phrase'}
            className="min-h-9 w-full gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:text-[13px]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />Add Phrase
          </Button>
        )}
        actionNote={atMaximum ? <span className="text-right text-[11px] font-semibold text-[#64748B]">Maximum of 4 phrases reached.</span> : null}
      />

      {visiblePhrases.length > 0 ? (
        <div className="mt-4 min-w-0" aria-label="Why Choose Us phrases">
          <PhraseColumn phrases={visiblePhrases} startIndex={0} {...sharedRowProps} />
        </div>
      ) : (
        <StorefrontEmptyState
          className="mt-4"
          title="No phrases added yet."
          description="Add short reasons customers should choose your store."
          action={<Button type="button" onClick={handleAdd} disabled={disabled} aria-label="Add phrase" className="mt-3 min-h-9 gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]"><Plus className="h-4 w-4" aria-hidden="true" />Add Phrase</Button>}
        />
      )}

      <p className="sr-only" aria-live="polite">{announcement}</p>
      {interactionMode === 'modal' ? <PhraseDialog mode={phraseDialog.mode} open={phraseDialog.mode != null} value={phraseDialog.value} onChange={(value) => setPhraseDialog((current) => ({ ...current, value }))} onClose={() => setPhraseDialog({ mode: null, index: null, value: '' })} onSubmit={handleDialogSubmit} /> : null}
    </section>
  );
}
