import { describe, expect, it, jest } from '@jest/globals';
import { Sequelize } from 'sequelize';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import TenantAdminAuditLogFactory from '../src/models/Landlord/TenantAdminAuditLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationRunnerMigrationsDir = path.join(__dirname, '..', '..', 'dgfy-migration-runner', 'migrations');
const require = createRequire(import.meta.url);
const applyTemplateMigration = require('../../dgfy-migration-runner/migrations/20261023000001-extend-tenant-admin-audit-actions-apply-template.cjs');

const matchingClose = { '(': ')', '{': '}', '[': ']' };
const closing = new Set(Object.values(matchingClose));
const regexMayFollow = new Set(['(', '{', '[', '=', ':', ',', ';', '!', '?', '&&', '||', '??', '=>', '+', '-', '*', '%', '&', '|', '^', '~']);
const regexPrecedingKeywords = new Set(['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'yield', 'await', 'new']);

const readStringLiteral = (raw) => {
  if (raw.startsWith('"')) return JSON.parse(raw);
  return raw.slice(1, -1)
    .replace(/\\(['"\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
};

// This deliberately small lexer gives the scanner token boundaries without
// parsing or executing application code. Comments, strings, templates, and
// regular expressions cannot masquerade as calls or object properties.
const tokenize = (source) => {
  const tokens = [];
  let index = 0;

  const add = (type, value, start, end) => tokens.push({ type, value, start, end });
  const isIdentifierStart = (char) => Boolean(char && /[$A-Z_a-z]/.test(char));
  const isIdentifierPart = (char) => Boolean(char && /[$\w]/.test(char));
  const isDigit = (char) => Boolean(char && /[0-9]/.test(char));

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '/' && source[index + 1] === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      const commentEnd = source.indexOf('*/', index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
      continue;
    }

    if (char === "'" || char === '"') {
      const start = index;
      const quote = char;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        index += 1;
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === quote) {
          break;
        }
      }
      const raw = source.slice(start, index);
      add('string', readStringLiteral(raw), start, index);
      continue;
    }

    if (char === '`') {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        index += 1;
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === '`') {
          break;
        }
      }
      add('template', source.slice(start, index), start, index);
      continue;
    }

    if (char === '/' && (!tokens.length
      || (tokens.at(-1).type === 'punctuation' && regexMayFollow.has(tokens.at(-1).value))
      || (tokens.at(-1).type === 'identifier' && regexPrecedingKeywords.has(tokens.at(-1).value)))) {
      const start = index;
      index += 1;
      let escaped = false;
      let inCharacterClass = false;
      while (index < source.length) {
        const current = source[index];
        index += 1;
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (current === '[') {
          inCharacterClass = true;
        } else if (current === ']') {
          inCharacterClass = false;
        } else if (current === '/' && !inCharacterClass) {
          while (isIdentifierPart(source[index])) index += 1;
          break;
        }
      }
      add('regex', source.slice(start, index), start, index);
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (isIdentifierPart(source[index])) index += 1;
      add('identifier', source.slice(start, index), start, index);
      continue;
    }

    if (isDigit(char)) {
      const start = index;
      index += 1;
      while (/[\w.]/.test(source[index] || '')) index += 1;
      add('number', source.slice(start, index), start, index);
      continue;
    }

    const operator = ['...', '?.', '=>', '&&', '||', '??', '===', '!==', '==', '!=', '>=', '<=']
      .find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      add('punctuation', operator, index, index + operator.length);
      index += operator.length;
      continue;
    }

    add('punctuation', char, index, index + 1);
    index += 1;
  }

  return tokens;
};

