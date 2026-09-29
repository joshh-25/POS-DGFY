import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { buildBusinessAdminCapabilities, resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({ success: false, error: new DomainError(code, message, { statusCode, details }) });

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const buildGetBusinessAdminInventoryValuationUseCase = ({
  businessAdminOverviewRepository,
  getWeightedInventoryValueByLocation
}) => async ({ query = {}, user = {} } = {}) => {
  const access = resolveBusinessAdminAccess(user);
  if (!access.allowed) return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });

  const branchId = parsePositiveInt(query.branch_id);
  if (String(query.branch_id || '').trim() && !branchId) {
    return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' });
  }
  const allowedLocationIds = access.scope === 'all'
    ? null
    : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
  if (access.scope !== 'all' && allowedLocationIds.length === 0) {
    return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'No branch access is assigned to this user.', 403, { reason_code: 'BUSINESS_ADMIN_LOCATION_SCOPE_REQUIRED' });
  }
  if (branchId && access.scope !== 'all' && !allowedLocationIds.includes(branchId)) {
    return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
  }

  const locations = await businessAdminOverviewRepository.listActiveLocations({ branchId, allowedLocationIds });
  const valuation = await getWeightedInventoryValueByLocation({ locations });
  const capabilities = buildBusinessAdminCapabilities(user);
  if (!capabilities.view_costs) {
    valuation.locations.forEach((location) => { delete location.inventory_value; });
    delete valuation.weighted_total_inventory_value;
  }
  return ok({
    valuation,
    meta: { as_of: new Date().toISOString(), branch_id: branchId, scope: access.scope, cost_visibility: capabilities.view_costs }
  });
};
