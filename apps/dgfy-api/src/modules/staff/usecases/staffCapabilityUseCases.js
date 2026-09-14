import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveEffectivePermissions } from '../../../utils/userPermissions.js';
import dbStore from '../../../utils/dbStore.js';
import { plain } from '../repositories/staffRoleRepository.js';

const map = (error, fallback) => error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, fallback, { statusCode: 500 });
const positive = (value) => { if (value == null || value === '') return null; const n = Number.parseInt(value, 10); if (!Number.isInteger(n) || n <= 0) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'location_id must be a positive integer', { statusCode: 422 }); return n; };
const assertLocationAccess = async (userId, locationId) => {
  const user = await dbStore.get('User').findByPk(userId, { attributes: ['user_id', 'is_master_admin'] });
  if (user?.is_master_admin === true) return;
  const grant = await dbStore.get('UserLocationGrant').findOne({ where: { user_id: userId, location_id: locationId } });
  if (!grant) throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'You do not have access to this location.', { statusCode: 403, details: { reason_code: 'LOCATION_NOT_GRANTED' } });
};
export const buildGetEffectiveCapabilitiesUseCase = () => async ({ user, locationId } = {}) => {
  try {
    const normalizedLocationId = positive(locationId);
    if (normalizedLocationId) await assertLocationAccess(user.user_id, normalizedLocationId);
    // #1901: capabilities is the single authoritative effective-permission set used by backend
    // authorization. staff_role.capabilities is informational raw role data only and is not
    // necessarily included in capabilities; clients must read capabilities for access decisions.
    return ok({ capabilities: resolveEffectivePermissions(user), location_id: normalizedLocationId, staff_role: user.staffRole ? plain(user.staffRole) : null });
  } catch (error) { return fail(map(error, 'Failed to load effective capabilities')); }
};
export const buildGetStaffAssignmentsUseCase = ({ repository }) => async ({ user, locationId } = {}) => {
  try {
    const normalizedLocationId = positive(locationId);
    if (normalizedLocationId) await assertLocationAccess(user.user_id, normalizedLocationId);
    const permissions = resolveEffectivePermissions(user);
    const personnel = await repository.findDeliveryPersonnelForUser(user.user_id);
    const canViewRuns = permissions.includes('delivery_runs:view_assigned') || permissions.includes('delivery_runs:act');
    const canViewOrders = permissions.includes('orders:view_assigned') || permissions.includes('orders:pack');
    const runs = canViewRuns ? await repository.listRunsFromPersonnel(personnel) : [];
    const orders = canViewOrders && normalizedLocationId ? await repository.listAssignedOrders({ userId: user.user_id, locationId: normalizedLocationId }) : [];
    const deliveryJobs = canViewRuns && normalizedLocationId && personnel
      ? await repository.listAssignedDeliveryJobs({ deliveryPersonnelId: personnel.delivery_personnel_id, locationId: normalizedLocationId })
      : [];
    const safeDeliveryJobs = deliveryJobs.map((job) => ({
      delivery_job_id: job.delivery_job_id,
      pos_transaction_id: job.pos_transaction_id,
      delivery_run_id: job.delivery_run_id || null,
      provider: job.provider,
      status: job.status,
      delivery_personnel_id: job.delivery_personnel_id || null,
      delivery_personnel_name: job.delivery_personnel_name || null,
      assigned_at: job.assigned_at || null,
      picked_up_at: job.picked_up_at || null,
      delivered_at: job.delivered_at || null,
      tracking_url: job.tracking_url || null,
      delivery_run: job.deliveryRun ? {
        delivery_run_id: job.deliveryRun.delivery_run_id,
        label: job.deliveryRun.label,
        status: job.deliveryRun.status,
        scheduled_date: job.deliveryRun.scheduled_date || null,
        scheduled_date_end: job.deliveryRun.scheduled_date_end || null
      } : null,
      order: job.transaction ? {
        pos_transaction_id: job.transaction.pos_transaction_id,
        invoice_number: job.transaction.invoice_number,
        location_id: job.transaction.location_id,
        customer_name: job.transaction.customer_name || null,
        customer_phone: job.transaction.customer_phone || null,
        delivery_address: job.transaction.delivery_address || null,
        delivery_latitude: job.transaction.delivery_latitude || null,
        delivery_longitude: job.transaction.delivery_longitude || null,
        scheduled_for: job.transaction.scheduled_for || null,
        special_instructions: job.transaction.special_instructions || null,
        delivery_fee: job.transaction.delivery_fee,
        total_amount: job.transaction.total_amount,
        fulfillment_status: job.transaction.fulfillment_status,
        order_method: job.transaction.order_method,
        order_source: job.transaction.order_source
      } : null
    }));
    return ok({ delivery_runs: runs, orders, delivery_jobs: safeDeliveryJobs });
  } catch (error) { return fail(map(error, 'Failed to load staff assignments')); }
};
