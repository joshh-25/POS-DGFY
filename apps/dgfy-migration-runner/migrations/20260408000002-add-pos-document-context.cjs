/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableInfo = await queryInterface.describeTable('pos_transactions').catch(() => ({}));
        if (tableInfo.document_context) {
            return;
        }

        await queryInterface.addColumn('pos_transactions', 'document_context', {
            type: Sequelize.ENUM('fiscal', 'non_fiscal', 'training_test'),
            allowNull: false,
            defaultValue: 'non_fiscal'
        });

        await queryInterface.sequelize.query(`
            UPDATE pos_transactions
            SET document_context = CASE
                WHEN document_type = 'fiscal_invoice' THEN 'fiscal'
                ELSE 'non_fiscal'
            END
        `);

        await queryInterface.addIndex('pos_transactions', ['document_context'], {
            name: 'pos_transactions_document_context_idx'
        }).catch(() => null);
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('pos_transactions', 'pos_transactions_document_context_idx').catch(() => null);
        const tableInfo = await queryInterface.describeTable('pos_transactions').catch(() => ({}));
        if (tableInfo.document_context) {
            await queryInterface.removeColumn('pos_transactions', 'document_context');
        }
    }
};