const findMatchingToken = (tokens, openIndex) => {
  const first = tokens[openIndex]?.value;
  if (!matchingClose[first]) return -1;
  const stack = [matchingClose[first]];
  for (let index = openIndex + 1; index < tokens.length; index += 1) {
    const value = tokens[index].value;
    if (matchingClose[value]) {
      stack.push(matchingClose[value]);
    } else if (closing.has(value)) {
      if (stack.pop() !== value) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
};

const splitObjectMembers = (tokens, openIndex, closeIndex) => {
  const members = [];
  let start = openIndex + 1;
  const stack = [];
  for (let index = openIndex + 1; index < closeIndex; index += 1) {
    const value = tokens[index].value;
    if (matchingClose[value]) {
      stack.push(matchingClose[value]);
    } else if (closing.has(value)) {
      stack.pop();
    } else if (value === ',' && stack.length === 0) {
      members.push(tokens.slice(start, index));
      start = index + 1;
    }
  }
  if (start < closeIndex) members.push(tokens.slice(start, closeIndex));
  return members.filter((member) => member.length > 0);
};

const stripOuterParentheses = (tokens) => {
  let remaining = tokens;
  while (remaining[0]?.value === '(' && findMatchingToken(remaining, 0) === remaining.length - 1) {
    remaining = remaining.slice(1, -1);
  }
  return remaining;
};

const parseLiteralActionExpression = (tokens, depth = 0) => {
  const expression = stripOuterParentheses(tokens);
  if (depth > 12 || expression.length === 0) return null;
  if (expression.length === 1 && expression[0].type === 'string') return [expression[0].value];

  let stack = [];
  let questionIndex = -1;
  for (let index = 0; index < expression.length; index += 1) {
    const value = expression[index].value;
    if (matchingClose[value]) stack.push(matchingClose[value]);
    else if (closing.has(value)) stack.pop();
    else if (value === '?' && stack.length === 0) {
      questionIndex = index;
      break;
    }
  }
  if (questionIndex <= 0) return null;
  const condition = expression.slice(0, questionIndex);
  if (condition.some((token) => token.type === 'string' || token.type === 'template')) return null;

  stack = [];
  let nestedConditionals = 0;
  let colonIndex = -1;
  for (let index = questionIndex + 1; index < expression.length; index += 1) {
    const value = expression[index].value;
    if (matchingClose[value]) {
      stack.push(matchingClose[value]);
    } else if (closing.has(value)) {
      stack.pop();
    } else if (stack.length === 0 && value === '?') {
      nestedConditionals += 1;
    } else if (stack.length === 0 && value === ':') {
      if (nestedConditionals === 0) {
        colonIndex = index;
        break;
      }
      nestedConditionals -= 1;
    }
  }
  if (colonIndex <= questionIndex || colonIndex === expression.length - 1) return null;

  const trueActions = parseLiteralActionExpression(expression.slice(questionIndex + 1, colonIndex), depth + 1);
  const falseActions = parseLiteralActionExpression(expression.slice(colonIndex + 1), depth + 1);
  return trueActions && falseActions ? [...trueActions, ...falseActions] : null;
};

const scanAuditActionSource = (source, allowedActions, sourcePath = 'source.js') => {
  const tokens = tokenize(source);
  const actions = [];
  const problems = [];
  const recordProblem = (type, details = {}) => problems.push({
    type,
    sourcePath,
    ...(type === 'non-literal-audit-action' ? {
      message: 'Use a string literal or extend the audit-action scanner to support this expression.'
    } : {}),
    ...details
  });

  const inspectCall = (callName, openIndex, callTokenIndex) => {
    const closeIndex = findMatchingToken(tokens, openIndex);
    if (closeIndex < 0) {
      recordProblem('unclosed-audit-call', { callName });
      return;
    }

    const nextToken = tokens[closeIndex + 1];
    if (callName === 'createTenantAdminAuditLog'
      && path.basename(sourcePath) === 'tenantAdminRepository.js'
      && nextToken?.value === '{') return;

    const firstArgument = tokens[openIndex + 1];
    // This repository adapter forwards payloads already checked at each call
    // site below; direct model writes in any other file must use an object.
    if (callName === 'TenantAdminAuditLog.create'
      && path.basename(sourcePath) === 'tenantAdminRepository.js'
      && firstArgument?.value === 'payload') return;
    if (callName === 'createTenantAdminAuditLog'
      && firstArgument?.value === 'buildTenantAuditPayload'
      && tokens[openIndex + 2]?.value === '(') return;
    if (!firstArgument || firstArgument.value !== '{') {
      recordProblem('unsupported-audit-argument', { callName, tokenIndex: callTokenIndex });
      return;
    }

    const objectCloseIndex = findMatchingToken(tokens, openIndex + 1);
    if (objectCloseIndex < 0 || objectCloseIndex > closeIndex) {
      recordProblem('unclosed-audit-payload', { callName });
      return;
    }

    const actionMembers = [];
    for (const member of splitObjectMembers(tokens, openIndex + 1, objectCloseIndex)) {
      const first = member[0];
      if (first.value === '...') {
        recordProblem('unsupported-audit-payload-spread', { callName });
        continue;
      }
      if (first.value === '[') {
        recordProblem('unsupported-computed-audit-key', { callName });
        continue;
      }
      const isActionKey = first.value === 'action'
        || (first.type === 'string' && first.value === 'action');
      if (!isActionKey) continue;

      if (member[1]?.value === ':') {
        actionMembers.push(member.slice(2));
      } else {
        actionMembers.push([]);
      }
    }

    if (actionMembers.length === 0) {
      recordProblem('missing-audit-action', { callName });
      return;
    }

    for (const actionExpression of actionMembers) {
      const literals = parseLiteralActionExpression(actionExpression);
      if (!literals) {
        recordProblem('non-literal-audit-action', {
          callName,
          expression: actionExpression.length > 0
            ? source.slice(actionExpression[0].start, actionExpression.at(-1).end)
            : '<shorthand action property>'
        });
        continue;
      }
      for (const action of literals) {
        actions.push(action);
        if (!allowedActions.includes(action)) recordProblem('unknown-audit-action', { callName, action });
      }
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].type !== 'identifier') continue;
    if (tokens[index].value === 'TenantAdminAuditLog'
      && tokens[index + 1]?.value === '.'
      && tokens[index + 2]?.value === 'create'
      && tokens[index + 3]?.value === '(') {
      inspectCall('TenantAdminAuditLog.create', index + 3, index);
    } else if (['createTenantAdminAuditLog', 'buildTenantAuditPayload'].includes(tokens[index].value)
      && tokens[index + 1]?.value === '(') {
      inspectCall(tokens[index].value, index + 1, index);
    }
  }

  return { actions, problems };
};

const collectSourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const fullPath = path.join(directory, entry.name);
  if (entry.isDirectory()) {
    if (['__tests__', 'tests', 'test'].includes(entry.name)) return [];
    return collectSourceFiles(fullPath);
  }
  if (!/\.(?:js|cjs)$/.test(entry.name) || /\.(?:test|spec)\.(?:js|cjs)$/.test(entry.name)) return [];
  return [fullPath];
});

