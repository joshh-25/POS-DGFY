// #438: unit coverage for scripts/audit-test-cost-inventory.js.
// Run: node --test scripts/audit-test-cost-inventory.test.js
// Static only: no MySQL, Redis, provider credentials, or browser required.

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const tool = require('./audit-test-cost-inventory.js');

describe('estimateRuntimeBucket', () => {
  it('buckets small files as fast', () => {
    assert.match(tool.estimateRuntimeBucket(1024, 3), /^fast/);
  });
  it('buckets medium files as medium', () => {
    assert.match(tool.estimateRuntimeBucket(30 * 1024, 20), /^medium/);
  });
  it('buckets large or case-heavy files as slow', () => {
    assert.match(tool.estimateRuntimeBucket(200 * 1024, 5), /^slow/);
    assert.match(tool.estimateRuntimeBucket(1024, 100), /^slow/);
  });
});

describe('classifyBackend', () => {
  const manifest = new Set(['tests/auth.test.js']);

  it('reuses the backend db manifest instead of re-deriving it', () => {
    const out = tool.classifyBackend('apps/dgfy-api/tests/auth.test.js', 'describe("x",()=>{})', manifest);
    assert.equal(out.classification, tool.CLASS.DB_REQUIRED);
    assert.equal(out.dependencies.db_required, true);
    assert.equal(out.default_opt_in, 'opt-in');
  });

  it('classifies browser-gated frontend journey files as browser-e2e', () => {
    const out = tool.classifyBackend(
      'apps/dgfy-api/tests/frontend.imsPosSalesJourney.e2e.test.js',
      'if (process.env.RUN_BROWSER_E2E !== "true") describe.skip("x",()=>{});',
      new Set(),
    );
    assert.equal(out.classification, tool.CLASS.BROWSER_E2E);
    assert.equal(out.dependencies.browser_runtime_required, true);
    assert.equal(out.default_opt_in, 'opt-in');
  });

  it('treats a mocked provider file as fast-mocked-external, not network', () => {
    const content = 'jest.unstable_mockModule("axios",()=>({})); describe("paymongo",()=>{ it("x",()=>{}); });';
    const out = tool.classifyBackend('apps/dgfy-api/tests/paymongoDirectGcash.test.js', content, new Set());
    assert.equal(out.classification, tool.CLASS.FAST_MOCKED);
    assert.equal(out.dependencies.network_provider_required, false);
    assert.equal(out.default_opt_in, 'default');
  });

  it('treats provider words in fixture literals as fast-pure, not network', () => {
    const content = 'expect(order).toMatchObject({ payment_provider: "paymongo" });';
    const out = tool.classifyBackend('apps/dgfy-api/tests/storePaymentTruth.unit.test.js', content, new Set());
    assert.equal(out.classification, tool.CLASS.FAST_PURE);
    assert.equal(out.dependencies.network_provider_required, false);
  });

  it('treats axios-mock-adapter usage as fast-mocked-external', () => {
    const content = 'import MockAdapter from "axios-mock-adapter"; const m = new MockAdapter(api); m.onPost("/x").reply(200);';
    const out = tool.classifyFrontend('apps/dgfy-storefront/src/__tests__/a.test.js', content, 'apps/dgfy-storefront');
    assert.equal(out.classification, tool.CLASS.FAST_MOCKED);
    assert.equal(out.default_opt_in, 'default');
  });
  it('treats an unmocked live provider call as network/provider-required opt-in', () => {
    const content = 'fetch("https://api.paypal.com/v2/checkout"); describe("live",()=>{ it("x",()=>{}); });';
    const out = tool.classifyBackend('apps/dgfy-api/tests/paypalLive.probe.test.js', content, new Set());
    assert.equal(out.classification, tool.CLASS.NETWORK_PROVIDER);
    assert.equal(out.dependencies.network_provider_required, true);
    assert.equal(out.default_opt_in, 'opt-in');
  });

  it('treats redis imports as mocked (tests/setup.js), never redis-required', () => {
    const content = 'import { getRedisClient } from "../src/config/redis.js"; describe("lock",()=>{ it("x",()=>{}); });';
    const out = tool.classifyBackend('apps/dgfy-api/tests/distributedLock.redis.test.js', content, new Set());
    assert.equal(out.classification, tool.CLASS.FAST_MOCKED);
    assert.equal(out.dependencies.redis_required, false);
  });

  it('classifies a pure unit file as fast-pure default', () => {
    const out = tool.classifyBackend('apps/dgfy-api/tests/healthService.test.js', 'describe("x",()=>{ it("y",()=>{}); });', new Set());
    assert.equal(out.classification, tool.CLASS.FAST_PURE);
    assert.equal(out.default_opt_in, 'default');
    assert.deepEqual(out.dependencies, {
      db_required: false, redis_required: false, network_provider_required: false,
      browser_runtime_required: false, fixture_seed_required: false,
    });
  });

  it('flags fixture/seed usage explicitly', () => {
    const out = tool.classifyBackend('apps/dgfy-api/tests/x.test.js', 'await createTestTenant();', new Set(['tests/x.test.js']));
    assert.equal(out.dependencies.fixture_seed_required, true);
  });
});

