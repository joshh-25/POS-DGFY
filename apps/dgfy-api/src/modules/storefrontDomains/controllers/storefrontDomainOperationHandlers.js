import { storefrontDomainOperationUseCases } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const send = (res, result) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => 200,
    successPayloadResolver: () => ({
        success: true,
        data: result.data,
        timestamp: new Date().toISOString()
    }),
    errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        error_code: failure.code,
        errors: failure.details,
        timestamp: new Date().toISOString()
    })
});

export const leaseStorefrontDomainOperation = async (req, res) => send(res, await storefrontDomainOperationUseCases.lease({
    leaseOwner: req.storefrontDomainController?.id,
    leaseSeconds: req.body?.lease_seconds
}));

export const reportStorefrontDomainOperation = async (req, res) => send(res, await storefrontDomainOperationUseCases.report({
    operationId: req.params.operationId,
    leaseOwner: req.storefrontDomainController?.id,
    success: req.body?.success,
    provisioningReference: req.body?.provisioning_reference,
    healthCheckPassed: req.body?.health_check_passed,
    tlsExpiresAt: req.body?.tls_expires_at,
    result: req.body?.result,
    errorCode: req.body?.error_code,
    errorMessage: req.body?.error_message
}));
