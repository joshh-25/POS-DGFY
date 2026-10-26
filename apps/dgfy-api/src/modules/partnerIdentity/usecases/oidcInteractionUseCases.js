import crypto from 'node:crypto';
import {
  buildStorefrontOidcUrl,
  hashInteractionBinding,
  resolveDglaundryRestartOrigin,
  resolveOidcIssuerOrigin
} from '../domain/oidcInteractionPolicy.js';

export const OIDC_INTERACTION_TTL_MS = 10 * 60 * 1000;
export const OIDC_COMPLETION_TICKET_TTL_MS = 60 * 1000;
export const OIDC_INTERACTION_ERROR_TTL_MS = 10 * 60 * 1000;

const error = (code, message, statusCode = 400) => Object.assign(new Error(message), { code, statusCode });
const splitScopes = (scope) => String(scope || '').trim().split(/\s+/).filter(Boolean);
const validId = (value) => /^[A-Za-z0-9_-]{24,128}$/.test(String(value || ''));
const validCompletionTicket = (value) => /^[A-Za-z0-9_-]{43}$/.test(String(value || ''));
const validErrorId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const safeCompany = (company) => ({
  id: String(company.company_id),
  name: String(company.company_name || company.name || 'DGLaundry company'),
  role: String(company.role || '')
});
const identityOnlyScope = (scope) => splitScopes(scope).filter((item) => item !== 'dglaundry.company_context').join(' ');
const accountDisplay = (account) => ({
  first_name: String(account.first_name || ''),
  last_name: String(account.last_name || ''),
  email: String(account.email || '')
});
const hasPrompt = (params, prompt) => splitScopes(params.prompt).includes(prompt);

const authorizedClient = (client, interaction, dglaundryClientId) => Boolean(
  client && client.client_type === 'browser' && client.status === 'active'
  && client.client_id === dglaundryClientId
  && client.context_adapter === 'dglaundry'
  && client.client_id === interaction.client_id
  && Array.isArray(client.redirect_uris) && client.redirect_uris.includes(interaction.params.redirect_uri)
  && splitScopes(interaction.params.scope).every((scope) => client.allowed_scopes?.includes(scope))
  && interaction.params.response_type === 'code'
  && interaction.params.code_challenge_method === 'S256'
  && Boolean(interaction.params.code_challenge)
  && splitScopes(interaction.params.scope).includes('openid')
);

