import { afterEach, describe, expect, jest, test } from '@jest/globals';
import {
  buildOidcInteractionUseCases,
  OIDC_COMPLETION_TICKET_TTL_MS,
  OIDC_INTERACTION_TTL_MS
} from '../src/modules/partnerIdentity/usecases/oidcInteractionUseCases.js';
import { hashInteractionBinding } from '../src/modules/partnerIdentity/domain/oidcInteractionPolicy.js';

const clientId = 'dglaundry-web';
const client = {
  client_id: clientId,
  client_type: 'browser',
  status: 'active',
  context_adapter: 'dglaundry',
  redirect_uris: ['https://laundry.surebizcorp.com/auth/dgfy/callback'],
  allowed_scopes: ['openid', 'profile', 'email', 'dglaundry.company_context'],
  app: { name: 'DGLaundry' }
};
const baseParams = {
  client_id: clientId,
  response_type: 'code',
  redirect_uri: client.redirect_uris[0],
  scope: 'openid profile email dglaundry.company_context',
  state: 'state-123',
  nonce: 'nonce-123',
  code_challenge: 'pkce-challenge',
  code_challenge_method: 'S256'
};
const account = { id: 'account-1', is_active: true, first_name: 'Ada', last_name: 'Owner', email: 'ada@example.test' };
const sessionToken = 'dgfy-session-token';

const makeFixture = ({ params = {}, companies = [{ company_id: 'company-1', company_name: 'Laundry One', membership_id: 11, role: 'owner' }] } = {}) => {
  let now = 1_800_000_000_000;
  let currentCompanies = companies;
  const interactions = new Map();
  const tickets = new Map();
  const codes = new Map();
  const repository = {
    createInteraction: async (id, value) => { interactions.set(id, structuredClone(value)); return true; },
    findInteraction: async (id) => structuredClone(interactions.get(id) || null),
    bindStorefrontBrowser: async (id, handoffHash, bindingHash) => {
      const item = interactions.get(id);
      if (!item) return 'missing';
      if (Number(item.expires_at) <= now) return 'expired';
      if (item.storefront_binding_hash === bindingHash) return 'existing';
      if (!item.storefront_handoff_hash || item.storefront_handoff_hash !== handoffHash) return 'invalid';
      item.storefront_binding_hash = bindingHash;
      delete item.storefront_handoff_hash;
      return 'ok';
    },
    recordFreshAuthentication: async (id, proof) => {
      const item = interactions.get(id);
      if (!item || item.expires_at <= now) return false;
      item.fresh_auth = structuredClone(proof);
      return true;
    },
    createCompletionTicket: async (ticket, value) => { tickets.set(ticket, structuredClone(value)); return true; },
    inspectCompletion: async (ticket, bindingHash) => {
      const value = tickets.get(ticket);
      if (!value) return { status: 'missing' };
      if (value.expires_at <= now) return { status: 'expired' };
      if (value.binding_hash !== bindingHash) return { status: 'wrong_browser' };
      const interaction = interactions.get(value.interaction_id);
      if (!interaction || interaction.expires_at <= now) return { status: 'expired' };
      return { status: 'ok', ticket: structuredClone(value), interaction: structuredClone(interaction) };
    },
    consumeCompletionAndStoreCode: async ({ ticket, interactionId, bindingHash, codeKey, grant }) => {
      const value = tickets.get(ticket);
      const interaction = interactions.get(interactionId);
      if (!value || !interaction) return 'missing';
      if (value.expires_at <= now || interaction.expires_at <= now) return 'expired';
      if (value.binding_hash !== bindingHash || interaction.browser_binding_hash !== bindingHash) return 'wrong_browser';
      if (codes.has(codeKey)) return 'code_collision';
      codes.set(codeKey, structuredClone(grant));
      tickets.delete(ticket);
      interactions.delete(interactionId);
      return 'ok';
    }
  };
  const buildAuthorizationCodeGrant = jest.fn(({ client: selectedClient, params: authorizationParams, account: selectedAccount, context, scope }) => ({
    code: 'one-time-authorization-code',
    grant: { client_id: selectedClient.client_id, params: authorizationParams, account_id: selectedAccount.id, context, scope }
  }));
  const useCases = buildOidcInteractionUseCases({
    repository,
    consumePar: async () => ({ client, params: { ...baseParams, ...params } }),
    resolveClient: async () => client,
    listLaundryCompanies: async () => currentCompanies,
    findAccountById: async () => account,
    verifyDgfyToken: async () => ({
      token_scope: 'dgfy', dgfy_account_id: account.id, exp: Math.floor((now + 3_600_000) / 1000), jti: 'session-jti'
    }),
    isTokenBlacklisted: async () => false,
    buildAuthorizationCodeGrant,
    authorizationCodeKey: (_id, code) => `code:${code}`,
    dglaundryClientId: clientId,
    env: {
      NODE_ENV: 'production',
      DGFY_OIDC_ISSUER: 'https://api.dev.dgfy.ph/oidc',
      STOREFRONT_PUBLIC_ORIGIN: 'https://dev.dgfy.ph',
      DGLAUNDRY_PARTNER_BASE_URL: 'https://laundry.surebizcorp.com'
    },
    now: () => now
  });

  const start = async () => {
    const interaction = await useCases.createInteraction({ requestUri: 'urn:test:par', browserBinding: 'issuer-browser-binding' });
    const url = new URL(interaction.storefront_url);
    const handoff = new URLSearchParams(url.hash.slice(1)).get('oidc_handoff');
    const bound = await useCases.bindStorefrontBrowser({ id: interaction.id, handoff });
    return { ...interaction, handoff, storefrontBinding: bound.browser_binding };
  };
  const recordFresh = async (started, token = sessionToken) => useCases.recordFreshAuthentication({
    id: started.id,
    accountId: account.id,
    sessionToken: token,
    claims: { token_scope: 'dgfy', dgfy_account_id: account.id, jti: 'session-jti', exp: Math.floor((now + 3_600_000) / 1000) },
    browserBinding: started.storefrontBinding
  });

  return {
    useCases, repository, interactions, tickets, codes, buildAuthorizationCodeGrant, start, recordFresh,
    advance: (milliseconds) => { now += milliseconds; },
    setCompanies: (value) => { currentCompanies = value; },
    currentTime: () => now
  };
};

