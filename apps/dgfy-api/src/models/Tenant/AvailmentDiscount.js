import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.availment_discounts,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260713120000-create-availment-checkout.cjs's actual `availment_discounts`
// table definition (Phase 09, D-04/D-05/CHK-03/D-14). Each row represents one
// applied discount (promo code, manual, or SC/PWD); multiple discount types
// can stack on a single availment. NOT append-only-triggered (discounts can
// be added/removed while availment is draft), but carries created_at only for
// audit ordering.
export default (sequelize) => {
    class AvailmentDiscount extends Model {
        static associate(models = {}) {
            if (models.Availment && !AvailmentDiscount.associations?.availment) {
                AvailmentDiscount.belongsTo(models.Availment, {
                    foreignKey: 'availment_id',
                    as: 'availment'
                });
            }
            if (models.StaffAccount && !AvailmentDiscount.associations?.appliedByStaffAccount) {
                AvailmentDiscount.belongsTo(models.StaffAccount, {
                    foreignKey: 'applied_by_staff_account_id',
                    as: 'appliedByStaffAccount'
                });
            }
        }
    }

    AvailmentDiscount.init({
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
        // Parent Availment reference (same-DB FK).
        availment_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'availments', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // D-04: all three discount types can stack on one Availment; one row
        // per applied discount (D-14 receipt requirement).
        discount_type: {
            type: DataTypes.ENUM('promo_code', 'manual', 'sc_pwd'),
            allowNull: false
        },
        // D-06: free-text promo code (stored, not validated per RESEARCH Open
        // Question #4 + D-06).
        code: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        // D-05: amount or percent, never both (server recomputes applied peso
        // at finalize via money.js).
        amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        // D-05: percent value (e.g., 0.2000 for 20% SC/PWD).
        percent: {
            type: DataTypes.DECIMAL(5, 4),
            allowNull: true
        },
        // D-05: CHK-03 staff id + reason (mandatory for discount_type
        // 'manual').
        applied_by_staff_account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
        },
        // D-05: CHK-03 reason text (mandatory for discount_type 'manual').
        reason: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        // D-06: SC/PWD ID number (populated only for discount_type
        // 'sc_pwd').
        sc_pwd_id_number: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        // D-06: SC/PWD customer name (optional, populated only for
        // discount_type 'sc_pwd').
        sc_pwd_customer_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'AvailmentDiscount',
        tableName: 'availment_discounts',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        // Append-only audit row — no updated_at.
        updatedAt: false,
        indexes: [
            { fields: ['business_id', 'availment_id'], name: 'idx_availment_discounts_business_availment' }
        ]
    });

    return AvailmentDiscount;
};
