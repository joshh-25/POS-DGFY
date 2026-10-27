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
 *   5. Always-loaded files do not eagerly import a canonical role skill.
 *   6. Always-loaded instruction context stays within Claude Code's character budget.
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

const AGENT_SURFACE_PATTERN =
  /^(\.agents\/skills\/|\.claude\/skills\/|\.claude\/agents\/|\.claude\/rules\/|AGENTS\.md$|CLAUDE\.md$)/;
const MAX_IMPORT_DEPTH = 5;
const BUDGET_WARNING = 120000;
const BUDGET_LIMIT = 150000;

// Canonical role -> declared Claude Code shim(s). Only roles that actually need a Claude-specific
// shim are listed here — a canonical skill with no shim entry (e.g. web-performance-qa, which isn't
// one of #331's four named roles) is not required to have one.
const ROLE_SHIMS = {
  implement: ['.claude/skills/implement/SKILL.md'],
  pm: ['.claude/skills/pm/SKILL.md'],
  'pr-reviewer': ['.claude/agents/pr-reviewer.md'],
  observer: ['.claude/agents/observer.md'],
  verifier: ['.claude/agents/verifier.md'],
  promoter: ['.claude/skills/promoter/SKILL.md'],
  'incident-responder': ['.claude/skills/incident-responder/SKILL.md'],
  notes: ['.claude/skills/notes/SKILL.md'],
  planner: ['.claude/skills/planner/SKILL.md'],
  handoff: ['.claude/skills/handoff/SKILL.md'],
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

// Claude Code does not evaluate imports inside fenced blocks or inline code spans. Mask them while
// preserving newlines and offsets so the remaining text can be scanned using the same line layout.
const stripMarkdownCode = (content) => {
  const chars = content.split('');
  const maskRange = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
    }
  };

  let offset = 0;
  let fence = null;
  content.split('\n').forEach((rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    const fenceStart = line.match(/^ {0,3}(\x60{3,}|~{3,})/);
    if (fence) {
      const close = line.match(/^ {0,3}([\x60~]+)[ \t]*$/);
      maskRange(offset, offset + rawLine.length);
      if (
        close &&
        close[1].split('').every((char) => char === fence.char) &&
        close[1].length >= fence.length
      ) {
        fence = null;
      }
    } else if (fenceStart) {
      const marker = fenceStart[1];
      fence = { char: marker[0], length: marker.length };
      maskRange(offset, offset + rawLine.length);
    }
    offset += rawLine.length + 1;
  });

  // Inline code spans may use any run of backticks and may cross line boundaries.
  for (let index = 0; index < chars.length; ) {
    if (chars[index] !== '\x60') {
      index += 1;
      continue;
    }
    let runEnd = index + 1;
    while (chars[runEnd] === '\x60') runEnd += 1;
    const runLength = runEnd - index;
    let closeStart = -1;
    let closeEnd = -1;
    for (let cursor = runEnd; cursor < chars.length; ) {
      if (chars[cursor] !== '\x60') {
        cursor += 1;
        continue;
      }
      let candidateEnd = cursor + 1;
      while (chars[candidateEnd] === '\x60') candidateEnd += 1;
      if (candidateEnd - cursor === runLength) {
        closeStart = cursor;
        closeEnd = candidateEnd;
        break;
      }
      cursor = candidateEnd;
    }
    if (closeStart !== -1) {
      maskRange(index, closeEnd);
      index = closeEnd;
    } else {
      index = runEnd;
    }
  }

  return chars.join('');
};

