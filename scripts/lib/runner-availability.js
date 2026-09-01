// Phase 233 (#1365), F-4 refactor (no behavior change): shared reason-code constants and
// interpretation helpers for CI-runner unavailability classification, extracted out of
// scripts/pr-checks.js's classifyCiUnavailability() so scripts/ci-runner-preflight.js (Wave 2) can
// reuse the same four-way taxonomy for a *pre-dispatch* question ("is this class available right
// now, before I dispatch") instead of duplicating it for its own *post-hoc* question ("did CI fail
// in a way that justifies the local-CI merge carve-out").
//
// This module holds only the pure interpretation logic (given already-fetched JSON, decide what it
// means) -- not the network fetches themselves. pr-checks.js's own `deps.fetchRunners` /
// `deps.fetchCheckRuns` / `deps.fetchCheckSuites` / `deps.fetchGithubStatus` injection points, and
// their default `gh api`/`curl` implementations, stay exactly where they were; this refactor must
// not change classifyCiUnavailability's observable behavior or its dependency-injection surface --
// scripts/pr-checks.test.js is the check that behavior didn't change, and it must stay green
// unmodified.

const { BILLING_MESSAGE } = require('../collect-github-actions-unavailability');

// The four-way taxonomy AGENTS.md's Merge Safety carve-out names, plus the non-finding 'healthy'.
// Previously string literals duplicated across pr-checks.js and
// collect-github-actions-unavailability.js; now the one place either reason code is spelled.
const REASON_CODES = Object.freeze({
  RUNNER_OFFLINE: 'runner_offline',
  QUEUE_STARVATION: 'queue_starvation',
  BILLING_ALLOCATION_FAILURE: 'billing_allocation_failure',
  GITHUB_PLATFORM_OUTAGE: 'github_platform_outage',
  HEALTHY: 'healthy'
});

/**
 * Self-hosted pool probe (previously inlined at pr-checks.js:188-192): given an already-fetched
 * `repos/:repo/actions/runners` response body, decide whether the self-hosted pool is verifiably
 * offline. `repos/:repo/actions/runners` only ever returns self-hosted runners -- GitHub-hosted
 * runners are never enumerated there -- so this probe is inherently self-hosted-only; Wave 2's
 * hosted-availability probe (scripts/ci-runner-preflight.js) does not reuse this function.
 *
 * @param {{runners?: Array<{status?: string}>} | null} runnersResponse
 * @returns {{reason: string, evidence: string} | null} a runner_offline finding, or null if the
 *   pool is not verifiably offline (including when the response itself could not be parsed --
 *   silence is never treated as an offline finding, matching the fail-safe posture of every other
 *   probe in this module)
 */
function evaluateSelfHostedPool(runnersResponse) {
  const runners = runnersResponse && Array.isArray(runnersResponse.runners) ? runnersResponse.runners : null;
  if (runners && runners.length > 0 && runners.every((r) => r.status !== 'online')) {
    return { reason: REASON_CODES.RUNNER_OFFLINE, evidence: `all ${runners.length} runner(s) reported non-online status` };
  }
  return null;
}

/**
 * githubstatus.com Actions-component probe (previously inlined at pr-checks.js:243-262): given an
 * already-fetched githubstatus.com summary and the target SHA (for the evidence string only),
 * decide whether the Actions component is reporting non-operational. Caller is responsible for the
 * RF-1 gate (only call this once local evidence shows zero check-runs AND zero check-suites for the
 * target SHA -- a completed check-run for this SHA is proof its checks ran and must never be
 * overridden by a global degraded/outage status elsewhere) -- that gate stays in the caller because
 * it depends on data (check-runs/check-suites) this function is never given.
 *
 * @param {{components?: Array<{id: string, name: string, status: string}>, incidents?: Array<{status: string, name: string, components?: Array<{id: string}>}>} | null} statusSummary
 * @param {string} targetSha included in the evidence string only
 * @returns {{reason: string, evidence: string} | null} a github_platform_outage finding, or null
 *   if the Actions component is operational or the status fetch itself failed/was unparseable
 */
function evaluateGithubStatusOutage(statusSummary, targetSha) {
  const actionsComponent = statusSummary && Array.isArray(statusSummary.components)
    ? statusSummary.components.find((c) => c.name === 'Actions')
    : null;
  if (!actionsComponent || !actionsComponent.status || actionsComponent.status === 'operational') {
    return null;
  }
  // Match the incident that actually lists the Actions component -- incidents[] can carry
  // incidents affecting other components (Pages, Packages, ...) that have nothing to do with why
  // Actions is down. Omit the note entirely rather than cite the wrong one.
  const relevantIncident = Array.isArray(statusSummary.incidents)
    ? statusSummary.incidents.find((inc) => Array.isArray(inc.components)
      && inc.components.some((c) => c.id === actionsComponent.id))
    : null;
  const incidentNote = relevantIncident ? ` (incident: "${relevantIncident.name}", status ${relevantIncident.status})` : '';
  return {
    reason: REASON_CODES.GITHUB_PLATFORM_OUTAGE,
    evidence: `githubstatus.com reports Actions component status="${actionsComponent.status}"${incidentNote}, and zero check-suites exist for ${targetSha}`
  };
}

module.exports = {
  REASON_CODES,
  BILLING_MESSAGE,
  evaluateSelfHostedPool,
  evaluateGithubStatusOutage
};
