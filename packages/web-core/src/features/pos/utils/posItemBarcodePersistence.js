const normalizeScope = (value) => String(value || '').trim().toLowerCase();

export const persistPosItemBarcode = async ({
  itemId,
  barcodeSelection,
  existingPrimaryBarcode = null,
  attachBarcode,
  updateBarcode
}) => {
  if (barcodeSelection?.shouldGenerate || !barcodeSelection?.code) {
    return { action: 'unchanged' };
  }

  const existingCode = String(existingPrimaryBarcode?.code || '').trim().toUpperCase();
  const selectedCode = String(barcodeSelection.code || '').trim().toUpperCase();
  if (selectedCode !== existingCode) {
    if (typeof attachBarcode !== 'function') {
      throw new TypeError('attachBarcode must be a function');
    }
    await attachBarcode(itemId, {
      code: selectedCode,
      source: barcodeSelection.kind === 'gtin' ? 'manufacturer' : 'supplier',
      scope: 'pos',
      packaging_level: 'unit',
      quantity_multiplier: 1,
      is_primary: true,
      metadata: { attached_via: 'pos_item_edit' }
    });
    return { action: 'attached', code: selectedCode };
  }

  const existingBarcodeId = Number(existingPrimaryBarcode?.item_barcode_id);
  if (existingBarcodeId > 0 && normalizeScope(existingPrimaryBarcode?.scope) !== 'pos') {
    if (typeof updateBarcode !== 'function') {
      throw new TypeError('updateBarcode must be a function');
    }
    await updateBarcode(itemId, existingBarcodeId, { scope: 'pos' });
    return { action: 'scope_repaired', code: selectedCode };
  }

  return { action: 'unchanged', code: selectedCode };
};
