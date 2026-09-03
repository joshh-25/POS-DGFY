import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

const migrationPath = path.resolve(
  process.cwd(),
  '../dgfy-migration-runner/migrations/20260729000001-create-employee-credit-ledger.cjs'
);
const migrationContent = fs.readFileSync(migrationPath, 'utf8');
const employeeDirectoryMigrationPath = path.resolve(
  process.cwd(),
  '../dgfy-migration-runner/migrations/20260729000002-create-employee-directory.cjs'
);
const employeeDirectoryMigrationContent = fs.readFileSync(employeeDirectoryMigrationPath, 'utf8');

// Trimmed (#1441): kept to the 6 unique-constraint/ENUM assertions -- the ones a migration
// author is actually likely to break silently -- and dropped the 21 bare column-name greps,
// which rot independently of the schema invariants this file exists to protect.
describe('Employee Credit migration contract', () => {
  it('creates tenant-local account and immutable ledger tables', () => {
    expect(migrationContent).toContain('uq_employee_credit_accounts_user');
    expect(migrationContent).toContain('uq_employee_credit_accounts_code');
    expect(migrationContent).toContain('uq_employee_credit_ledger_idempotency');
    expect(migrationContent).toContain("ENUM('grant','debit','reversal','adjustment','expiration')");
  });

  it('adds a tenant-owned employee directory without requiring a login account', () => {
    expect(employeeDirectoryMigrationContent).toContain('uq_employees_code');
    expect(employeeDirectoryMigrationContent).toContain('uq_employee_credit_accounts_employee');
  });
});
