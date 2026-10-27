const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');

const scriptPath = path.join(__dirname, 'check-agent-surfaces.js');
const tempRoots = [];
const roles = [
  'implement',
  'pm',
  'pr-reviewer',
  'observer',
  'verifier',
  'promoter',
  'incident-responder',
  'notes',
  'planner',
  'handoff',
  'conduct',
];
const shimLocations = {
  implement: '.claude/skills/implement/SKILL.md',
  pm: '.claude/skills/pm/SKILL.md',
  'pr-reviewer': '.claude/agents/pr-reviewer.md',
  observer: '.claude/agents/observer.md',
  verifier: '.claude/agents/verifier.md',
  promoter: '.claude/skills/promoter/SKILL.md',
  'incident-responder': '.claude/skills/incident-responder/SKILL.md',
  notes: '.claude/skills/notes/SKILL.md',
  planner: '.claude/skills/planner/SKILL.md',
  handoff: '.claude/skills/handoff/SKILL.md',
};

afterEach(() => {
  tempRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

const write = (root, relativePath, content) => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const createFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-surfaces-'));
  tempRoots.push(root);

  roles.forEach((role) => {
    const canonicalPath = '.agents/skills/' + role + '/SKILL.md';
    write(
      root,
      canonicalPath,
      '---\nname: ' + role + '\ndescription: fixture role\n---\n'
    );
    if (shimLocations[role]) {
      write(root, shimLocations[role], 'Read ' + canonicalPath + ' in full.\n');
    }
  });

  const roleReferences = roles
    .map((role) => '- .agents/skills/' + role + '/SKILL.md')
    .join('\n');
  write(root, 'AGENTS.md', '# Roles\n' + roleReferences + '\n');
  write(root, 'CLAUDE.md', '@AGENTS.md\n');
  write(root, '.claude/rules/project.md', 'Always loaded project rule.\n');
  return root;
};

const runChecker = (root, args = []) => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: (result.stdout || '') + (result.stderr || ''),
  };
};

const setBudget = (root, desiredTotal) => {
  const agentsPath = path.join(root, 'AGENTS.md');
  const agents = fs.readFileSync(agentsPath, 'utf8') + '@docs/budget.md\n';
  write(root, 'AGENTS.md', agents);

  const fixedLength =
    fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').length +
    agents.length +
    fs.readFileSync(path.join(root, '.claude/rules/project.md'), 'utf8').length;
  const budgetLength = desiredTotal - fixedLength;
  assert.ok(budgetLength > 0, 'fixture budget file must have positive length');
  write(root, 'docs/budget.md', 'x'.repeat(budgetLength));
};

