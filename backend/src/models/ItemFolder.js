import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const ItemFolder = sequelize.define('ItemFolder', {
    folder_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    show_in_pos_filter: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'item_folders',
            key: 'folder_id'
        }
    }
}, {
    tableName: 'item_folders',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

export default ItemFolder;
