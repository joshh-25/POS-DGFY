/**
 * E2E Full Cycle Integration Test
 * Tests the complete FIFO workflow:
 * 1. PO Receipt (Material In)
 * 2. JO Creation/Completion (Material Out → Product In)
 * 3. Manual Loss Adjustment
 * 4. Void a Movement
 * 5. Final Verification
 *
 * Run with: npm test -- backend/tests/e2e-full-cycle.test.js
 */

import { createPurchaseOrder, receivePurchaseOrder } from '../src/services/purchaseOrderService.js';
import { createJobOrder, completeJobOrder } from '../src/services/jobOrderService.js';
import { createStockMovement, voidMovement, getItemBatches } from '../src/services/stockMovementService.js';
import { auditRuntimeSchemaReadiness } from '../src/services/runtimeSchemaAuditService.js';
import db, {
  sequelize,
  User,
  Item,
  Supplier,
  FIFOBatch,
  StockMovement,
  BatchTransaction,
  TenantLocation,
  UserLocationGrant,
  PurchaseOrder,
  POLineItem,
  JobOrder,
  JOIngredient
} from '../src/models/index.js';

describe('E2E Full Cycle: PO → JO → Loss → Void', () => {
  // Test data
  let testUser;
  let supplier;
  let ingredient1;
  let ingredient2;
  let finishedProduct;
  let createdPO;
  let createdJO;
  let lossMovement;
  let sourceLocationId;
  let destinationLocationId;
  const createdLocationIds = [];
  let runtimeReady = true;
  let runtimeSkipReason = '';
  let runtimeSkipLogged = false;
  const timestamp = Date.now();

  const itIfRuntimeReady = (name, fn) => it(name, async () => {
    if (!runtimeReady) {
      if (!runtimeSkipLogged) {
        console.warn(`[E2E skipped] ${runtimeSkipReason}`);
        runtimeSkipLogged = true;
      }
      return;
    }
    await fn();
  });

  beforeAll(async () => {
    const runtimeAudit = await auditRuntimeSchemaReadiness({ sequelizeInstance: sequelize });
    if (runtimeAudit.status !== 'healthy') {
      runtimeReady = false;
      runtimeSkipReason = `Runtime schema not ready (${runtimeAudit.issueCount} issue(s))`;
      return;
    }

    // Create test user
    testUser = await User.create({
      username: 'e2e_test_user_' + timestamp,
      password_hash: 'hash',
      email: `e2e_test_${timestamp}@example.com`,
      role: 'admin'
    });

    let activeLocations = await TenantLocation.findAll({
      where: { is_active: true },
      order: [['location_id', 'ASC']]
    });
    if (!activeLocations.length) {
      const primary = await TenantLocation.create({
        name: `E2E Primary ${timestamp}`,
        address_line: 'E2E Primary Address',
        latitude: 14.6001,
        longitude: 120.9831,
        is_active: true,
        is_open: true,
        is_primary_storefront: true
      });
      const secondary = await TenantLocation.create({
        name: `E2E Secondary ${timestamp}`,
        address_line: 'E2E Secondary Address',
        latitude: 14.5995,
        longitude: 120.9842,
        is_active: true,
        is_open: true,
        is_primary_storefront: false
      });
      createdLocationIds.push(primary.location_id, secondary.location_id);
      activeLocations = await TenantLocation.findAll({
        where: { is_active: true },
        order: [['location_id', 'ASC']]
      });
    }
    if (activeLocations.length < 2) {
      const fallbackLocation = await TenantLocation.create({
        name: `E2E Secondary ${timestamp}`,
        address_line: 'E2E Secondary Address',
        latitude: 14.5995,
        longitude: 120.9842,
        is_active: true,
        is_open: true,
        is_primary_storefront: false
      });
      createdLocationIds.push(fallbackLocation.location_id);
      activeLocations = await TenantLocation.findAll({
        where: { is_active: true },
        order: [['location_id', 'ASC']]
      });
    }

    sourceLocationId = Number(activeLocations[0].location_id);
    destinationLocationId = Number((activeLocations[1] || activeLocations[0]).location_id);
    if (destinationLocationId === sourceLocationId && activeLocations[1]) {
      destinationLocationId = Number(activeLocations[1].location_id);
    }

    try {
      await UserLocationGrant.bulkCreate(
        activeLocations.map((location) => ({
          user_id: testUser.user_id,
          location_id: Number(location.location_id),
          created_by: testUser.user_id
        })),
        { ignoreDuplicates: true }
      );
    } catch {
      // Older test databases may not have user_location_grants yet.
    }

    // Create supplier
    supplier = await Supplier.create({
      name: 'E2E Test Supplier ' + timestamp,
      contact_email: 'e2e@supplier.test'
    });

    // Create 2 ingredient items (FIFO enabled)
    ingredient1 = await Item.create({
      sku_code: 'E2E-ING1-' + timestamp,
      name: 'E2E Ingredient 1 (Flour)',
      category: 'raw_material',
      unit_of_measure: 'kg',
      current_stock: 0,
      fifo_enabled: true,
      cost_per_unit: 5.00,
      shelf_life_days: 90
    });

    ingredient2 = await Item.create({
      sku_code: 'E2E-ING2-' + timestamp,
      name: 'E2E Ingredient 2 (Sugar)',
      category: 'raw_material',
      unit_of_measure: 'kg',
      current_stock: 0,
      fifo_enabled: true,
      cost_per_unit: 8.00,
      shelf_life_days: 180
    });

    // Create finished product (FIFO enabled)
    finishedProduct = await Item.create({
      sku_code: 'E2E-PROD-' + timestamp,
      name: 'E2E Finished Product (Cake)',
      category: 'product',
      product_type: 'finished_goods',
      unit_of_measure: 'units',
      current_stock: 0,
      fifo_enabled: true,
      cost_per_unit: 50.00,
      shelf_life_days: 7
    });
  });

  afterAll(async () => {
    if (!runtimeReady) {
      await sequelize.close();
      return;
    }

    // Cleanup in reverse order of dependencies
    await BatchTransaction.destroy({ where: {} });
    await StockMovement.destroy({ where: {} });
    await JOIngredient.destroy({ where: {} });
    await JobOrder.destroy({ where: {} });
    await POLineItem.destroy({ where: {} });
    await PurchaseOrder.destroy({ where: {} });
    try {
      await UserLocationGrant.destroy({ where: { user_id: testUser?.user_id } });
    } catch {
      // Ignore if table is unavailable in local test schema.
    }
    if (createdLocationIds.length) {
      try {
        await TenantLocation.destroy({ where: { location_id: createdLocationIds } });
      } catch {
        // Ignore cleanup drift for tenant_locations in legacy local schemas.
      }
    }
    await FIFOBatch.destroy({ where: {} });
    await Item.destroy({ where: { item_id: [ingredient1?.item_id, ingredient2?.item_id, finishedProduct?.item_id].filter(Boolean) } });
    await Supplier.destroy({ where: { supplier_id: supplier?.supplier_id } });
    await User.destroy({ where: { user_id: testUser?.user_id } });
    await sequelize.close();
  });

  // =====================================
  // STEP 1: PO Receipt (Material In)
  // =====================================
  describe('Step 1: PO Receipt', () => {
    itIfRuntimeReady('should create PO with 2 ingredients and receive them', async () => {
      // Create PO with both ingredients
      const poData = {
        supplier_id: supplier.supplier_id,
        notes: 'E2E Test PO',
        line_items: [
          { item_id: ingredient1.item_id, quantity_ordered: 100, unit_price: 6.00 },  // Flour: 100kg @ $6
          { item_id: ingredient2.item_id, quantity_ordered: 50, unit_price: 9.00 }    // Sugar: 50kg @ $9
        ]
      };

      createdPO = await createPurchaseOrder(poData, testUser.user_id);
      expect(createdPO.po_number).toBeTruthy();
      expect(createdPO.lineItems.length).toBe(2);

      // Receive PO fully
      const receiptData = {
        location_id: destinationLocationId,
        line_items: createdPO.lineItems.map(li => ({
          line_item_id: li.line_item_id,
          quantity_received: li.quantity_ordered
        })),
        notes: 'Full receipt'
      };

      await receivePurchaseOrder(createdPO.po_id, receiptData, testUser.user_id);

      // Verify stock increased
      const ing1 = await Item.findByPk(ingredient1.item_id);
      const ing2 = await Item.findByPk(ingredient2.item_id);

      expect(parseFloat(ing1.current_stock)).toBe(100);
      expect(parseFloat(ing2.current_stock)).toBe(50);
    });

    itIfRuntimeReady('should create FIFO batches with correct costs from PO', async () => {
      const batches1 = await FIFOBatch.findAll({ where: { item_id: ingredient1.item_id } });
      const batches2 = await FIFOBatch.findAll({ where: { item_id: ingredient2.item_id } });

      expect(batches1.length).toBe(1);
      expect(batches2.length).toBe(1);

      // Verify cost override from PO
      expect(parseFloat(batches1[0].cost_per_unit)).toBe(6.00);  // PO price, not item default
      expect(parseFloat(batches2[0].cost_per_unit)).toBe(9.00);

      // Verify PO reference
      expect(batches1[0].po_number).toBe(createdPO.po_number);
      expect(batches2[0].po_number).toBe(createdPO.po_number);
    });

    itIfRuntimeReady('should create stock movements for PO receipt', async () => {
      const movements = await StockMovement.findAll({
        where: { reference_id: createdPO.po_number }
      });

      expect(movements.length).toBe(2);
      movements.forEach(m => {
        expect(m.movement_type).toBe('purchase_receipt');
        expect(m.reference_type).toBe('PO');
      });
    });
  });

  // =====================================
  // STEP 2: JO Creation/Completion
  // =====================================
  describe('Step 2: JO Creation and Completion', () => {
    itIfRuntimeReady('should create and complete JO consuming ingredients via FIFO', async () => {
      // Create JO: Make 10 cakes requiring 50kg flour + 25kg sugar each
      const joData = {
        product_id: finishedProduct.item_id,
        quantity_to_produce: 10,
        start_date: new Date(),
        status: 'in_progress', // Non-draft to generate jo_number for reference tracking
        ingredients: [
          { item_id: ingredient1.item_id, quantity_required: 50 },  // 50kg flour
          { item_id: ingredient2.item_id, quantity_required: 25 }   // 25kg sugar
        ]
      };

      createdJO = await createJobOrder(joData, testUser.user_id);
      expect(createdJO.jo_number).toBeTruthy();

      // Complete JO
      await completeJobOrder(
        createdJO.jo_id,
        testUser.user_id,
        null,
        'E2E completion',
        10,
        'passed',
        sourceLocationId,
        destinationLocationId
      );

      // Verify ingredient stock decreased
      const ing1 = await Item.findByPk(ingredient1.item_id);
      const ing2 = await Item.findByPk(ingredient2.item_id);

      expect(parseFloat(ing1.current_stock)).toBe(50);   // 100 - 50 = 50
      expect(parseFloat(ing2.current_stock)).toBe(25);   // 50 - 25 = 25

      // Verify product stock increased
      const product = await Item.findByPk(finishedProduct.item_id);
      expect(parseFloat(product.current_stock)).toBe(10);
    });

    itIfRuntimeReady('should consume from FIFO batches correctly', async () => {
      // Check ingredient batches consumed
      const batches1 = await FIFOBatch.findAll({ where: { item_id: ingredient1.item_id } });
      const batches2 = await FIFOBatch.findAll({ where: { item_id: ingredient2.item_id } });

      expect(parseFloat(batches1[0].quantity_consumed)).toBe(50);  // 50 of 100 consumed
      expect(parseFloat(batches2[0].quantity_consumed)).toBe(25);  // 25 of 50 consumed
    });

    itIfRuntimeReady('should create production_output movement for finished product', async () => {
      const productMovements = await StockMovement.findAll({
        where: {
          item_id: finishedProduct.item_id,
          movement_type: 'production_output'
        }
      });

      expect(productMovements.length).toBe(1);
      expect(parseFloat(productMovements[0].quantity)).toBe(10);
      expect(productMovements[0].reference_id).toBe(createdJO.jo_number);
    });

    itIfRuntimeReady('should create BatchTransaction records for ingredient consumption', async () => {
      // Get consumption movements for ingredients
      const consumptionMovements = await StockMovement.findAll({
        where: {
          reference_id: createdJO.jo_number,
          movement_type: 'production_consumption'
        },
        include: [{ model: BatchTransaction, as: 'batchTransactions' }]
      });

      expect(consumptionMovements.length).toBe(2);  // One per ingredient

      // Each should have at least one BatchTransaction
      consumptionMovements.forEach(m => {
        expect(m.batchTransactions.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // =====================================
  // STEP 3: Manual Loss Adjustment
  // =====================================
  describe('Step 3: Manual Loss Adjustment', () => {
    itIfRuntimeReady('should record calculated_loss for damaged product', async () => {
      const productBefore = await Item.findByPk(finishedProduct.item_id);
      const stockBefore = parseFloat(productBefore.current_stock);

      // Record loss of 3 units due to damage
      lossMovement = await createStockMovement({
        item_id: finishedProduct.item_id,
        quantity: 3,
        movement_type: 'calculated_loss',
        location_id: destinationLocationId,
        reference_type: 'MANUAL',
        loss_reason: 'damage',
        notes: 'Dropped during packing'
      }, testUser.user_id);

      expect(lossMovement.movement_id).toBeTruthy();
      expect(lossMovement.loss_reason).toBe('damage');

      // Verify stock decreased
      const productAfter = await Item.findByPk(finishedProduct.item_id);
      expect(parseFloat(productAfter.current_stock)).toBe(stockBefore - 3);  // 10 - 3 = 7
    });

    itIfRuntimeReady('should consume from product FIFO batch', async () => {
      const productBatches = await FIFOBatch.findAll({
        where: { item_id: finishedProduct.item_id }
      });

      expect(productBatches.length).toBe(1);
      expect(parseFloat(productBatches[0].quantity_consumed)).toBe(3);
    });
  });

  // =====================================
  // STEP 4: Void a Movement
  // =====================================
  describe('Step 4: Void Movement', () => {
    itIfRuntimeReady('should void the loss adjustment and restore stock', async () => {
      const productBefore = await Item.findByPk(finishedProduct.item_id);
      const stockBefore = parseFloat(productBefore.current_stock);  // Should be 7

      // Void the loss
      const voidResult = await voidMovement(
        lossMovement.movement_id,
        testUser.user_id,
        'Loss was miscounted'
      );

      expect(voidResult.movement_type).toBe('adjustment');
      expect(parseFloat(voidResult.quantity)).toBe(3);  // Positive (restoring)

      // Verify stock restored
      const productAfter = await Item.findByPk(finishedProduct.item_id);
      expect(parseFloat(productAfter.current_stock)).toBe(stockBefore + 3);  // 7 + 3 = 10
    });

    itIfRuntimeReady('should restore product FIFO batch quantity_consumed', async () => {
      const productBatches = await FIFOBatch.findAll({
        where: { item_id: finishedProduct.item_id }
      });

      // quantity_consumed should be back to 0 (the loss was the only consumption)
      expect(parseFloat(productBatches[0].quantity_consumed)).toBe(0);
    });

    itIfRuntimeReady('should mark original movement as voided', async () => {
      const originalMovement = await StockMovement.findByPk(lossMovement.movement_id);
      expect(originalMovement.notes).toContain('Voided by');
    });
  });

  // =====================================
  // STEP 5: Final Verification
  // =====================================
  describe('Step 5: Final Verification', () => {
    itIfRuntimeReady('should have correct final stock levels', async () => {
      const ing1 = await Item.findByPk(ingredient1.item_id);
      const ing2 = await Item.findByPk(ingredient2.item_id);
      const product = await Item.findByPk(finishedProduct.item_id);

      // Ingredient 1: Started 0, received 100, consumed 50 → 50
      expect(parseFloat(ing1.current_stock)).toBe(50);

      // Ingredient 2: Started 0, received 50, consumed 25 → 25
      expect(parseFloat(ing2.current_stock)).toBe(25);

      // Product: Started 0, produced 10, lost 3, voided loss → 10
      expect(parseFloat(product.current_stock)).toBe(10);
    });

    itIfRuntimeReady('should have correct batch consumption totals', async () => {
      const ing1Batches = await FIFOBatch.findAll({ where: { item_id: ingredient1.item_id } });
      const ing2Batches = await FIFOBatch.findAll({ where: { item_id: ingredient2.item_id } });
      const productBatches = await FIFOBatch.findAll({ where: { item_id: finishedProduct.item_id } });

      // Ingredient batches: partial consumption
      expect(parseFloat(ing1Batches[0].quantity)).toBe(100);
      expect(parseFloat(ing1Batches[0].quantity_consumed)).toBe(50);  // 50 available

      expect(parseFloat(ing2Batches[0].quantity)).toBe(50);
      expect(parseFloat(ing2Batches[0].quantity_consumed)).toBe(25);  // 25 available

      // Product batch: no consumption after void
      expect(parseFloat(productBatches[0].quantity)).toBe(10);
      expect(parseFloat(productBatches[0].quantity_consumed)).toBe(0);  // All 10 available
    });

    itIfRuntimeReady('should have complete audit trail in stock movements', async () => {
      // Get all movements for our items
      const allMovements = await StockMovement.findAll({
        where: {
          item_id: [ingredient1.item_id, ingredient2.item_id, finishedProduct.item_id]
        },
        order: [['timestamp', 'ASC']]
      });

      // Expected movements:
      // 1. purchase_receipt x2 (ingredients from PO)
      // 2. production_consumption x2 (JO consuming ingredients)
      // 3. production_output x1 (JO producing product)
      // 4. calculated_loss x1 (manual loss)
      // 5. adjustment x1 (void of loss)
      expect(allMovements.length).toBe(7);

      // Verify movement types present
      const types = allMovements.map(m => m.movement_type);
      expect(types.filter(t => t === 'purchase_receipt').length).toBe(2);
      expect(types.filter(t => t === 'production_consumption').length).toBe(2);
      expect(types.filter(t => t === 'production_output').length).toBe(1);
      expect(types.filter(t => t === 'calculated_loss').length).toBe(1);
      expect(types.filter(t => t === 'adjustment').length).toBe(1);
    });

    itIfRuntimeReady('should calculate correct inventory valuation', async () => {
      // Get available batches with their costs
      const ing1Batches = await getItemBatches(ingredient1.item_id, sourceLocationId);
      const ing2Batches = await getItemBatches(ingredient2.item_id, sourceLocationId);
      const productBatches = await getItemBatches(finishedProduct.item_id, destinationLocationId);
      const consumptionMovements = await StockMovement.findAll({
        where: {
          reference_id: createdJO.jo_number,
          movement_type: 'production_consumption'
        },
        include: [{ model: BatchTransaction, as: 'batchTransactions' }]
      });
      const outputMovements = await StockMovement.findAll({
        where: {
          reference_id: createdJO.jo_number,
          movement_type: 'production_output',
          item_id: finishedProduct.item_id
        }
      });

      // Note: available_quantity is returned as string from SQL computed column, must parseFloat
      // Ingredient 1: 50kg available @ $6/kg = $300
      const ing1Value = ing1Batches.reduce((sum, b) => sum + (parseFloat(b.dataValues.available_quantity) * parseFloat(b.cost_per_unit)), 0);
      expect(ing1Value).toBe(300);

      // Ingredient 2: 25kg available @ $9/kg = $225
      const ing2Value = ing2Batches.reduce((sum, b) => sum + (parseFloat(b.dataValues.available_quantity) * parseFloat(b.cost_per_unit)), 0);
      expect(ing2Value).toBe(225);

      const totalConsumedInputCost = consumptionMovements.reduce((sum, movement) => (
        sum + movement.batchTransactions.reduce((lineSum, tx) => (
          lineSum + (parseFloat(tx.quantity_consumed) * parseFloat(tx.cost_per_unit))
        ), 0)
      ), 0);
      const totalProducedQuantity = outputMovements.reduce((sum, movement) => (
        sum + parseFloat(movement.quantity || 0)
      ), 0);
      const expectedOutputUnitCost = totalProducedQuantity > 0
        ? totalConsumedInputCost / totalProducedQuantity
        : parseFloat(finishedProduct.cost_per_unit || 0);

      // Product valuation should follow JO output cost computed from consumed FIFO batches.
      const productValue = productBatches.reduce((sum, b) => sum + (parseFloat(b.dataValues.available_quantity) * parseFloat(b.cost_per_unit)), 0);
      const expectedProductValue = productBatches.reduce((sum, b) => (
        sum + (parseFloat(b.dataValues.available_quantity) * expectedOutputUnitCost)
      ), 0);
      expect(productValue).toBeCloseTo(expectedProductValue, 4);

      // Total inventory value follows current on-hand balances.
      const totalValue = ing1Value + ing2Value + productValue;
      expect(totalValue).toBeCloseTo(ing1Value + ing2Value + expectedProductValue, 4);
    });
  });
});
