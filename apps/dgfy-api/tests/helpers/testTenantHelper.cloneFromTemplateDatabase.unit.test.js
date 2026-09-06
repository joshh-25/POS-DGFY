// Regression test for RF-1 (PR #1638 review): a CREATE TABLE replay failure mid-loop must not
// leave FOREIGN_KEY_CHECKS=0 on the pooled physical connection. No real MySQL connection is used --
// `tenantSeq` and `landlordSeq` are hand-rolled fakes (mirrors the injectable-dependency pattern in
// tests/dgfyAffiliatePriceRuleUseCases.unit.test.js), which is why cloneFromTemplateDatabase() takes
// `landlordSeq` as an optional third argument instead of always reaching for the real
// landlordSequelize singleton.

import { cloneFromTemplateDatabase } from './testTenantHelper.js';

const TEMPLATE_DB_NAME = 'test_tenant_template_deadbeef_local';

// A fake tenantSeq whose `.transaction()` mirrors Sequelize's real contract closely enough for this
// test: it invokes the callback with a stand-in transaction token, and if the callback throws, the
// same error propagates out of `.transaction()` (real Sequelize would additionally issue a ROLLBACK
// on the underlying connection at that point -- this fake only needs to prove the calling code
// still runs SET FOREIGN_KEY_CHECKS=1 *before* that happens, on the same token/connection).
function makeFakeTenantSeq({ failOnCreateIndex = -1 } = {}) {
    const queries = [];
    return {
        queries,
        transaction: async (fn) => {
            const t = { id: 'fake-tx-1' };
            return fn(t);
        },
        query: async (sql, options = {}) => {
            queries.push({ sql, transaction: options.transaction });
            if (failOnCreateIndex >= 0 && sql.startsWith('CREATE TABLE')) {
                const createCallsSoFar = queries.filter((q) => q.sql.startsWith('CREATE TABLE')).length;
                if (createCallsSoFar === failOnCreateIndex + 1) {
                    throw new Error(`simulated failure on CREATE TABLE #${createCallsSoFar}`);
                }
            }
            return [[]];
        },
    };
}

function makeFakeLandlordSeq(tableNames) {
    return {
        query: async (sql) => {
            if (sql.includes('information_schema.tables')) {
                return [tableNames.map((name) => ({ name }))];
            }
            if (sql.startsWith('SHOW CREATE TABLE')) {
                const tableName = sql.match(/`([^`]+)`$/)[1];
                return [[{ 'Create Table': `CREATE TABLE \`${tableName}\` (id INT)` }]];
            }
            throw new Error(`Unexpected query in fake landlordSeq: ${sql}`);
        },
    };
}

test('restores FOREIGN_KEY_CHECKS=1 on the happy path', async () => {
    const tenantSeq = makeFakeTenantSeq();
    const landlordSeq = makeFakeLandlordSeq(['tenants_a', 'tenants_b']);

    await cloneFromTemplateDatabase(tenantSeq, TEMPLATE_DB_NAME, landlordSeq);

    const fkQueries = tenantSeq.queries.filter((q) => q.sql.startsWith('SET FOREIGN_KEY_CHECKS'));
    expect(fkQueries.map((q) => q.sql)).toEqual(['SET FOREIGN_KEY_CHECKS=0', 'SET FOREIGN_KEY_CHECKS=1']);
    // Every statement -- including the final restore -- ran on the same transaction/connection token.
    const sameConnection = tenantSeq.queries.every((q) => q.transaction === tenantSeq.queries[0].transaction);
    expect(sameConnection).toBe(true);
});

test('RF-1: still restores FOREIGN_KEY_CHECKS=1 when a CREATE TABLE fails mid-loop', async () => {
    const tenantSeq = makeFakeTenantSeq({ failOnCreateIndex: 1 }); // fail on the 2nd CREATE TABLE
    const landlordSeq = makeFakeLandlordSeq(['tenants_a', 'tenants_b', 'tenants_c']);

    await expect(
        cloneFromTemplateDatabase(tenantSeq, TEMPLATE_DB_NAME, landlordSeq)
    ).rejects.toThrow('simulated failure on CREATE TABLE #2');

    const fkQueries = tenantSeq.queries.filter((q) => q.sql.startsWith('SET FOREIGN_KEY_CHECKS'));
    expect(fkQueries.map((q) => q.sql)).toEqual(['SET FOREIGN_KEY_CHECKS=0', 'SET FOREIGN_KEY_CHECKS=1']);
    // The restore ran on the exact same transaction token the disable used, not a fresh connection.
    expect(fkQueries[1].transaction).toBe(fkQueries[0].transaction);
    // Only the first CREATE TABLE actually completed before the failure -- the third never ran.
    const createQueries = tenantSeq.queries.filter((q) => q.sql.startsWith('CREATE TABLE'));
    expect(createQueries).toHaveLength(2);
});

test('RF-4: rejects a template DB name that does not match the matrix-generated shape', async () => {
    const tenantSeq = makeFakeTenantSeq();
    const landlordSeq = makeFakeLandlordSeq(['tenants_a']);

    await expect(
        cloneFromTemplateDatabase(tenantSeq, "evil`; DROP DATABASE x; --", landlordSeq)
    ).rejects.toThrow(/unexpected name shape/);
});
