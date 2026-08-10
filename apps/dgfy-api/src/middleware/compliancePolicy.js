import {
    assertComplianceOperationAllowed,
    COMPLIANCE_OPERATION
} from '../modules/compliance/index.js';

const getTenantSnapshot = (req) => {
    if (!req.tenant?.id) return null;

    return {
        id: req.tenant.id,
        compliance_mode_state: req.tenant.compliance_mode_state || null,
        compliance_mode_choice_required: req.tenant.compliance_mode_choice_required === true,
        compliance_profile: req.tenant.compliance_profile || null,
        compliance_policy_version: req.tenant.compliance_policy_version || null
    };
};

const buildFailurePayload = (failure) => ({
    success: false,
    message: failure.message,
    error_code: failure.code,
    errors: failure.details,
    timestamp: new Date().toISOString()
});

export const requireComplianceOperation = (
    operation,
    contextResolver = () => ({})
) => async (req, res, next) => {
    try {
        const tenant = getTenantSnapshot(req);
        if (!tenant?.id) {
            return res.status(400).json({
                success: false,
                message: 'Tenant context is required for compliance checks',
                error_code: 'TENANT_CONTEXT_MISSING',
                timestamp: new Date().toISOString()
            });
        }

        const result = await assertComplianceOperationAllowed({
            tenantId: tenant.id,
            tenant,
            operation,
            context: contextResolver(req) || {},
            actorUser: req.user || null
        });

        if (!result.success) {
            const failure = result.error;
            return res.status(failure.statusCode || 422).json(buildFailurePayload(failure));
        }

        req.complianceDecision = result.data?.decision || null;
        return next();
    } catch (error) {
        return next(error);
    }
};

export const requirePaymentCapabilityCompliance = requireComplianceOperation(
    COMPLIANCE_OPERATION.PAYMENT_CAPABILITY_ENABLE,
    (req) => ({
        method: req.method,
        route: req.path
    })
);
