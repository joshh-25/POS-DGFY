import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const mapStoreUseCaseError = (error, fallbackMessage = 'Store operation failed') => {
    if (error instanceof DomainError) {
        return error;
    }

    if (error?.name === 'SequelizeUniqueConstraintError') {
        return new DomainError(
            DomainErrorCode.CONFLICT,
            'A record with the same unique value already exists',
            { statusCode: 409 }
        );
    }

    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
        return new DomainError(
            DomainErrorCode.AUTHENTICATION_FAILED,
            'Invalid or expired store session',
            { statusCode: 401 }
        );
    }

    return new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        fallbackMessage,
        {
            statusCode: error?.statusCode || 500,
            details: error?.details || null
        }
    );
};
