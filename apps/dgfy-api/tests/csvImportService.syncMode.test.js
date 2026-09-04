import { jest } from '@jest/globals';
import crypto from 'crypto';

/**
 * #1495 Part B -- CSV sync import: upsert + deactivate-not-delete.
 *
 * Covers the three behaviours this phase introduces, and the safety properties that keep the
 * destructive half bounded:
 *   1. REACTIVATE classification (the duplicate-row bug the widened lookup fixes).
 *   2. The sync-mode deactivation set and everything deliberately excluded from it.
 *   3. The preview gate: a sync confirm without an acknowledged list is refused, and an
 *      acknowledged list can only ever narrow the server's own re-derived set.
 */

const mockItemModel = {
  findAll: jest.fn(),
  bulkCreate: jest.fn(),
  update: jest.fn()
};

const mockTransaction = {
  commit: jest.fn(),
  rollback: jest.fn()
};

const mockSequelize = {
  transaction: jest.fn()
};

const mockDbStore = {
  get: jest.fn((name) => {
    if (name === 'Item') return mockItemModel;
    if (name === 'sequelize') return mockSequelize;
    throw new Error(`Unexpected model lookup: ${name}`);
  })
};

const mockGetAllSettingsUseCase = jest.fn();
const mockCreateItem = jest.fn();
const mockUpdateItem = jest.fn();
const mockDeleteItem = jest.fn();
const mockReactivateItem = jest.fn();

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: mockDbStore
}));

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
  getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

jest.unstable_mockModule('../src/services/itemService.js', () => ({
  createItem: mockCreateItem,
  updateItem: mockUpdateItem,
  deleteItem: mockDeleteItem,
  reactivateItem: mockReactivateItem
}));

