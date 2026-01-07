'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
    }).catch(err => {
        if (!err.original || err.original.code !== 'ER_TABLE_EXISTS_ERROR') {
            if (err.name === 'SequelizeDatabaseError' && err.message.includes('already exists')) return;
            throw err;
        }
    });

    // Add indexes for efficient lineage queries
    try {
        await queryInterface.addIndex('batch_lineage', ['parent_batch_id'], {
            name: 'idx_batch_lineage_parent'
        });
    } catch(e) { }

        try {
        await queryInterface.addIndex('batch_lineage', ['child_batch_id'], {
            name: 'idx_batch_lineage_child'
        });
    } catch(e) { }

        try {
        await queryInterface.addIndex('batch_lineage', ['jo_number'], {
            name: 'idx_batch_lineage_jo'
        });
    } catch(e) { }
},

    async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('batch_lineage');
}
};
