/**
 * voidMovement Test Suite
 * Tests the voidMovement function in stockMovementService.js
 *
 * Run with: npm test -- apps/dgfy-api/tests/voidMovement.test.js
 */

import { createStockMovement, voidMovement } from '../src/services/stockMovementService.js';
import db, { sequelize, User, Item, FIFOBatch, StockMovement, BatchTransaction } from '../src/models/index.js';

// Test helpers
let testUser;
let testItem;
const timestamp = Date.now();

beforeAll(async () => {
  // Create test user
  testUser = await User.create({
    username: 'void_test_user_' + timestamp,
    password_hash: 'hash',
    email: `void_test_${timestamp}@example.com`,
    role: 'admin'
  });

  // Create test item (FIFO enabled)
  testItem = await Item.create({
    sku_code: 'VOID-TEST-' + timestamp,
    name: 'Void Test Item',
    category: 'raw_material',
    unit_of_measure: 'kg',
    current_stock: 0,
    fifo_enabled: true,
    cost_price: 10.00,
    shelf_life_days: 30
  });
});

afterAll(async () => {
  // Cleanup
  await BatchTransaction.destroy({ where: {} });
  await StockMovement.destroy({ where: { item_id: testItem?.item_id } });
  await FIFOBatch.destroy({ where: { item_id: testItem?.item_id } });
  await Item.destroy({ where: { item_id: testItem?.item_id } });
  await User.destroy({ where: { user_id: testUser?.user_id } });
  await sequelize.close();
});

