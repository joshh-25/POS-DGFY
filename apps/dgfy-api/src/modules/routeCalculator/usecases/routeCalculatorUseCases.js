import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { routeCalculatorEnabled, routeCalculatorDefaultProfile } from '../../../config/routeCalculatorFeature.js';

// `reasonCode`, where present, marks a mapped error as an expected precondition (missing/disabled
// optional config) rather than a genuine fault -- see domainErrors.js's isExpectedDomainFailure
// (#508). ROUTE_TIMEOUT/ROUTE_UNREACHABLE are deliberately left untagged: those are real transient
// or infra failures and should keep reporting to Sentry.
const REPOSITORY_ERROR_TO_DOMAIN = {
    ROUTE_CALCULATOR_DISABLED: { code: DomainErrorCode.SERVICE_UNAVAILABLE, statusCode: 503, reasonCode: 'ROUTE_CALCULATOR_NOT_CONFIGURED' },
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
                { statusCode: 503, details: { reason_code: 'ROUTE_CALCULATOR_NOT_CONFIGURED' } }
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
                {
                    statusCode: mapped.statusCode,
                    details: mapped.reasonCode ? { reason_code: mapped.reasonCode } : null
                }
            ));
        }
    };
};
