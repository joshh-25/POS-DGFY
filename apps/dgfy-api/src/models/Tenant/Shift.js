import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.shifts, matching
// apps/dgfy-migration-runner/src/migrations/schema/
// 20260712100000-create-commerce-foundation.cjs's actual `shifts` table
// definition exactly (Phase 8, SFT-01/SFT-02). Money-column shapes ported
// from the read-only legacy PosTerminalShift model (all DECIMAL(14,4)).
// D-13: `cashier_account_id` is the tenant-local
// `staff_accounts.id` (INTEGER, same-DB FK), NOT the landlord
// `dgfy_account_id` (UUID) — `cashier_dgfy_account_id` is kept alongside,
// opaque, audit-only. The `active_terminal_cashier_key` generated column
// (D-12: one-open-shift invariant) is DB-managed
// (`GENERATED ALWAYS AS (...) STORED`) and is deliberately NOT declared as
// a writable Sequelize attribute here — Sequelize must never attempt to
// write it.
export default (sequelize) => {
    class Shift extends Model {
        static associate(models = {}) {
            if (models.TerminalIdentity && !Shift.associations?.terminal) {
                Shift.belongsTo(models.TerminalIdentity, {
                    foreignKey: 'terminal_id',
                    as: 'terminal'
                });
            }
            if (models.StaffAccount && !Shift.associations?.cashier) {
                Shift.belongsTo(models.StaffAccount, {
                    foreignKey: 'cashier_account_id',
                    as: 'cashier'
                });
            }
            if (models.CashDrawerEvent && !Shift.associations?.cashDrawerEvents) {
                Shift.hasMany(models.CashDrawerEvent, {
                    foreignKey: 'shift_id',
                    as: 'cashDrawerEvents'
                });
            }
        }

        isOpen() {
            return this.status === 'open';
        }
    }

    Shift.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: {
            type: DataTypes.CHAR(36),
            allowNull: false
        },
        // RESTRICT (not CASCADE): base column of the
        // active_terminal_cashier_key STORED generated column — MySQL 8.0
        // forbids CASCADE/SET NULL/SET DEFAULT on a foreign key whose
        // column feeds a STORED generated column. Mirrors
        // 20260712100000-create-commerce-foundation.cjs exactly.
        terminal_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'terminal_identities', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
        },
        // D-13: tenant-local staff_accounts.id (INTEGER), NOT the landlord
        // dgfy_account_id (UUID) — keeps the one-open-shift key same-DB.
        // RESTRICT (not CASCADE): also a base column of
        // active_terminal_cashier_key — same generated-column restriction
        // as terminal_id above.
        cashier_account_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database); kept alongside for audit only (D-13).
        cashier_dgfy_account_id: {
            type: DataTypes.CHAR(36),
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('open', 'closed'),
            allowNull: false,
            defaultValue: 'open'
        },
        opening_float_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: false
        },
        expected_cash_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        closing_cash_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        cash_variance_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        opened_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        closed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
        // active_terminal_cashier_key intentionally omitted — DB-managed
        // GENERATED ALWAYS AS (...) STORED column (D-12); never a writable
        // Sequelize attribute.
    }, {
        sequelize,
        modelName: 'Shift',
        tableName: 'shifts',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['active_terminal_cashier_key'], name: 'uq_shifts_active_terminal_cashier' }
        ]
    });

    return Shift;
};
