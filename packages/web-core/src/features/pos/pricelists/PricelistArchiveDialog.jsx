import React from 'react';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';

export default function PricelistArchiveDialog({ open, onOpenChange, archiving, onConfirm }) {
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Archive this pricelist?"
      description="Archived pricelists can no longer be attached to a voucher or edited. Vouchers already using it keep resolving against its last-published prices."
      confirmLabel={archiving ? 'Archiving...' : 'Archive'}
      variant="destructive"
      stackedActions
      showIcon={false}
      confirmClassName="bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600"
      onConfirm={onConfirm}
    />
  );
}
