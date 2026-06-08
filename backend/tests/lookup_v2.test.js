import request from 'supertest';
import app from '../src/server.js';
import db from '../src/models/index.js';
import sequelize from '../src/config/database.js';
import { Op } from 'sequelize';
import { generateDgfyToken } from '../src/modules/dgfy/usecases/dgfyAuthUseCases.js';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';

// Shared email prefix so afterAll can sweep up anything this suite touches
// regardless of which individual test created it.
const EMAIL_PREFIX = 'lookup-v2-test-';
const ts = Date.now();

const makeEmail = (label) => `${EMAIL_PREFIX}${label}-${ts}@example.com`;
let previousApprovalMode;
let dgfyAccountCounter = 0;

const createDgfyAccountForLabel = async (label) => {
    dgfyAccountCounter += 1;
    const suffix = `${label}-${dgfyAccountCounter}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const account = await db.DgfyAccount.create({
        first_name: 'Lookup',
        last_name: label,
        username: `lookup_${suffix}`,
        email: makeEmail(suffix),
        phone: `+63918${String(ts + dgfyAccountCounter).slice(-7).padStart(7, '0')}`,
        password_hash: '$2y$10$abcdefghijklmnopqrstuv',
        is_active: true,
        email_verified_at: new Date()
    });
    return {
        account,
        token: generateDgfyToken(account)
    };
};

const baseData = (label) => ({
    name: `Lookup V2 Test Corp [${label}] ${ts}`,
    plan: 'standard',
    complianceMode: 'non_compliant',
    workflowMode: 'msme',
    accepted_company_terms: true,
    company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
    marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
});

// ─── Cleanup ────────────────────────────────────────────────────────────────
beforeAll(async () => {
    previousApprovalMode = process.env.TENANT_REGISTRATION_APPROVAL_MODE;
    process.env.TENANT_REGISTRATION_APPROVAL_MODE = 'manual';
    await db.DgfyLegalAcknowledgement.sync();
});

// Pattern-based: catches orphans even if a test fails mid-way.
afterAll(async () => {
    if (previousApprovalMode === undefined) {
        delete process.env.TENANT_REGISTRATION_APPROVAL_MODE;
    } else {
        process.env.TENANT_REGISTRATION_APPROVAL_MODE = previousApprovalMode;
    }

    await db.UserTenantMapping.destroy({
        where: { email: { [Op.like]: `${EMAIL_PREFIX}%` } },
    });
    await db.DgfyAccount.destroy({
        where: { email: { [Op.like]: `${EMAIL_PREFIX}%` } },
    });
    await db.Tenant.destroy({
        where: { admin_email: { [Op.like]: `${EMAIL_PREFIX}%` } },
    });
    await sequelize.close();
});

// ─── Suite ──────────────────────────────────────────────────────────────────
describe('Company Token Lookup — full coverage', () => {

    // ── 1. Happy path (original tests, now with status assertion) ────────────
    describe('single tenant — happy path', () => {
        it('registers a pending company and looks it up by email, asserting token, name, and status', async () => {
            const data = baseData('happy');
            const { account, token } = await createDgfyAccountForLabel('happy');

            const regRes = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('Authorization', `Bearer ${token}`)
                .send(data)
                .expect(201);

            expect(regRes.body.success).toBe(true);
            expect(regRes.body.data.status).toBe('pending');
            const expectedToken = regRes.body.data.company_token;

            const lookupRes = await request(app)
                .post('/api/v1/auth/lookup')
                .send({ email: account.email })
                .expect(200);

            expect(lookupRes.body.success).toBe(true);
            expect(lookupRes.body.data.company_token).toBe(expectedToken);
            expect(lookupRes.body.data.company_name).toBe(data.name);
            // Gap 3 fix: assert status so a rejected tenant leaking through is caught
            expect(lookupRes.body.data.status).toBe('pending');
        });
    });

    // ── 2. 404 for unknown email (original) ──────────────────────────────────
    describe('unknown email', () => {
        it('returns 404 for an email that has never been registered', async () => {
            await request(app)
                .post('/api/v1/auth/lookup')
                .send({ email: 'nobody-ever-registered-this@example.com' })
                .expect(404);
        });
    });

    // ── 3. Case normalization (Gap 1) ────────────────────────────────────────
    describe('email case normalization', () => {
        it('returns the same token when the email is looked up in UPPERCASE', async () => {
            const data = baseData('case');
            const { account, token } = await createDgfyAccountForLabel('case');

            const regRes = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('Authorization', `Bearer ${token}`)
                .send(data)
                .expect(201);

            const expectedToken = regRes.body.data.company_token;

            // Lookup with fully uppercased email
            const lookupRes = await request(app)
                .post('/api/v1/auth/lookup')
                .send({ email: account.email.toUpperCase() })
                .expect(200);

            expect(lookupRes.body.data.company_token).toBe(expectedToken);
        });

        it('returns the same token when the email is looked up with mixed case', async () => {
            const data = baseData('mixedcase');
            const { account, token } = await createDgfyAccountForLabel('mixedcase');

            const regRes = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('Authorization', `Bearer ${token}`)
                .send(data)
                .expect(201);

            const expectedToken = regRes.body.data.company_token;

            // Flip casing of every other character
            const mixedEmail = account.email
                .split('')
                .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
                .join('');

            const lookupRes = await request(app)
                .post('/api/v1/auth/lookup')
                .send({ email: mixedEmail })
                .expect(200);

            expect(lookupRes.body.data.company_token).toBe(expectedToken);
        });
    });

    // ── 4. Multiple-tenant branch (Gap 2) ────────────────────────────────────
    describe('multiple tenants for one email', () => {
        it('returns multiple: true with a tenants array when the email belongs to two companies', async () => {
            // Register two separate companies under the same admin email
            const { account, token } = await createDgfyAccountForLabel('multi');
            const sharedEmail = account.email;

            const reg1 = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('Authorization', `Bearer ${token}`)
                .send(baseData('multi-a'))
                .expect(201);

            const reg2 = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('Authorization', `Bearer ${token}`)
                .send(baseData('multi-b'))
                .expect(201);

            const tokenA = reg1.body.data.company_token;
            const tokenB = reg2.body.data.company_token;

            const lookupRes = await request(app)
                .post('/api/v1/auth/lookup')
                .send({ email: sharedEmail })
                .expect(200);

            expect(lookupRes.body.success).toBe(true);
            expect(lookupRes.body.data.multiple).toBe(true);

            const tenants = lookupRes.body.data.tenants;
            expect(Array.isArray(tenants)).toBe(true);
            expect(tenants.length).toBe(2);

            // Both returned tokens must match what was registered
            const returnedTokens = tenants.map(t => t.company_token);
            expect(returnedTokens).toContain(tokenA);
            expect(returnedTokens).toContain(tokenB);

            // Each tenant object must have the required fields
            tenants.forEach(t => {
                expect(t).toHaveProperty('id');
                expect(t).toHaveProperty('name');
                expect(t).toHaveProperty('company_token');
                expect(t).toHaveProperty('status');
            });
        });
    });

    // ── 5. Rejected tenant is excluded (Gap 4) ───────────────────────────────
    describe('rejected tenant exclusion', () => {
        it('returns 404 when the only tenant for an email has been rejected', async () => {
            const data = baseData('rejected');
            const { account, token } = await createDgfyAccountForLabel('rejected');

            const regRes = await request(app)
                .post('/api/v1/admin/tenants/register')
                .set('Authorization', `Bearer ${token}`)
                .send(data)
                .expect(201);

            const tenantId = regRes.body.data.id;

            // Manually reject the tenant via DB (simulates admin rejection)
            await db.Tenant.update(
                { status: 'rejected' },
                { where: { id: tenantId } }
            );

            // Lookup should now return 404 — rejected tenants are excluded
            await request(app)
                .post('/api/v1/auth/lookup')
                .send({ email: account.email })
                .expect(404);
        });
    });

    // ── 6. Input validation — 422 responses (Gap 5) ──────────────────────────
    describe('input validation', () => {
        it('returns 422 with field errors for a malformed email', async () => {
            const res = await request(app)
                .post('/api/v1/auth/lookup')
                .send({ email: 'not-an-email' })
                .expect(422);

            expect(res.body.success).toBe(false);
            expect(Array.isArray(res.body.errors)).toBe(true);
            expect(res.body.errors.some(e => e.field === 'email')).toBe(true);
        });

        it('returns 422 when email field is missing entirely', async () => {
            const res = await request(app)
                .post('/api/v1/auth/lookup')
                .send({})
                .expect(422);

            expect(res.body.success).toBe(false);
            expect(Array.isArray(res.body.errors)).toBe(true);
        });

        it('returns 422 for an email with spaces', async () => {
            const res = await request(app)
                .post('/api/v1/auth/lookup')
                .send({ email: 'has spaces@example.com' })
                .expect(422);

            expect(res.body.success).toBe(false);
        });
    });

    // ── 7. Rate limiter bypass documentation (Gap 6) ─────────────────────────
    describe('rate limiter behavior in test environment', () => {
        it('allows more than 5 consecutive lookups without returning 429 (test env bypass confirmed)', async () => {
            // Production limit is 5 per 15-minute window.
            // In NODE_ENV=test the limiter's skip() returns true, so none should 429.
            const results = [];
            for (let i = 0; i < 6; i++) {
                const res = await request(app)
                    .post('/api/v1/auth/lookup')
                    .send({ email: `nonexistent-ratelimit-${i}@example.com` });
                results.push(res.status);
            }

            // All must be 404 (not found), none must be 429 (rate limited)
            expect(results.every(s => s === 404)).toBe(true);
        });
    });

});
