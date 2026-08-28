import { describe, expect, it, vi } from 'vitest';
import { persistPosItemBarcode } from '../utils/posItemBarcodePersistence.js';

describe('POS item barcode persistence', () => {
  it('attaches a newly scanned GTIN as a POS-scoped primary barcode', async () => {
    const attachBarcode = vi.fn().mockResolvedValue({});
    const updateBarcode = vi.fn();

    const result = await persistPosItemBarcode({
      itemId: 176,
      barcodeSelection: {
        code: '4006381333931',
        kind: 'gtin',
        shouldGenerate: false
      },
      attachBarcode,
      updateBarcode
    });

    expect(result).toEqual({ action: 'attached', code: '4006381333931' });
    expect(attachBarcode).toHaveBeenCalledWith(176, {
      code: '4006381333931',
      source: 'manufacturer',
      scope: 'pos',
      packaging_level: 'unit',
      quantity_multiplier: 1,
      is_primary: true,
      metadata: { attached_via: 'pos_item_edit' }
    });
    expect(updateBarcode).not.toHaveBeenCalled();
  });

  it('repairs an unchanged legacy manufacturer GTIN from inventory to POS scope', async () => {
    const attachBarcode = vi.fn();
    const updateBarcode = vi.fn().mockResolvedValue({});

    const result = await persistPosItemBarcode({
      itemId: 176,
      barcodeSelection: {
        code: '4006381333931',
        kind: 'gtin',
        shouldGenerate: false
      },
      existingPrimaryBarcode: {
        item_barcode_id: 26,
        code: '4006381333931',
        source: 'manufacturer',
        scope: 'inventory'
      },
      attachBarcode,
      updateBarcode
    });

    expect(result).toEqual({ action: 'scope_repaired', code: '4006381333931' });
    expect(updateBarcode).toHaveBeenCalledWith(176, 26, { scope: 'pos' });
    expect(attachBarcode).not.toHaveBeenCalled();
  });

  it('does not make another request when the barcode is already POS-scoped', async () => {
    const attachBarcode = vi.fn();
    const updateBarcode = vi.fn();

    const result = await persistPosItemBarcode({
      itemId: 176,
      barcodeSelection: {
        code: '4006381333931',
        kind: 'gtin',
        shouldGenerate: false
      },
      existingPrimaryBarcode: {
        item_barcode_id: 26,
        code: '4006381333931',
        source: 'manufacturer',
        scope: 'pos'
      },
      attachBarcode,
      updateBarcode
    });

    expect(result).toEqual({ action: 'unchanged', code: '4006381333931' });
    expect(attachBarcode).not.toHaveBeenCalled();
    expect(updateBarcode).not.toHaveBeenCalled();
  });
});
