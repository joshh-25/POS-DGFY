import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Barcode, Printer, QrCode, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';
import {
  attachItemBarcode,
  deactivateItemBarcode,
  generateItemBarcode,
  listItemBarcodes,
  renderItemBarcodeLabel,
  resolveItemBarcodeConflict,
  setPrimaryItemBarcode
} from '@/services/itemService.js';

const SOURCE_OPTIONS = [
  ['manufacturer', 'Manufacturer'],
  ['supplier', 'Supplier'],
  ['tenant_generated', 'Internal'],
  ['legacy_import', 'Legacy import']
];

const SCOPE_OPTIONS = [
  ['inventory', 'Inventory'],
  ['pos', 'POS'],
  ['storefront_qr', 'Storefront QR'],
  ['package', 'Package'],
  ['batch', 'Batch'],
  ['service', 'Service'],
  ['ticket', 'Ticket']
];

const LEVEL_OPTIONS = [
  ['unit', 'Unit'],
  ['pack', 'Pack'],
  ['case', 'Case'],
  ['carton', 'Carton'],
  ['shelf', 'Shelf'],
  ['batch', 'Batch'],
  ['service', 'Service'],
  ['ticket', 'Ticket']
];

const LABEL_TYPE_OPTIONS = [
  ['item', 'Item'],
  ['shelf', 'Shelf'],
  ['package', 'Package'],
  ['case', 'Case'],
  ['batch', 'Batch/Lot'],
  ['service', 'Service'],
  ['ticket', 'Ticket'],
  ['booking', 'Booking']
];

const getErrorMessage = (error) => (
  error?.response?.data?.message
  || error?.response?.data?.errors?.reason_code
  || error?.message
  || 'Barcode action failed'
);

