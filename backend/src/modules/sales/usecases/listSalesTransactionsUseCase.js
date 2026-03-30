import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildListSalesTransactionsUseCase = ({ salesRepository }) => {
  return async ({ query = {}, userPermissions = [] }) => {
    try {
      const result = await salesRepository.listUnifiedTransactions({
        filters: query,
        userPermissions
      });
      return ok(result);
    } catch (error) {
      return fail(new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to load unified sales transactions',
        { statusCode: 500 }
      ));
    }
  };
};

