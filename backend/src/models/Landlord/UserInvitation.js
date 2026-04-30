import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class UserInvitation extends Model { }

  UserInvitation.init({
    invitation_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    tenant_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    role: {
      type: DataTypes.STRING(40),
      allowNull: false
    },
    token_hash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    delivery_status: {
      type: DataTypes.ENUM('not_configured', 'sent', 'failed', 'manual_link'),
      allowNull: false,
      defaultValue: 'manual_link'
    },
    delivery_error: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    invited_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    invited_by_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    last_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    accepted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelled_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelled_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'UserInvitation',
    tableName: 'user_invitations',
    underscored: true,
    timestamps: true
  });

  return UserInvitation;
};
