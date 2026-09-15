import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePermissionArray } from '../src/utils/userPermissions.js';

export const classifyCashierItemGrants = (users) => users.map((user) => {
    const stored = normalizePermissionArray(user.permissions);
    return {
        user_id: user.user_id,
        role_preset_key: user.role_preset_key || null,
        status: stored.includes('items:edit') ? 'review_required_ambiguous_edit' : 'no_stored_edit',
        // A saved array does not prove whether an editor was explicitly delegated
        // or inherited the previous default. Never propose an automatic rewrite.
        item_permissions: stored.filter((permission) => permission.startsWith('items:')),
        action: stored.includes('items:edit') ? 'administrator_review_keep_or_revoke' : 'none'
    };
});

const run = async () => {
    const { default: landlord } = await import('../src/config/database.js');
    const { Sequelize } = await import('sequelize');
    const host = landlord.config.host;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('This audit is local-only.');
    try {
        const [tenants] = await landlord.query("SELECT id, db_name FROM tenants WHERE status = 'active'", { logging: false });
        const report = [];
        for (const tenant of tenants) {
            if (!/^[A-Za-z0-9_]+$/.test(tenant.db_name) || /^test_/i.test(tenant.db_name)) continue;
            const connection = new Sequelize(tenant.db_name, landlord.config.username, landlord.config.password, {
                host, port: landlord.config.port, dialect: 'mysql', logging: false, pool: { max: 1, min: 0 }
            });
            try {
                const [users] = await connection.query("SELECT user_id, role_preset_key, permissions FROM users WHERE role = 'cashier' AND deleted_at IS NULL");
                const requiredIndexes = ['uq_pos_terminal_shifts_active_operator', 'uq_pos_terminal_operator_sessions_active_user', 'uq_pos_terminal_operator_sessions_active_terminal', 'uq_employee_attendance_sessions_active_user'];
                const [indexes] = await connection.query('SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME IN (:names)', { replacements: { names: requiredIndexes } });
                report.push({ tenant_id: tenant.id, missing_operating_indexes: requiredIndexes.filter((name) => !indexes.some((index) => index.name === name)), users: classifyCashierItemGrants(users) });
            } finally {
                await connection.close();
            }
        }
        console.log(JSON.stringify({ read_only: true, report }, null, 2));
    } finally {
        await landlord.close();
    }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    run().catch(() => { console.error('Cashier grant audit failed; check local database availability/schema. No grants were modified.'); process.exitCode = 1; });
}
