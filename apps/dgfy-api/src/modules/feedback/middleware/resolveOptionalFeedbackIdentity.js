import dbStore from '../../../utils/dbStore.js';
import { getCookie, SESSION_COOKIE_NAMES } from '../../../utils/browserSessionCookies.js';
import { verifyStoreToken, normalizeTenantIdentifier } from '../../store/utils/storeJwtToken.js';
import { verifyToken, isTokenBlacklisted } from '../../../services/authService.js';
import { dgfyAccountRepository } from '../../dgfy/index.js';
import { authenticate } from '../../../middleware/auth.js';

const reject = (res, status, message) => res.status(status).json({ success: false, data: null, message });

export const resolveOptionalFeedbackIdentity = async (req, res, next) => {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const storeCookie = getCookie(req, SESSION_COOKIE_NAMES.storefront);
  const dgfyCookie = getCookie(req, SESSION_COOKIE_NAMES.dgfy);
  const token = bearer || storeCookie || dgfyCookie;
  req.feedbackIdentity = null;

  if (header && !bearer) return reject(res, 401, 'Invalid authorization header');
  if (!token) return next();

  try {
    let storeClaims;
    try { storeClaims = verifyStoreToken(token); } catch { /* another token scope */ }
    if (storeClaims) {
      if (storeClaims.type !== 'store_customer') return reject(res, 401, 'Invalid store token type');
      const tenantId = normalizeTenantIdentifier(req.tenant?.id);
      if (!tenantId || tenantId !== normalizeTenantIdentifier(storeClaims.tenant_id)) {
        return reject(res, 403, 'Store token is not valid for this tenant context');
      }
      const customerId = Number(storeClaims.customer_id);
      if (!Number.isSafeInteger(customerId) || customerId <= 0) return reject(res, 401, 'Invalid store token payload');
      const customer = await dbStore.get('StoreCustomer').findByPk(customerId);
      if (!customer || customer.is_active === false) return reject(res, 401, 'Store customer account is unavailable');
      req.feedbackIdentity = {
        kind: 'store_customer', id: customer.customer_id, name: customer.name,
        email: customer.email, verified: false, dgfyAccountId: customer.dgfy_account_id || null
      };
      return next();
    }

    let claims;
    try { claims = verifyToken(token); } catch { /* staff authentication reports invalid tokens */ }
    if (claims?.token_scope === 'dgfy') {
      if (!claims.dgfy_account_id || await isTokenBlacklisted(token)) return reject(res, 401, 'DGFY session is invalid or revoked');
      const account = await dgfyAccountRepository.findById(claims.dgfy_account_id);
      if (!account || account.is_active === false || account.deleted_at) return reject(res, 401, 'DGFY account is unavailable');
      req.feedbackIdentity = {
        kind: 'dgfy_account', id: account.id,
        name: `${account.first_name || ''} ${account.last_name || ''}`.trim(),
        email: account.email, verified: Boolean(account.email_verified_at)
      };
      return next();
    }
    if (!bearer) return reject(res, 401, 'Invalid feedback session');
    return authenticate(req, res, (error) => {
      if (error) return next(error);
      req.feedbackIdentity = {
        kind: 'tenant_user', id: req.user.user_id,
        name: req.user.username, email: req.user.email, verified: true
      };
      return next();
    });
  } catch (error) {
    return next(error);
  }
};
