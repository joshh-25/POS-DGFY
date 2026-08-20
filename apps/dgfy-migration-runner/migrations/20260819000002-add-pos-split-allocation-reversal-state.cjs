'use strict';

const columnExists = async (queryInterface, tableName, columnName) => {
    try {
        const description = await queryInterface.describeTable(tableName);
        return Boolean(description?.[columnName]);
    } catch (error) {
        if (error?.original?.code === 'ER_NO_SUCH_TABLE' || error?.parent?.code === 'ER_NO_SUCH_TABLE') return false;
        throw error;
    }
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
    if (!(await columnExists(queryInterface, tableName, columnName))) {
        await queryInterface.addColumn(tableName, columnName, definition);
    }
};

const indexExists = async (queryInterface, tableName, indexName) => {
    const indexes = await queryInterface.showIndex(tableName);
    return indexes.some((index) => index.name === indexName);
};

const ALLOCATION_ADJUSTMENT_FK = 'fk_pos_adjustment_payment_allocation';

const foreignKeyExists = async (queryInterface, tableName, constraintName) => {
    const references = await queryInterface.getForeignKeyReferencesForTable(tableName);
    return references.some((reference) => (
        reference.constraintName === constraintName
        || reference.constraint_name === constraintName
    ));
};

module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'pos_payment_allocations', 'reversed_amount', {
            type: Sequelize.DECIMAL(14, 4),
            allowNull: false,
            defaultValue: 0,
            comment: 'Successful allocation amount reversed through append-only adjustment evidence'
        });
        await addColumnIfMissing(queryInterface, 'pos_payment_allocations', 'reversal_status', {
            type: Sequelize.ENUM('none', 'pending', 'partial', 'completed', 'manual_review_required'),
            allowNull: false,
            defaultValue: 'none'
        });
        await addColumnIfMissing(queryInterface, 'pos_transaction_adjustments', 'pos_payment_allocation_id', {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: 'Allocation-level reversal attribution for split-tender refunds'
        });
        if (!(await foreignKeyExists(queryInterface, 'pos_transaction_adjustments', ALLOCATION_ADJUSTMENT_FK))) {
            await queryInterface.addConstraint('pos_transaction_adjustments', {
                fields: ['pos_payment_allocation_id'],
                type: 'foreign key',
                name: ALLOCATION_ADJUSTMENT_FK,
                references: { table: 'pos_payment_allocations', field: 'pos_payment_allocation_id' },
                onUpdate: 'RESTRICT',
                onDelete: 'RESTRICT'
            });
        }
        if (!(await indexExists(queryInterface, 'pos_payment_allocations', 'idx_pos_payment_allocations_session_reversal_status'))) {
            await queryInterface.addIndex('pos_payment_allocations', ['session_id', 'reversal_status'], {
                name: 'idx_pos_payment_allocations_session_reversal_status'
            });
        }
        if (!(await indexExists(queryInterface, 'pos_transaction_adjustments', 'idx_pos_transaction_adjustments_allocation_created'))) {
            await queryInterface.addIndex('pos_transaction_adjustments', ['pos_payment_allocation_id', 'created_at'], {
                name: 'idx_pos_transaction_adjustments_allocation_created'
            });
        }
    },

    async down(queryInterface) {
        if (await indexExists(queryInterface, 'pos_transaction_adjustments', 'idx_pos_transaction_adjustments_allocation_created')) {
            await queryInterface.removeIndex('pos_transaction_adjustments', 'idx_pos_transaction_adjustments_allocation_created');
        }
        if (await indexExists(queryInterface, 'pos_payment_allocations', 'idx_pos_payment_allocations_session_reversal_status')) {
            await queryInterface.removeIndex('pos_payment_allocations', 'idx_pos_payment_allocations_session_reversal_status');
        }
        if (await foreignKeyExists(queryInterface, 'pos_transaction_adjustments', ALLOCATION_ADJUSTMENT_FK)) {
            await queryInterface.removeConstraint('pos_transaction_adjustments', ALLOCATION_ADJUSTMENT_FK);
        }
        if (await columnExists(queryInterface, 'pos_transaction_adjustments', 'pos_payment_allocation_id')) {
            await queryInterface.removeColumn('pos_transaction_adjustments', 'pos_payment_allocation_id');
        }
        for (const columnName of ['reversal_status', 'reversed_amount']) {
            if (await columnExists(queryInterface, 'pos_payment_allocations', columnName)) {
                await queryInterface.removeColumn('pos_payment_allocations', columnName);
            }
        }
    }
};
