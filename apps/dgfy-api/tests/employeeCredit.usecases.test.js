import { describe, expect, it, jest } from '@jest/globals';
import {
  buildAdjustEmployeeCreditOutstandingUseCase,
  buildEmployeeCreditService,
  buildEnableEmployeeCreditForActiveEmployeesUseCase,
  buildGetEmployeeCreditReportUseCase,
  buildListEmployeeCreditCheckoutOptionsUseCase,
  buildRecordEmployeeCreditRepaymentUseCase
} from '../src/modules/employeeCredit/usecases/employeeCreditUseCases.js';
import dbStore from '../src/utils/dbStore.js';

const buildAccount = (overrides = {}) => ({
  account_id: 7,
  user_id: 33,
  account_code: 'EC-33-TEST',
  is_eligible: true,
  balance: 500,
  outstanding_balance: 0,
  version: 0,
  authorization_pin_hash: null,
  employee: {
    username: 'Eligible Worker',
    email: 'worker@example.test',
    is_active: true,
    deleted_at: null
  },
  ...overrides
});

const buildRepository = ({ account, financialEntry = null } = {}) => {
  const ledgerByKey = new Map();
  const ledgerEntries = [];
  const auditEntries = [];
  return {
    ledgerByKey,
    ledgerEntries,
    auditEntries,
    findAccountByCode: jest.fn(async () => account),
    findAccountById: jest.fn(async () => account),
    findAccountByEmployeeId: jest.fn(async () => account),
    findAccountByUserId: jest.fn(async () => account),
    findLedgerEntryByIdempotencyKey: jest.fn(async (key) => ledgerByKey.get(key) || null),
    findFinancialEntryForTransaction: jest.fn(async () => financialEntry),
    updateAccount: jest.fn(async (target, values) => {
      Object.assign(target, values);
      return target;
    }),
    createLedgerEntry: jest.fn(async (values) => {
      const entry = {
        ledger_entry_id: ledgerEntries.length + 1,
        ...values,
        get: () => ({ ledger_entry_id: ledgerEntries.length + 1, ...values })
      };
      ledgerEntries.push(entry);
      ledgerByKey.set(values.idempotency_key, entry);
      return entry;
    }),
    createAuditLog: jest.fn(async (values) => {
      auditEntries.push(values);
      return values;
    })
  };
};

const runWithTenantTransaction = async (callback) => {
  const transaction = {
    LOCK: { UPDATE: 'UPDATE' },
    finished: false,
    commit: jest.fn(async function commit() {
      this.finished = 'commit';
    }),
    rollback: jest.fn(async function rollback() {
      this.finished = 'rollback';
    })
  };
  const sequelize = {
    transaction: jest.fn(async () => transaction)
  };
  const result = await dbStore.run({ sequelize }, callback);
  return { result, sequelize, transaction };
};

