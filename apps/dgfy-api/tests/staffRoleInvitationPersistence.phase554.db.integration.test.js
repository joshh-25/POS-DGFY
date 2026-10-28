import crypto from 'crypto';
import { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { createMigratedTestDatabase } from './helpers/migratedTestDatabase.js';
import customRoleInvitationMigration from '../../dgfy-migration-runner/migrations/20261026000001-add-custom-staff-role-invitation-metadata.cjs';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import dbStore from '../src/utils/dbStore.js';
import {
  applyStaffRoleAssignmentInTransaction,
  staffRoleRepository
} from '../src/modules/staff/repositories/staffRoleRepository.js';
import {
  buildAssignStaffRoleToUserUseCase,
  buildSetStaffRoleStatusUseCase
} from '../src/modules/staff/usecases/staffRoleUseCases.js';

jest.setTimeout(180000);

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: Number(process.env.DB_PORT || 3306)
};

const adminSequelize = new Sequelize('mysql', dbConfig.user, dbConfig.password, {
  host: dbConfig.host,
  port: dbConfig.port,
  dialect: 'mysql',
  logging: false
});

const suffix = `${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
const dbName = `test_staff_role_invite_phase554_${suffix}`;
const tenantId = `phase554-${suffix}`;

describe('Phase 554 staff-role invitation persistence on a disposable migrated tenant', () => {
  let tenantSequelize;
  let models;
  let owner;
  let role;

  const runInTenantContext = (callback) => dbStore.run({
    ...models,
    sequelize: tenantSequelize,
    tenantId,
    tenantName: 'Phase 554 Staff Role Invitation Tenant',
    dbName
  }, callback);

  const createUser = (label, values = {}) => models.User.create({
    username: `phase554_${label}_${suffix}`.slice(0, 50),
    email: `phase554_${label}_${suffix}@test.invalid`,
    password_hash: 'phase554-test-hash',
    role: 'staff',
    is_active: true,
    permissions: [],
    permission_mode: 'inherit',
    ...values
  });

  beforeAll(async () => {
    await adminSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await createMigratedTestDatabase(dbName, adminSequelize);
    tenantSequelize = new Sequelize(dbName, dbConfig.user, dbConfig.password, {
      host: dbConfig.host,
      port: dbConfig.port,
      dialect: 'mysql',
      logging: false,
      pool: { max: 8, min: 0 }
    });
    await tenantSequelize.authenticate();
    models = getTenantModels(tenantSequelize);
    owner = await createUser('owner', { role: 'admin', is_master_admin: true });
    role = await models.StaffRole.create({
      name: `Phase 554 Warehouse ${suffix}`,
      capabilities: ['pos:orders:view'],
      is_active: true,
      created_by: owner.user_id,
      updated_by: owner.user_id
    });
  }, 180000);

  afterAll(async () => {
    if (tenantSequelize) await tenantSequelize.close();
    await adminSequelize.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await adminSequelize.close();
  }, 60000);

  it('commits custom-role assignment and audit together, and rolls both back together', async () => {
    const user = await createUser('assignment', {
      permissions: ['pos:orders:view', 'pos:orders:refund'],
      permission_mode: 'custom'
    });

    await runInTenantContext(async () => {
      const transaction = await tenantSequelize.transaction();
      const target = await models.User.findByPk(user.user_id, { transaction, lock: transaction.LOCK.UPDATE });
      const persistedRole = await models.StaffRole.findByPk(role.staff_role_id, { transaction, lock: transaction.LOCK.UPDATE });
      await applyStaffRoleAssignmentInTransaction({
        repository: staffRoleRepository,
        target,
        role: persistedRole,
        actorUserId: owner.user_id,
        transaction
      });
      await transaction.rollback();
    });

    const afterRollback = await models.User.findByPk(user.user_id);
    expect(afterRollback).toMatchObject({
      staff_role_id: null,
      permission_mode: 'custom',
      permissions: ['pos:orders:view', 'pos:orders:refund']
    });
    expect(await models.AuditLog.count({ where: { entity_type: 'staff_role', entity_id: user.user_id } })).toBe(0);

    const assign = buildAssignStaffRoleToUserUseCase({ repository: staffRoleRepository });
    await expect(runInTenantContext(() => assign({
      userId: user.user_id,
      staffRoleId: role.staff_role_id,
      actorUserId: owner.user_id
    }))).resolves.toMatchObject({
      success: true,
      data: { assignment: { user_id: user.user_id, staff_role_id: role.staff_role_id } }
    });

    const assigned = await models.User.findByPk(user.user_id);
    expect(assigned).toMatchObject({
      staff_role_id: role.staff_role_id,
      permission_mode: 'inherit',
      permissions: []
    });
    const audit = await models.AuditLog.findOne({
      where: { entity_type: 'user', entity_id: user.user_id },
      order: [['log_id', 'DESC']]
    });
    expect(audit.changes).toMatchObject({
      staff_role_id: role.staff_role_id,
      previous_permission_mode: 'custom',
      previous_permissions: ['pos:orders:view', 'pos:orders:refund'],
      permission_overrides_cleared: true
    });
  });

  it('cancels only pending assigned invitations and leaves accepted staff active', async () => {
    const pendingA = await createUser('pending_a', {
      role: 'staff', is_active: false, invitation_token: `pending-a-${suffix}`,
      invitation_status: 'pending', invitation_expires_at: new Date(Date.now() + 3600000),
      staff_role_id: role.staff_role_id
    });
    const pendingB = await createUser('pending_b', {
      role: 'staff', is_active: false, invitation_token: `pending-b-${suffix}`,
      invitation_status: 'pending', invitation_expires_at: new Date(Date.now() + 3600000),
      staff_role_id: role.staff_role_id
    });
    const accepted = await createUser('accepted', {
      role: 'staff', is_active: true, invitation_token: null,
      invitation_status: 'accepted', invitation_accepted_at: new Date(),
      staff_role_id: role.staff_role_id
    });
    const synchronizeInvitationCancellations = jest.fn(async () => ({ cancelled_count: 2 }));
    const deactivate = buildSetStaffRoleStatusUseCase({
      repository: staffRoleRepository,
      synchronizeInvitationCancellations
    });

    await expect(runInTenantContext(() => deactivate({
      staffRoleId: role.staff_role_id,
      isActive: false,
      actorUserId: owner.user_id
    }))).resolves.toMatchObject({
      success: true,
      data: { cancelled_invitation_count: 2, invitation_sync_status: 'complete' }
    });

    const [cancelledA, cancelledB, unchangedAccepted] = await Promise.all([
      models.User.findByPk(pendingA.user_id),
      models.User.findByPk(pendingB.user_id),
      models.User.findByPk(accepted.user_id)
    ]);
    for (const cancelled of [cancelledA, cancelledB]) {
      expect(cancelled).toMatchObject({
        staff_role_id: role.staff_role_id,
        invitation_token: null,
        invitation_status: 'cancelled',
        is_active: false,
        invitation_cancelled_by: owner.user_id
      });
      expect(cancelled.invitation_cancelled_at).toBeTruthy();
    }
    expect(unchangedAccepted).toMatchObject({
      staff_role_id: role.staff_role_id,
      invitation_status: 'accepted',
      is_active: true
    });
    expect(synchronizeInvitationCancellations).toHaveBeenCalledTimes(1);
    expect(await models.StaffRole.findByPk(role.staff_role_id)).toMatchObject({ is_active: false });
  });

  it('honors an InnoDB role-row lock across concurrent transactions', async () => {
    const lockRole = await models.StaffRole.create({
      name: `Phase 554 Lock ${suffix}`,
      capabilities: [],
      is_active: true,
      created_by: owner.user_id,
      updated_by: owner.user_id
    });
    const firstTransaction = await tenantSequelize.transaction();
    await runInTenantContext(() => staffRoleRepository.findById(lockRole.staff_role_id, {
      transaction: firstTransaction,
      lock: true
    }));

    let secondTransactionFinished = false;
    const secondTransaction = tenantSequelize.transaction(async (transaction) => runInTenantContext(async () => {
      const lockedRole = await staffRoleRepository.findById(lockRole.staff_role_id, {
        transaction,
        lock: true
      });
      await staffRoleRepository.update(lockedRole, { is_active: false }, { transaction });
    })).then(() => { secondTransactionFinished = true; });

    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(secondTransactionFinished).toBe(false);
    } finally {
      await firstTransaction.commit();
    }
    await secondTransaction;
    expect(secondTransactionFinished).toBe(true);
    expect(await models.StaffRole.findByPk(lockRole.staff_role_id)).toMatchObject({ is_active: false });
  });

  it('adds, reapplies, and rolls back only the invitation metadata on the disposable database', async () => {
    const queryInterface = tenantSequelize.getQueryInterface();
    const addedColumns = ['staff_role_id', 'staff_role_name', 'cancellation_reason'];
    const addedIndex = 'idx_user_invitations_tenant_staff_role_status';

    // Start from the pre-feature table shape on this isolated database to exercise an upgrade.
    await customRoleInvitationMigration.down(queryInterface);
    const before = await queryInterface.describeTable('user_invitations');
    expect(addedColumns.every((column) => !before[column])).toBe(true);

    await customRoleInvitationMigration.up(queryInterface, Sequelize);
    await customRoleInvitationMigration.up(queryInterface, Sequelize);
    const upgraded = await queryInterface.describeTable('user_invitations');
    expect(addedColumns.every((column) => upgraded[column]?.allowNull === true)).toBe(true);
    expect((await queryInterface.showIndex('user_invitations')).some((index) => index.name === addedIndex)).toBe(true);

    await customRoleInvitationMigration.down(queryInterface);
    const rolledBack = await queryInterface.describeTable('user_invitations');
    expect(Object.keys(rolledBack).sort()).toEqual(Object.keys(before).sort());
    expect((await queryInterface.showIndex('user_invitations')).some((index) => index.name === addedIndex)).toBe(false);

    await customRoleInvitationMigration.up(queryInterface, Sequelize);
  });
});
