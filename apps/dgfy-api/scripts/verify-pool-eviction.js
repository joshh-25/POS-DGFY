/**
 * Connection Pool Eviction Verification Script
 * Tests the fixes for issue 2.2: Connection pool eviction insufficient for high load
 *
 * Validates:
 *   1. Concurrent connection requests don't exceed MAX_CACHED_CONNECTIONS
 *   2. Batch eviction works when pool is full
 *   3. Periodic idle cleanup closes stale connections
 *   4. pendingConnections guard prevents duplicate creation for same tenant
 *   5. getPoolStats() returns correct data
 *
 * Usage: node --experimental-vm-modules scripts/verify-pool-eviction.js
 */

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

import tenantConnector from '../src/utils/TenantConnector.js';
import db from '../src/models/index.js';

const MAX_CACHED = 20; // Must match TenantConnector's MAX_CACHED_CONNECTIONS

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✓ PASS: ${testName}`);
        passed++;
    } else {
        console.log(`  ✗ FAIL: ${testName}`);
        failed++;
    }
}

async function run() {
    console.log('=== Connection Pool Eviction Verification ===\n');

    // Get all available tenants, then filter to those with actual databases
    const allTenants = await db.Tenant.findAll({ order: [['id', 'ASC']] });
    console.log(`Found ${allTenants.length} tenants in landlord DB`);

    // Probe each tenant to find those with real databases
    const tenants = [];
    for (const t of allTenants) {
        try {
            const conn = await tenantConnector.getConnection(t);
            tenants.push(t);
        } catch (err) {
            // Skip tenants whose databases don't exist
        }
    }
    // Close all so tests start fresh
    await tenantConnector.closeAll();
    console.log(`${tenants.length} tenants have valid databases\n`);

    if (tenants.length < 2) {
        console.log('Need at least 2 tenants with valid databases to run these tests. Exiting.');
        process.exit(1);
    }

    // ────────────────────────────────────────────────────
    // Test 1: getPoolStats() works and starts empty
    // ────────────────────────────────────────────────────
    console.log('--- Test 1: Pool starts empty ---');
    const initialStats = tenantConnector.getPoolStats();
    assert(initialStats.total === 0, 'Pool starts with 0 connections');
    assert(initialStats.pending === 0, 'No pending connections initially');
    assert(initialStats.capacity === MAX_CACHED, `Capacity is ${MAX_CACHED}`);
    assert(initialStats.utilizationPercent === 0, 'Utilization is 0%');

    // ────────────────────────────────────────────────────
    // Test 2: Concurrent requests for the SAME tenant
    //         should not create duplicates
    // ────────────────────────────────────────────────────
    console.log('\n--- Test 2: Concurrent requests for same tenant ---');
    const tenant0 = tenants[0];
    const concurrentSame = Array(5).fill(null).map(() =>
        tenantConnector.getConnection(tenant0)
    );
    const results = await Promise.all(concurrentSame);

    // All should return the exact same Sequelize instance
    const allSameInstance = results.every(r => r === results[0]);
    assert(allSameInstance, 'All concurrent requests got the same Sequelize instance');
    assert(tenantConnector.connections.size === 1, 'Only 1 connection was created');

    // ────────────────────────────────────────────────────
    // Test 3: Sequential connections up to pool limit
    // ────────────────────────────────────────────────────
    console.log('\n--- Test 3: Fill pool to capacity ---');
    const tenantsToUse = tenants.slice(0, Math.min(tenants.length, MAX_CACHED));

    for (const t of tenantsToUse) {
        await tenantConnector.getConnection(t);
    }

    const filledStats = tenantConnector.getPoolStats();
    console.log(`  Pool: ${filledStats.total}/${filledStats.capacity}`);
    assert(filledStats.total === tenantsToUse.length, `Pool has ${tenantsToUse.length} connections`);
    assert(filledStats.total <= MAX_CACHED, 'Pool does not exceed MAX_CACHED_CONNECTIONS');

    // ────────────────────────────────────────────────────
    // Test 4: Adding beyond capacity triggers eviction
    // ────────────────────────────────────────────────────
    if (tenants.length > MAX_CACHED) {
        console.log('\n--- Test 4: Eviction when exceeding capacity ---');
        const extraTenant = tenants[MAX_CACHED];
        await tenantConnector.getConnection(extraTenant);

        const afterEvict = tenantConnector.getPoolStats();
        console.log(`  Pool after adding extra: ${afterEvict.total}/${afterEvict.capacity}`);
        assert(afterEvict.total <= MAX_CACHED, 'Pool did not exceed MAX_CACHED after eviction');
    } else {
        console.log('\n--- Test 4: SKIPPED (need >' + MAX_CACHED + ' tenants to test eviction) ---');
    }

    // ────────────────────────────────────────────────────
    // Test 5: Concurrent requests for DIFFERENT tenants
    //         should still respect the pool limit
    // ────────────────────────────────────────────────────
    console.log('\n--- Test 5: Concurrent requests for different tenants ---');
    // Close everything first to start fresh
    await tenantConnector.closeAll();
    assert(tenantConnector.getPoolStats().total === 0, 'Pool cleared for concurrent test');

    const concurrentDifferent = tenants
        .slice(0, Math.min(tenants.length, MAX_CACHED + 5))
        .map(t => tenantConnector.getConnection(t));

    await Promise.allSettled(concurrentDifferent);

    const concurrentStats = tenantConnector.getPoolStats();
    console.log(`  Pool after concurrent burst: ${concurrentStats.total}/${concurrentStats.capacity}`);
    assert(
        concurrentStats.total <= MAX_CACHED,
        `Concurrent burst kept pool within limit (${concurrentStats.total} <= ${MAX_CACHED})`
    );

    // ────────────────────────────────────────────────────
    // Test 6: Idle cleanup works
    // ────────────────────────────────────────────────────
    console.log('\n--- Test 6: Idle cleanup (simulated) ---');
    // Manually backdate lastUsed to simulate idle connections
    const connectionsBefore = tenantConnector.connections.size;
    let backdated = 0;
    for (const [, data] of tenantConnector.connections.entries()) {
        data.lastUsed = Date.now() - (11 * 60 * 1000); // 11 minutes ago
        backdated++;
        if (backdated >= 3) break; // Only backdate 3 connections
    }
    console.log(`  Backdated ${backdated} connections to 11 minutes ago`);

    await tenantConnector.cleanupIdleConnections();

    const afterCleanup = tenantConnector.getPoolStats();
    console.log(`  Pool after cleanup: ${afterCleanup.total}/${afterCleanup.capacity}`);
    assert(
        afterCleanup.total === connectionsBefore - backdated,
        `Cleanup removed ${backdated} idle connections`
    );

    // ────────────────────────────────────────────────────
    // Test 7: closeAll() cleans everything
    // ────────────────────────────────────────────────────
    console.log('\n--- Test 7: closeAll() ---');
    await tenantConnector.closeAll();
    const finalStats = tenantConnector.getPoolStats();
    assert(finalStats.total === 0, 'closeAll() removed all connections');
    assert(finalStats.pending === 0, 'No pending connections after closeAll');

    // ────────────────────────────────────────────────────
    // Summary
    // ────────────────────────────────────────────────────
    console.log('\n========================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('========================================');

    // Cleanup
    try { await db.sequelize.close(); } catch (_) {}

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Verification script failed:', err);
    process.exit(1);
});
