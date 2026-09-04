import crypto from 'crypto';
import dbStore from '../../../utils/dbStore.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const round4 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const employeeName = (employee) => String(employee?.full_name || employee?.username || employee?.email || 'Employee').trim();
const accountIdentity = (account) => account?.employeeProfile || account?.employee || null;
const accountIdentityIsActive = (account) => {
  const identity = accountIdentity(account);
  return Boolean(identity?.is_active) && !identity?.deleted_at;
};
const safeAccountData = (account) => {
  const data = account?.get ? account.get({ plain: true }) : { ...account };
  delete data.authorization_pin_hash;
  return data;
};
const maskCode = (code) => {
  const normalized = normalizeCode(code);
  if (normalized.length <= 4) return normalized;
  return `${'*'.repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-4)}`;
};
const checkoutOptionFromDirectoryEmployee = (employee) => {
  const account = employee?.employeeCreditAccount || null;
  const outstandingBalance = round4(account?.outstanding_balance || 0);
  return {
    option_key: `employee:${employee.employee_id}`,
    employee_id: employee.employee_id,
    user_id: null,
    employee_code: employee.employee_code,
    employee_name: employee.full_name,
    branch_id: employee.location?.location_id || employee.location_id || null,
    branch_name: employee.location?.name || 'All branches / unassigned',
    is_active: employee.is_active === true,
    is_eligible: Boolean(account?.is_eligible),
    account_configured: Boolean(account),
    account_code: account?.account_code || null,
    masked_account_code: account?.account_code ? maskCode(account.account_code) : null,
    current_balance: outstandingBalance,
    outstanding_balance: outstandingBalance,
    funded_balance: round4(account?.balance || 0),
    available_credit: null,
    credit_mode: 'open_tab',
    credit_limit: account?.credit_limit == null ? null : round4(account.credit_limit)
  };
};
const checkoutOptionFromLegacyAccount = (account) => {
  const outstandingBalance = round4(account?.outstanding_balance || 0);
  return {
    option_key: `user:${account.user_id}`,
    employee_id: null,
    user_id: account.user_id,
    employee_code: String(account?.employee?.username || account?.employee?.email || `USER-${account.user_id}`),
    employee_name: employeeName(account.employee),
    branch_id: null,
    branch_name: 'Legacy account / all branches',
    is_active: Boolean(account?.employee?.is_active),
    is_eligible: Boolean(account?.is_eligible),
    account_configured: true,
    account_code: account.account_code,
    masked_account_code: maskCode(account.account_code),
    current_balance: outstandingBalance,
    outstanding_balance: outstandingBalance,
    funded_balance: round4(account?.balance || 0),
    available_credit: null,
    credit_mode: 'open_tab',
    credit_limit: account?.credit_limit == null ? null : round4(account.credit_limit)
  };
};
const mapError = (error, fallback) => {
  if (error instanceof DomainError) return error;
  return new DomainError(DomainErrorCode.INTERNAL_ERROR, fallback, { statusCode: 500 });
};
const requirePositiveInt = (value, label) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${label} must be a positive integer`, { statusCode: 422 });
  }
  return normalized;
};
const toBusinessDayBoundary = (value, endOfDay = false) => {
  if (!value) return null;
  const source = value instanceof Date
    ? value
    : new Date(`${String(value).trim()}T00:00:00`);
  if (Number.isNaN(source.getTime())) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Employee Credit report date is invalid', { statusCode: 422 });
  }
  return new Date(
    source.getFullYear(),
    source.getMonth(),
    source.getDate(),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
};

export const buildEmployeeCreditService = ({ repository }) => ({
  async prepareDebit({ accountCode, amount, transaction }) {
    const normalizedCode = normalizeCode(accountCode);
    const normalizedAmount = round4(amount);
    if (!normalizedCode) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Employee Credit account is required', { statusCode: 422 });
    }
    if (normalizedAmount <= 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Employee Credit amount must be greater than zero', { statusCode: 422 });
    }
    const account = await repository.findAccountByCode(normalizedCode, { transaction, lock: true });
    if (!account || !account.is_eligible || !accountIdentityIsActive(account)) {
      throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Employee Credit account is not eligible', { statusCode: 403 });
    }
    const outstandingBefore = round4(account.outstanding_balance);
    const outstandingAfter = round4(outstandingBefore + normalizedAmount);
    return {
      account,
      accountId: account.account_id,
      userId: account.user_id,
      employeeId: account.employee_id,
      employeeName: employeeName(accountIdentity(account)),
      accountCode: account.account_code,
      maskedAccountCode: maskCode(account.account_code),
      amount: normalizedAmount,
      outstandingBefore,
      outstandingAfter,
      authorizationReference: `EC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    };
  },

  async finalizeDebit({ prepared, posTransactionId, actorUserId, shiftId, terminalId, locationId, idempotencyKey, transaction }) {
    const ledgerKey = `${idempotencyKey}:employee-credit:charge`;
    const existing = await repository.findLedgerEntryByIdempotencyKey(ledgerKey, { transaction, lock: true });
    if (existing) return existing;
    await repository.updateAccount(prepared.account, {
      outstanding_balance: prepared.outstandingAfter,
      version: Number(prepared.account.version || 0) + 1
    }, { transaction });
    const entry = await repository.createLedgerEntry({
      account_id: prepared.accountId,
      pos_transaction_id: posTransactionId,
      entry_type: 'charge',
      amount: prepared.amount,
      balance_before: prepared.outstandingBefore,
      balance_after: prepared.outstandingAfter,
      actor_user_id: actorUserId,
      shift_id: shiftId,
      terminal_id: terminalId,
      location_id: locationId,
      authorization_reference: prepared.authorizationReference,
      idempotency_key: ledgerKey,
      reason: 'POS Employee Credit charge',
      metadata: {
        balance_basis: 'outstanding',
        employee_user_id: prepared.userId || null,
        employee_id: prepared.employeeId || null,
        employee_name_snapshot: prepared.employeeName,
        applied_by_user_id: actorUserId
      }
    }, { transaction });
    await repository.createAuditLog({
      user_id: actorUserId,
      entity_type: 'employee_credit',
      entity_id: prepared.accountId,
      action: 'UPDATE',
      changes: {
        action: 'charge',
        pos_transaction_id: posTransactionId,
        amount: prepared.amount,
        outstanding_before: prepared.outstandingBefore,
        outstanding_after: prepared.outstandingAfter,
        authorization_reference: prepared.authorizationReference,
        employee_user_id: prepared.userId || null,
        employee_id: prepared.employeeId || null,
        employee_name_snapshot: prepared.employeeName,
        applied_by_user_id: actorUserId
      }
    }, { transaction });
    return entry;
  },

  async reverseForVoid({ posTransaction, actorUserId, reason, transaction }) {
    if (String(posTransaction?.payment_type || '').toLowerCase() !== 'employee_credit') return null;
    const financialEntry = await repository.findFinancialEntryForTransaction(posTransaction.pos_transaction_id, { transaction, lock: true });
    if (!financialEntry) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Employee Credit financial record is missing', { statusCode: 409 });
    }
    const reversalKey = `void:${posTransaction.pos_transaction_id}:employee-credit:reversal`;
    const existing = await repository.findLedgerEntryByIdempotencyKey(reversalKey, { transaction, lock: true });
    if (existing) return existing;
    const account = await repository.findAccountById(posTransaction.employee_credit_account_id, { transaction, lock: true })
      || (posTransaction.employee_credit_employee_id
        ? await repository.findAccountByEmployeeId(posTransaction.employee_credit_employee_id, { transaction, lock: true })
        : await repository.findAccountByUserId(posTransaction.employee_credit_user_id, { transaction, lock: true }));
    if (!account) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Employee Credit account is unavailable for reversal', { statusCode: 409 });
    }
    const isOpenTabCharge = financialEntry.entry_type === 'charge';
    const amount = Math.abs(round4(financialEntry.amount));
    const balanceBefore = isOpenTabCharge
      ? round4(account.outstanding_balance)
      : round4(account.balance);
    const balanceAfter = isOpenTabCharge
      ? round4(Math.max(0, balanceBefore - amount))
      : round4(balanceBefore + amount);
    await repository.updateAccount(account, {
      [isOpenTabCharge ? 'outstanding_balance' : 'balance']: balanceAfter,
      version: Number(account.version || 0) + 1
    }, { transaction });
    const entry = await repository.createLedgerEntry({
      account_id: account.account_id,
      pos_transaction_id: posTransaction.pos_transaction_id,
      entry_type: 'reversal',
      amount: isOpenTabCharge ? -amount : amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      actor_user_id: actorUserId,
      shift_id: posTransaction.shift_id,
      terminal_id: posTransaction.terminal_id,
      location_id: posTransaction.location_id,
      authorization_reference: posTransaction.employee_credit_authorization_reference,
      idempotency_key: reversalKey,
      reason: String(reason || 'POS transaction void').slice(0, 500),
      metadata: {
        reversed_ledger_entry_id: financialEntry.ledger_entry_id,
        reversed_entry_type: financialEntry.entry_type,
        balance_basis: isOpenTabCharge ? 'outstanding' : 'funded'
      }
    }, { transaction });
    await repository.createAuditLog({
      user_id: actorUserId,
      entity_type: 'employee_credit',
      entity_id: account.account_id,
      action: 'UPDATE',
      changes: {
        action: 'reversal',
        pos_transaction_id: posTransaction.pos_transaction_id,
        amount: isOpenTabCharge ? -amount : amount,
        balance_basis: isOpenTabCharge ? 'outstanding' : 'funded',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reason
      }
    }, { transaction });
    return entry;
  }
});

