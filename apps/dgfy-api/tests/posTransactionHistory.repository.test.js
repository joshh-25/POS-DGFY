import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DataTypes, Op, Sequelize } from 'sequelize';

const findAndCountAll = jest.fn();
const userFindAll = jest.fn();
const discountFindAll = jest.fn();
const sequelize = {
    cast: jest.fn((column, type) => ({ kind: 'cast', column, type })),
    col: jest.fn((name) => ({ kind: 'column', name })),
    fn: jest.fn((name, ...args) => ({ kind: 'function', name, args })),
    where: jest.fn((left, right) => ({ kind: 'where', left, right }))
};
const models = {
    PosTransaction: { findAndCountAll, sequelize },
    User: { findAll: userFindAll },
    PosTerminalShift: {},
    PosTransactionLine: {},
    PosTransactionDiscount: { findAll: discountFindAll }
};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: jest.fn((modelName) => models[modelName] || {}),
        getStore: jest.fn(() => ({ sequelize }))
    }
}));

const { posRepository } = await import('../src/modules/pos/repositories/posRepository.js');

describe('POS transaction history repository query', () => {
    beforeEach(() => {
        findAndCountAll.mockReset().mockResolvedValue({ rows: [], count: 0 });
        userFindAll.mockReset().mockResolvedValue([{ user_id: 7 }]);
        discountFindAll.mockReset().mockResolvedValue([{ transaction_id: 11 }]);
        sequelize.cast.mockClear();
        sequelize.col.mockClear();
        sequelize.fn.mockClear();
        sequelize.where.mockClear();
    });

    it('combines cashier-name, Employee Credit, humanized, date, and amount search conditions', async () => {
        await posRepository.listTransactions({
            search: 'Employee Credit',
            cashier_name: 'Hernando',
            payment_type: 'employee_credit',
            page: 2,
            limit: 20
        });

        const [options] = findAndCountAll.mock.calls[0];
        const whereClauses = options.where[Op.and];
        const cashierClause = whereClauses.find((clause) => clause[Op.or]?.some((entry) => entry.cashier_id));
        const searchClause = whereClauses.find((clause) => clause[Op.or]?.some((entry) => entry.payment_type?.[Op.like]));

        expect(cashierClause[Op.or]).toEqual(expect.arrayContaining([
            { cashier_id: { [Op.in]: [7] } },
            { accepted_by: { [Op.in]: [7] } }
        ]));
        expect(searchClause[Op.or]).toEqual(expect.arrayContaining([
            { payment_type: { [Op.like]: '%Employee Credit%' } },
            { pos_transaction_id: { [Op.in]: [11] } }
        ]));
        expect(userFindAll).toHaveBeenCalledTimes(2);
        expect(discountFindAll).toHaveBeenCalledTimes(1);
        expect(sequelize.cast).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'column', name: 'PosTransaction.total_amount' }),
            'CHAR'
        );
        await posRepository.listTransactions({ search: '8/18/2026' });
        const [dateOptions] = findAndCountAll.mock.calls[1];
        expect(sequelize.fn).toHaveBeenCalledWith(
            'DATE_FORMAT',
            expect.objectContaining({ kind: 'column', name: 'PosTransaction.created_at' }),
            '%Y-%m-%d'
        );
        expect(dateOptions.where[Op.and]).toEqual(expect.arrayContaining([
            expect.objectContaining({ [Op.or]: expect.any(Array) })
        ]));
        const paymentClause = options.where[Op.and].find((clause) => (
            clause[Op.or]?.some((entry) => entry?.payment_type === 'employee_credit')
        ));
        expect(paymentClause[Op.or]).toEqual(expect.arrayContaining([
            { payment_type: 'employee_credit' },
            expect.objectContaining({ kind: 'where' })
        ]));
        expect(sequelize.fn).toHaveBeenCalledWith(
            'JSON_CONTAINS',
            expect.objectContaining({ kind: 'column', name: 'PosTransaction.payment_breakdown' }),
            JSON.stringify({ payment_type: 'employee_credit' })
        );
        expect(options.where.payment_type).toBeUndefined();
        expect(options.limit).toBe(20);
        expect(options.offset).toBe(20);
        expect(options.include).toEqual(expect.arrayContaining([
            expect.objectContaining({
                as: 'voidedByUser',
                attributes: ['user_id', 'username'],
                required: false
            })
        ]));
    });

    it('generates a valid MySQL JSON_CONTAINS expression for split-payment filters', async () => {
        const realSequelize = new Sequelize('dgfy_sql_generation', 'root', '', {
            dialect: 'mysql',
            logging: false
        });
        const queryModel = realSequelize.define('PosTransaction', {
            payment_type: DataTypes.STRING,
            payment_breakdown: DataTypes.JSON
        }, {
            tableName: 'pos_transactions',
            timestamps: false
        });
        models.PosTransaction.sequelize = realSequelize;

        try {
            await posRepository.listTransactions({ payment_type: 'card' });
            const [options] = findAndCountAll.mock.calls[0];
            const sql = realSequelize.dialect.queryGenerator.selectQuery(queryModel.tableName, {
                where: options.where,
                model: queryModel
            });

            expect(sql).toContain("JSON_CONTAINS(`PosTransaction`.`payment_breakdown`, '{\\\"payment_type\\\":\\\"card\\\"}') = 1");
            expect(sql).not.toContain("'$$'");
        } finally {
            models.PosTransaction.sequelize = sequelize;
            await realSequelize.close();
        }
    });
});