describe('Employee Credit service', () => {
  it('enables Employee Credit for active employees without changing limits or balances', async () => {
    const accounts = new Map([
      [1, { account_id: 11, employee_id: 1, is_eligible: false, credit_limit: 500, balance: 25, outstanding_balance: 10, version: 2 }],
      [2, { account_id: 12, employee_id: 2, is_eligible: true, credit_limit: null, balance: 0, outstanding_balance: 35, version: 4 }]
    ]);
    const repository = {
      listActiveEmployees: jest.fn(async () => [
        { employee_id: 1, employee_code: 'EMP-001', full_name: 'Previously Ineligible Worker' },
        { employee_id: 2, employee_code: 'EMP-002', full_name: 'Already Eligible Worker' },
        { employee_id: 3, employee_code: 'EMP-003', full_name: 'New Credit Worker' }
      ]),
      findAccountByEmployeeId: jest.fn(async (employeeId) => accounts.get(Number(employeeId)) || null),
      createAccount: jest.fn(async (values) => {
        const account = { account_id: 13, ...values };
        accounts.set(Number(values.employee_id), account);
        return account;
      }),
      updateAccount: jest.fn(async (account, values) => {
        Object.assign(account, values);
        return account;
      }),
      createAuditLog: jest.fn(async (values) => values)
    };
    const useCase = buildEnableEmployeeCreditForActiveEmployeesUseCase({ repository });

    const { result } = await runWithTenantTransaction(() => useCase({ actorUserId: 99 }));

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      active_employee_count: 3,
      enabled_count: 2,
      created_account_count: 1,
      already_eligible_count: 1
    });
    expect(accounts.get(1)).toMatchObject({
      is_eligible: true,
      credit_limit: 500,
      balance: 25,
      outstanding_balance: 10,
      version: 3
    });
    expect(accounts.get(3)).toMatchObject({
      is_eligible: true,
      balance: 0,
      outstanding_balance: 0,
      version: 0
    });
    expect(repository.createAuditLog).toHaveBeenCalledTimes(2);
    expect(repository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 99,
      changes: expect.objectContaining({
        action: 'bulk_employee_account_eligibility',
        active_employees_only: true,
        is_eligible: true
      })
    }), expect.anything());
  });

  it('authorizes and records one open-tab charge', async () => {
    const account = await buildAccount();
    const repository = buildRepository({ account });
    const service = buildEmployeeCreditService({ repository });

    const prepared = await service.prepareDebit({
      accountCode: 'ec-33-test',
      amount: 125.5,
      transaction: {}
    });
    const entry = await service.finalizeDebit({
      prepared,
      posTransactionId: 91,
      actorUserId: 12,
      shiftId: 18,
      terminalId: 'COUNTER-01',
      locationId: 4,
      idempotencyKey: 'checkout-employee-credit-001',
      transaction: {}
    });

    expect(prepared).toMatchObject({
      accountId: 7,
      userId: 33,
      employeeName: 'Eligible Worker',
      amount: 125.5,
      outstandingBefore: 0,
      outstandingAfter: 125.5
    });
    expect(prepared.maskedAccountCode).toMatch(/TEST$/);
    expect(account).toMatchObject({ balance: 500, outstanding_balance: 125.5, version: 1 });
    expect(entry).toMatchObject({
      pos_transaction_id: 91,
      entry_type: 'charge',
      amount: 125.5,
      balance_before: 0,
      balance_after: 125.5,
      shift_id: 18,
      terminal_id: 'COUNTER-01',
      location_id: 4
    });
    expect(repository.auditEntries).toHaveLength(1);
    expect(repository.auditEntries[0]).toMatchObject({
      user_id: 12,
      changes: {
        employee_user_id: 33,
        employee_id: null,
        employee_name_snapshot: 'Eligible Worker',
        applied_by_user_id: 12
      }
    });
    expect(entry.metadata).toMatchObject({
      employee_user_id: 33,
      employee_id: null,
      employee_name_snapshot: 'Eligible Worker',
      applied_by_user_id: 12
    });
  });

  it('returns safe searchable checkout options with employee, branch, eligibility, and balances', async () => {
    const repository = {
      listCheckoutEmployees: jest.fn(async () => [{
        employee_id: 44,
        employee_code: 'EMP-044',
        full_name: 'Branch Employee',
        location_id: 5,
        is_active: true,
        location: { location_id: 5, name: 'Makati Branch' },
        employeeCreditAccount: {
          account_id: 9,
          account_code: 'EC-E44-TEST',
          is_eligible: true,
          balance: '450.0000',
          outstanding_balance: '80.0000',
          credit_limit: '500.0000'
        }
      }]),
      listLegacyCheckoutAccounts: jest.fn(async () => [{
        account_id: 10,
        user_id: 33,
        employee_id: null,
        account_code: 'EC-33-LEGACY',
        is_eligible: false,
        balance: '75.0000',
        outstanding_balance: '20.0000',
        credit_limit: null,
        employee: {
          user_id: 33,
          username: 'Legacy Worker',
          email: 'legacy@example.test',
          is_active: true
        }
      }])
    };
    const useCase = buildListEmployeeCreditCheckoutOptionsUseCase({ repository });

    const result = await useCase({ query: { search: 'employee', limit: 50 } });

    expect(result.success).toBe(true);
    expect(repository.listCheckoutEmployees).toHaveBeenCalledWith({ search: 'employee', locationId: null, limit: 50 });
    expect(result.data.options).toEqual(expect.arrayContaining([
      expect.objectContaining({
        option_key: 'employee:44',
        employee_id: 44,
        employee_code: 'EMP-044',
        employee_name: 'Branch Employee',
        branch_id: 5,
        branch_name: 'Makati Branch',
        is_eligible: true,
        current_balance: 80,
        outstanding_balance: 80,
        funded_balance: 450,
        available_credit: null,
        credit_mode: 'open_tab',
        credit_limit: 500
      }),
      expect.objectContaining({
        option_key: 'user:33',
        user_id: 33,
        employee_name: 'Legacy Worker',
        branch_name: 'Legacy account / all branches',
        is_eligible: false,
        current_balance: 20,
        outstanding_balance: 20,
        funded_balance: 75
      })
    ]));
    expect(result.data.options.some((option) => Object.hasOwn(option, 'authorization_pin_hash'))).toBe(false);
  });

  it('authorizes a directory employee who has no POS login account', async () => {
    const account = await buildAccount({
      user_id: null,
      employee_id: 44,
      outstanding_balance: 20,
      employee: null,
      employeeProfile: {
        employee_id: 44,
        employee_code: 'EMP-044',
        full_name: 'Non-login Workmate',
        is_active: true
      }
    });
    const repository = buildRepository({ account });
    const service = buildEmployeeCreditService({ repository });

    const prepared = await service.prepareDebit({
      accountCode: account.account_code,
      amount: 80,
      transaction: {}
    });

    expect(prepared).toMatchObject({
      employeeId: 44,
      userId: null,
      employeeName: 'Non-login Workmate',
      outstandingBefore: 20,
      outstandingAfter: 100
    });
  });

  it('allows an eligible employee to charge above the legacy funded balance', async () => {
    const account = await buildAccount({ balance: 100, outstanding_balance: 20 });
    const repository = buildRepository({ account });
    const service = buildEmployeeCreditService({ repository });

    const prepared = await service.prepareDebit({
      accountCode: account.account_code,
      amount: 101,
      transaction: {}
    });
    await service.finalizeDebit({
      prepared,
      posTransactionId: 94,
      actorUserId: 12,
      shiftId: 18,
      terminalId: 'COUNTER-01',
      locationId: 4,
      idempotencyKey: 'checkout-employee-credit-no-limit',
      transaction: {}
    });

    expect(account).toMatchObject({ balance: 100, outstanding_balance: 121 });
    expect(repository.updateAccount).toHaveBeenCalledTimes(1);
    expect(repository.createLedgerEntry).toHaveBeenCalledTimes(1);
    expect(repository.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it('replays a duplicate charge without increasing outstanding twice', async () => {
    const account = await buildAccount();
    const repository = buildRepository({ account });
    const service = buildEmployeeCreditService({ repository });
    const prepared = await service.prepareDebit({
      accountCode: account.account_code,
      amount: 75,
      transaction: {}
    });
    const request = {
      prepared,
      posTransactionId: 92,
      actorUserId: 12,
      shiftId: 18,
      terminalId: 'COUNTER-01',
      locationId: 4,
      idempotencyKey: 'checkout-employee-credit-duplicate',
      transaction: {}
    };

    const first = await service.finalizeDebit(request);
    const replay = await service.finalizeDebit(request);

    expect(replay).toBe(first);
    expect(account.balance).toBe(500);
    expect(account.outstanding_balance).toBe(75);
    expect(repository.updateAccount).toHaveBeenCalledTimes(1);
    expect(repository.createLedgerEntry).toHaveBeenCalledTimes(1);
    expect(repository.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it('reverses an open-tab charge once when an Employee Credit transaction is voided', async () => {
    const account = await buildAccount({ balance: 375, outstanding_balance: 125, version: 1 });
    const financialEntry = { ledger_entry_id: 22, entry_type: 'charge', amount: 125 };
    const repository = buildRepository({ account, financialEntry });
    const service = buildEmployeeCreditService({ repository });
    const request = {
      posTransaction: {
        pos_transaction_id: 93,
        payment_type: 'employee_credit',
        employee_credit_account_id: 7,
        employee_credit_user_id: 33,
        employee_credit_authorization_reference: 'EC-AUTH-001',
        shift_id: 18,
        terminal_id: 'COUNTER-01',
        location_id: 4
      },
      actorUserId: 12,
      reason: 'Customer cancellation',
      transaction: {}
    };

    const first = await service.reverseForVoid(request);
    const replay = await service.reverseForVoid(request);

    expect(first).toMatchObject({
      entry_type: 'reversal',
      amount: -125,
      balance_before: 125,
      balance_after: 0,
      reason: 'Customer cancellation'
    });
    expect(replay).toBe(first);
    expect(account).toMatchObject({ balance: 375, outstanding_balance: 0, version: 2 });
    expect(repository.updateAccount).toHaveBeenCalledTimes(1);
    expect(repository.createLedgerEntry).toHaveBeenCalledTimes(1);
    expect(repository.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it('records one idempotent repayment against the outstanding balance', async () => {
    const account = await buildAccount({ outstanding_balance: 125, version: 2 });
    const repository = buildRepository({ account });
    const useCase = buildRecordEmployeeCreditRepaymentUseCase({ repository });
    const request = {
      accountId: 7,
      actorUserId: 12,
      payload: {
        amount: 40,
        reason: 'Payroll repayment',
        idempotency_key: 'employee-credit-repayment-001'
      }
    };

    const first = await runWithTenantTransaction(() => useCase(request));
    const replay = await runWithTenantTransaction(() => useCase(request));

    expect(first.result.success).toBe(true);
    expect(first.result.data).toMatchObject({
      account: { account_id: 7, outstanding_balance: 85, version: 3 },
      ledger_entry: {
        entry_type: 'repayment',
        amount: -40,
        balance_before: 125,
        balance_after: 85
      },
      idempotent_replay: false
    });
    expect(replay.result.success).toBe(true);
    expect(replay.result.data).toMatchObject({
      ledger_entry: {
        entry_type: 'repayment',
        amount: -40,
        balance_before: 125,
        balance_after: 85
      },
      idempotent_replay: true
    });
    expect(account.outstanding_balance).toBe(85);
    expect(repository.updateAccount).toHaveBeenCalledTimes(1);
    expect(repository.createLedgerEntry).toHaveBeenCalledTimes(1);
    expect(repository.createAuditLog).toHaveBeenCalledTimes(1);
  });

  it('records a reasoned outstanding correction without changing the legacy funded balance', async () => {
    const account = await buildAccount({ balance: 500, outstanding_balance: 85, version: 3 });
    const repository = buildRepository({ account });
    const useCase = buildAdjustEmployeeCreditOutstandingUseCase({ repository });

    const { result } = await runWithTenantTransaction(() => useCase({
      accountId: 7,
      actorUserId: 12,
      payload: {
        adjustment_amount: 15,
        reason: 'Correct imported opening balance',
        idempotency_key: 'employee-credit-adjustment-001'
      }
    }));

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      account: {
        balance: 500,
        outstanding_balance: 100,
        version: 4
      },
      ledger_entry: {
        entry_type: 'adjustment',
        amount: 15,
        balance_before: 85,
        balance_after: 100
      }
    });
    expect(repository.auditEntries[0]).toMatchObject({
      changes: {
        action: 'outstanding_adjustment',
        adjustment_amount: 15,
        outstanding_before: 85,
        outstanding_after: 100
      }
    });
  });

  it('uses validated Date values as local business-day report boundaries', async () => {
    const entries = [
      { entry_type: 'charge', amount: 1878.6 },
      { entry_type: 'repayment', amount: -1000 },
      { entry_type: 'charge', amount: 454.5 }
    ];
    const repository = {
      listLedgerEntries: jest.fn(async () => entries)
    };
    const useCase = buildGetEmployeeCreditReportUseCase({ repository });

    const result = await useCase({
      query: {
        date_from: new Date(2026, 6, 30),
        date_to: new Date(2026, 6, 30)
      }
    });

    expect(result.success).toBe(true);
    expect(result.data.totals).toMatchObject({
      credit_sales: 2333.1,
      repayments: 1000
    });
    expect(repository.listLedgerEntries).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: new Date(2026, 6, 30, 0, 0, 0, 0),
      dateTo: new Date(2026, 6, 30, 23, 59, 59, 999)
    }));
  });
});