const getErrorDetails = (error) => (
  error?.response?.data?.errors
  || error?.response?.data?.details
  || error?.details
  || null
);

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const printLabelPayload = async (payload) => {
  const qrDataUrl = await QRCode.toDataURL(payload?.print_contract?.qr_payload || payload?.barcode?.code || '');
  const barcode = payload?.barcode || {};
  const item = payload?.item || {};
  const display = payload?.display || {};
  const layout = payload?.print_contract?.layout || {};
  const labelTitle = escapeHtml(item.name || 'Item label');
  const labelMeta = escapeHtml(item.sku_code || `Item ${item.item_id || ''}`);
  const labelCode = escapeHtml(barcode.code || '');
  const labelScope = escapeHtml(barcode.scope || 'inventory');
  const labelLevel = escapeHtml(barcode.packaging_level || 'unit');
  const labelType = escapeHtml(display.label_title || payload?.print_contract?.human_readable_type || 'Item label');
  const labelPurpose = escapeHtml(display.purpose || layout.purpose || 'item_identity');
  const labelWidth = Number(layout.width_mm || 62);
  const labelHeight = Number(layout.height_mm || 40);
  const labelSize = escapeHtml(layout.size || 'standard');
  const win = window.open('', '_blank', 'width=480,height=640');
  if (!win) {
    toast.error('Allow popups to print barcode labels.');
    return;
  }
  win.document.write(`<!doctype html>
<html>
<head>
  <title>Barcode Label</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 24px; color: #0f172a; }
    .label { width: ${Math.max(58, labelWidth) * 4}px; min-height: ${Math.max(36, labelHeight) * 4}px; border: 1px solid #cbd5e1; padding: 16px; border-radius: 8px; }
    .type { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #0f766e; margin: 0 0 8px; }
    .title { font-size: ${labelSize === 'large' ? '20px' : '18px'}; font-weight: 700; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #475569; margin: 0 0 12px; }
    .code { font-family: "Courier New", monospace; font-size: 14px; word-break: break-all; margin-top: 12px; }
    img { width: 128px; height: 128px; }
    @media print { body { padding: 0; } .label { border-color: #000; } }
  </style>
</head>
<body>
  <div class="label">
    <p class="type">${labelType}</p>
    <p class="title">${labelTitle}</p>
    <p class="meta">${labelMeta}</p>
    <img src="${qrDataUrl}" alt="QR code" />
    <p class="code">${labelCode}</p>
    <p class="meta">${labelScope} / ${labelLevel} / x${Number(barcode.quantity_multiplier || 1)} / ${labelPurpose}</p>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  win.document.close();
};

export default function BarcodeManager({ item, onRefresh = null }) {
  const { can } = usePermission();
  const canEditItems = can('items:edit');
  const itemId = item?.item_id || item?.id;
  const [loading, setLoading] = useState(false);
  const [barcodes, setBarcodes] = useState([]);
  const [form, setForm] = useState({
    code: '',
    source: 'manufacturer',
    scope: 'inventory',
    packaging_level: 'unit',
    quantity_multiplier: 1
  });
  const [conflict, setConflict] = useState(null);
  const [labelTypes, setLabelTypes] = useState({});

  const loadBarcodes = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const data = await listItemBarcodes(itemId);
      setBarcodes(Array.isArray(data?.barcodes) ? data.barcodes : []);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    if (itemId) loadBarcodes();
  }, [itemId, loadBarcodes]);

  const mutate = async (runner, successMessage) => {
    try {
      await runner();
      toast.success(successMessage);
      setForm((prev) => ({ ...prev, code: '' }));
      setConflict(null);
      await loadBarcodes();
      if (typeof onRefresh === 'function') onRefresh();
    } catch (error) {
      const details = getErrorDetails(error);
      if (details?.reason_code === 'BARCODE_CONFLICT' || details?.existing) {
        setConflict(details);
      }
      toast.error(getErrorMessage(error));
    }
  };

  const handleAttach = () => {
    if (!form.code.trim()) {
      toast.error('Scan or type a barcode first.');
      return;
    }
    mutate(() => attachItemBarcode(itemId, form), 'Barcode attached');
  };

  const handleGenerate = () => {
    mutate(() => generateItemBarcode(itemId, {
      scope: form.scope,
      packaging_level: form.packaging_level,
      quantity_multiplier: Number(form.quantity_multiplier || 1),
      is_primary: barcodes.filter((barcode) => barcode.is_active !== false).length === 0
    }), 'Internal barcode generated');
  };

  const handlePrint = async (barcode, labelType = 'item') => {
    try {
      const payload = await renderItemBarcodeLabel(itemId, {
        barcode_id: barcode.item_barcode_id,
        label_type: labelType
      });
      await printLabelPayload(payload);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleResolveConflict = (action) => {
    if (!conflict) return;
    mutate(() => resolveItemBarcodeConflict({
      code: form.code || conflict.existing?.code,
      target_item_id: itemId,
      action,
      source: form.source,
      scope: form.scope,
      packaging_level: form.packaging_level,
      quantity_multiplier: Number(form.quantity_multiplier || 1)
    }), action === 'move_code' ? 'Barcode moved to this item' : 'Barcode conflict resolved');
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Barcode className="h-4 w-4 text-teal-700" />
            Barcode identities
          </h4>
          <p className="mt-1 text-xs text-slate-500">Scans identify this item, but POS, Storefront, stock, location, and compliance rules still apply.</p>
        </div>
        <Badge variant="outline">{loading ? 'Loading' : `${barcodes.length} alias${barcodes.length === 1 ? '' : 'es'}`}</Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_150px_150px_120px]">
        <Input
          value={form.code}
          onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
          placeholder="Scan or type manufacturer barcode"
          disabled={!canEditItems}
        />
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={form.source}
          onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
          disabled={!canEditItems}
        >
          {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={form.scope}
          onChange={(event) => setForm((prev) => ({ ...prev, scope: event.target.value }))}
          disabled={!canEditItems}
        >
          {SCOPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Input
          type="number"
          min="0.0001"
          step="0.0001"
          value={form.quantity_multiplier}
          onChange={(event) => setForm((prev) => ({ ...prev, quantity_multiplier: event.target.value }))}
          disabled={!canEditItems}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={form.packaging_level}
          onChange={(event) => setForm((prev) => ({ ...prev, packaging_level: event.target.value }))}
          disabled={!canEditItems}
        >
          {LEVEL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button type="button" onClick={handleAttach} disabled={!canEditItems}>
          Attach
        </Button>
        <Button type="button" variant="outline" onClick={handleGenerate} disabled={!canEditItems}>
          <QrCode className="mr-2 h-4 w-4" />
          Generate internal
        </Button>
      </div>
      {conflict?.existing && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Barcode conflict requires review</div>
          <p className="mt-1">
            This active code is already linked to {conflict.existing.item_name || `item ${conflict.existing.item_id}`}{conflict.existing.sku_code ? ` (${conflict.existing.sku_code})` : ''}. Choose a controlled resolution before assigning it here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => handleResolveConflict('keep_existing')} disabled={!canEditItems}>
              Keep existing
            </Button>
            <Button type="button" size="sm" onClick={() => handleResolveConflict('move_code')} disabled={!canEditItems}>
              Move to this item
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => handleResolveConflict('add_package_alias')} disabled={!canEditItems || Number(form.quantity_multiplier || 1) <= 1}>
              Add package alias
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => handleResolveConflict('reject_import')} disabled={!canEditItems}>
              Reject imported code
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {barcodes.map((barcode) => (
          <div key={barcode.item_barcode_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900">{barcode.code}</span>
                {barcode.is_primary && <Badge className="bg-teal-100 text-teal-800">Primary</Badge>}
                {barcode.is_active === false && <Badge variant="outline">Inactive</Badge>}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {barcode.source} / {barcode.scope} / {barcode.packaging_level} / x{Number(barcode.quantity_multiplier || 1)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs"
                value={labelTypes[barcode.item_barcode_id] || 'item'}
                onChange={(event) => setLabelTypes((prev) => ({ ...prev, [barcode.item_barcode_id]: event.target.value }))}
              >
                {LABEL_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => handlePrint(barcode, labelTypes[barcode.item_barcode_id] || 'item')}>
                <Printer className="mr-2 h-4 w-4" />
                Label
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => mutate(() => setPrimaryItemBarcode(itemId, barcode.item_barcode_id), 'Primary barcode updated')} disabled={!canEditItems || barcode.is_active === false}>
                <Star className="mr-2 h-4 w-4" />
                Primary
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => mutate(() => deactivateItemBarcode(itemId, barcode.item_barcode_id), 'Barcode deactivated')} disabled={!canEditItems || barcode.is_active === false}>
                <Trash2 className="mr-2 h-4 w-4" />
                Deactivate
              </Button>
            </div>
          </div>
        ))}
        {!loading && barcodes.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">No barcodes assigned yet.</p>
        )}
      </div>
    </section>
  );
}