describe('csvImportService sync mode (#1495 Part B)', () => {
  let previewImport;
  let confirmImport;

  const SCHEMA_VERSION = 'v1';
  const ISSUED_AT = '2026-09-03T00:00:00.000Z';

  const buildSignature = ({ workflowMode, schemaVersion, issuedAt }) => {
    const payload = `${workflowMode}|${schemaVersion}|${issuedAt}`;
    return crypto
      .createHmac('sha256', process.env.CSV_TEMPLATE_SIGNING_SECRET || process.env.JWT_SECRET || 'csv-template-signing-secret')
      .update(payload)
      .digest('hex');
  };

  // A minimal, correctly-signed manufacturing CSV. `rows` is [sku, name] pairs.
  const csvWith = (rows) => [
    'sku_code,name,category,max_capacity,unit_of_measure,template_workflow_mode,mode_compatibility_note',
    ...rows.map(([sku, name]) => `${sku},${name},supplies,100,pcs,manufacturing,"mode note"`)
  ].join('\n');

  // Preview rows are what the frontend echoes back to confirmImport.
  const confirmRowFor = (sku, name, rowNumber) => ({
    rowNumber,
    sku_code: sku,
    name,
    valid: true,
    data: {
      sku_code: sku,
      name,
      category: 'supplies',
      max_capacity: 100,
      unit_of_measure: 'pcs',
      template_workflow_mode: 'food_manufacturing',
      template_schema_version: SCHEMA_VERSION,
      template_issued_at: ISSUED_AT,
      template_signature: buildSignature({
        workflowMode: 'food_manufacturing',
        schemaVersion: SCHEMA_VERSION,
        issuedAt: ISSUED_AT
      })
    }
  });

  const item = (overrides) => ({
    item_id: 1,
    sku_code: 'SKU-001',
    name: 'Item One',
    category: 'supplies',
    product_type: null,
    unit_of_measure: 'pcs',
    status: 'active',
    deleted_at: null,
    ...overrides
  });

  beforeAll(async () => {
    const mod = await import('../src/services/csvImportService.js');
    previewImport = mod.previewImport;
    confirmImport = mod.confirmImport;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDbStore.get.mockImplementation((name) => {
      if (name === 'Item') return mockItemModel;
      if (name === 'sequelize') return mockSequelize;
      throw new Error(`Unexpected model lookup: ${name}`);
    });
    mockItemModel.findAll.mockResolvedValue([]);
    mockItemModel.update.mockResolvedValue([1]);
    mockItemModel.bulkCreate.mockImplementation(async (items) => (
      items.map((entry, index) => ({ item_id: 900 + index, ...entry }))
    ));
    mockSequelize.transaction.mockResolvedValue(mockTransaction);
    mockGetAllSettingsUseCase.mockResolvedValue({
      success: true,
      data: { ops_workflow_mode: { value: 'manufacturing' } },
      error: null,
      message: null
    });
    mockReactivateItem.mockResolvedValue(true);
    mockDeleteItem.mockResolvedValue(true);
  });

  describe('REACTIVATE classification', () => {
    it('classifies a soft-deleted SKU as REACTIVATE, not CREATE', async () => {
      // The bug: this row used to be invisible to the lookup, so it was classified CREATE and --
      // because active_sku_code is NULL while deleted_at is set -- inserted as a duplicate row
      // without tripping uq_items_active_sku_code.
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 7, sku_code: 'SKU-001', status: 'inactive', deleted_at: new Date() })
      ]);

      const result = await previewImport(csvWith([['SKU-001', 'Item One']]));

      expect(result.success).toBe(true);
      expect(result.rows[0].action).toBe('REACTIVATE');
      expect(result.rows[0].existingItemId).toBe(7);
      expect(result.createCount).toBe(0);
      expect(result.reactivateCount).toBe(1);
    });

    it('classifies a status-inactive SKU with no deleted_at as REACTIVATE too', async () => {
      // The second deactivation shape: a plain PUT to status 'inactive'. restoreItem rejects this
      // one as "not deleted", which is why reactivateItem exists alongside it.
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 8, sku_code: 'SKU-001', status: 'inactive', deleted_at: null })
      ]);

      const result = await previewImport(csvWith([['SKU-001', 'Item One']]));

      expect(result.rows[0].action).toBe('REACTIVATE');
      expect(result.rows[0].existingItemId).toBe(8);
    });

    it('still classifies active and draft SKUs as UPDATE', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 1, sku_code: 'SKU-001', status: 'active' }),
        item({ item_id: 2, sku_code: 'SKU-002', status: 'draft' })
      ]);

      const result = await previewImport(csvWith([['SKU-001', 'One'], ['SKU-002', 'Two']]));

      expect(result.rows.map((r) => r.action)).toEqual(['UPDATE', 'UPDATE']);
      expect(result.updateCount).toBe(2);
      expect(result.reactivateCount).toBe(0);
    });

    it('binds to the active row when an inactive duplicate holds the same SKU', async () => {
      // Pre-existing corruption from the old bug: two rows, same SKU. The active one must win
      // deterministically regardless of the order findAll returns them in.
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 50, sku_code: 'SKU-001', status: 'inactive', deleted_at: new Date() }),
        item({ item_id: 51, sku_code: 'SKU-001', status: 'active' })
      ]);

      const result = await previewImport(csvWith([['SKU-001', 'One']]));

      expect(result.rows[0].action).toBe('UPDATE');
      expect(result.rows[0].existingItemId).toBe(51);
    });

    it('reactivates through itemService and reports the row as reactivated, not updated', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 7, sku_code: 'SKU-001', status: 'inactive', deleted_at: new Date() })
      ]);

      const result = await confirmImport([confirmRowFor('SKU-001', 'Item One', 1)], 42);

      expect(mockReactivateItem).toHaveBeenCalledWith(7, 42);
      expect(result.reactivatedCount).toBe(1);
      expect(result.updatedCount).toBe(0);
      expect(result.createdCount).toBe(0);
      // The field update still runs afterwards -- reactivation flips status, it does not import data.
      expect(mockItemModel.update).toHaveBeenCalledTimes(1);
    });

    it('fails the row and skips its write when reactivation hits a SKU conflict', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 7, sku_code: 'SKU-001', status: 'inactive', deleted_at: new Date() })
      ]);
      const conflict = new Error('Item with this SKU code already exists');
      conflict.statusCode = 409;
      mockReactivateItem.mockRejectedValue(conflict);

      const result = await confirmImport([confirmRowFor('SKU-001', 'Item One', 1)], 42);

      expect(result.reactivatedCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.results.failed[0].errors[0]).toMatch(/Reactivation failed/i);
      expect(mockItemModel.update).not.toHaveBeenCalled();
    });
  });

  describe('sync-mode deactivation preview', () => {
    it('lists active SKUs absent from the CSV', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 1, sku_code: 'SKU-001', name: 'Kept' }),
        item({ item_id: 2, sku_code: 'SKU-002', name: 'Dropped' })
      ]);

      const result = await previewImport(csvWith([['SKU-001', 'Kept']]), { mode: 'sync' });

      expect(result.mode).toBe('sync');
      expect(result.deactivateCount).toBe(1);
      expect(result.deactivateRows).toEqual([
        expect.objectContaining({ item_id: 2, sku_code: 'SKU-002', name: 'Dropped' })
      ]);
    });

    it('returns an empty deactivation list in append mode', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 2, sku_code: 'SKU-002', name: 'Dropped' })
      ]);

      const result = await previewImport(csvWith([['SKU-001', 'New']]));

      expect(result.mode).toBe('append');
      expect(result.deactivateCount).toBe(0);
      expect(result.deactivateRows).toEqual([]);
    });

    it('excludes drafts, already-inactive rows, and rows with no SKU', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 2, sku_code: 'SKU-DRAFT', status: 'draft' }),
        item({ item_id: 3, sku_code: 'SKU-GONE', status: 'inactive', deleted_at: new Date() }),
        item({ item_id: 4, sku_code: 'SKU-OFF', status: 'inactive', deleted_at: null }),
        item({ item_id: 5, sku_code: '  ', name: 'No SKU' }),
        item({ item_id: 6, sku_code: 'SKU-REAL', name: 'Real' })
      ]);

      const result = await previewImport(csvWith([['SKU-001', 'New']]), { mode: 'sync' });

      expect(result.deactivateRows.map((r) => r.item_id)).toEqual([6]);
    });

    it('spares an item whose CSV row failed validation', async () => {
      // Presence in the file, not row validity, is what protects an item. A typo must never cost
      // a merchant their item.
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 9, sku_code: 'SKU-BAD', name: 'Typo row' })
      ]);
      const csv = [
        'sku_code,name,category,max_capacity,unit_of_measure,template_workflow_mode,mode_compatibility_note',
        'SKU-BAD,,not_a_category,100,pcs,manufacturing,"mode note"'
      ].join('\n');

      const result = await previewImport(csv, { mode: 'sync' });

      expect(result.invalidRows).toBe(1);
      expect(result.deactivateCount).toBe(0);
    });
  });

  describe('sync-mode confirm gate', () => {
    it('refuses a sync confirm with no acknowledged deactivation list', async () => {
      const result = await confirmImport([confirmRowFor('SKU-001', 'One', 1)], 42, { mode: 'sync' });

      expect(result.success).toBe(false);
      expect(result.details).toEqual({ code: 'SYNC_DEACTIVATION_NOT_ACKNOWLEDGED' });
      expect(mockDeleteItem).not.toHaveBeenCalled();
    });

    it('accepts an empty acknowledged list and deactivates nothing', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 2, sku_code: 'SKU-002' })
      ]);

      const result = await confirmImport(
        [confirmRowFor('SKU-001', 'One', 1)],
        42,
        { mode: 'sync', deactivateSkus: [] }
      );

      expect(result.success).toBe(true);
      expect(result.deactivatedCount).toBe(0);
      expect(mockDeleteItem).not.toHaveBeenCalled();
    });

    it('deactivates through deleteItem for an acknowledged, genuinely absent SKU', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 1, sku_code: 'SKU-001' }),
        item({ item_id: 2, sku_code: 'SKU-002' })
      ]);

      const result = await confirmImport(
        [confirmRowFor('SKU-001', 'One', 1)],
        42,
        { mode: 'sync', deactivateSkus: ['SKU-002'] }
      );

      expect(mockDeleteItem).toHaveBeenCalledTimes(1);
      expect(mockDeleteItem).toHaveBeenCalledWith(2, 42);
      expect(result.deactivatedCount).toBe(1);
      expect(result.results.deactivated[0]).toEqual(
        expect.objectContaining({ item_id: 2, sku_code: 'SKU-002' })
      );
    });

    it('ignores an acknowledged SKU the server does not consider absent', async () => {
      // The acknowledged list can only narrow, never widen. SKU-001 is present in the file, so a
      // client asking for it to be deactivated is refused by the server-side re-derivation.
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 1, sku_code: 'SKU-001' })
      ]);

      const result = await confirmImport(
        [confirmRowFor('SKU-001', 'One', 1)],
        42,
        { mode: 'sync', deactivateSkus: ['SKU-001'] }
      );

      expect(mockDeleteItem).not.toHaveBeenCalled();
      expect(result.deactivatedCount).toBe(0);
    });

    it('ignores a newly-absent SKU the preview never showed the user', async () => {
      // TOCTOU: SKU-003 appeared between preview and confirm, so it is absent from both the file
      // and the acknowledged list. The intersection drops it rather than deactivating something
      // the user never saw.
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 2, sku_code: 'SKU-002' }),
        item({ item_id: 3, sku_code: 'SKU-003' })
      ]);

      const result = await confirmImport(
        [confirmRowFor('SKU-001', 'One', 1)],
        42,
        { mode: 'sync', deactivateSkus: ['SKU-002'] }
      );

      expect(mockDeleteItem).toHaveBeenCalledTimes(1);
      expect(mockDeleteItem).toHaveBeenCalledWith(2, 42);
    });

    it('never deactivates in append mode, even if a list is supplied', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 2, sku_code: 'SKU-002' })
      ]);

      const result = await confirmImport(
        [confirmRowFor('SKU-001', 'One', 1)],
        42,
        { deactivateSkus: ['SKU-002'] }
      );

      expect(mockDeleteItem).not.toHaveBeenCalled();
      expect(result.mode).toBe('append');
      expect(result.deactivatedCount).toBe(0);
    });

    it('reports an item blocked by deleteItem as skipped, not failed or silently dropped', async () => {
      // deleteItem's referential guards (active product composition, open PO/JO) are reused rather
      // than reimplemented; the merchant sees exactly why an item survived the sync.
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 2, sku_code: 'SKU-002', name: 'Still used' })
      ]);
      const blocked = new Error('Cannot delete item "Still used". Reasons:\n- Referenced in 1 purchase order(s)');
      blocked.statusCode = 400;
      mockDeleteItem.mockRejectedValue(blocked);

      const result = await confirmImport(
        [confirmRowFor('SKU-001', 'One', 1)],
        42,
        { mode: 'sync', deactivateSkus: ['SKU-002'] }
      );

      expect(result.success).toBe(true);
      expect(result.deactivatedCount).toBe(0);
      expect(result.deactivationSkippedCount).toBe(1);
      expect(result.results.deactivationSkipped[0].reason).toMatch(/purchase order/i);
    });

    it('spares an item whose row is present but invalid at confirm time', async () => {
      mockItemModel.findAll.mockResolvedValue([
        item({ item_id: 9, sku_code: 'SKU-BAD', name: 'Typo row' })
      ]);
      const invalidRow = confirmRowFor('SKU-BAD', 'Typo row', 1);
      invalidRow.data.category = 'not_a_category';

      const result = await confirmImport(
        [invalidRow],
        42,
        { mode: 'sync', deactivateSkus: ['SKU-BAD'] }
      );

      expect(result.failedCount).toBe(1);
      expect(mockDeleteItem).not.toHaveBeenCalled();
      expect(result.deactivatedCount).toBe(0);
    });
  });
});