const parseMigrationEnumValues = (sql) => {
  const enumClause = sql.match(/MODIFY\s+action\s+ENUM\(([^)]*)\)\s+NOT\s+NULL/i)?.[1];
  if (!enumClause) throw new Error(`Could not find action ENUM in SQL: ${sql}`);
  return [...enumClause.matchAll(/'((?:''|[^'])*)'/g)].map(([, value]) => value.replace(/''/g, "'"));
};

describe('tenant admin audit log action contract', () => {
  it('allows tenant admin audit actions in the landlord model and migrations', () => {
    const model = readFileSync(path.resolve('src/models/Landlord/TenantAdminAuditLog.js'), 'utf8');
    const migration = readFileSync(path.join(migrationRunnerMigrationsDir, '20260615000001-extend-tenant-admin-audit-actions.cjs'), 'utf8');
    const provisioningMigration = readFileSync(path.join(migrationRunnerMigrationsDir, '20260625000001-add-platform-admin-assisted-provisioning.cjs'), 'utf8');
    const affiliateSlotsMigration = readFileSync(path.join(migrationRunnerMigrationsDir, '20260831000001-extend-tenant-admin-audit-actions-affiliate-slots.cjs'), 'utf8');
    const forceDeleteMigration = readFileSync(path.join(migrationRunnerMigrationsDir, '20260920000001-extend-tenant-admin-audit-actions-force-delete-registration-history.cjs'), 'utf8');
    const businessNameMigration = readFileSync(path.join(migrationRunnerMigrationsDir, '20261015000001-extend-tenant-admin-audit-actions-business-name.cjs'), 'utf8');

    expect(model).toContain("'pos_metadata_update'");
    expect(model).toContain("'admin_create_tenant'");
    expect(model).toContain("'admin_create_account_and_tenant'");
    expect(model).toContain("'admin_force_assign_owner'");
    expect(model).toContain("'affiliate_slots_update'");
    expect(model).toContain("'force_delete_registration_history'");
    expect(model).toContain("'business_name_update'");
    expect(migration).toContain("'pos_metadata_update'");
    expect(provisioningMigration).toContain("'admin_create_tenant'");
    expect(provisioningMigration).toContain("'admin_force_assign_owner'");
    expect(affiliateSlotsMigration).toContain("'affiliate_slots_update'");
    expect(forceDeleteMigration).toContain("'force_delete_registration_history'");
    expect(businessNameMigration).toContain("'business_name_update'");
  });

  it('keeps the landlord model enum ordered-identical to the apply-template migration', async () => {
    const sequelize = new Sequelize('tenant_admin_audit_action_contract', 'root', '', {
      dialect: 'mysql',
      logging: false
    });
    const statements = [];

    try {
      const model = TenantAdminAuditLogFactory(sequelize);
      const queryInterface = {
        showAllTables: jest.fn().mockResolvedValue(['tenant_admin_audit_logs']),
        sequelize: {
          query: jest.fn(async (sql) => {
            statements.push(sql);
            return [];
          })
        }
      };

      await applyTemplateMigration.up(queryInterface);

      expect(statements).toHaveLength(1);
      expect(parseMigrationEnumValues(statements[0])).toEqual(model.rawAttributes.action.values);
    } finally {
      await sequelize.close();
    }
  });

  it('keeps every literal tenant-admin audit action in src covered by the model enum', () => {
    const sequelize = new Sequelize('tenant_admin_audit_action_source_contract', 'root', '', {
      dialect: 'mysql',
      logging: false
    });

    try {
      const allowedActions = TenantAdminAuditLogFactory(sequelize).rawAttributes.action.values;
      const sourceFiles = collectSourceFiles(path.resolve(__dirname, '..', 'src'));
      const scans = sourceFiles.map((sourcePath) => scanAuditActionSource(
        readFileSync(sourcePath, 'utf8'),
        allowedActions,
        path.relative(path.resolve(__dirname, '..'), sourcePath)
      ));
      const actions = scans.flatMap((scan) => scan.actions);
      const problems = scans.flatMap((scan) => scan.problems);

      expect(problems).toEqual([]);
      expect(actions).toContain('apply_template');
      expect(actions).toContain('business_name_update');
      expect(actions).toContain('admin_assign_owner');
      expect(actions).toContain('admin_force_assign_owner');
    } finally {
      sequelize.close();
    }
  });

  it('reports unknown literals and dynamic action expressions in scanner self-checks', () => {
    const allowedActions = ['capability_update'];
    const unknownLiteral = scanAuditActionSource(`
      tenantAdminRepository.createTenantAdminAuditLog({
        metadata: { action: 'nested_decoy' },
        action: 'not_in_enum'
      });
    `, allowedActions, 'synthetic/unknown-action.js');
    const dynamicAction = scanAuditActionSource(
      "TenantAdminAuditLog.create({ action: actionFromRuntime });",
      allowedActions,
      'synthetic/dynamic-action.js'
    );

    expect(unknownLiteral.actions).toEqual(['not_in_enum']);
    expect(unknownLiteral.problems).toContainEqual(expect.objectContaining({
      type: 'unknown-audit-action',
      action: 'not_in_enum'
    }));
    expect(unknownLiteral.actions).not.toContain('nested_decoy');
    expect(dynamicAction.problems).toContainEqual(expect.objectContaining({
      type: 'non-literal-audit-action',
      message: expect.stringContaining('Use a string literal or extend the audit-action scanner')
    }));
  });
});
