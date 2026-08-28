#!/usr/bin/env node
/**
 * Parse a POST /api/v1/compliance/preflight response body into a pass/fail verdict.
 *
 * Pulled out of .github/workflows/compliance-preflight-sweep.yml's inline `node -e` scriptlet
 * (pr-reviewer RF-5 on PR #1127/#1121) -- that scriptlet read `result`/`can_proceed`/`reason_code`
 * off the JSON *top level*, but `runCompliancePreflight`
 * (apps/dgfy-api/src/modules/compliance/controllers/complianceHandlers.js's
 * `successPayloadResolver`) wraps them inside `data`:
 *
 *   { "success": true, "data": { "result": "no_breach", "can_proceed": true, "reason_code": "ALLOWED", ... }, "message": "...", "timestamp": "..." }
 *
 * Reading the top level meant `result`/`can_proceed` were always `undefined`, so every real
 * `no_breach` response was misparsed as a failure -- the sweep could never actually pass.
 *
 * A pass requires BOTH `data.result === "no_breach"` AND `data.can_proceed === true` -- the
 * endpoint returns HTTP 200 for `breach`/`review_required` too (`can_proceed: false`), so HTTP
 * status alone is never sufficient (pr-reviewer RF-2, fixed earlier on this same PR).
 *
 * Usage:
 *   node scripts/parse-preflight-response.js <<< "$response_body"
 * Prints `{"pass":bool,"result":string|null,"can_proceed":bool|null,"reason_code":string|null}`
 * to stdout. Never throws on malformed JSON -- an unparseable body is just `pass: false` with
 * every other field `null`, since a sweep step should fail loudly, not crash.
 */

'use strict';

const fs = require('fs');

/**
 * Parse a raw response body string into a verdict. Exported separately from stdin-reading
 * `main()` so it's directly testable against fixture strings.
 */
const parseVerdict = (rawBody) => {
  let parsed = null;
  try {
    parsed = JSON.parse(String(rawBody || ''));
  } catch {
    parsed = null;
  }

  // Unwrap the { success, data: {...} } envelope -- fall back to the top level so a bare
  // { result, can_proceed, reason_code } body (e.g. a hand-built fixture, or a future API version
  // that stops wrapping) still parses correctly rather than only ever matching one shape.
  const data = parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object'
    ? parsed.data
    : parsed;

  const result = (data && data.result) || null;
  const canProceed = data ? data.can_proceed === true : null;
  const reasonCode = (data && data.reason_code) || null;
  const pass = result === 'no_breach' && canProceed === true;

  return { pass, result, can_proceed: canProceed, reason_code: reasonCode };
};

const main = () => {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }
  process.stdout.write(JSON.stringify(parseVerdict(raw)));
};

if (require.main === module) main();

module.exports = { parseVerdict };
