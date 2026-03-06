#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const registryPath = path.join(repoRoot, 'docs', '_meta', 'document-registry.json');

const FRONT_MATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const fail = (errors) => {
  console.error('[docs-lint] FAILED');
  errors.forEach((error) => console.error(` - ${error}`));
  process.exit(1);
};

const parseFrontMatter = (content) => {
  const match = content.match(FRONT_MATTER_REGEX);
  if (!match) return null;

  const lines = match[1].split(/\r?\n/);
  const data = {};

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    data[key] = value;
  });

  return {
    data,
    body: content.slice(match[0].length)
  };
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const isExternalLink = (target) => (
  target.startsWith('http://') ||
  target.startsWith('https://') ||
  target.startsWith('file://') ||
  target.startsWith('mailto:') ||
  target.startsWith('#')
);

const resolveLinkTarget = (docPath, rawTarget) => {
  const target = rawTarget.split('#')[0].trim();
  if (!target || isExternalLink(target)) return null;

  if (path.isAbsolute(target)) {
    return path.join(repoRoot, target);
  }

  return path.resolve(path.dirname(docPath), target);
};

const extractMarkdownLinks = (body) => {
  const links = [];
  const regex = /\[[^\]]*]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    links.push(match[1]);
  }
  return links;
};

const run = () => {
  if (!fs.existsSync(registryPath)) {
    fail([`Missing document registry: ${registryPath}`]);
  }

  const registry = readJson(registryPath);
  const errors = [];

  const authoritativeTopics = new Map();

  registry.governed_docs.forEach((entry) => {
    const absoluteDocPath = path.join(repoRoot, entry.path);
    if (!fs.existsSync(absoluteDocPath)) {
      errors.push(`${entry.path}: file is missing`);
      return;
    }

    const content = fs.readFileSync(absoluteDocPath, 'utf8');
    const parsed = parseFrontMatter(content);
    if (!parsed) {
      errors.push(`${entry.path}: missing front matter`);
      return;
    }

    const frontMatter = parsed.data;
    registry.required_frontmatter.forEach((key) => {
      if (!frontMatter[key]) {
        errors.push(`${entry.path}: missing front matter key "${key}"`);
      }
    });

    if (frontMatter.last_reviewed && !DATE_REGEX.test(frontMatter.last_reviewed)) {
      errors.push(`${entry.path}: last_reviewed must be YYYY-MM-DD`);
    }

    if (entry.expected_status && frontMatter.status !== entry.expected_status) {
      errors.push(`${entry.path}: expected status "${entry.expected_status}" but got "${frontMatter.status || 'missing'}"`);
    }

    if (entry.expected_authority_level && frontMatter.authority_level !== entry.expected_authority_level) {
      errors.push(`${entry.path}: expected authority_level "${entry.expected_authority_level}" but got "${frontMatter.authority_level || 'missing'}"`);
    }

    if (frontMatter.status === 'deprecated' && !frontMatter.superseded_by) {
      errors.push(`${entry.path}: deprecated docs must include superseded_by`);
    }

    if (frontMatter.status === 'authoritative' && frontMatter.authority_level === 'authoritative') {
      const topic = frontMatter.topic || entry.topic;
      const existing = authoritativeTopics.get(topic) || [];
      existing.push(entry.path);
      authoritativeTopics.set(topic, existing);
    }

    extractMarkdownLinks(parsed.body).forEach((rawLink) => {
      const target = resolveLinkTarget(absoluteDocPath, rawLink);
      if (!target) return;
      if (!fs.existsSync(target)) {
        errors.push(`${entry.path}: broken link -> ${rawLink}`);
      }
    });
  });

  Array.from(authoritativeTopics.entries()).forEach(([topic, docs]) => {
    if (docs.length > 1) {
      errors.push(`Topic "${topic}" has multiple authoritative docs: ${docs.join(', ')}`);
    }
  });

  if (errors.length > 0) {
    fail(errors);
  }

  console.log(`[docs-lint] OK. Validated ${registry.governed_docs.length} governed docs.`);
};

run();
