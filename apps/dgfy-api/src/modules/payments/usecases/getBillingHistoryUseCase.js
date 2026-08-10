import { ok } from '../../shared/contracts/applicationResult.js';

export const buildGetBillingHistoryUseCase = ({ paymentRepository }) => {
    return async ({ tenantId }) => {
        const payments = await paymentRepository.findPaymentsByTenantId(tenantId);
        return ok(payments);
    };
};
