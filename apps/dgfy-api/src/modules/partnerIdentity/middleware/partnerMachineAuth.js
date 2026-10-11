import { validatePartnerMachineToken } from '../services/oidcProvider.js';
import { partnerIdentityRegistryRepository } from '../repositories/partnerIdentityRegistryRepository.js';
import { findTenantById } from '../../../services/landlordService.js';
import { tenantHandler } from '../../../middleware/tenantHandler.js';
import dbStore from '../../../utils/dbStore.js';
import { authorizePartnerAccess } from '../usecases/partnerIdentityUseCases.js';

const sendError = (res, status, message, errorCode) => res.status(status).json({ success: false, message, error_code: errorCode });
const publicRecord = (record) => {
  if (!record) return null;
  const safe = { ...record };
  for (const key of ['secret_hash', 'public_key_pem', 'credentials', 'credentials_all_versions']) delete safe[key];
  return safe;
};

const selectorFor = (req) => req.headers['x-tenant-id'] || req.params?.tenant_id || req.query?.tenant_id || null;
const locationFor = (req) => req.headers['x-location-id'] || req.params?.location_id || req.query?.location_id || null;

export const authenticatePartnerClient = async (req, res, next) => {
  try {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return sendError(res, 401, 'Partner bearer token is required.', 'CLIENT_NOT_ACTIVE');
    const grant = await validatePartnerMachineToken(token);
    if (!grant) return sendError(res, 401, 'Partner bearer token is invalid, expired, or revoked.', 'CLIENT_NOT_ACTIVE');
    const tenantSelector = selectorFor(req);
    const locationId = locationFor(req);
    const authorizationResult = await authorizePartnerAccess({
      registryRepository: partnerIdentityRegistryRepository,
      client: grant.client,
      token: grant,
      tenantSelector,
      locationId
    });
    if (!authorizationResult.allowed) {
      const status = authorizationResult.reason === 'SCOPE_DENIED' || authorizationResult.reason === 'LOCATION_DENIED' ? 403 : 403;
      return sendError(res, status, 'Partner client is not authorized for this tenant, location, or scope.', authorizationResult.reason);
    }
    const tenant = await findTenantById(authorizationResult.attachment.tenant_id);
    if (!tenant?.company_token || tenant.status !== 'active') return sendError(res, 403, 'Partner attachment tenant is unavailable.', 'ATTACHMENT_NOT_ACTIVE');
    req.headers['x-company-token'] = tenant.company_token;
    req.partnerContext = {
      app: publicRecord(grant.app),
      client: publicRecord(grant.client),
      attachment: publicRecord(authorizationResult.attachment),
      tenantId: String(tenant.id),
      locationIds: authorizationResult.locationIds,
      scopes: authorizationResult.scopes,
      tokenScopes: String(grant.scope || '').split(/\s+/).filter(Boolean),
      locationAuthority: authorizationResult.locationAuthority
    };
    return tenantHandler(req, res, (error) => {
      if (error) return next(error);
      if (!req.tenant || String(req.tenant.id) !== String(tenant.id)) return sendError(res, 403, 'Resolved tenant does not match the partner attachment.', 'ATTACHMENT_REQUIRED');
      const selectedLocation = locationFor(req);
      const TenantLocation = dbStore.get('TenantLocation');
      const where = { is_active: true };
      if (selectedLocation) where.location_id = Number(selectedLocation);
      TenantLocation.findAll({ where }).then((rows) => {
        const activeIds = new Set(rows.map((row) => String(row.location_id)));
        const attached = authorizationResult.locationIds.filter((id) => activeIds.has(String(id)));
        if (attached.length !== authorizationResult.locationIds.length || (selectedLocation && !activeIds.has(String(selectedLocation)))) {
          return sendError(res, 403, 'Partner attachment contains an inactive or unavailable location.', 'LOCATION_DENIED');
        }
        if (selectedLocation && !authorizationResult.locationIds.includes(String(selectedLocation))) return sendError(res, 403, 'Partner client is not authorized for this location.', 'LOCATION_DENIED');
        req.partnerContext.locationIds = attached;
        return next();
      }).catch(next);
    });
  } catch (error) { return next(error); }
};

export const requirePartnerScope = (scope) => (req, res, next) => {
  if (!req.partnerContext) return sendError(res, 401, 'Partner client authentication is required.', 'CLIENT_NOT_ACTIVE');
  if (!req.partnerContext.scopes.includes(scope) || !req.partnerContext.tokenScopes.includes(scope)) return sendError(res, 403, 'Partner scope is not authorized.', 'SCOPE_DENIED');
  return next();
};
