import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyLegalAcknowledgement extends Model { }

    DgfyLegalAcknowledgement.init({
        acknowledgement_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'dgfy_accounts',
                key: 'id'
            }
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'tenants',
                key: 'id'
            }
        },
        flow: {
            type: DataTypes.ENUM('dgfy_account_registration', 'dgfy_company_registration'),
            allowNull: false
        },
        terms_version: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        privacy_version: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        company_terms_version: {
            type: DataTypes.STRING(80),
            allowNull: true
        },
        marketplace_terms_version: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        acknowledgement_text: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        acknowledgement_hash: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        ip_address: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        user_agent: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        request_id: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        accepted_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        }
    }, {
        sequelize,
        modelName: 'DgfyLegalAcknowledgement',
        tableName: 'dgfy_legal_acknowledgements',
        underscored: true,
        timestamps: true,
        indexes: [
            {
                fields: ['dgfy_account_id', 'flow', 'accepted_at'],
                name: 'idx_dgfy_legal_ack_account_flow_time'
            },
            {
                fields: ['tenant_id', 'flow'],
                name: 'idx_dgfy_legal_ack_tenant_flow'
            },
            {
                fields: ['marketplace_terms_version'],
                name: 'idx_dgfy_legal_ack_marketplace_version'
            }
        ]
    });

    return DgfyLegalAcknowledgement;
};
