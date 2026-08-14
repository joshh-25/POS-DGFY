#!/usr/bin/env node
/**
 * Agent-surface anti-drift gate (#442).
 *
 * #331's own rule for agent roles is "reference rules at runtime, never restate them" — a shim
 * that grows a body is the same staleness failure one level down. This script keeps that honest:
 *
 *   1. Every canonical `.agents/skills/<role>/SKILL.md` parses and has `name` + `description`.
 *   2. Every canonical role that declares a Claude Code shim has that shim file present.
 *   3. Every shim body stays under a line cap AND references its canonical path — so a shim can't
 *      quietly turn into a second copy of the role definition.
 *   4. `AGENTS.md` references every canonical role, so the cross-vendor hub can't go stale either.
 *
 * Supports `--staged` (pre-commit, only runs when a staged path touches an agent surface) and full
 * mode (no args — always checks everything, for manual/CI use).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const staged = args.has('--staged');

const AGENT_SURFACE_PATTERN = /^(\.agents\/skills\/|\.claude\/skills\/|\.claude\/agents\/|AGENTS\.md$)/;

// Canonical role -> declared Claude Code shim(s). Only roles that actually need a Claude-specific
// shim are listed here — a canonical skill with no shim entry (e.g. web-performance-qa, which isn't
// one of #331's four named roles) is not required to have one.
const ROLE_SHIMS = {
  implement: ['.claude/skills/implement/SKILL.md'],
  pm: ['.claude/skills/pm/SKILL.md'],
  'pr-reviewer': ['.claude/agents/pr-reviewer.md'],
};

const SHIM_LINE_CAP = 25;

const fail = (errors) => {
  console.error('[agent-surfaces] FAILED');
  errors.forEach((error) => console.error(` - ${error}`));
  process.exit(1);
};

const readFrontMatter = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: content, raw: content };
  const data = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const sep = trimmed.indexOf(':');
    if (sep === -1) return;
    data[trimmed.slice(0, sep).trim()] = trimmed.slice(sep + 1).trim();
  });
  return { data, body: content.slice(match[0].length), raw: content };
};

const errors = [];

if (staged) {
  const stagedFiles = execSync('git diff --cached --name-only', { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const touchesAgentSurface = stagedFiles.some((f) => AGENT_SURFACE_PATTERN.test(f));
  if (!touchesAgentSurface) {
    process.exit(0);
  }
}

// 1. Canonical roles: frontmatter must have name + description.
const skillsRoot = path.join(repoRoot, '.agents', 'skills');
if (!fs.existsSync(skillsRoot)) {
  fail(['.agents/skills/ does not exist — the canonical agent-role root is missing']);
}

const canonicalRoles = fs
  .readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

canonicalRoles.forEach((role) => {
  const skillPath = path.join(skillsRoot, role, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    errors.push(`.agents/skills/${role}/ has no SKILL.md`);
    return;
  }
  const { data } = readFrontMatter(skillPath);
  if (!data.name) errors.push(`.agents/skills/${role}/SKILL.md is missing frontmatter 'name'`);
  if (!data.description) {
    errors.push(`.agents/skills/${role}/SKILL.md is missing frontmatter 'description'`);
  }
});

// 2 + 3. Declared shims exist, stay short, and reference their canonical path.
Object.entries(ROLE_SHIMS).forEach(([role, shimPaths]) => {
  if (!canonicalRoles.includes(role)) {
    errors.push(`ROLE_SHIMS declares '${role}' but .agents/skills/${role}/ does not exist`);
    return;
  }
  const canonicalPath = `.agents/skills/${role}/SKILL.md`;
  shimPaths.forEach((shimRelPath) => {
    const shimAbsPath = path.join(repoRoot, shimRelPath);
    if (!fs.existsSync(shimAbsPath)) {
      errors.push(`Declared shim ${shimRelPath} for role '${role}' does not exist`);
      return;
    }
    const { raw } = readFrontMatter(shimAbsPath);
    const lineCount = raw.split(/\r?\n/).length;
    if (lineCount > SHIM_LINE_CAP) {
      errors.push(
        `${shimRelPath} is ${lineCount} lines (cap ${SHIM_LINE_CAP}) — shims point at the ` +
          `canonical role file, they don't restate it. Move content to ${canonicalPath} instead.`
      );
    }
    if (!raw.includes(canonicalPath)) {
      errors.push(
        `${shimRelPath} does not reference its canonical path (${canonicalPath}) — a shim must ` +
          'point at the definition it stands in for.'
      );
    }
  });
});

// 4. AGENTS.md references every canonical role that has a declared shim (i.e. every named #331 role).
const agentsMdPath = path.join(repoRoot, 'AGENTS.md');
if (!fs.existsSync(agentsMdPath)) {
  errors.push('AGENTS.md does not exist — it is the cross-vendor role hub');
} else {
  const agentsMd = fs.readFileSync(agentsMdPath, 'utf8');
  Object.keys(ROLE_SHIMS).forEach((role) => {
    const canonicalPath = `.agents/skills/${role}/SKILL.md`;
    if (!agentsMd.includes(canonicalPath)) {
      errors.push(`AGENTS.md does not reference ${canonicalPath} — every named role needs an entry`);
    }
  });
}

if (errors.length > 0) {
  fail(errors);
}

console.log(
  `[agent-surfaces] OK. ${canonicalRoles.length} canonical role(s), ` +
    `${Object.values(ROLE_SHIMS).flat().length} shim(s) validated.`
);