export const buildListEmployeeCreditAccountsUseCase = ({ repository }) => async () => {
  try {
    const accounts = await repository.listAccounts();
    return ok({ accounts });
  } catch (error) {
    return fail(mapError(error, 'Failed to load Employee Credit accounts'));
  }
};

export const buildEnableEmployeeCreditForActiveEmployeesUseCase = ({ repository }) => async ({ actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const employees = await repository.listActiveEmployees({ transaction, lock: true });
    let enabledCount = 0;
    let createdAccountCount = 0;
    let alreadyEligibleCount = 0;

    for (const employee of employees) {
      const normalizedEmployeeId = requirePositiveInt(employee?.employee_id, 'employeeId');
      let account = await repository.findAccountByEmployeeId(normalizedEmployeeId, { transaction, lock: true });
      const wasEligible = Boolean(account?.is_eligible);

      if (!account) {
        account = await repository.createAccount({
          employee_id: normalizedEmployeeId,
          user_id: null,
          account_code: `EC-E${normalizedEmployeeId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          is_eligible: true,
          balance: 0,
          outstanding_balance: 0,
          version: 0
        }, { transaction });
        createdAccountCount += 1;
        enabledCount += 1;
      } else if (!wasEligible) {
        await repository.updateAccount(account, {
          is_eligible: true,
          version: Number(account.version || 0) + 1
        }, { transaction });
        enabledCount += 1;
      } else {
        alreadyEligibleCount += 1;
      }

      if (!wasEligible) {
        await repository.createAuditLog({
          user_id: normalizedActorUserId,
          entity_type: 'employee_credit',
          entity_id: account.account_id,
          action: 'UPDATE',
          changes: {
            action: 'bulk_employee_account_eligibility',
            employee_id: normalizedEmployeeId,
            employee_code: employee.employee_code,
            employee_name: employee.full_name,
            is_eligible: true,
            active_employees_only: true
          }
        }, { transaction });
      }
    }

    await transaction.commit();
    return ok({
      active_employee_count: employees.length,
      enabled_count: enabledCount,
      created_account_count: createdAccountCount,
      already_eligible_count: alreadyEligibleCount
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to enable Employee Credit for active employees'));
  }
};

export const buildListEmployeeCreditCheckoutOptionsUseCase = ({ repository }) => async ({ query = {} } = {}) => {
  try {
    const search = String(query.search || '').trim();
    const limit = Math.min(100, Math.max(1, Number(query.limit || 50)));
    const locationId = query.location_id ? requirePositiveInt(query.location_id, 'location_id') : null;
    const employeeId = query.employee_id ? requirePositiveInt(query.employee_id, 'employee_id') : null;
    const [employees, legacyAccounts] = await Promise.all([
      repository.listCheckoutEmployees({ search, locationId, employeeId, limit }),
      employeeId ? Promise.resolve([]) : repository.listLegacyCheckoutAccounts({ search, limit })
    ]);
    const options = [
      ...employees.map(checkoutOptionFromDirectoryEmployee),
      ...legacyAccounts.map(checkoutOptionFromLegacyAccount)
    ]
      .sort((left, right) => left.employee_name.localeCompare(right.employee_name))
      .slice(0, limit);
    return ok({ options });
  } catch (error) {
    return fail(mapError(error, 'Failed to load Employee Credit checkout options'));
  }
};

export const buildUpdateEmployeeCreditAccountUseCase = ({ repository }) => async ({ userId, payload, actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedUserId = requirePositiveInt(userId, 'userId');
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const user = await repository.findActiveUserById(normalizedUserId, { transaction, lock: true });
    if (!user) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Employee was not found', { statusCode: 404 });
    let account = await repository.findAccountByUserId(normalizedUserId, { transaction, lock: true });
    if (!account) {
      account = await repository.createAccount({
        user_id: normalizedUserId,
        account_code: `EC-${normalizedUserId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        is_eligible: false,
        balance: 0,
        outstanding_balance: 0,
        version: 0
      }, { transaction });
    }
    const updates = {};
    if (payload.is_eligible !== undefined) updates.is_eligible = Boolean(payload.is_eligible);
    if (payload.credit_limit !== undefined) updates.credit_limit = payload.credit_limit == null ? null : round4(payload.credit_limit);
    const adjustmentAmount = round4(payload.adjustment_amount || 0);
    let ledgerEntry = null;
    if (adjustmentAmount !== 0) {
      const reason = String(payload.reason || '').trim();
      if (reason.length < 3) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A reason is required for credit adjustments', { statusCode: 422 });
      const idempotencyKey = String(payload.idempotency_key || '').trim();
      if (idempotencyKey.length < 8) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required for credit adjustments', { statusCode: 422 });
      const existing = await repository.findLedgerEntryByIdempotencyKey(idempotencyKey, { transaction, lock: true });
      if (existing) {
        await transaction.commit();
        return ok({ account: safeAccountData(account), ledger_entry: existing.get({ plain: true }), idempotent_replay: true });
      }
      const before = round4(account.balance);
      const after = round4(before + adjustmentAmount);
      if (after < 0) throw new DomainError(DomainErrorCode.CONFLICT, 'Credit adjustment cannot create a negative balance', { statusCode: 409 });
      updates.balance = after;
      ledgerEntry = await repository.createLedgerEntry({
        account_id: account.account_id,
        entry_type: adjustmentAmount > 0 ? 'grant' : 'adjustment',
        amount: adjustmentAmount,
        balance_before: before,
        balance_after: after,
        actor_user_id: normalizedActorUserId,
        idempotency_key: idempotencyKey,
        reason,
        metadata: { managed_employee_user_id: normalizedUserId }
      }, { transaction });
    }
    updates.version = Number(account.version || 0) + 1;
    await repository.updateAccount(account, updates, { transaction });
    await repository.createAuditLog({
      user_id: normalizedActorUserId,
      entity_type: 'employee_credit',
      entity_id: account.account_id,
      action: 'UPDATE',
      changes: {
        action: 'account_configuration',
        is_eligible: updates.is_eligible,
        credit_limit: updates.credit_limit,
        adjustment_amount: adjustmentAmount || undefined
      }
    }, { transaction });
    await transaction.commit();
    return ok({ account: safeAccountData(account), ledger_entry: ledgerEntry?.get({ plain: true }) || null });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to update Employee Credit account'));
  }
};

export const buildUpdateEmployeeCreditEmployeeAccountUseCase = ({ repository }) => async ({ employeeId, payload, actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedEmployeeId = requirePositiveInt(employeeId, 'employeeId');
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const employee = await repository.findActiveEmployeeById(normalizedEmployeeId, { transaction, lock: true });
    if (!employee) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Employee was not found or is inactive', { statusCode: 404 });
    let account = await repository.findAccountByEmployeeId(normalizedEmployeeId, { transaction, lock: true });
    if (!account) {
      account = await repository.createAccount({
        employee_id: normalizedEmployeeId,
        user_id: null,
        account_code: `EC-E${normalizedEmployeeId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        is_eligible: false,
        balance: 0,
        outstanding_balance: 0,
        version: 0
      }, { transaction });
    }
    const updates = {};
    if (payload.is_eligible !== undefined) updates.is_eligible = Boolean(payload.is_eligible);
    if (payload.credit_limit !== undefined) updates.credit_limit = payload.credit_limit == null ? null : round4(payload.credit_limit);
    const adjustmentAmount = round4(payload.adjustment_amount || 0);
    let ledgerEntry = null;
    if (adjustmentAmount !== 0) {
      const reason = String(payload.reason || '').trim();
      if (reason.length < 3) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A reason is required for credit adjustments', { statusCode: 422 });
      const idempotencyKey = String(payload.idempotency_key || '').trim();
      if (idempotencyKey.length < 8) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required for credit adjustments', { statusCode: 422 });
      const existing = await repository.findLedgerEntryByIdempotencyKey(idempotencyKey, { transaction, lock: true });
      if (existing) {
        await transaction.commit();
        return ok({ account: safeAccountData(account), ledger_entry: existing.get({ plain: true }), idempotent_replay: true });
      }
      const before = round4(account.balance);
      const after = round4(before + adjustmentAmount);
      if (after < 0) throw new DomainError(DomainErrorCode.CONFLICT, 'Credit adjustment cannot create a negative balance', { statusCode: 409 });
      updates.balance = after;
      ledgerEntry = await repository.createLedgerEntry({
        account_id: account.account_id,
        entry_type: adjustmentAmount > 0 ? 'grant' : 'adjustment',
        amount: adjustmentAmount,
        balance_before: before,
        balance_after: after,
        actor_user_id: normalizedActorUserId,
        idempotency_key: idempotencyKey,
        reason,
        metadata: { managed_employee_id: normalizedEmployeeId }
      }, { transaction });
    }
    updates.version = Number(account.version || 0) + 1;
    await repository.updateAccount(account, updates, { transaction });
    await repository.createAuditLog({
      user_id: normalizedActorUserId,
      entity_type: 'employee_credit',
      entity_id: account.account_id,
      action: 'UPDATE',
      changes: {
        action: 'employee_account_configuration',
        employee_id: normalizedEmployeeId,
        is_eligible: updates.is_eligible,
        credit_limit: updates.credit_limit,
        adjustment_amount: adjustmentAmount || undefined
      }
    }, { transaction });
    await transaction.commit();
    return ok({ account: safeAccountData(account), ledger_entry: ledgerEntry?.get({ plain: true }) || null });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to update Employee Credit account'));
  }
};

export const buildRecordEmployeeCreditRepaymentUseCase = ({ repository }) => async ({ accountId, payload, actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedAccountId = requirePositiveInt(accountId, 'accountId');
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const repayAll = payload.repay_all === true;
    const hasAmount = payload.amount !== undefined && payload.amount !== null;
    if (repayAll === hasAmount) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Provide either a repayment amount or repay_all', { statusCode: 422 });
    }
    const requestedAmount = hasAmount ? round4(payload.amount) : null;
    const expectedVersion = payload.expected_version === undefined || payload.expected_version === null
      ? null
      : Number(payload.expected_version);
    const reason = String(payload.reason || '').trim();
    const idempotencyKey = String(payload.idempotency_key || '').trim();
    if (hasAmount && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Repayment amount must be greater than zero', { statusCode: 422 });
    }
    if (repayAll && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'expected_version is required for Repay All', { statusCode: 422 });
    }
    if (reason.length < 3) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A reason is required for Employee Credit repayment', { statusCode: 422 });
    }
    if (idempotencyKey.length < 8) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required for Employee Credit repayment', { statusCode: 422 });
    }
    const existing = await repository.findLedgerEntryByIdempotencyKey(idempotencyKey, { transaction, lock: true });
    if (existing) {
      await transaction.commit();
      return ok({ ledger_entry: existing.get({ plain: true }), idempotent_replay: true });
    }
    const account = await repository.findAccountById(normalizedAccountId, { transaction, lock: true });
    if (!account) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Employee Credit account was not found', { statusCode: 404 });
    }
    const outstandingBefore = round4(account.outstanding_balance);
    if (repayAll && Number(account.version || 0) !== expectedVersion) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Employee Credit balance changed. Refresh and confirm the current balance again.', { statusCode: 409 });
    }
    const amount = repayAll ? outstandingBefore : requestedAmount;
    if (repayAll && amount <= 0) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Employee Credit account has no outstanding balance', { statusCode: 409 });
    }
    if (amount > outstandingBefore) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Repayment cannot exceed the outstanding balance', { statusCode: 409 });
    }
    const outstandingAfter = round4(outstandingBefore - amount);
    await repository.updateAccount(account, {
      outstanding_balance: outstandingAfter,
      version: Number(account.version || 0) + 1
    }, { transaction });
    const ledgerEntry = await repository.createLedgerEntry({
      account_id: account.account_id,
      entry_type: 'repayment',
      amount: -amount,
      balance_before: outstandingBefore,
      balance_after: outstandingAfter,
      actor_user_id: normalizedActorUserId,
      idempotency_key: idempotencyKey,
      reason,
      metadata: {
        balance_basis: 'outstanding',
        repayment_mode: repayAll ? 'all' : 'partial'
      }
    }, { transaction });
    await repository.createAuditLog({
      user_id: normalizedActorUserId,
      entity_type: 'employee_credit',
      entity_id: account.account_id,
      action: 'UPDATE',
      changes: {
        action: 'repayment',
        amount,
        outstanding_before: outstandingBefore,
        outstanding_after: outstandingAfter,
        reason,
        repayment_mode: repayAll ? 'all' : 'partial'
      }
    }, { transaction });
    await transaction.commit();
    return ok({
      account: safeAccountData(account),
      ledger_entry: ledgerEntry.get({ plain: true }),
      idempotent_replay: false
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to record Employee Credit repayment'));
  }
};

export const buildAdjustEmployeeCreditOutstandingUseCase = ({ repository }) => async ({ accountId, payload, actorUserId }) => {
  const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
  const transaction = await sequelize.transaction();
  try {
    const normalizedAccountId = requirePositiveInt(accountId, 'accountId');
    const normalizedActorUserId = requirePositiveInt(actorUserId, 'actorUserId');
    const adjustmentAmount = round4(payload.adjustment_amount);
    const reason = String(payload.reason || '').trim();
    const idempotencyKey = String(payload.idempotency_key || '').trim();
    if (adjustmentAmount === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Outstanding adjustment amount must not be zero', { statusCode: 422 });
    }
    if (reason.length < 3) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A reason is required for outstanding adjustments', { statusCode: 422 });
    }
    if (idempotencyKey.length < 8) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key is required for outstanding adjustments', { statusCode: 422 });
    }
    const existing = await repository.findLedgerEntryByIdempotencyKey(idempotencyKey, { transaction, lock: true });
    if (existing) {
      await transaction.commit();
      return ok({ ledger_entry: existing.get({ plain: true }), idempotent_replay: true });
    }
    const account = await repository.findAccountById(normalizedAccountId, { transaction, lock: true });
    if (!account) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Employee Credit account was not found', { statusCode: 404 });
    }
    const outstandingBefore = round4(account.outstanding_balance);
    const outstandingAfter = round4(outstandingBefore + adjustmentAmount);
    if (outstandingAfter < 0) {
      throw new DomainError(DomainErrorCode.CONFLICT, 'Outstanding adjustment cannot create a negative balance', { statusCode: 409 });
    }
    await repository.updateAccount(account, {
      outstanding_balance: outstandingAfter,
      version: Number(account.version || 0) + 1
    }, { transaction });
    const ledgerEntry = await repository.createLedgerEntry({
      account_id: account.account_id,
      entry_type: 'adjustment',
      amount: adjustmentAmount,
      balance_before: outstandingBefore,
      balance_after: outstandingAfter,
      actor_user_id: normalizedActorUserId,
      idempotency_key: idempotencyKey,
      reason,
      metadata: { balance_basis: 'outstanding' }
    }, { transaction });
    await repository.createAuditLog({
      user_id: normalizedActorUserId,
      entity_type: 'employee_credit',
      entity_id: account.account_id,
      action: 'UPDATE',
      changes: {
        action: 'outstanding_adjustment',
        adjustment_amount: adjustmentAmount,
        outstanding_before: outstandingBefore,
        outstanding_after: outstandingAfter,
        reason
      }
    }, { transaction });
    await transaction.commit();
    return ok({
      account: safeAccountData(account),
      ledger_entry: ledgerEntry.get({ plain: true }),
      idempotent_replay: false
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return fail(mapError(error, 'Failed to adjust Employee Credit outstanding balance'));
  }
};

export const buildLookupEmployeeCreditAccountUseCase = ({ repository }) => async ({ accountCode }) => {
  try {
    const account = await repository.findAccountByCode(normalizeCode(accountCode));
    if (!account || !account.is_eligible || !accountIdentityIsActive(account)) {
      throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Eligible Employee Credit account was not found', { statusCode: 404 });
    }
    return ok({
      account: {
        account_code: account.account_code,
        masked_account_code: maskCode(account.account_code),
        employee_name: employeeName(accountIdentity(account)),
        balance: round4(account.outstanding_balance),
        outstanding_balance: round4(account.outstanding_balance),
        funded_balance: round4(account.balance),
        credit_mode: 'open_tab',
        credit_limit: account.credit_limit == null ? null : round4(account.credit_limit)
      }
    });
  } catch (error) {
    return fail(mapError(error, 'Failed to look up Employee Credit account'));
  }
};

export const buildGetEmployeeCreditReportUseCase = ({ repository }) => async ({ query = {} } = {}) => {
  try {
    const dateFrom = toBusinessDayBoundary(query.date_from);
    const dateTo = toBusinessDayBoundary(query.date_to, true);
    const entries = await repository.listLedgerEntries({
      dateFrom,
      dateTo,
      accountId: query.account_id ? requirePositiveInt(query.account_id, 'account_id') : null,
      entryType: query.entry_type || null,
      limit: Math.min(1000, Math.max(1, Number(query.limit || 500)))
    });
    const totals = entries.reduce((acc, entry) => {
      const amount = round4(entry.amount);
      if (entry.entry_type === 'charge' || entry.entry_type === 'debit') {
        acc.credit_sales = round4(acc.credit_sales + Math.abs(amount));
      }
      if (entry.entry_type === 'repayment') acc.repayments = round4(acc.repayments + Math.abs(amount));
      if (entry.entry_type === 'grant') acc.grants = round4(acc.grants + amount);
      if (entry.entry_type === 'reversal') acc.reversals = round4(acc.reversals + amount);
      return acc;
    }, { credit_sales: 0, repayments: 0, grants: 0, reversals: 0 });
    return ok({ entries, totals, excluded_from_cashflow: true });
  } catch (error) {
    return fail(mapError(error, 'Failed to load Employee Credit report'));
  }
};
