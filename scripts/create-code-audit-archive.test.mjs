import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIT_ARCHIVE_EXCLUDE_PATHS, AUDIT_ARCHIVE_INCLUDE_PATHS } from './create-code-audit-archive.mjs';

test('code audit archives include source roots and exclude credentials/session artifacts', () => {
  assert.ok(AUDIT_ARCHIVE_INCLUDE_PATHS.includes('apps/dgfy-api/src'));
  assert.ok(AUDIT_ARCHIVE_INCLUDE_PATHS.includes('apps/dgfy-pos/src'));
  assert.ok(AUDIT_ARCHIVE_INCLUDE_PATHS.includes('apps/dgfy-opis/src'));
  assert.ok(AUDIT_ARCHIVE_INCLUDE_PATHS.includes('apps/dgfy-storefront/src'));
  assert.ok(AUDIT_ARCHIVE_EXCLUDE_PATHS.includes(':(exclude)**/CREDENTIALS.md'));
  assert.ok(AUDIT_ARCHIVE_EXCLUDE_PATHS.includes(':(exclude)**/*Credentials*'));
  assert.ok(AUDIT_ARCHIVE_EXCLUDE_PATHS.includes(':(exclude)**/*Secrets*'));
  assert.ok(AUDIT_ARCHIVE_EXCLUDE_PATHS.includes(':(exclude)**/playwright/.auth/**'));
  assert.ok(AUDIT_ARCHIVE_EXCLUDE_PATHS.includes(':(exclude)**/private-uploads/**'));
  assert.ok(AUDIT_ARCHIVE_EXCLUDE_PATHS.includes(':(exclude)**/.env.*'));
});
