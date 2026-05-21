import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const buildAdminLogoutUseCase = ({ authService }) => {
    return async ({ token }) => {
        if (!token) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Token is required'
            ));
        }

        try {
            const blacklisted = await authService.blacklistToken(token);
            return ok({ blacklisted });
        } catch (error) {
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error?.message || 'Failed to revoke admin token'
            ));
        }
    };
};
