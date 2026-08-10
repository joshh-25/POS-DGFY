import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { employeeRepository } from '../src/modules/employees/repositories/employeeRepository.js';

describe('Employee repository', () => {
  it('reads the real tenant location name column while preserving the location_name API field', async () => {
    const findAll = jest.fn(async () => []);
    const getModel = jest.spyOn(dbStore, 'get').mockImplementation((modelName) => {
      if (modelName === 'Employee') return { findAll };
      return { modelName };
    });

    try {
      await employeeRepository.list({ includeInactive: false });

      const query = findAll.mock.calls[0][0];
      expect(query.include[0]).toEqual(expect.objectContaining({
        as: 'location',
        attributes: ['location_id', ['name', 'location_name']]
      }));
    } finally {
      getModel.mockRestore();
    }
  });
});