describe('voidMovement', () => {

  describe('Void purchase_receipt', () => {
    it('should decrease stock and mark batch as consumed when voiding purchase_receipt', async () => {
      // Create initial stock via purchase_receipt
      const movement = await createStockMovement({
        item_id: testItem.item_id,
        quantity: 100,
        movement_type: 'purchase_receipt',
        reference_type: 'MANUAL',
        cost_per_unit: 15.00,
        notes: 'Test receipt for void'
      }, testUser.user_id);

      // Verify stock increased
      let item = await Item.findByPk(testItem.item_id);
      expect(parseFloat(item.current_stock)).toBe(100);

      // Verify batch created
      const batch = await FIFOBatch.findByPk(movement.batch_id);
      expect(batch).toBeTruthy();
      expect(parseFloat(batch.quantity)).toBe(100);

      // Void the movement
      const voidResult = await voidMovement(movement.movement_id, testUser.user_id, 'Test void of receipt');

      // Verify stock decreased
      item = await Item.findByPk(testItem.item_id);
      expect(parseFloat(item.current_stock)).toBe(0);

      // Verify void movement created with reverse type
      expect(voidResult.movement_type).toBe('return');
      expect(parseFloat(voidResult.quantity)).toBe(-100);

      // Verify batch marked as consumed
      const updatedBatch = await FIFOBatch.findByPk(movement.batch_id);
      expect(parseFloat(updatedBatch.quantity_consumed)).toBe(100);
    });
  });

  describe('Void production_consumption', () => {
    it('should increase stock and restore batch quantity_consumed', async () => {
      // First, add stock
      await createStockMovement({
        item_id: testItem.item_id,
        quantity: 50,
        movement_type: 'purchase_receipt',
        reference_type: 'MANUAL',
        cost_per_unit: 10.00
      }, testUser.user_id);

      let item = await Item.findByPk(testItem.item_id);
      const stockBefore = parseFloat(item.current_stock);

      // Create consumption movement
      const consumptionMovement = await createStockMovement({
        item_id: testItem.item_id,
        quantity: 30,
        movement_type: 'production_consumption',
        reference_type: 'JO',
        reference_id: 'JO-TEST-001'
      }, testUser.user_id);

      // Verify stock decreased
      item = await Item.findByPk(testItem.item_id);
      expect(parseFloat(item.current_stock)).toBe(stockBefore - 30);

      // Get batch to check consumption
      const batchBefore = await FIFOBatch.findByPk(consumptionMovement.batch_id);
      const consumedBefore = parseFloat(batchBefore.quantity_consumed);

      // Void the consumption
      const voidResult = await voidMovement(consumptionMovement.movement_id, testUser.user_id, 'Undo consumption');

      // Verify stock restored
      item = await Item.findByPk(testItem.item_id);
      expect(parseFloat(item.current_stock)).toBe(stockBefore);

      // Verify void movement type
      expect(voidResult.movement_type).toBe('return');
      expect(parseFloat(voidResult.quantity)).toBe(30);

      // Verify batch quantity_consumed restored
      const batchAfter = await FIFOBatch.findByPk(consumptionMovement.batch_id);
      expect(parseFloat(batchAfter.quantity_consumed)).toBe(consumedBefore - 30);
    });
  });

  describe('Void calculated_loss', () => {
    it('should increase stock when voiding calculated_loss', async () => {
      // Add stock first
      await createStockMovement({
        item_id: testItem.item_id,
        quantity: 40,
        movement_type: 'purchase_receipt',
        reference_type: 'MANUAL',
        cost_per_unit: 10.00
      }, testUser.user_id);

      let item = await Item.findByPk(testItem.item_id);
      const stockBefore = parseFloat(item.current_stock);

      // Record a loss
      const lossMovement = await createStockMovement({
        item_id: testItem.item_id,
        quantity: 10,
        movement_type: 'calculated_loss',
        reference_type: 'MANUAL',
        loss_reason: 'damage',
        notes: 'Damaged goods'
      }, testUser.user_id);

      // Verify stock decreased
      item = await Item.findByPk(testItem.item_id);
      expect(parseFloat(item.current_stock)).toBe(stockBefore - 10);

      // Void the loss
      const voidResult = await voidMovement(lossMovement.movement_id, testUser.user_id, 'Loss was incorrect');

      // Verify stock restored
      item = await Item.findByPk(testItem.item_id);
      expect(parseFloat(item.current_stock)).toBe(stockBefore);

      // Verify void movement type
      expect(voidResult.movement_type).toBe('adjustment');
      expect(parseFloat(voidResult.quantity)).toBe(10);
    });
  });

  describe('Double-void prevention', () => {
    it('should throw error when attempting to void an already voided movement', async () => {
      // Add and consume stock
      await createStockMovement({
        item_id: testItem.item_id,
        quantity: 20,
        movement_type: 'purchase_receipt',
        reference_type: 'MANUAL'
      }, testUser.user_id);

      const movement = await createStockMovement({
        item_id: testItem.item_id,
        quantity: 5,
        movement_type: 'production_consumption',
        reference_type: 'MANUAL'
      }, testUser.user_id);

      // Void once - should succeed
      await voidMovement(movement.movement_id, testUser.user_id, 'First void');

      // Try to void again - should fail
      await expect(
        voidMovement(movement.movement_id, testUser.user_id, 'Second void attempt')
      ).rejects.toThrow('Movement is already voided');
    });
  });

  describe('Void non-existent movement', () => {
    it('should throw 404 error for non-existent movement', async () => {
      const fakeId = 999999;

      await expect(
        voidMovement(fakeId, testUser.user_id, 'Void fake movement')
      ).rejects.toThrow('Movement not found');
    });
  });

  describe('Multi-batch consumption void', () => {
    it('should restore all affected batches when voiding multi-batch consumption', async () => {
      // Create a fresh item for this test
      const multiBatchItem = await Item.create({
        sku_code: 'MULTI-BATCH-' + Date.now(),
        name: 'Multi Batch Test Item',
        category: 'raw_material',
        unit_of_measure: 'kg',
        current_stock: 0,
        fifo_enabled: true,
        cost_price: 10.00
      });

      try {
        // Create Batch A: 100kg @ $10
        await createStockMovement({
          item_id: multiBatchItem.item_id,
          quantity: 100,
          movement_type: 'purchase_receipt',
          reference_type: 'MANUAL',
          cost_per_unit: 10.00,
          po_number: 'BATCH-A'
        }, testUser.user_id);

        // Small delay to ensure different timestamps
        await new Promise(r => setTimeout(r, 10));

        // Create Batch B: 50kg @ $12
        await createStockMovement({
          item_id: multiBatchItem.item_id,
          quantity: 50,
          movement_type: 'purchase_receipt',
          reference_type: 'MANUAL',
          cost_per_unit: 12.00,
          po_number: 'BATCH-B'
        }, testUser.user_id);

        // Verify total stock: 150
        let item = await Item.findByPk(multiBatchItem.item_id);
        expect(parseFloat(item.current_stock)).toBe(150);

        // Consume 120kg (should use all of Batch A + 20 from Batch B)
        const consumptionMovement = await createStockMovement({
          item_id: multiBatchItem.item_id,
          quantity: 120,
          movement_type: 'production_consumption',
          reference_type: 'JO',
          reference_id: 'JO-MULTI-001'
        }, testUser.user_id);

        // Verify stock decreased to 30
        item = await Item.findByPk(multiBatchItem.item_id);
        expect(parseFloat(item.current_stock)).toBe(30);

        // Verify BatchTransactions created
        const batchTxns = await BatchTransaction.findAll({
          where: { movement_id: consumptionMovement.movement_id }
        });
        expect(batchTxns.length).toBe(2);

        // Get batches and verify consumption
        const batches = await FIFOBatch.findAll({
          where: { item_id: multiBatchItem.item_id },
          order: [['received_date', 'ASC']]
        });

        expect(parseFloat(batches[0].quantity_consumed)).toBe(100); // Batch A fully consumed
        expect(parseFloat(batches[1].quantity_consumed)).toBe(20);  // Batch B partial

        // NOW VOID THE MULTI-BATCH CONSUMPTION
        const voidResult = await voidMovement(
          consumptionMovement.movement_id,
          testUser.user_id,
          'Voiding multi-batch consumption'
        );

        // Verify stock restored to 150
        item = await Item.findByPk(multiBatchItem.item_id);
        expect(parseFloat(item.current_stock)).toBe(150);

        // Verify BOTH batches restored
        const restoredBatches = await FIFOBatch.findAll({
          where: { item_id: multiBatchItem.item_id },
          order: [['received_date', 'ASC']]
        });

        expect(parseFloat(restoredBatches[0].quantity_consumed)).toBe(0); // Batch A restored
        expect(parseFloat(restoredBatches[1].quantity_consumed)).toBe(0); // Batch B restored

        // Verify void movement
        expect(voidResult.movement_type).toBe('return');
        expect(parseFloat(voidResult.quantity)).toBe(120);

      } finally {
        // Cleanup multi-batch test data
        await BatchTransaction.destroy({ where: {} });
        await StockMovement.destroy({ where: { item_id: multiBatchItem.item_id } });
        await FIFOBatch.destroy({ where: { item_id: multiBatchItem.item_id } });
        await Item.destroy({ where: { item_id: multiBatchItem.item_id } });
      }
    });
  });

  describe('Void receipt with consumed batch (Finding 5.3)', () => {
    let f53Item;

    beforeEach(async () => {
      f53Item = await Item.create({
        sku_code: 'F53-TEST-' + Date.now(),
        name: 'F53 Batch Guard Item',
        category: 'raw_material',
        unit_of_measure: 'kg',
        current_stock: 0,
        fifo_enabled: true,
        cost_price: 5.00
      });
    });

    afterEach(async () => {
      await BatchTransaction.destroy({ where: {} });
      await StockMovement.destroy({ where: { item_id: f53Item?.item_id } });
      await FIFOBatch.destroy({ where: { item_id: f53Item?.item_id } });
      await Item.destroy({ where: { item_id: f53Item?.item_id } });
    });

    it('should throw 409 when voiding a receipt whose batch was partially consumed', async () => {
      // 1. Receive 100 units -> creates Batch A
      const receiptMovement = await createStockMovement({
        item_id: f53Item.item_id,
        quantity: 100,
        movement_type: 'purchase_receipt',
        reference_type: 'MANUAL',
        cost_per_unit: 5.00,
        notes: 'F53 receipt for partial consume test'
      }, testUser.user_id);

      // 2. Consume 50 units from Batch A (simulates a Job Order)
      await createStockMovement({
        item_id: f53Item.item_id,
        quantity: 50,
        movement_type: 'production_consumption',
        reference_type: 'JO',
        reference_id: 'JO-F53-PARTIAL'
      }, testUser.user_id);

      // 3. Attempt to void the receipt -> must fail
      await expect(
        voidMovement(receiptMovement.movement_id, testUser.user_id, 'Trying to void used receipt')
      ).rejects.toThrow(/Cannot void this movement.*batch.*already been.*used downstream/i);

      // 4. Stock should remain unchanged (rollback occurred)
      const item = await Item.findByPk(f53Item.item_id);
      expect(parseFloat(item.current_stock)).toBe(50); // 100 received, 50 consumed
    });

    it('should throw 409 when voiding a receipt whose batch was fully consumed', async () => {
      // 1. Receive 30 units -> creates Batch
      const receiptMovement = await createStockMovement({
        item_id: f53Item.item_id,
        quantity: 30,
        movement_type: 'purchase_receipt',
        reference_type: 'MANUAL',
        cost_per_unit: 5.00,
        notes: 'F53 receipt for full consume test'
      }, testUser.user_id);

      // 2. Consume all 30 units
      await createStockMovement({
        item_id: f53Item.item_id,
        quantity: 30,
        movement_type: 'production_consumption',
        reference_type: 'JO',
        reference_id: 'JO-F53-FULL'
      }, testUser.user_id);

      // 3. Attempt to void the receipt -> must fail
      await expect(
        voidMovement(receiptMovement.movement_id, testUser.user_id, 'Trying to void fully used receipt')
      ).rejects.toThrow(/Cannot void this movement.*batch.*already been.*used downstream/i);

      // 4. Stock remains at 0 (no double-negative)
      const item = await Item.findByPk(f53Item.item_id);
      expect(parseFloat(item.current_stock)).toBe(0);
    });

    it('should allow voiding a receipt when batch has zero consumption', async () => {
      // 1. Receive 40 units -> creates Batch (never consumed)
      const receiptMovement = await createStockMovement({
        item_id: f53Item.item_id,
        quantity: 40,
        movement_type: 'purchase_receipt',
        reference_type: 'MANUAL',
        cost_per_unit: 5.00,
        notes: 'F53 receipt for zero consume test'
      }, testUser.user_id);

      // 2. Void the receipt immediately -> should succeed
      const voidResult = await voidMovement(
        receiptMovement.movement_id,
        testUser.user_id,
        'Voiding unused receipt'
      );

      expect(voidResult.movement_type).toBe('return');
      expect(parseFloat(voidResult.quantity)).toBe(-40);

      const item = await Item.findByPk(f53Item.item_id);
      expect(parseFloat(item.current_stock)).toBe(0);
    });
  });

  describe('Void with negative stock prevention', () => {
    it('should block voiding an addition whose batch was partially consumed (batch guard fires before stock check)', async () => {
      // Create a fresh item
      const negStockItem = await Item.create({
        sku_code: 'NEG-STOCK-' + Date.now(),
        name: 'Neg Stock Test Item',
        category: 'raw_material',
        unit_of_measure: 'pcs',
        current_stock: 0,
        fifo_enabled: true
      });

      try {
        // Add 100 units
        const addMovement = await createStockMovement({
          item_id: negStockItem.item_id,
          quantity: 100,
          movement_type: 'purchase_receipt',
          reference_type: 'MANUAL'
        }, testUser.user_id);

        // Consume 80 units
        await createStockMovement({
          item_id: negStockItem.item_id,
          quantity: 80,
          movement_type: 'production_consumption',
          reference_type: 'MANUAL'
        }, testUser.user_id);

        // Current stock: 20
        let item = await Item.findByPk(negStockItem.item_id);
        expect(parseFloat(item.current_stock)).toBe(20);

        // Try to void the original 100 addition — should fail.
        // The batch-consumed guard (Finding 5.3) fires first and returns a more
        // specific error than "negative stock" (though both would prevent the void).
        await expect(
          voidMovement(addMovement.movement_id, testUser.user_id, 'Try to void addition')
        ).rejects.toThrow(/Cannot void this movement.*batch.*already been.*used downstream/i);

      } finally {
        await BatchTransaction.destroy({ where: {} });
        await StockMovement.destroy({ where: { item_id: negStockItem.item_id } });
        await FIFOBatch.destroy({ where: { item_id: negStockItem.item_id } });
        await Item.destroy({ where: { item_id: negStockItem.item_id } });
      }
    });
  });
});

