import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phone_number: {
    type: DataTypes.STRING(40),
    allowNull: true
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  pos_approval_pin_hash: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  pos_day_close_pin_hash: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('admin', 'manager', 'staff', 'cashier', 'po', 'do', 'jo'),
    defaultValue: 'staff'
  },
  role_preset_key: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  permissions: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  },
  is_master_admin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Invitation system fields
  invitation_token: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true
  },
  invitation_expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  invited_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  invitation_status: {
    type: DataTypes.ENUM('pending', 'accepted', 'expired', 'cancelled', 'declined'),
    allowNull: true
  },
  invitation_delivery_status: {
    type: DataTypes.ENUM('not_configured', 'sent', 'failed', 'manual_link'),
    allowNull: true
  },
  invitation_delivery_error: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  invitation_last_sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  invitation_accepted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  invitation_cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  invitation_cancelled_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  // Soft delete fields for "Remove from Company" feature
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deleted_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default User;
