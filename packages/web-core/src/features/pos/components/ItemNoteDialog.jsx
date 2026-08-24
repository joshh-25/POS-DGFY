import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const MAX_ITEM_NOTE_LENGTH = 1000;

export default function ItemNoteDialog({ open = false, line = null, onClose, onSave }) {
  const [note, setNote] = useState(() => String(line?.special_instructions || ''));

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 shadow-2xl sm:w-full">
        <DialogHeader className="border-b border-slate-200 px-5 py-4 text-left">
          <DialogTitle className="text-lg font-black text-slate-900">
            Item note
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Add a request for {line?.item_name || 'this item'}. This note applies only to this item, not the whole order.
          </DialogDescription>
        </DialogHeader>
        <div className="p-5">
          <label className="block text-xs font-bold text-slate-700" htmlFor="pos-item-note-input">
            Note for this item
          </label>
          <textarea
            id="pos-item-note-input"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, MAX_ITEM_NOTE_LENGTH))}
            placeholder="e.g. No onions"
            maxLength={MAX_ITEM_NOTE_LENGTH}
            rows={4}
            className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            autoFocus
          />
          <p className="mt-1 text-right text-[11px] text-slate-500">
            {note.length}/{MAX_ITEM_NOTE_LENGTH}
          </p>
        </div>
        <DialogFooter className="border-t border-slate-200 px-5 py-4 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
            onClick={() => onSave?.(note)}
          >
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
