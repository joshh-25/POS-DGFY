import fs from 'node:fs';
import { dgfyLaundryRepository } from '../../dgfyLaundry/repositories/dgfyLaundryRepository.js';
import { buildDgfyLaundryProviderUseCases } from '../../dgfyLaundry/usecases/dgfyLaundryProviderUseCases.js';
import { resolveDglaundryRedirectUri } from '../../dgfyLaundry/dglaundryOrigin.js';

const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const readFile = (path) => {
  if (!path) return '';
  try { return fs.readFileSync(path, 'utf8').trim(); } catch { return ''; }
};
const configuredSecret = () => readFile(process.env.DGFY_DGLAUNDRY_CLIENT_SECRET_FILE) || String(process.env.DGFY_DGLAUNDRY_CLIENT_SECRET || '').trim();
const machinePublicKey = () => readFile(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE) || String(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY || '').trim();
const scopes = ['openid', 'profile', 'email', 'dglaundry.company_context'];
const dgfyLaundryProviderUseCases = buildDgfyLaundryProviderUseCases({ repository: dgfyLaundryRepository });
export const dglaundryBrowserClientId = () => String(process.env.DGFY_DGLAUNDRY_CLIENT_ID || 'dglaundry-web').trim();
export const dglaundryMachineClientId = () => String(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID || 'dglaundry-machine').trim();

export const isDglaundryParPkceConfigured = () => Boolean(
  String(process.env.DGFY_DGLAUNDRY_CLIENT_ID || 'dglaundry-web').trim()
  && configuredSecret()
  && /^https:\/\//i.test(resolveDglaundryRedirectUri())
);

// @compat-seam id=oidc-dglaundry-env-client-source
export const dglaundryLegacyClientSource = async (clientId) => {
  const browserId = dglaundryBrowserClientId();
  const machineId = dglaundryMachineClientId();
  const redirect = resolveDglaundryRedirectUri();
  const postLogout = String(process.env.DGFY_DGLAUNDRY_POST_LOGOUT_REDIRECT_URI || '').trim();
  // No redirect (neither DGFY_DGLAUNDRY_REDIRECT_URI nor DGLAUNDRY_PARTNER_BASE_URL) means the browser client is not configured (#2513).
  if (clientId === browserId && configuredSecret() && redirect) return {
    id: `legacy:${browserId}`, app_id: 'legacy:dglaundry', client_id: browserId, client_type: 'browser', environment: process.env.NODE_ENV || 'development',
    status: 'active', auth_method: 'client_secret_basic', legacy_secret: configuredSecret(), audience: browserId,
    redirect_uris: [redirect], post_logout_redirect_uris: postLogout ? [postLogout] : [], allowed_scopes: scopes,
    context_adapter: 'dglaundry', app: { app_slug: 'dglaundry', status: 'approved' }, legacy: true
  };
  if (clientId === machineId) return {
    id: `legacy:${machineId}`, app_id: 'legacy:dglaundry', client_id: machineId, client_type: 'machine', environment: process.env.NODE_ENV || 'development',
    status: 'active', auth_method: 'private_key_jwt', public_key_pem: machinePublicKey(), key_id: 'dglaundry-machine-env',
    audience: String(process.env.DGFY_DGLAUNDRY_MACHINE_ASSERTION_AUDIENCE || `${ISSUER}/token`).trim(),
    redirect_uris: [], post_logout_redirect_uris: [], allowed_scopes: ['dglaundry'], context_adapter: null,
    app: { app_slug: 'dglaundry', status: 'approved' }, legacy: true
  };
  return null;
};

// @compat-seam id=oidc-dglaundry-company-context
export const dglaundryContextAdapter = {
  scopes,
  async resolveContext({ account, params }) {
    const selection = await dgfyLaundryProviderUseCases.chooseCompany({ dgfyAccount: account, companyId: params.dglaundry_company_id });
    return selection;
  },
  buildIdTokenClaims(context) {
    if (!context?.company) return {};
    return { dglaundry_company_context: { companyId: context.company.company_id, membershipId: context.company.membership_id, role: context.company.role } };
  }
};

export const dglaundryDefaultScopes = scopes;