const initGit = (root) => {
  const commands = [
    ['init', '-q'],
    ['config', 'user.email', 'agent-surfaces@example.test'],
    ['config', 'user.name', 'Agent Surfaces Test'],
    ['add', '.'],
    ['commit', '-m', 'fixture'],
  ];
  commands.forEach((args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
};

test('accepts the baseline and prints total plus the per-file breakdown', () => {
  const root = createFixture();
  const result = runChecker(root);

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /\[agent-surfaces\] Always-loaded context: \d+ characters/);
  assert.match(result.stdout, / - CLAUDE\.md: \d+/);
  assert.match(result.stdout, / - AGENTS\.md: \d+/);
  assert.match(result.stdout, / - \.claude\/rules\/project\.md: \d+/);
});

test('rejects direct eager imports and conduct-style trailing punctuation', () => {
  const cases = [
    '@.agents/skills/implement/SKILL.md\n',
    '@.agents/skills/conduct/SKILL.md;\n',
    '@./.agents/skills/pm/SKILL.md,\n',
  ];

  cases.forEach((importLine) => {
    const root = createFixture();
    write(root, 'AGENTS.md', fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8') + importLine);
    const result = runChecker(root);

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /eagerly imports canonical skill/);
  });
});

test('ignores skill paths inside inline code spans and fenced code blocks', () => {
  const root = createFixture();
  const tick = String.fromCharCode(96);
  const fence = tick.repeat(3);
  const codeExamples =
    'Inline example: ' +
    tick +
    '@.agents/skills/implement/SKILL.md' +
    tick +
    '\n\n' +
    fence +
    'text\n@.agents/skills/conduct/SKILL.md;\n' +
    fence +
    '\n';
  write(root, 'AGENTS.md', fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8') + codeExamples);
  const result = runChecker(root);

  assert.equal(result.status, 0, result.output);
});

test('counts transitive imports and direct rule files once each', () => {
  const root = createFixture();
  const agents =
    fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8') + '@docs/transitive.md:\n';
  write(root, 'AGENTS.md', agents);
  write(root, 'docs/transitive.md', 'Transitive content.\n');
  const expectedTotal =
    fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').length +
    agents.length +
    fs.readFileSync(path.join(root, 'docs/transitive.md'), 'utf8').length +
    fs.readFileSync(path.join(root, '.claude/rules/project.md'), 'utf8').length;
  const result = runChecker(root);

  assert.equal(result.status, 0, result.output);
  assert.match(
    result.stdout,
    new RegExp('Always-loaded context: ' + expectedTotal + ' characters')
  );
  assert.match(result.stdout, / - docs\/transitive\.md: \d+/);
});

test('follows imports through depth 5 and stops before depth 6', () => {
  const root = createFixture();
  const docs = [];
  for (let depth = 1; depth <= 6; depth += 1) {
    const relativePath = 'docs/depth-' + depth + '.md';
    const nextImport = depth < 6 ? '@docs/depth-' + (depth + 1) + '.md\n' : '';
    write(root, relativePath, 'depth-' + depth + '\n' + nextImport);
    docs.push(relativePath);
  }
  const agents =
    fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8') + '@docs/depth-1.md\n';
  write(root, 'AGENTS.md', agents);
  const expectedTotal =
    fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').length +
    agents.length +
    fs.readFileSync(path.join(root, '.claude/rules/project.md'), 'utf8').length +
    docs.slice(0, 4).reduce((total, relativePath) => {
      return total + fs.readFileSync(path.join(root, relativePath), 'utf8').length;
    }, 0);
  const result = runChecker(root);

  assert.equal(result.status, 0, result.output);
  assert.match(
    result.stdout,
    new RegExp('Always-loaded context: ' + expectedTotal + ' characters')
  );
  assert.match(result.stdout, / - docs\/depth-4\.md: \d+/);
  assert.doesNotMatch(result.stdout, /docs\/depth-[56]\.md/);
});

test('ignores unresolved import tokens such as emails for the budget', () => {
  const root = createFixture();
  const claude = 'Contact user@example.com and @missing-file.md.\n@AGENTS.md\n';
  write(root, 'CLAUDE.md', claude);
  const expectedTotal =
    claude.length +
    fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8').length +
    fs.readFileSync(path.join(root, '.claude/rules/project.md'), 'utf8').length;
  const result = runChecker(root);

  assert.equal(result.status, 0, result.output);
  assert.match(
    result.stdout,
    new RegExp('Always-loaded context: ' + expectedTotal + ' characters')
  );
  assert.doesNotMatch(result.stdout, /missing-file|example\.com/);
});

test('warns above 120000 characters and passes through 150000', () => {
  const root = createFixture();
  setBudget(root, 125000);
  const result = runChecker(root);

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /Always-loaded context: 125000 characters/);
  assert.match(result.output, /WARNING: context exceeds the 120000-character warning threshold/);
});

test('does not warn at exactly 120000 characters', () => {
  const root = createFixture();
  setBudget(root, 120000);
  const result = runChecker(root);

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /Always-loaded context: 120000 characters/);
  assert.doesNotMatch(result.output, /WARNING:/);
});

test('warns but does not fail at exactly 150000 characters', () => {
  const root = createFixture();
  setBudget(root, 150000);
  const result = runChecker(root);

  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /Always-loaded context: 150000 characters/);
  assert.match(result.output, /WARNING: context exceeds the 120000-character warning threshold/);
});

test('fails above 150000 characters', () => {
  const root = createFixture();
  setBudget(root, 150001);
  const result = runChecker(root);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /Always-loaded context: 150001 characters/);
  assert.match(result.output, /always-loaded context is 150001 characters \(limit 150000\)/);
});

test('preserves the existing role-reference regression check', () => {
  const root = createFixture();
  const agents = fs
    .readFileSync(path.join(root, 'AGENTS.md'), 'utf8')
    .replace('- .agents/skills/pm/SKILL.md\n', '');
  write(root, 'AGENTS.md', agents);
  const result = runChecker(root);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /AGENTS\.md does not reference \.agents\/skills\/pm\/SKILL\.md/);
});

test('staged CLAUDE.md changes trigger the guard', () => {
  const root = createFixture();
  initGit(root);
  write(root, 'CLAUDE.md', '@.agents/skills/implement/SKILL.md\n');
  const add = spawnSync('git', ['add', 'CLAUDE.md'], { cwd: root, encoding: 'utf8' });
  assert.equal(add.status, 0, add.stderr);
  const result = runChecker(root, ['--staged']);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /CLAUDE\.md eagerly imports canonical skill/);
});

test('staged Claude rule changes trigger the guard', () => {
  const root = createFixture();
  initGit(root);
  write(root, '.claude/rules/nested/security.md', '@.agents/skills/pm/SKILL.md\n');
  const add = spawnSync('git', ['add', '.claude/rules/nested/security.md'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(add.status, 0, add.stderr);
  const result = runChecker(root, ['--staged']);

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\.claude\/rules\/nested\/security\.md eagerly imports canonical skill/);
});
