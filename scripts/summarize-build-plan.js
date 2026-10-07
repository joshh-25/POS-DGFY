#!/usr/bin/env node
'use strict';

const APPS = Object.freeze([
  ['dgfy-api', 'API + migration runner'],
  ['dgfy-migration-runner', 'API + migration runner'],
  ['dgfy-ims', 'IMS'],
  ['dgfy-pos', 'POS'],
  ['dgfy-storefront', 'Storefront'],
  ['dgfy-opis', 'OPIS'],
  ['dgfy-admin', 'Admin'],
]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--selected-json') options.selected = argv[++index];
    else if (arg === '--needed-json') options.needed = argv[++index];
    else if (arg === '--revisions-json') options.revisions = argv[++index];
    else if (arg === '--deploy') options.deploy = argv[++index];
    else if (arg === '--environment') options.environment = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const name of ['selected', 'needed', 'revisions', 'deploy', 'environment']) {
    if (options[name] === undefined || options[name] === '') throw new Error(`Missing required option: --${name === 'selected' ? 'selected-json' : name === 'needed' ? 'needed-json' : name === 'revisions' ? 'revisions-json' : name}`);
  }
  if (!['true', 'false'].includes(options.deploy)) throw new Error('--deploy must be true or false');
  return options;
}

function parseObjectJson(value, label) {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`--${label}-json must contain a JSON object`);
  return parsed;
}

function summarizeBuildPlan({ selected, needed, revisions = {}, deploy, environment }) {
  const readApp = (source, app) => source[app] ?? source[app.replaceAll('-', '_')];
  const gaps = [];
  const rows = APPS.map(([app, group]) => {
    const isSelected = Boolean(readApp(selected, app));
    const isNeeded = Boolean(readApp(needed, app));
    const effective = isSelected && isNeeded;
    const note = isSelected && !isNeeded ? 'live state says rebuild can be skipped'
      : !isSelected && isNeeded ? 'selected=false while live state says rebuild is needed' : '';
    if (!isSelected && isNeeded) gaps.push(app);
    const appRevision = readApp(revisions, app);
    const revision = appRevision ? `; revision ${String(appRevision)}` : '';
    return `| ${app} (${group}) | ${isSelected ? 'yes' : 'no'}${revision} | ${isNeeded ? 'yes' : 'no'} | ${effective ? 'yes' : 'no'} | ${note} |`;
  });
  const selectedGroupCount = Number(Boolean(readApp(selected, 'dgfy-api') && readApp(selected, 'dgfy-migration-runner')))
    + APPS.filter(([app]) => !['dgfy-api', 'dgfy-migration-runner'].includes(app) && Boolean(readApp(selected, app))).length;
  const groupCount = 6;
  const selectedScope = selectedGroupCount === groupCount ? 'Full app-group selection' : `PARTIAL app-group selection (${selectedGroupCount}/${groupCount} groups)`;
  const hasRevision = Object.values(revisions).some((revision) => Boolean(revision));
  const promoteAliases = hasRevision
    ? 'could run if all required jobs avoid failure/cancellation'
    : 'will be skipped because no release revision is selected';
  const publish = deploy === 'true'
    ? 'could run if required jobs and promote-aliases avoid failure/cancellation'
    : 'will not run because deploy=false';
  // These current line ranges are pointers only; the workflow's `if:` clauses remain authoritative.
  // This is only an approximation of deploy-main.yml:759-779 (promote-aliases) and :908-929 (publish).
  const markdown = [
    '### PROD build plan summary',
    '',
    `**Selected scope:** ${selectedScope}. This describes checkbox selection, not completed builds.`,
    '',
    '| App | Selected | Needed | Effective build | Note |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `- Deploy input: **${deploy}**`,
    `- Target environment: **${environment}**`,
    `- Downstream promote-aliases: ${promoteAliases}; publish: ${publish}. This is only an approximation of the actual conditions at .github/workflows/deploy-main.yml:759-779 and :908-929; the workflow's own gate expressions remain authoritative.`,
  ].join('\n');
  return { markdown, gaps };
}

function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const options = parseArgs(argv);
    const result = summarizeBuildPlan({
      selected: parseObjectJson(options.selected, 'selected'),
      needed: parseObjectJson(options.needed, 'needed'),
      revisions: parseObjectJson(options.revisions, 'revisions'),
      deploy: options.deploy,
      environment: options.environment,
    });
    console.log(result.markdown);
    if (env.GITHUB_STEP_SUMMARY) require('node:fs').appendFileSync(env.GITHUB_STEP_SUMMARY, `${result.markdown}\n`);
    for (const app of result.gaps) console.log(`::warning::${app} is unchecked but live registry state says it still needs building.`);
  } catch (error) {
    // Warning-only contract: malformed advisory inputs are visible but never fail the deploy job.
    console.log(`::warning::Unable to summarize build plan: ${error.message}`);
  }
}

if (require.main === module) main();

module.exports = { APPS, parseArgs, summarizeBuildPlan, main };
