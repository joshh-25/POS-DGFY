#!/usr/bin/env node
/**
 * Mint a short-lived DGFY_DEV_TOKEN for the compliance preflight sweep (#1121).
 *
 * Replaces the manual "log in by hand, paste the JWT" step the promotion-time compliance sweep
 * (docs/compliance/request-time-preflight-protocol.md, "Where live preflight actually runs") has
 * relied on since #884. This script does one thing: log in against a target host with a dedicated,
 * least-privilege service/bot account (SYSTEM.EDIT_SETTINGS only -- never `role: admin`) and print
 * the resulting JWT to stdout, nothing else. Provisioning that account is a manual, one-time step --
 * see docs/compliance/request-time-preflight-protocol.md's "Where live preflight actually runs" for
 * the exact procedure and why no seeder in this repo can create it automatically.
 *
 * No credential is ever hardcoded, cached, or written to disk here -- everything comes from env,
 * consistent with the deploy-sops.sh pattern of exporting decrypted secrets into the shell just
 * before use (docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md). It is cheap to mint a fresh token per
 * call (24h JWT_EXPIRY default, apps/dgfy-api/src/services/authService.js), so this script never
 * tries to reuse or persist one -- see the issue's own rationale for why that's the lower-exposure
 * choice.
 *
 * Primary caller: .github/workflows/compliance-preflight-sweep.yml, where these env vars are
 * resolved from a GitHub Environment's own secret store (STAGING/DEV), never a repo-wide secret.
 * Also directly runnable locally as a documented debugging fallback -- see
 * docs/compliance/request-time-preflight-protocol.md.
 *
 * Usage:
 *   DGFY_DEV_TOKEN=$(node scripts/mint-preflight-token.js)
 *
 * Required env vars:
 *   PREFLIGHT_HOST            e.g. https://stage.dgfy.ph -- no trailing slash
 *   PREFLIGHT_COMPANY_TOKEN   the target tenant's x-company-token value (login requires tenant
 *                             context -- see authService.loginUser's requireTenantAuthContext())
 *   PREFLIGHT_BOT_EMAIL       the bot account's login email
 *   PREFLIGHT_BOT_PASSWORD    the bot account's login password
 */

'use strict';

const REQUIRED_ENV_VARS = [
  'PREFLIGHT_HOST',
  'PREFLIGHT_COMPANY_TOKEN',
  'PREFLIGHT_BOT_EMAIL',
  'PREFLIGHT_BOT_PASSWORD'
];

function readConfig() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name] || !process.env[name].trim());
  if (missing.length > 0) {
    throw new Error(`Missing required env var(s): ${missing.join(', ')}`);
  }

  return {
    host: process.env.PREFLIGHT_HOST.trim().replace(/\/+$/, ''),
    companyToken: process.env.PREFLIGHT_COMPANY_TOKEN.trim(),
    email: process.env.PREFLIGHT_BOT_EMAIL.trim(),
    password: process.env.PREFLIGHT_BOT_PASSWORD
  };
}

async function mintToken({ host, companyToken, email, password }) {
  const url = `${host}/api/v1/auth/login`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company-token': companyToken
      },
      body: JSON.stringify({ email, password })
    });
  } catch (error) {
    throw new Error(`Login request to ${url} failed: ${error.message}`);
  }

  if (!response.ok) {
    // Deliberately not dumping the response body -- it may echo the request payload back or
    // carry other fields not safe to put in a log/step-summary. Status + statusText is enough to
    // diagnose "wrong credentials" vs "wrong host" vs "tenant not resolved" from the caller's own
    // knowledge of the target environment.
    throw new Error(`Login request to ${url} returned ${response.status} ${response.statusText}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Login response from ${url} was not valid JSON: ${error.message}`);
  }

  const token = payload && payload.data && payload.data.token;
  if (!token || typeof token !== 'string') {
    throw new Error(`Login response from ${url} did not include a token`);
  }

  return token;
}

async function main() {
  const config = readConfig();
  const token = await mintToken(config);
  // Only the token on stdout -- safe for `DGFY_DEV_TOKEN=$(node scripts/mint-preflight-token.js)`
  // capture with nothing else to strip out.
  process.stdout.write(`${token}\n`);
}

main().catch((error) => {
  process.stderr.write(`[mint-preflight-token] ${error.message}\n`);
  process.exitCode = 1;
});
