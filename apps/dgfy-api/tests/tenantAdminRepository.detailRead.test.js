import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { tenantAdminRepository } from '../src/modules/tenants/repositories/tenantAdminRepository.js';

describe('tenantAdminRepository.findAdminTenantById', () => {
  it('uses one ID-scoped read with the same narrow list projection and registration association', async () => {
    const registrationApplicationModel = { name: 'CompanyRegistrationApplication' };
    const tenantModel = {
      findOne: jest.fn().mockResolvedValue({ id: 'tenant-42' }),
      findAll: jest.fn().mockResolvedValue([])
    };

    await dbStore.run({
      Tenant: tenantModel,
      CompanyRegistrationApplication: registrationApplicationModel
    }, async () => {
      await tenantAdminRepository.findAdminTenantById('tenant-42');
      await tenantAdminRepository.listTenants({ status: 'active' });
    });

    expect(tenantModel.findOne).toHaveBeenCalledTimes(1);
    expect(tenantModel.findAll).toHaveBeenCalledTimes(1);
    const detailOptions = tenantModel.findOne.mock.calls[0][0];
    const listOptions = tenantModel.findAll.mock.calls[0][0];

    expect(detailOptions.where).toEqual({ id: 'tenant-42' });
    expect(detailOptions).not.toHaveProperty('order');
    expect(detailOptions.attributes).toEqual(listOptions.attributes);
    expect(detailOptions.include).toEqual(listOptions.include);
    expect(detailOptions.include[0]).toEqual({
      model: registrationApplicationModel,
      as: 'registrationApplication',
      required: false,
      attributes: ['id', 'review_status', 'provisioning_status', 'updatedAt']
    });
    expect(detailOptions.attributes).not.toContain('company_token');
    expect(detailOptions.attributes).not.toContain('password_hash');
  });
});
