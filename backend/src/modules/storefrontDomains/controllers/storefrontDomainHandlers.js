import { storefrontDomainUseCases } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const actorFrom = (req) => ({
    username: req.admin?.username || 'platform_admin',
    request_id: req.requestId || req.headers?.['x-request-id'] || null
});

const send = (req, res, result, created = false) => sendUseCaseResult(res, result, {
    successStatusCodeResolver: () => created ? 201 : 200,
    successPayloadResolver: () => ({ success: true, data: result.data, timestamp: new Date().toISOString() }),
    errorPayloadResolver: (failure) => ({
        success: false,
        data: null,
        message: failure.message,
        error_code: failure.code,
        errors: failure.details,
        timestamp: new Date().toISOString()
    })
});

export const listStorefrontDomains = async (req, res) => send(req, res, await storefrontDomainUseCases.list({ tenantId: req.params.id }));
export const createStorefrontDomain = async (req, res) => send(req, res, await storefrontDomainUseCases.create({
    tenantId: req.params.id,
    hostname: req.body?.hostname,
    role: req.body?.role,
    canonicalDomainId: req.body?.canonical_domain_id,
    reason: req.body?.reason,
    actor: actorFrom(req)
}), true);
export const verifyStorefrontDomain = async (req, res) => send(req, res, await storefrontDomainUseCases.verify({
    tenantId: req.params.id,
    domainId: req.params.domainId,
    reason: req.body?.reason,
    actor: actorFrom(req)
}));
export const makeCanonicalStorefrontDomain = async (req, res) => send(req, res, await storefrontDomainUseCases.makeCanonical({
    tenantId: req.params.id,
    domainId: req.params.domainId,
    reason: req.body?.reason,
    actor: actorFrom(req)
}));
export const retryStorefrontDomain = async (req, res) => send(req, res, await storefrontDomainUseCases.retry({
    tenantId: req.params.id,
    domainId: req.params.domainId,
    reason: req.body?.reason,
    actor: actorFrom(req)
}));
export const auditStorefrontDomainDnsDrift = async (req, res) => send(req, res, await storefrontDomainUseCases.auditDnsDrift({
    tenantId: req.params.id,
    domainId: req.params.domainId,
    reason: req.body?.reason,
    actor: actorFrom(req)
}));
export const reconcileStorefrontDomainEligibility = async (req, res) => send(req, res, await storefrontDomainUseCases.reconcileEligibility({
    tenantId: req.params.id,
    reason: req.body?.reason,
    actor: actorFrom(req)
}));
export const suspendStorefrontDomain = async (req, res) => send(req, res, await storefrontDomainUseCases.suspend({
    tenantId: req.params.id,
    domainId: req.params.domainId,
    reason: req.body?.reason,
    actor: actorFrom(req)
}));
export const removeStorefrontDomain = async (req, res) => send(req, res, await storefrontDomainUseCases.remove({
    tenantId: req.params.id,
    domainId: req.params.domainId,
    reason: req.body?.reason,
    actor: actorFrom(req)
}));

export const resolveStorefrontCanonicalOrigin = (req, context) => {
    const hostname = String(context?.canonical_domain?.hostname || context?.domain?.hostname || '').trim().toLowerCase();
    const isLocalPreview = process.env.NODE_ENV !== 'production'
        && hostname.endsWith('.localhost');

    if (!isLocalPreview) return `https://${hostname}`;

    const requestHost = String(req.get?.('host') || req.headers?.host || '');
    const port = requestHost.match(/:(\d{1,5})$/)?.[1] || '';
    const protocol = req.protocol === 'https' ? 'https' : 'http';
    return `${protocol}://${hostname}${port ? `:${port}` : ''}`;
};

export const getStorefrontDomainContext = (req, res) => {
    const context = req.storefrontDomainContext;
    if (!context) {
        return res.status(404).json({ success: false, data: null, message: 'No active storefront domain is mapped to this host.', error_code: 'STOREFRONT_DOMAIN_NOT_FOUND' });
    }
    return res.status(200).json({
        success: true,
        data: {
            tenant_id: context.tenant.id,
            slug: context.discovery.slug,
            canonical_origin: resolveStorefrontCanonicalOrigin(req, context),
            routing_mode: context.domain?.role === 'alias' ? 'custom_domain_alias' : 'custom_domain',
            redirect_to: context.domain?.role === 'alias'
                ? resolveStorefrontCanonicalOrigin(req, context)
                : null
        },
        timestamp: new Date().toISOString()
    });
};