export const buildOidcInteractionUseCases = ({
  repository,
  consumePar,
  resolveClient,
  listLaundryCompanies,
  findAccountById,
  verifyDgfyToken,
  isTokenBlacklisted,
  buildAuthorizationCodeGrant,
  authorizationCodeKey,
  dglaundryClientId,
  codeTtlMs = 120_000,
  env = process.env,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  randomUUID = crypto.randomUUID
}) => {
  const loadInteraction = async (id) => {
    if (!validId(id)) throw error('OIDC_INTERACTION_EXPIRED', 'This sign-in session is invalid or expired.', 410);
    const interaction = await repository.findInteraction(id);
    if (!interaction || Number(interaction.expires_at) <= now()) {
      throw error('OIDC_INTERACTION_EXPIRED', 'This sign-in session expired. Start sign-in again from DGLaundry.', 410);
    }
    const client = await resolveClient(interaction.client_id);
    if (!authorizedClient(client, interaction, dglaundryClientId)) {
      throw error('OIDC_CLIENT_UNAVAILABLE', 'This sign-in request is no longer available.', 400);
    }
    return { interaction, client };
  };

  const eligibleCompanies = async (account) => {
    if (!account) return [];
    const companies = await listLaundryCompanies({ dgfyAccountId: account.id });
    return Array.isArray(companies) ? companies : [];
  };

  const matchesFreshAuthentication = (interaction, account, sessionToken) => {
    const fresh = interaction.fresh_auth;
    if (!fresh || !account || !sessionToken) return false;
    return String(fresh.account_id) === String(account.id)
      && fresh.session_hash === hashInteractionBinding(sessionToken)
      && fresh.storefront_binding_hash === interaction.storefront_binding_hash
      && Number(fresh.authenticated_at) >= Number(interaction.created_at)
      && Number(fresh.authenticated_at) <= now();
  };

  const requireStorefrontBinding = (interaction, browserBinding) => {
    if (!interaction.storefront_binding_hash || !browserBinding
      || interaction.storefront_binding_hash !== hashInteractionBinding(browserBinding)) {
      throw error('OIDC_STOREFRONT_BINDING_REQUIRED', 'This browser sign-in session is invalid. Start again from DGLaundry.', 403);
    }
  };

  const requireFreshAuthentication = (interaction, account, sessionToken) => {
    if (hasPrompt(interaction.params, 'login') && !matchesFreshAuthentication(interaction, account, sessionToken)) {
      throw error('OIDC_FRESH_LOGIN_REQUIRED', 'Sign in again to continue this request.', 403);
    }
  };

  const newErrorRecord = async ({ code, knownDglaundryClient = false, message = '' }) => {
    const id = randomUUID();
    const expiresAt = now() + OIDC_INTERACTION_ERROR_TTL_MS;
    const storefrontUrl = buildStorefrontOidcUrl(`/oidc/error/${encodeURIComponent(id)}`, env);
    if (!storefrontUrl) throw error('OIDC_STOREFRONT_UNAVAILABLE', 'DGFY sign-in is not configured for this environment.', 503);
    const restartOrigin = knownDglaundryClient ? resolveDglaundryRestartOrigin(env) : null;
    const record = {
      id,
      code: String(code || 'sign_in_failed'),
      message: String(message || 'DGFY could not continue this sign-in request. Start again from DGLaundry.'),
      restart_url: restartOrigin || null,
      expires_at: expiresAt
    };
    if (!(await repository.createError(id, record, expiresAt))) {
      throw error('OIDC_INTERACTION_STATE_UNAVAILABLE', 'DGFY could not save this sign-in request. Start again from DGLaundry.', 503);
    }
    return { id, storefront_url: storefrontUrl };
  };

  return {
    async createInteraction({ requestUri, clientId = '', browserBinding }) {
      const binding = String(browserBinding || '');
      if (!binding) throw error('OIDC_BROWSER_BINDING_REQUIRED', 'The browser sign-in binding is unavailable.', 400);
      const { client, params } = await consumePar({ requestUri, clientId });
      if (client.client_id !== dglaundryClientId || client.context_adapter !== 'dglaundry') {
        throw error('OIDC_INTERACTION_UNSUPPORTED_CLIENT', 'This client does not support DGFY browser sign-in.', 400);
      }
      const id = randomBytes(32).toString('base64url');
      const storefrontHandoff = randomBytes(32).toString('base64url');
      const createdAt = now();
      const expiresAt = createdAt + OIDC_INTERACTION_TTL_MS;
      const interaction = {
        id,
        client_id: client.client_id,
        params,
        created_at: createdAt,
        expires_at: expiresAt,
        browser_binding_hash: hashInteractionBinding(binding),
        storefront_handoff_hash: hashInteractionBinding(storefrontHandoff),
        storefront_binding_hash: null,
        fresh_auth: null
      };
      if (!(await repository.createInteraction(id, interaction))) {
        throw error('OIDC_INTERACTION_STATE_UNAVAILABLE', 'DGFY could not save this sign-in request. Start again from DGLaundry.', 503);
      }
      const storefrontUrl = buildStorefrontOidcUrl(`/oidc/interaction/${encodeURIComponent(id)}`, env);
      if (!storefrontUrl) throw error('OIDC_STOREFRONT_UNAVAILABLE', 'DGFY sign-in is not configured for this environment.', 503);
      const storefrontUrlWithHandoff = new URL(storefrontUrl);
      storefrontUrlWithHandoff.hash = new URLSearchParams({ oidc_handoff: storefrontHandoff }).toString();
      return { id, expires_at: expiresAt, storefront_url: storefrontUrlWithHandoff.toString() };
    },

    async bindStorefrontBrowser({ id, handoff, browserBinding = '' }) {
      const { interaction } = await loadInteraction(id);
      const normalizedBinding = String(browserBinding || '') || randomBytes(32).toString('base64url');
      if (!/^[A-Za-z0-9_-]{43}$/.test(normalizedBinding)) {
        throw error('OIDC_STOREFRONT_BINDING_INVALID', 'This browser sign-in session is invalid. Start again from DGLaundry.', 400);
      }
      const handoffValue = String(handoff || '');
      const result = await repository.bindStorefrontBrowser(
        interaction.id,
        handoffValue ? hashInteractionBinding(handoffValue) : '',
        hashInteractionBinding(normalizedBinding)
      );
      if (!['ok', 'existing'].includes(result)) {
        throw error(result === 'expired' ? 'OIDC_INTERACTION_EXPIRED' : 'OIDC_STOREFRONT_BINDING_INVALID',
          'This browser sign-in session is invalid. Start again from DGLaundry.', result === 'expired' ? 410 : 403);
      }
      return { browser_binding: normalizedBinding, expires_at: interaction.expires_at };
    },

    async createBrowserError({ code, message, clientId = '' }) {
      let knownDglaundryClient = false;
      if (clientId) {
        try {
          const client = await resolveClient(clientId);
          knownDglaundryClient = client?.client_id === dglaundryClientId
            && client?.client_type === 'browser' && client?.status === 'active'
            && client?.context_adapter === 'dglaundry';
        } catch { /* Unknown or unavailable clients receive only the DGFY destination. */ }
      }
      return newErrorRecord({ code, message, knownDglaundryClient });
    },

    async getError(id) {
      if (!validErrorId(id)) return null;
      const record = await repository.findError(id);
      if (!record || Number(record.expires_at) <= now()) return null;
      return { code: record.code, message: record.message, restart_url: record.restart_url || null };
    },

    async getInteractionMetadata({ id, account = null, sessionToken = '', browserBinding = '' }) {
      const { interaction, client } = await loadInteraction(id);
      requireStorefrontBinding(interaction, browserBinding);
      const allCompanies = await eligibleCompanies(account);
      const requestedCompanyId = String(interaction.params.dglaundry_company_id || '').trim();
      const companies = requestedCompanyId
        ? allCompanies.filter((company) => String(company.company_id) === requestedCompanyId)
        : allCompanies;
      if (account && requestedCompanyId && companies.length === 0) {
        throw error('OIDC_COMPANY_SELECTION_DENIED', 'The requested DGLaundry company is not available to this DGFY account.', 403);
      }
      return {
        client: { name: String(client.app?.name || 'DGLaundry'), app_slug: 'dglaundry' },
        expires_at: interaction.expires_at,
        authenticated: Boolean(account),
        account: account ? accountDisplay(account) : null,
        companies: account ? companies.map(safeCompany) : [],
        prompt_login: hasPrompt(interaction.params, 'login'),
        prompt_select_account: hasPrompt(interaction.params, 'select_account'),
        screen_hint: interaction.params.screen_hint === 'signup' ? 'signup' : null,
        login_hint: String(interaction.params.login_hint || ''),
        fixed_company_selection: Boolean(requestedCompanyId),
        new_company_intent: interaction.params.dglaundry_intent === 'create_company',
        fresh_auth_verified: matchesFreshAuthentication(interaction, account, sessionToken)
      };
    },

    async validateFreshAuthenticationTarget(id, browserBinding = '') {
      const { interaction } = await loadInteraction(id);
      requireStorefrontBinding(interaction, browserBinding);
      return true;
    },

    async recordFreshAuthentication({ id, accountId, sessionToken, claims, browserBinding = '' }) {
      const { interaction } = await loadInteraction(id);
      requireStorefrontBinding(interaction, browserBinding);
      if (String(claims?.token_scope || '') !== 'dgfy'
        || String(claims?.dgfy_account_id || '') !== String(accountId)
        || !claims?.jti || !Number.isFinite(Number(claims?.exp))
        || Number(claims.exp) * 1000 <= now()) return false;
      return repository.recordFreshAuthentication(id, {
        account_id: String(accountId),
        session_hash: hashInteractionBinding(sessionToken),
        storefront_binding_hash: interaction.storefront_binding_hash,
        session_jti: String(claims.jti),
        authenticated_at: now(),
        interaction_created_at: interaction.created_at
      });
    },

    async prepareCompletion({ id, account, sessionToken, action, companyId, browserBinding = '' }) {
      const { interaction, client } = await loadInteraction(id);
      requireStorefrontBinding(interaction, browserBinding);
      requireFreshAuthentication(interaction, account, sessionToken);
      if (interaction.params.dglaundry_intent === 'create_company' && action !== 'create_company') {
        throw error('OIDC_ACTION_NOT_ALLOWED', 'This request must continue through DGLaundry company onboarding.', 400);
      }

      const companies = await eligibleCompanies(account);
      const fixedCompanyId = String(interaction.params.dglaundry_company_id || '').trim();
      let context = null;
      let grantedScope = String(interaction.params.scope || 'openid profile email');
      if (action === 'company') {
        const selectedId = String(companyId || '').trim();
        if (!selectedId || (fixedCompanyId && selectedId !== fixedCompanyId)) {
          throw error('OIDC_COMPANY_SELECTION_DENIED', 'Choose the DGLaundry company requested for this sign-in.', 403);
        }
        const company = companies.find((candidate) => String(candidate.company_id) === selectedId);
        if (!company) throw error('OIDC_COMPANY_SELECTION_DENIED', 'The selected DGLaundry company is not an accepted membership of this DGFY account.', 403);
        context = { company };
      } else if (action === 'create_company') {
        if (fixedCompanyId) throw error('OIDC_ACTION_NOT_ALLOWED', 'This sign-in request is fixed to an existing DGLaundry company.', 400);
        if (interaction.params.dglaundry_intent !== 'create_company' && companies.length > 0) {
          throw error('OIDC_ACTION_NOT_ALLOWED', 'DGLaundry did not authorize new-company onboarding for this sign-in request.', 400);
        }
        grantedScope = identityOnlyScope(grantedScope);
      } else {
        throw error('OIDC_ACTION_INVALID', 'Choose a DGLaundry company or continue to new-company onboarding.', 400);
      }

      if (!grantedScope || !splitScopes(grantedScope).includes('openid')
        || !splitScopes(grantedScope).every((scope) => client.allowed_scopes?.includes(scope))) {
        throw error('OIDC_SCOPE_INVALID', 'The requested DGFY identity scopes are not available to this client.', 400);
      }
      const issuer = resolveOidcIssuerOrigin(env);
      if (!issuer) throw error('OIDC_ISSUER_CONFIGURATION_INVALID', 'The DGFY OIDC issuer is not configured for this environment.', 503);
      const ticket = randomBytes(32).toString('base64url');
      const expiresAt = Math.min(now() + OIDC_COMPLETION_TICKET_TTL_MS, Number(interaction.expires_at));
      if (expiresAt <= now()) throw error('OIDC_INTERACTION_EXPIRED', 'This sign-in session expired. Start again from DGLaundry.', 410);
      const ticketData = {
        interaction_id: interaction.id,
        client_id: client.client_id,
        account_id: String(account.id),
        session_token: String(sessionToken),
        session_hash: hashInteractionBinding(sessionToken),
        session_jti: String(interaction.fresh_auth?.session_jti || ''),
        action,
        company_id: context?.company?.company_id || null,
        granted_scope: grantedScope,
        binding_hash: interaction.browser_binding_hash,
        storefront_binding_hash: interaction.storefront_binding_hash,
        created_at: now(),
        expires_at: expiresAt
      };
      if (!(await repository.createCompletionTicket(ticket, ticketData))) {
        throw error('OIDC_COMPLETION_TICKET_UNAVAILABLE', 'DGFY could not prepare this sign-in. Start again from DGLaundry.', 503);
      }
      const completionUrl = new URL('/oidc/complete', issuer.origin);
      completionUrl.hash = new URLSearchParams({ ticket }).toString();
      return { completion_url: completionUrl.toString(), expires_at: expiresAt };
    },

    async redeemCompletion({ ticket, browserBinding }) {
      const bindingHash = hashInteractionBinding(browserBinding);
      if (!validCompletionTicket(ticket) || !String(browserBinding || '')) {
        throw error('OIDC_COMPLETION_TICKET_INVALID', 'This sign-in link is invalid or expired. Start again from DGLaundry.', 400);
      }
      const inspected = await repository.inspectCompletion(ticket, bindingHash);
      if (inspected.status === 'wrong_browser') {
        throw error('OIDC_COMPLETION_WRONG_BROWSER', 'This sign-in link was opened in a different browser. Return to the browser that started sign-in.', 403);
      }
      if (inspected.status === 'expired' || inspected.status === 'missing') {
        throw error('OIDC_COMPLETION_TICKET_EXPIRED', 'This sign-in link is invalid or expired. Start again from DGLaundry.', 410);
      }
      if (inspected.status !== 'ok' || !inspected.ticket || !inspected.interaction) {
        throw error('OIDC_COMPLETION_TICKET_INVALID', 'This sign-in link is invalid or expired. Start again from DGLaundry.', 400);
      }

      const ticketData = inspected.ticket;
      const interaction = inspected.interaction;
      const client = await resolveClient(ticketData.client_id);
      if (!authorizedClient(client, interaction, dglaundryClientId)
        || ticketData.client_id !== interaction.client_id
        || ticketData.interaction_id !== interaction.id
        || ticketData.binding_hash !== interaction.browser_binding_hash
        || ticketData.storefront_binding_hash !== interaction.storefront_binding_hash) {
        throw error('OIDC_CLIENT_UNAVAILABLE', 'This sign-in request is no longer available.', 400);
      }

      const sessionToken = String(ticketData.session_token || '');
      if (!sessionToken || ticketData.session_hash !== hashInteractionBinding(sessionToken)) {
        throw error('OIDC_SESSION_INVALID', 'Sign in again to continue this request.', 401);
      }
      let claims;
      try { claims = await verifyDgfyToken(sessionToken); }
      catch { throw error('OIDC_SESSION_INVALID', 'Sign in again to continue this request.', 401); }
      if (String(claims?.token_scope || '') !== 'dgfy'
        || String(claims?.dgfy_account_id || '') !== String(ticketData.account_id)
        || Number(claims?.exp || 0) * 1000 <= now()) {
        throw error('OIDC_SESSION_INVALID', 'Sign in again to continue this request.', 401);
      }
      if (await isTokenBlacklisted(sessionToken)) {
        throw error('OIDC_SESSION_REVOKED', 'Your DGFY session expired. Sign in again to continue.', 401);
      }
      const account = await findAccountById(ticketData.account_id);
      if (!account || !account.is_active || account.deleted_at) {
        throw error('OIDC_ACCOUNT_UNAVAILABLE', 'This DGFY account is no longer available.', 401);
      }
      requireFreshAuthentication(interaction, account, sessionToken);
      if (hasPrompt(interaction.params, 'login')
        && (String(claims.jti || '') !== String(interaction.fresh_auth?.session_jti || '')
          || String(ticketData.session_jti || '') !== String(interaction.fresh_auth?.session_jti || ''))) {
        throw error('OIDC_FRESH_LOGIN_REQUIRED', 'Sign in again to continue this request.', 403);
      }

      let context = null;
      let grantedScope = String(ticketData.granted_scope || '');
      const fixedCompanyId = String(interaction.params.dglaundry_company_id || '').trim();
      if (ticketData.action === 'company') {
        const companies = await eligibleCompanies(account);
        const selectedId = String(ticketData.company_id || '').trim();
        if (!selectedId || (fixedCompanyId && selectedId !== fixedCompanyId)) {
          throw error('OIDC_COMPANY_SELECTION_DENIED', 'The selected DGLaundry company is no longer available.', 403);
        }
        const company = companies.find((candidate) => String(candidate.company_id) === selectedId);
        if (!company) throw error('OIDC_COMPANY_SELECTION_DENIED', 'The selected DGLaundry company is no longer an accepted membership of this DGFY account.', 403);
        context = { company };
      } else if (ticketData.action === 'create_company') {
        if (fixedCompanyId) throw error('OIDC_ACTION_NOT_ALLOWED', 'This sign-in request is fixed to an existing DGLaundry company.', 400);
        const currentCompanies = await eligibleCompanies(account);
        if (interaction.params.dglaundry_intent !== 'create_company' && currentCompanies.length > 0) {
          throw error('OIDC_ACTION_NOT_ALLOWED', 'DGLaundry did not authorize new-company onboarding for this sign-in request.', 400);
        }
        grantedScope = identityOnlyScope(interaction.params.scope);
        if (grantedScope !== ticketData.granted_scope) throw error('OIDC_SCOPE_INVALID', 'The requested identity scopes changed.', 400);
      } else {
        throw error('OIDC_ACTION_INVALID', 'This sign-in action is invalid.', 400);
      }

      if (!grantedScope || !splitScopes(grantedScope).includes('openid')
        || !splitScopes(grantedScope).every((scope) => client.allowed_scopes?.includes(scope))) {
        throw error('OIDC_SCOPE_INVALID', 'The requested DGFY identity scopes are no longer available.', 400);
      }
      const { code, grant } = buildAuthorizationCodeGrant({
        client,
        params: interaction.params,
        account,
        context,
        scope: grantedScope
      });
      const consumeStatus = await repository.consumeCompletionAndStoreCode({
        ticket,
        interactionId: interaction.id,
        bindingHash,
        codeKey: authorizationCodeKey(client.client_id, code),
        grant,
        codeTtlMs
      });
      if (consumeStatus === 'code_collision') throw error('OIDC_CODE_ISSUANCE_FAILED', 'DGFY could not complete this sign-in. Start again from DGLaundry.', 503);
      if (consumeStatus === 'wrong_browser') throw error('OIDC_COMPLETION_WRONG_BROWSER', 'This sign-in link was opened in a different browser. Return to the browser that started sign-in.', 403);
      if (consumeStatus !== 'ok') throw error('OIDC_COMPLETION_TICKET_EXPIRED', 'This sign-in link is invalid or expired. Start again from DGLaundry.', 410);

      const callback = new URL(interaction.params.redirect_uri);
      callback.searchParams.set('code', code);
      if (interaction.params.state) callback.searchParams.set('state', interaction.params.state);
      return {
        redirect_uri: callback.toString(),
        session_token: sessionToken,
        session_expires_at: Number(claims.exp) * 1000
      };
    }
  };
};
