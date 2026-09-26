import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { resolveBusinessAdminAccess } from '../domain/businessAdminAccessPolicy.js';

const ok = (data) => ({ success: true, data });
const fail = (code, message, statusCode = 400, details = null) => ({
    success: false,
    error: new DomainError(code, message, { statusCode, details })
});

const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseItemIds = (value) => [...new Set(String(value || '')
    .split(',')
    .map((itemId) => parsePositiveInt(itemId))
    .filter(Boolean))];

// This read model overlays the branch ledger quantity onto the shared catalog.
export const buildListBusinessAdminInventoryStockUseCase = ({
    businessAdminOverviewRepository,
    businessAdminInventoryReportRepository
}) => async ({ query = {}, user = {} } = {}) => {
    const access = resolveBusinessAdminAccess(user);
    if (!access.allowed) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, access.reason, 403, { reason_code: 'BUSINESS_ADMIN_ACCESS_DENIED' });
    }

    const branchId = parsePositiveInt(query.branch_id);
    if (!branchId) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'branch_id must be a positive integer.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_BRANCH_ID' });
    }

    const itemIds = parseItemIds(query.item_ids);
    if (itemIds.length === 0 || itemIds.length > 100) {
        return fail(DomainErrorCode.VALIDATION_FAILED, 'item_ids must contain between 1 and 100 positive item IDs.', 422, { reason_code: 'BUSINESS_ADMIN_INVALID_ITEM_IDS' });
    }

    const allowedLocationIds = access.scope === 'all'
        ? null
        : await businessAdminOverviewRepository.listUserLocationGrantIds(user.user_id);
    if (access.scope !== 'all' && !allowedLocationIds.includes(branchId)) {
        return fail(DomainErrorCode.AUTHORIZATION_FAILED, 'This user is not assigned to the selected branch.', 403, { reason_code: 'BUSINESS_ADMIN_BRANCH_ACCESS_DENIED' });
    }

    const rows = await businessAdminInventoryReportRepository.listBranchStock({ branchId, itemIds });
    return ok({ branch_id: branchId, stocks: rows });
};
