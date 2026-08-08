import * as Sentry from '@sentry/node';
import { mapDomainErrorToHttp } from '../contracts/domainErrorMapper.js';
import { isSentryInitialized } from '../../../config/sentry.js';

export const resolveDomainFailure = (
    result,
    fallbackStatusCode = 500,
    fallbackMessage = 'Internal Server Error'
) => {
    const mapped = mapDomainErrorToHttp(result?.error);

    return {
        statusCode: mapped?.statusCode || fallbackStatusCode,
        message: mapped?.payload?.message || result?.error?.message || fallbackMessage,
        details: mapped?.payload?.details || result?.error?.details || null,
        code: mapped?.payload?.code || result?.error?.code || null
    };
};

// This is the single choke point for every `return fail(...)` use case in
// the codebase (265+ call sites at last count). None of them throw -- they
// catch their own infrastructure errors and hand back an application-level
// result -- so this response path never reaches sentryErrorHandler /
// errorHandler. Without capturing here, a real backend failure (a DB
// connection exhaustion, say) answers its caller with a 500 and leaves
// zero trace in Sentry. `result.error.cause`, when present (see
// DomainError's `cause` option), is the original infrastructure error --
// captured in preference to the remapped DomainError so the event carries
// the real stack instead of a stackless wrapper.
const captureUseCaseFailure = (statusCode, result) => {
    if (statusCode < 500 || !isSentryInitialized()) return;

    const domainError = result?.error;
    const original = domainError?.cause || domainError;
    if (!original) return;

    Sentry.captureException(original, {
        level: 'error',
        tags: {
            domain_error_code: domainError?.code || null
        }
    });
};

export const sendUseCaseResult = (
    res,
    result,
    {
        fallbackStatusCode = 500,
        fallbackErrorMessage = 'Internal Server Error',
        successStatusCodeResolver = null,
        successPayloadResolver = null,
        errorPayloadResolver = null
    } = {}
) => {
    if (!result?.success) {
        const failure = resolveDomainFailure(result, fallbackStatusCode, fallbackErrorMessage);
        captureUseCaseFailure(failure.statusCode, result);
        const errorPayload = errorPayloadResolver
            ? errorPayloadResolver(failure, result)
            : {
                success: false,
                message: failure.message
            };

        return res.status(failure.statusCode).json(errorPayload);
    }

    const statusCode = successStatusCodeResolver
        ? successStatusCodeResolver(result)
        : (result?.data?.statusCode || 200);

    const payload = successPayloadResolver
        ? successPayloadResolver(result)
        : (result?.data?.payload || { success: true });

    return res.status(statusCode).json(payload);
};

