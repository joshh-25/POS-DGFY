import {
    listAdminRegistrationIndustriesUseCase,
    setRegistrationIndustryVisibilityUseCase,
    listRegistrationIndustryVisibilityAuditLogsUseCase
} from '../index.js';

// Thrown DomainErrors are mapped to their HTTP response by the global
// errorHandler middleware, same as storeConfigurationTemplateHandlers.js -
// these handlers only translate the request/response shape.
const resolveActor = (req) => ({
    username: req.admin?.username || req.user?.username || 'platform_admin'
});

export const listAdminRegistrationIndustries = async (req, res, next) => {
    try {
        const industries = await listAdminRegistrationIndustriesUseCase();
        return res.status(200).json({ success: true, data: { industries }, message: null });
    } catch (error) {
        next(error);
    }
};

export const setRegistrationIndustryVisibility = async (req, res, next) => {
    try {
        const industry = await setRegistrationIndustryVisibilityUseCase({
            industryKey: req.params.industryKey,
            hidden: req.validatedData?.hidden,
            reason: req.validatedData?.reason,
            actorUser: resolveActor(req)
        });
        return res.status(200).json({
            success: true,
            data: { industry },
            message: industry.hidden ? 'Industry hidden from registration' : 'Industry shown on registration'
        });
    } catch (error) {
        next(error);
    }
};

export const listRegistrationIndustryVisibilityAuditLogs = async (req, res, next) => {
    try {
        const logs = await listRegistrationIndustryVisibilityAuditLogsUseCase({
            industryKey: req.params.industryKey,
            limit: req.validatedQuery?.limit
        });
        return res.status(200).json({ success: true, data: { logs }, message: null });
    } catch (error) {
        next(error);
    }
};
