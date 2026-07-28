import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { routeCalculatorEnabled, routeCalculatorDefaultProfile } from '../../../config/routeCalculatorFeature.js';

const REPOSITORY_ERROR_TO_DOMAIN = {
    ROUTE_CALCULATOR_DISABLED: { code: DomainErrorCode.SERVICE_UNAVAILABLE, statusCode: 503 },
    ROUTE_TIMEOUT: { code: DomainErrorCode.SERVICE_UNAVAILABLE, statusCode: 503 },
    ROUTE_UNREACHABLE: { code: DomainErrorCode.SERVICE_UNAVAILABLE, statusCode: 503 },
    ROUTE_NOT_FOUND: { code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 }
};

export const buildCalculateRouteUseCase = ({ routeCalculatorRepository }) => {
    return async ({ originLat, originLng, destLat, destLng, profile }) => {
        if (!routeCalculatorEnabled()) {
            return fail(new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Route calculator is not configured for this environment.',
                { statusCode: 503 }
            ));
        }

        const resolvedProfile = profile || routeCalculatorDefaultProfile();

        try {
            const route = await routeCalculatorRepository.calculateRoute({
                originLat,
                originLng,
                destLat,
                destLng,
                profile: resolvedProfile
            });
            return ok(route);
        } catch (error) {
            const mapped = REPOSITORY_ERROR_TO_DOMAIN[error?.code] || { code: DomainErrorCode.INTERNAL_ERROR, statusCode: 500 };
            return fail(new DomainError(
                mapped.code,
                error?.message || 'Route calculation failed.',
                { statusCode: mapped.statusCode }
            ));
        }
    };
};
