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
const outstandingBalanceMigrationPath = path.resolve(
  process.cwd(),
  '../dgfy-migration-runner/migrations/20260730000001-convert-employee-credit-to-outstanding-balance.cjs'
);
const outstandingBalanceMigrationContent = fs.readFileSync(outstandingBalanceMigrationPath, 'utf8');

describe('Employee Credit migration contract', () => {
  it('creates tenant-local account and immutable ledger tables', () => {
    expect(migrationContent).toContain('employee_credit_accounts');
    expect(migrationContent).toContain('employee_credit_ledger_entries');
    expect(migrationContent).toContain('uq_employee_credit_accounts_user');
    expect(migrationContent).toContain('uq_employee_credit_accounts_code');
    expect(migrationContent).toContain('uq_employee_credit_ledger_idempotency');
    expect(migrationContent).toContain("ENUM('grant','debit','reversal','adjustment','expiration')");
  });

  it('adds Employee Credit as a tender and stores receipt-safe snapshots', () => {
    expect(migrationContent).toContain("'employee_credit'");
    expect(migrationContent).toContain('employee_credit_account_id');
    expect(migrationContent).toContain('employee_credit_user_id');
    expect(migrationContent).toContain('employee_credit_employee_name_snapshot');
    expect(migrationContent).toContain('employee_credit_account_code_snapshot');
    expect(migrationContent).toContain('employee_credit_amount');
    expect(migrationContent).toContain('employee_credit_balance_after');
    expect(migrationContent).toContain('employee_credit_authorization_reference');
  });

  it('adds a tenant-owned employee directory without requiring a login account', () => {
    expect(employeeDirectoryMigrationContent).toContain('employees');
    expect(employeeDirectoryMigrationContent).toContain('employee_code');
    expect(employeeDirectoryMigrationContent).toContain('employee_id');
    expect(employeeDirectoryMigrationContent).toContain('uq_employees_code');
    expect(employeeDirectoryMigrationContent).toContain('uq_employee_credit_accounts_employee');
    expect(employeeDirectoryMigrationContent).toContain('MODIFY COLUMN \\`user_id\\` INT NULL');
    expect(employeeDirectoryMigrationContent).toContain('employee_credit_employee_id');
    expect(employeeDirectoryMigrationContent).toContain('Cannot roll back employee directory');
  });

  it('converts employee credit into an outstanding-balance ledger without removing legacy data', () => {
    expect(outstandingBalanceMigrationContent).toContain('outstanding_balance');
    expect(outstandingBalanceMigrationContent).toContain("'charge'");
    expect(outstandingBalanceMigrationContent).toContain("'repayment'");
    expect(outstandingBalanceMigrationContent).toContain('employee_credit_outstanding_after');
    expect(outstandingBalanceMigrationContent).toContain('employee_credit_ledger_entries');
  });
});
