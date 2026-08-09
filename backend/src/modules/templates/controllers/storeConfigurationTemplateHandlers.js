import {
    listTemplatesUseCase,
    getTemplateUseCase,
    listTemplateAuditLogsUseCase,
    createDraftTemplateUseCase,
    updateTemplateModulesUseCase,
    publishTemplateUseCase,
    deprecateTemplateUseCase
} from '../index.js';

// Thrown DomainErrors are mapped to their HTTP response by the global
// errorHandler middleware (mapDomainErrorToHttp) via next(error) - the same
// pipeline every throw-based use case in this codebase relies on, so these
// handlers don't need their own ok()/fail() translation.
const resolveActor = (req) => ({
    username: req.admin?.username || req.user?.username || 'platform_admin'
});

export const listTemplates = async (req, res, next) => {
    try {
        const templates = await listTemplatesUseCase({
            status: req.validatedQuery?.status || null,
            baseMode: req.validatedQuery?.base_mode || null
        });
        return res.status(200).json({ success: true, data: { templates }, message: null });
    } catch (error) {
        next(error);
    }
};

export const getTemplate = async (req, res, next) => {
    try {
        const template = await getTemplateUseCase({ templateId: Number(req.params.id) });
        return res.status(200).json({ success: true, data: { template }, message: null });
    } catch (error) {
        next(error);
    }
};

export const listTemplateAuditLogs = async (req, res, next) => {
    try {
        const logs = await listTemplateAuditLogsUseCase({
            templateId: Number(req.params.id),
            limit: req.validatedQuery?.limit
        });
        return res.status(200).json({ success: true, data: { logs }, message: null });
    } catch (error) {
        next(error);
    }
};

export const createDraftTemplate = async (req, res, next) => {
    try {
        const actor = resolveActor(req);
        const template = await createDraftTemplateUseCase({
            templateKey: req.validatedData?.template_key,
            label: req.validatedData?.label,
            baseMode: req.validatedData?.base_mode,
            visibility: req.validatedData?.visibility || 'visible',
            owner: actor.username,
            moduleKeys: req.validatedData?.module_keys || [],
            actorUser: actor
        });
        return res.status(201).json({ success: true, data: { template }, message: 'Template draft created' });
    } catch (error) {
        next(error);
    }
};

export const updateTemplateModules = async (req, res, next) => {
    try {
        const template = await updateTemplateModulesUseCase({
            templateId: Number(req.params.id),
            moduleKeys: req.validatedData?.module_keys || [],
            reason: req.validatedData?.reason,
            actorUser: resolveActor(req)
        });
        return res.status(200).json({ success: true, data: { template }, message: 'Template modules updated' });
    } catch (error) {
        next(error);
    }
};

export const publishTemplate = async (req, res, next) => {
    try {
        const template = await publishTemplateUseCase({
            templateId: Number(req.params.id),
            reason: req.validatedData?.reason,
            actorUser: resolveActor(req)
        });
        return res.status(200).json({ success: true, data: { template }, message: 'Template published' });
    } catch (error) {
        next(error);
    }
};

export const deprecateTemplate = async (req, res, next) => {
    try {
        const template = await deprecateTemplateUseCase({
            templateId: Number(req.params.id),
            reason: req.validatedData?.reason,
            actorUser: resolveActor(req)
        });
        return res.status(200).json({ success: true, data: { template }, message: 'Template deprecated' });
    } catch (error) {
        next(error);
    }
};
