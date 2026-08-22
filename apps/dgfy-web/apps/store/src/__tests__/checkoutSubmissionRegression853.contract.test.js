import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

// #857: PR #853's develop reconciliation silently reverted three pieces of prior, intentional
// behavior in these two hooks while adding its own direct-card/OTP-gating work. None of the
// reverts were called out in that PR's own description as intended scope. This is a static
// source-contract test, matching the pattern already used in
// simpleCheckoutOnlinePayments.contract.test.js -- both hooks take many props with real
// side-effecting dependencies (auth, navigation, cart state), so a full renderHook mount is
// impractical; asserting on the source text directly is what actually catches a call-shape
// regression like R3 without reconstructing that whole dependency graph.
describe('checkout-submission hooks: #853 regression guards', () => {
  const submission = readSource('shared/hooks/useCheckoutSubmission.js');
  const fnbSubmission = readSource('modes/fnb/checkout/hooks/useFnbCheckoutSubmission.js');

  it('R3: checkoutPayload is always called with a single options object, never a second positional cartOverride arg', () => {
    // buildPayload (useFnbCheckoutQuote.js) takes `({ promoCode, voucherCode, cartOverride } = {})`
    // -- a second positional argument is silently discarded, so a mixed product+service cart's
    // productCartLines override never reaches the request body and service lines get submitted
    // into the product order instead.
    expect(submission).not.toMatch(/checkoutPayload\(\s*undefined\s*,/);
    expect(submission).toContain('...checkoutPayload({ cartOverride: hasMixedCart ? productCartLines : undefined }),');
  });

  it('R1: resolveTrackedTotals is defined and used to overlay the server-persisted order total in both hooks', () => {
    // Without this, checkoutResult.totals and the tracking snapshot's total_amount fall back to
    // the client's pre-submission totalsForDisplay, which does not reflect a just-applied voucher.
    expect(submission).toContain('const resolveTrackedTotals = (order, fallbackTotals) => {');
    expect(submission).toContain('totals: resolveTrackedTotals(productData?.order, totalsForDisplay)');
    expect(submission).toContain('totals: resolveTrackedTotals(data?.order, totalsForDisplay)');

    expect(fnbSubmission).toContain('const resolveTrackedTotals = (order, fallbackTotals) => {');
    expect(fnbSubmission).toContain('totals: resolveTrackedTotals(data?.order, totalsForDisplay)');
  });

  it('R2: the Services local-simulation branch is present and wired to the params StorefrontApp.jsx passes', () => {
    // StorefrontApp.jsx always passes serviceOrderMethod/servicesLocalSimulationEnabled/
    // isServicesLocalSimulationMethod/createServicesLocalSimulation into this hook -- if the hook
    // stops destructuring and using them, they become silently dead-wired props with no runtime
    // effect and no error, rather than an obvious break.
    expect(submission).toContain('serviceOrderMethod,\n  servicesLocalSimulationEnabled,\n  isServicesLocalSimulationMethod,\n  createServicesLocalSimulation,');
    expect(submission).toContain('const shouldCreateLocalServicesSimulation = isServicesMode');
    expect(submission).toContain('createServicesLocalSimulation({');
  });
});
