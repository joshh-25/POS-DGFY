import { mapDomainErrorToHttp } from '../contracts/domainErrorMapper.js';

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

