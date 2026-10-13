import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import StorefrontSectionInfo from '../settings/StorefrontSectionInfo.jsx';

export default function PricelistCreateDialog({
  open,
  onOpenChange,
  createName,
  onCreateNameChange,
  createDescription,
  onCreateDescriptionChange,
  activePricelistsForCopy,
  copyFromId,
  onCopyFromChange,
  creating,
  onCreate
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="pos-pricelist-create-dialog"
        className="w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full"
      >
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
          <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">New pricelist</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">Create a pricelist to set per-item prices for wholesale vouchers.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="create-pricelist-name" className="text-[12px] font-bold text-slate-700 sm:text-[13px]">Name</Label>
            <Input
              id="create-pricelist-name"
              className="h-10 rounded-lg border-slate-300 text-[16px] font-normal text-[#0F172A] focus:border-[#1A4E8D] focus-visible:ring-[#1A4E8D]/20 sm:text-[14px]"
              value={createName}
              onChange={(event) => onCreateNameChange(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="create-pricelist-description" className="text-[12px] font-bold text-slate-700 sm:text-[13px]">Description (optional)</Label>
            <Input
              id="create-pricelist-description"
              className="h-10 rounded-lg border-slate-300 text-[16px] font-normal text-[#0F172A] focus:border-[#1A4E8D] focus-visible:ring-[#1A4E8D]/20 sm:text-[14px]"
              value={createDescription}
              onChange={(event) => onCreateDescriptionChange(event.target.value)}
            />
          </div>
          {activePricelistsForCopy.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                <Label htmlFor="copy-pricelist-from" className="text-[12px] font-bold text-slate-700 sm:text-[13px]">Copy prices from (optional)</Label>
                <StorefrontSectionInfo label="Copy prices from" panelId="pos-pricelists-copy-prices-info" portal>
                  <p>Copies the selected pricelist&apos;s current prices once. It is not a live link, so future changes to the source pricelist will not update this one.</p>
                </StorefrontSectionInfo>
              </div>
              <Select value={copyFromId} onValueChange={onCopyFromChange}>
                <SelectTrigger
                  id="copy-pricelist-from"
                  aria-label="Copy prices from (optional)"
                  className="h-10 w-full rounded-lg border-slate-300 px-3 text-[16px] font-normal text-[#0F172A] focus:border-[#1A4E8D] focus:ring-[#1A4E8D]/20 sm:text-[14px]"
                >
                  <SelectValue placeholder="Start blank (SRP for every item)" />
                </SelectTrigger>
                <SelectContent className="max-h-[6.125rem] overflow-y-auto overscroll-contain">
                  <SelectItem value="">Start blank (SRP for every item)</SelectItem>
                  {activePricelistsForCopy.map((row) => (
                    <SelectItem key={row.pricelist_id} value={String(row.pricelist_id)}>{row.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter stacked className="border-t border-slate-100 px-5 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="min-h-9 w-full text-[13px] font-bold sm:text-[14px]"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={creating}
            onClick={onCreate}
            className="w-full bg-[#1A4E8D] text-[13px] font-bold text-white hover:bg-[#143F73] focus-visible:ring-[#1A4E8D] sm:text-[14px]"
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