describe('classifyFrontend', () => {
  it('classifies tests/e2e files as browser-e2e (Playwright owns them)', () => {
    const out = tool.classifyFrontend(
      'apps/dgfy-ims/tests/e2e/smoke.spec.js',
      'import { test } from "@playwright/test";',
      'apps/dgfy-ims',
    );
    assert.equal(out.classification, tool.CLASS.BROWSER_E2E);
    assert.equal(out.runner, 'Playwright');
    assert.equal(out.default_opt_in, 'opt-in');
  });

  it('attributes web-core files to the IMS invocation (ADR 0071)', () => {
    const out = tool.classifyFrontend(
      'packages/web-core/src/utils/x.test.js',
      'describe("x",()=>{ it("y",()=>{}); });',
      'apps/dgfy-ims',
    );
    assert.match(out.command, /--prefix apps\/dgfy-ims/);
    assert.match(out.command, /packages\/web-core\/src\/utils\/x\.test\.js/);
  });

  it('treats mocked fetch as fast-mocked-external default', () => {
    const content = 'vi.mock("@/services/api"); it("x",()=>{ expect(fetch).toHaveBeenCalled(); });';
    const out = tool.classifyFrontend('apps/dgfy-pos/src/__tests__/a.test.js', content, 'apps/dgfy-pos');
    assert.equal(out.classification, tool.CLASS.FAST_MOCKED);
    assert.equal(out.default_opt_in, 'default');
  });

  it('never claims a mocked API test proves live provider behavior', () => {
    const content = 'vi.mock("axios"); describe("paymongo checkout",()=>{ it("x",()=>{}); });';
    const out = tool.classifyFrontend('apps/dgfy-storefront/src/__tests__/a.test.js', content, 'apps/dgfy-storefront');
    assert.equal(out.classification, tool.CLASS.FAST_MOCKED);
    assert.match(out.safe_command, /no MySQL\/Redis\/network\/browser required/);
  });
});

describe('buildInventory', () => {
  it('discovers backend tests recursively, like jest --listTests does', () => {
    const inv = tool.buildInventory();
    const hit = inv.records.find((r) => r.path === 'apps/dgfy-api/tests/helpers/testTenantHelper.cloneFromTemplateDatabase.unit.test.js');
    assert.ok(hit, 'tests/helpers/*.test.js must be inventoried (a top-level readdir misses it)');
  });

  it('excludes legacy backend files with an explicit reason', () => {
    const inv = tool.buildInventory();
    const legacyExcluded = inv.exclusions.filter((e) => e.path.includes('apps/dgfy-api'));
    assert.ok(legacyExcluded.length > 0, 'legacy backend files must be explicitly excluded');
    for (const e of legacyExcluded) assert.match(e.reason, /legacy/);
  });

  it('excludes e2e files from Vitest unit classifications', () => {
    const inv = tool.buildInventory();
    const vitestE2E = inv.records.filter((r) => r.runner === 'Vitest' && /(^|\/)tests\/e2e\//.test(r.path));
    assert.equal(vitestE2E.length, 0, `e2e files under Vitest: ${vitestE2E.map((r) => r.path).join(', ')}`);
  });

  it('marks the migration runner as db-required operational validation with no invented unit suite', () => {
    const inv = tool.buildInventory();
    const mig = inv.records.filter((r) => r.workspace === 'apps/dgfy-migration-runner');
    assert.ok(mig.length >= 2);
    for (const r of mig) {
      assert.equal(r.classification, tool.CLASS.DB_REQUIRED);
      assert.equal(r.default_opt_in, 'opt-in');
    }
  });

  it('matches every #378 basename to a live record or reports it unmatched', () => {
    const inv = tool.buildInventory();
    assert.ok(Array.isArray(inv.unmatched_baseline_failures_378));
    for (const base of tool.BASELINE_FAILURES_378) {
      const hit = inv.records.some((r) => r.path.endsWith(`/${base}`));
      assert.ok(hit || inv.unmatched_baseline_failures_378.includes(base), `unaccounted #378 entry: ${base}`);
    }
  });

  it('emits a safe default subset with no DB/Redis/network/browser dependency', () => {
    const inv = tool.buildInventory();
    const def = inv.records.filter((r) => r.default_opt_in === 'default');
    assert.ok(def.length > 0);
    for (const r of def) {
      assert.equal(r.dependencies.db_required, false, r.path);
      assert.equal(r.dependencies.redis_required, false, r.path);
      assert.equal(r.dependencies.network_provider_required, false, r.path);
      assert.equal(r.dependencies.browser_runtime_required, false, r.path);
    }
  });
});
