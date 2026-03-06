import { jest } from '@jest/globals';
import { buildSupplierToolRegistry } from '../src/modules/ai/usecases/toolHandlers/supplierToolRegistry.js';

describe('supplierToolRegistry', () => {
  it('get_suppliers maps array payload to response list', async () => {
    const registry = buildSupplierToolRegistry({
      supplierService: {
        getSuppliers: jest.fn().mockResolvedValue([
          {
            supplier_id: 1,
            name: 'Acme',
            contact_person: 'Jane',
            email: 'jane@acme.test',
            phone: '123',
            quality_rating: 4.8,
            avg_delivery_days: 3
          }
        ])
      }
    });

    const result = await registry.get_suppliers({ args: {} });

    expect(result).toEqual({
      count: 1,
      suppliers: [
        {
          id: 1,
          name: 'Acme',
          contact_person: 'Jane',
          email: 'jane@acme.test',
          phone: '123',
          quality_rating: 4.8,
          avg_delivery_days: 3
        }
      ]
    });
  });

  it('get_supplier_details throws when supplier is missing', async () => {
    const registry = buildSupplierToolRegistry({
      supplierService: {
        getSupplierById: jest.fn().mockResolvedValue(null)
      }
    });

    await expect(
      registry.get_supplier_details({ args: { supplier_id: 5 } })
    ).rejects.toThrow('Supplier not found');
  });

  it('update_supplier maps lead_time to avg_delivery_days before service call', async () => {
    const updateSupplier = jest.fn().mockResolvedValue({
      supplier_id: 2,
      name: 'NorthStar',
      status: 'active'
    });

    const registry = buildSupplierToolRegistry({
      supplierService: { updateSupplier }
    });

    const result = await registry.update_supplier({
      args: { supplier_id: 2, lead_time: 6, phone: '555-111' },
      user: { user_id: 9 }
    });

    expect(updateSupplier).toHaveBeenCalledWith(
      2,
      { avg_delivery_days: 6, phone: '555-111' },
      9
    );
    expect(result.supplier).toEqual({ id: 2, name: 'NorthStar', status: 'active' });
  });

  it('add_supplier_item defaults moq to 1 when missing', async () => {
    const addSupplierItem = jest.fn().mockResolvedValue(undefined);
    const registry = buildSupplierToolRegistry({
      supplierService: { addSupplierItem }
    });

    const result = await registry.add_supplier_item({
      args: { supplier_id: 3, item_id: 10, price_per_unit: 5.25 }
    });

    expect(addSupplierItem).toHaveBeenCalledWith(3, {
      item_id: 10,
      moq: 1,
      price_per_unit: 5.25
    });
    expect(result.success).toBe(true);
  });
});
