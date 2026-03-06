import db from '../../../models/index.js';
import { assertTenantRepositoryContract } from '../contracts/tenantRepository.contract.js';

const { Tenant } = db;

export const tenantRepository = {
    findById(tenantId, options = {}) {
        return Tenant.findByPk(tenantId, options);
    },
    findByName(name, options = {}) {
        return Tenant.findOne({ where: { name }, ...options });
    }
};

assertTenantRepositoryContract(tenantRepository);