const extractImportTargets = (content) => {
  const visibleText = stripMarkdownCode(content);
  const targets = [];
  const importPattern = /@([^\s<>()\[\]{}]+)/g;
  let match;
  while ((match = importPattern.exec(visibleText)) !== null) {
    const target = match[1].replace(/[.,;:!?]+$/, '').replace(/^['"]|['"]$/g, '');
    if (target) targets.push(target);
  }
  return targets;
};

const resolveRepoImport = (target) => {
  const resolvedPath = path.resolve(repoRoot, target);
  const relativePath = path.relative(repoRoot, resolvedPath);
  if (
    relativePath === '..' ||
    relativePath.startsWith('..' + path.sep) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) return null;
  const realRelativePath = path.relative(fs.realpathSync(repoRoot), fs.realpathSync(resolvedPath));
  if (
    realRelativePath === '..' ||
    realRelativePath.startsWith('..' + path.sep) ||
    path.isAbsolute(realRelativePath)
  ) {
    return null;
  }
  return resolvedPath;
};

const listMarkdownFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
    });
};

const errors = [];

if (staged) {
  const stagedFiles = execSync('git diff --cached --name-only', { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const touchesAgentSurface = stagedFiles.some((file) => AGENT_SURFACE_PATTERN.test(file));
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

// 5 + 6. Resolve Claude Code's always-loaded files, find eager skill imports, and measure context.
const alwaysLoaded = new Map();
const importDepth = new Map();
const visitImports = (filePath, depth) => {
  if (depth > MAX_IMPORT_DEPTH || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return;
  const previousDepth = importDepth.get(filePath);
  if (previousDepth !== undefined && previousDepth <= depth) return;
  importDepth.set(filePath, depth);
  alwaysLoaded.set(filePath, fs.readFileSync(filePath, 'utf8'));

  extractImportTargets(alwaysLoaded.get(filePath)).forEach((target) => {
    const importedPath = resolveRepoImport(target);
    if (importedPath) visitImports(importedPath, depth + 1);
  });
};

const claudeMdPath = path.join(repoRoot, 'CLAUDE.md');
if (!fs.existsSync(claudeMdPath)) {
  errors.push('CLAUDE.md does not exist — the always-loaded Claude Code entrypoint is missing');
} else {
  visitImports(claudeMdPath, 0);
}

listMarkdownFiles(path.join(repoRoot, '.claude', 'rules')).forEach((filePath) => {
  if (!alwaysLoaded.has(filePath)) alwaysLoaded.set(filePath, fs.readFileSync(filePath, 'utf8'));
});

alwaysLoaded.forEach((content, filePath) => {
  extractImportTargets(content).forEach((target) => {
    const skillTarget = target.replace(/^\.\/+/, '');
    if (skillTarget.startsWith('.agents/skills/')) {
      errors.push(
        path.relative(repoRoot, filePath) +
          ' eagerly imports canonical skill @' +
          target +
          ' — keep the path plain text and load it when entering that role.'
      );
    }
  });
});

const measuredFiles = Array.from(alwaysLoaded.entries())
  .map(([filePath, content]) => ({
    filePath,
    relativePath: path.relative(repoRoot, filePath).split(path.sep).join('/'),
    characters: content.length,
  }))
  .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
const totalCharacters = measuredFiles.reduce((total, file) => total + file.characters, 0);

console.log('[agent-surfaces] Always-loaded context: ' + totalCharacters + ' characters');
measuredFiles.forEach((file) => {
  console.log(' - ' + file.relativePath + ': ' + file.characters);
});
if (totalCharacters > BUDGET_WARNING) {
  console.warn(
    '[agent-surfaces] WARNING: context exceeds the ' +
      BUDGET_WARNING +
      '-character warning threshold.'
  );
}
if (totalCharacters > BUDGET_LIMIT) {
  errors.push(
    'always-loaded context is ' +
      totalCharacters +
      ' characters (limit ' +
      BUDGET_LIMIT +
      ')'
  );
}

if (errors.length > 0) {
  fail(errors);
}

console.log(
  `[agent-surfaces] OK. ${canonicalRoles.length} canonical role(s), ` +
    `${Object.values(ROLE_SHIMS).flat().length} shim(s) validated.`
);