describe('OIDC browser interaction use cases', () => {
  afterEach(() => jest.restoreAllMocks());

  test('creates an absolute interaction and consumes its Storefront handoff exactly once', async () => {
    const fixture = makeFixture();
    const started = await fixture.start();
    const saved = fixture.interactions.get(started.id);
    expect(started.expires_at).toBe(fixture.currentTime() + OIDC_INTERACTION_TTL_MS);
    expect(started.storefront_url).toMatch(/^https:\/\/dev\.dgfy\.ph\/oidc\/interaction\//);
    expect(saved.browser_binding_hash).toBe(hashInteractionBinding('issuer-browser-binding'));
    expect(saved.storefront_binding_hash).toBe(hashInteractionBinding(started.storefrontBinding));
    expect(saved.storefront_handoff_hash).toBeUndefined();
    await expect(fixture.useCases.bindStorefrontBrowser({ id: started.id, handoff: started.handoff })).rejects.toMatchObject({ statusCode: 403 });
    await expect(fixture.useCases.bindStorefrontBrowser({ id: started.id, handoff: '', browserBinding: 'd'.repeat(43) })).rejects.toMatchObject({ statusCode: 403 });
    await expect(fixture.useCases.getInteractionMetadata({ id: started.id, browserBinding: 'd'.repeat(43) })).rejects.toMatchObject({ statusCode: 403 });
  });

  test('requires fresh server proof for prompt=login and ties the proof to the Storefront binding', async () => {
    const fixture = makeFixture({ params: { prompt: 'login' } });
    const started = await fixture.start();
    await expect(fixture.useCases.prepareCompletion({ id: started.id, account, sessionToken, action: 'company', companyId: 'company-1', browserBinding: started.storefrontBinding }))
      .rejects.toMatchObject({ code: 'OIDC_FRESH_LOGIN_REQUIRED' });
    await expect(fixture.recordFresh(started)).resolves.toBe(true);
    await expect(fixture.useCases.getInteractionMetadata({ id: started.id, account, sessionToken, browserBinding: started.storefrontBinding }))
      .resolves.toMatchObject({ fresh_auth_verified: true });
    await expect(fixture.useCases.prepareCompletion({ id: started.id, account, sessionToken, action: 'company', companyId: 'company-1', browserBinding: started.storefrontBinding }))
      .resolves.toMatchObject({ completion_url: expect.stringMatching(/^https:\/\/api\.dev\.dgfy\.ph\/oidc\/complete#ticket=/) });
  });

  test('grants identity only for the explicit create-company intent and consumes the ticket once', async () => {
    const fixture = makeFixture({ params: { dglaundry_intent: 'create_company' } });
    const started = await fixture.start();
    const metadata = await fixture.useCases.getInteractionMetadata({ id: started.id, account, sessionToken, browserBinding: started.storefrontBinding });
    expect(metadata.new_company_intent).toBe(true);
    const prepared = await fixture.useCases.prepareCompletion({ id: started.id, account, sessionToken, action: 'create_company', browserBinding: started.storefrontBinding });
    const ticket = new URLSearchParams(new URL(prepared.completion_url).hash.slice(1)).get('ticket');
    expect(prepared.expires_at).toBeLessThanOrEqual(fixture.currentTime() + OIDC_COMPLETION_TICKET_TTL_MS);
    expect(fixture.tickets.get(ticket)).toMatchObject({
      granted_scope: 'openid profile email',
      binding_hash: hashInteractionBinding('issuer-browser-binding'),
      storefront_binding_hash: hashInteractionBinding(started.storefrontBinding)
    });
    await expect(fixture.useCases.redeemCompletion({ ticket, browserBinding: 'wrong-issuer-browser' })).rejects.toMatchObject({ code: 'OIDC_COMPLETION_WRONG_BROWSER' });
    await expect(fixture.useCases.redeemCompletion({ ticket, browserBinding: 'issuer-browser-binding' })).resolves.toMatchObject({
      redirect_uri: `${client.redirect_uris[0]}?code=one-time-authorization-code&state=state-123`
    });
    expect(fixture.buildAuthorizationCodeGrant).toHaveBeenCalledWith(expect.objectContaining({ context: null, scope: 'openid profile email' }));
    expect(fixture.codes.size).toBe(1);
    await expect(fixture.useCases.redeemCompletion({ ticket, browserBinding: 'issuer-browser-binding' })).rejects.toMatchObject({ statusCode: 410 });
  });

  test('allows identity-only onboarding without eligible companies but blocks it for existing members without PAR intent', async () => {
    const noMembership = makeFixture({ companies: [] });
    const noMembershipInteraction = await noMembership.start();
    const prepared = await noMembership.useCases.prepareCompletion({ id: noMembershipInteraction.id, account, sessionToken, action: 'create_company', browserBinding: noMembershipInteraction.storefrontBinding });
    const ticket = new URLSearchParams(new URL(prepared.completion_url).hash.slice(1)).get('ticket');
    expect(noMembership.tickets.get(ticket).granted_scope).toBe('openid profile email');

    const existingMembership = makeFixture();
    const existingInteraction = await existingMembership.start();
    await expect(existingMembership.useCases.prepareCompletion({ id: existingInteraction.id, account, sessionToken, action: 'create_company', browserBinding: existingInteraction.storefrontBinding }))
      .rejects.toMatchObject({ code: 'OIDC_ACTION_NOT_ALLOWED' });
  });

  test('rejects an explicit company that is not current accepted membership and rechecks membership at redemption', async () => {
    const fixture = makeFixture();
    const started = await fixture.start();
    await expect(fixture.useCases.prepareCompletion({ id: started.id, account, sessionToken, action: 'company', companyId: 'unknown-company', browserBinding: started.storefrontBinding }))
      .rejects.toMatchObject({ code: 'OIDC_COMPANY_SELECTION_DENIED' });
    await fixture.useCases.prepareCompletion({ id: started.id, account, sessionToken, action: 'company', companyId: 'company-1', browserBinding: started.storefrontBinding });
    fixture.setCompanies([]);
    await expect(fixture.useCases.redeemCompletion({ ticket: [...fixture.tickets.keys()][0], browserBinding: 'issuer-browser-binding' }))
      .rejects.toMatchObject({ code: 'OIDC_COMPANY_SELECTION_DENIED' });
    expect(fixture.codes.size).toBe(0);
  });

  test('completion tickets never outlive their interaction', async () => {
    const fixture = makeFixture();
    const started = await fixture.start();
    fixture.advance(OIDC_INTERACTION_TTL_MS - 10_000);
    const prepared = await fixture.useCases.prepareCompletion({ id: started.id, account, sessionToken, action: 'company', companyId: 'company-1', browserBinding: started.storefrontBinding });
    expect(prepared.expires_at).toBe(started.expires_at);
    fixture.advance(10_001);
    await expect(fixture.useCases.redeemCompletion({ ticket: [...fixture.tickets.keys()][0], browserBinding: 'issuer-browser-binding' }))
      .rejects.toMatchObject({ statusCode: 410 });
  });

  test('completes after the 120-second PAR window while the absolute interaction remains active', async () => {
    const fixture = makeFixture();
    const started = await fixture.start();
    fixture.advance(120_001);

    const prepared = await fixture.useCases.prepareCompletion({
      id: started.id,
      account,
      sessionToken,
      action: 'company',
      companyId: 'company-1',
      browserBinding: started.storefrontBinding
    });
    const ticket = new URLSearchParams(new URL(prepared.completion_url).hash.slice(1)).get('ticket');
    await expect(fixture.useCases.redeemCompletion({ ticket, browserBinding: 'issuer-browser-binding' }))
      .resolves.toMatchObject({ redirect_uri: expect.stringContaining('code=one-time-authorization-code') });
  });

  test('concurrent completion redemptions issue at most one authorization code', async () => {
    const fixture = makeFixture();
    const started = await fixture.start();
    const prepared = await fixture.useCases.prepareCompletion({
      id: started.id,
      account,
      sessionToken,
      action: 'company',
      companyId: 'company-1',
      browserBinding: started.storefrontBinding
    });
    const ticket = new URLSearchParams(new URL(prepared.completion_url).hash.slice(1)).get('ticket');

    const outcomes = await Promise.allSettled([
      fixture.useCases.redeemCompletion({ ticket, browserBinding: 'issuer-browser-binding' }),
      fixture.useCases.redeemCompletion({ ticket, browserBinding: 'issuer-browser-binding' })
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(fixture.codes.size).toBe(1);
  });

  test('rejects malformed completion tickets before consulting authorization state', async () => {
    const fixture = makeFixture();
    await expect(fixture.useCases.redeemCompletion({ ticket: 'not-a-ticket', browserBinding: 'issuer-browser-binding' }))
      .rejects.toMatchObject({ code: 'OIDC_COMPLETION_TICKET_INVALID', statusCode: 400 });
    expect(fixture.interactions.size).toBe(0);
  });
});
