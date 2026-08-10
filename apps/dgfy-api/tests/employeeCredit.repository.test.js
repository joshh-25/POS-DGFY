import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { employeeCreditRepository } from '../src/modules/employeeCredit/repositories/employeeCreditRepository.js';

describe('Employee Credit repository', () => {
  it('selects the real tenant location name column for checkout employees', async () => {
    const findAll = jest.fn(async () => []);
    const getModel = jest.spyOn(dbStore, 'get').mockImplementation((modelName) => {
      if (modelName === 'Employee') return { findAll };
      return { modelName };
    });

    try {
      await employeeCreditRepository.listCheckoutEmployees({
        search: 'employee',
        locationId: 3,
        limit: 10
      });

      const query = findAll.mock.calls[0][0];
      expect(query.include[0]).toEqual(expect.objectContaining({
        as: 'location',
        attributes: ['location_id', 'name']
      }));
      expect(query.include[0].attributes).not.toContain('location_name');
    } finally {
      getModel.mockRestore();
    }
  });
});
