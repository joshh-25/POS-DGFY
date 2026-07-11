import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.terminal_identities,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260710021000-create-dgfy-business-foundation.cjs's actual table
// definition exactly (D-14/T-02-03-04: terminal identity/policy lookup
// foundation — identity and location binding only, no checkout/payment
// behavior in this phase). Per Phase 4 Clean Architecture: this model
// carries NO business logic.
export default (sequelize) => {
    class TerminalIdentity extends Model {
        static associate(models = {}) {
            if (models.Location && !TerminalIdentity.associations?.location) {
                TerminalIdentity.belongsTo(models.Location, {
                    foreignKey: 'location_id',
                    as: 'location'
                });
            }
        }
    }

    TerminalIdentity.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        terminal_code: {
            type: DataTypes.STRING(40),
            allowNull: false,
            unique: true
        },
        label: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        location_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'locations', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active'
        },
        last_seen_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'TerminalIdentity',
        tableName: 'terminal_identities',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['terminal_code'], name: 'unique_terminal_identities_terminal_code' },
            { fields: ['location_id'], name: 'idx_terminal_identities_location_id' },
            { fields: ['status'], name: 'idx_terminal_identities_status' }
        ]
    });

    return TerminalIdentity;
};
