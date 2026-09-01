import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

// Phase 210 (#1179). Staff-only post-placement delivery address/pin edit. Modelled on
// DeliveryAssignmentControl.jsx's shape: plain props, no reach into the terminal's whole `model`
// object, so its guard behaviour is testable without standing up every other dialog in the layer.
//
// Pat's confirmed decision: pre-dispatch only. Visibility here mirrors the server's
// DELIVERY_ADDRESS_EDITABLE_STATUSES (posUseCases.js) -- `out_for_delivery` is deliberately
// EXCLUDED, same as a terminal state. The server stays authoritative either way.
export const DELIVERY_ADDRESS_EDITABLE_STATUSES = Object.freeze(['placed', 'confirmed', 'preparing']);

const formatChangeEntry = (change = {}) => {
  const changedByName = String(
    change?.changedByUser?.username || change?.changedByUser?.email || 'Staff'
  ).trim() || 'Staff';
  const changedAt = change?.changed_at ? new Date(change.changed_at).toLocaleString() : '';
  const previousAddress = String(change?.previous_address || '').trim() || 'no prior address on file';
  return `${changedByName} · ${changedAt} · from ${previousAddress}`;
};

export default function DeliveryAddressEditControl({
  orderId,
  order = {},
  addressChanges = [],
  actionLoading = '',
  canTransactPos = false,
  locked = false,
  isOnline = true,
  hasActiveShift = false,
  onSave = async () => false
}) {
  const normalizedOrderId = Number(orderId || 0);
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [reason, setReason] = useState('');

  const editActionKey = `delivery-address-edit:${normalizedOrderId}`;
  const saving = actionLoading === editActionKey;

  const currentStatus = String(order?.fulfillment_status || '').trim();
  const isDelivery = String(order?.order_method || '').trim() === 'delivery';
  const isEditable = isDelivery && DELIVERY_ADDRESS_EDITABLE_STATUSES.includes(currentStatus);

  if (!isEditable) {
    return null;
  }

  const openDialog = () => {
    setAddress(String(order?.delivery_address || '').trim());
    setLatitude(order?.delivery_latitude ?? '');
    setLongitude(order?.delivery_longitude ?? '');
    setReason('');
    setOpen(true);
  };

  const trimmedAddress = address.trim();
  const trimmedReason = reason.trim();
  const hasLat = String(latitude).trim() !== '';
  const hasLng = String(longitude).trim() !== '';
  const pairValid = hasLat === hasLng;
  const canSubmit = Boolean(trimmedAddress) && trimmedAddress.length >= 3
    && Boolean(trimmedReason) && trimmedReason.length >= 3
    && pairValid
    && !saving && !locked && isOnline && canTransactPos && hasActiveShift;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const success = await onSave(normalizedOrderId, {
      delivery_address: trimmedAddress,
      delivery_latitude: hasLat ? Number(latitude) : null,
      delivery_longitude: hasLng ? Number(longitude) : null,
      change_reason: trimmedReason
    });
    if (success) setOpen(false);
  };

  const recentChanges = Array.isArray(addressChanges) ? addressChanges.slice(0, 5) : [];

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={locked || !isOnline || !canTransactPos || !hasActiveShift}
        onClick={openDialog}
        className="h-8 px-2 text-xs font-semibold"
      >
        Edit delivery address
      </Button>

      {recentChanges.length > 0 && (
        <ul className="mt-2 space-y-1">
          {recentChanges.map((change) => (
            <li key={change.address_change_id} className="text-[11px] text-slate-500">
              {formatChangeEntry(change)}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit delivery address</DialogTitle>
            <DialogDescription>
              The customer is not notified and does not confirm this change. Use this only after
              agreeing the new location directly with the customer -- the phone call is the
              confirmation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor={`delivery-address-${normalizedOrderId}`}>Address</Label>
              <textarea
                id={`delivery-address-${normalizedOrderId}`}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={500}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor={`delivery-lat-${normalizedOrderId}`}>Latitude</Label>
                <Input
                  id={`delivery-lat-${normalizedOrderId}`}
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor={`delivery-lng-${normalizedOrderId}`}>Longitude</Label>
                <Input
                  id={`delivery-lng-${normalizedOrderId}`}
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                />
              </div>
            </div>
            {!pairValid && (
              <p className="text-xs text-rose-700">Provide both latitude and longitude, or neither.</p>
            )}
            <div>
              <Label htmlFor={`delivery-address-reason-${normalizedOrderId}`}>Reason for change</Label>
              <Input
                id={`delivery-address-reason-${normalizedOrderId}`}
                value={reason}
                maxLength={255}
                placeholder="e.g. customer requested handover at the highway junction"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>

            {recentChanges.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600">Change history</p>
                <ul className="mt-1 space-y-1">
                  {recentChanges.map((change) => (
                    <li key={change.address_change_id} className="text-[11px] text-slate-500">
                      {formatChangeEntry(change)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {saving ? 'Saving...' : 'Save address'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
