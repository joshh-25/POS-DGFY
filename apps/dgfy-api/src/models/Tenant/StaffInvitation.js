import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.staff_invitations
// (Wave 7 gap-closure, 04-07-PLAN.md: API-02/API-04 staff durability gap),
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260711143000-add-dgfy-business-staff-invitations.cjs's actual table
// definition exactly. Per Phase 4 Clean Architecture: this model carries NO
// business logic — that lives in
// ../../modules/businesses/usecases/businessUseCases.js, mediated through
// ../../modules/businesses/repositories/staffOnboardingRepository.js.
//
// SECURITY (T-04-07-02): only a SHA-256 `token_hash` is ever persisted here.
// The raw invitation token is never written to this table or any other
// tenant/landlord row — it exists only transiently in the invitation
// creation response and the outbound email body.
export default (sequelize) => {
    class StaffInvitation extends Model {
        static associate(models = {}) {
            if (models.StaffAccount && !StaffInvitation.associations?.staffAccount) {
                StaffInvitation.belongsTo(models.StaffAccount, {
                    foreignKey: 'staff_account_id',
                    as: 'staffAccount'
                });
            }
        }
    }

    StaffInvitation.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // Nullable: an invitation is not required to reference an existing
        // staff_accounts row up front — acceptance creates or links one.
        staff_account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            set(value) {
                this.setDataValue('email', String(value || '').trim().toLowerCase());
            }
        },
        // SHA-256 hex digest of the raw invitation token — never the raw
        // token itself (T-04-07-02).
        token_hash: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'accepted', 'expired', 'revoked'),
            allowNull: false,
            defaultValue: 'pending'
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        accepted_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'StaffInvitation',
        tableName: 'staff_invitations',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['token_hash'], name: 'unique_staff_invitations_token_hash' },
            { fields: ['email'], name: 'idx_staff_invitations_email' },
            { fields: ['status'], name: 'idx_staff_invitations_status' }
        ]
    });

    return StaffInvitation;
};
