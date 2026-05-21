/**
 * Connection Pool & Memory Verification Script
 * Tests: Pool handling, memory leaks, concurrent tenant switches
 */

import tenantConnector from '../src/utils/tenantConnector.js';
import db from '../src/models/index.js';
import dotenv from 'dotenv';
dotenv.config();

async function verifyConnectionPool() {
    console.log('=== Connection Pool Verification ===\n');

    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`Initial Memory: ${initialMemory.toFixed(2)} MB`);

    // Get tenant records from Landlord DB
    const Tenant = db.Tenant;
    const tenantA = await Tenant.findOne({ where: { company_token: 'token-tenant-a' } });
    const tenantB = await Tenant.findOne({ where: { company_token: 'token-tenant-b' } });

    if (!tenantA || !tenantB) {
        console.log('❌ FAIL: Could not find test tenants in Landlord DB');
        process.exit(1);
    }

    // Test 1: Get connections for both tenants
    console.log('\n--- Test 1: Multi-Tenant Connection ---');
    const connA = await tenantConnector.getConnection(tenantA);
    const connB = await tenantConnector.getConnection(tenantB);

    console.log(`✓ Tenant A connection: ${connA.config.database}`);
    console.log(`✓ Tenant B connection: ${connB.config.database}`);

    // Test 2: Verify they are different connections
    console.log('\n--- Test 2: Connection Isolation ---');
    if (connA.config.database !== connB.config.database) {
        console.log('✓ PASS: Connections are isolated');
    } else {
        console.log('❌ FAIL: Connections are NOT isolated');
        process.exit(1);
    }

    // Test 3: Multiple rapid switches (stress test)
    console.log('\n--- Test 3: Rapid Context Switching (50 cycles) ---');
    for (let i = 0; i < 50; i++) {
        await tenantConnector.getConnection(tenantA);
        await tenantConnector.getConnection(tenantB);
    }
    console.log('✓ PASS: Survived 50 rapid switches');

    // Test 4: Check memory after stress
    const postMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    const memoryGrowth = postMemory - initialMemory;
    console.log(`\n--- Test 4: Memory Check ---`);
    console.log(`Post-Test Memory: ${postMemory.toFixed(2)} MB`);
    console.log(`Memory Growth: ${memoryGrowth.toFixed(2)} MB`);

    if (memoryGrowth < 50) { // Less than 50MB growth is acceptable
        console.log('✓ PASS: Memory usage is within acceptable limits');
    } else {
        console.log('⚠️ WARNING: Memory growth exceeds 50MB - potential leak');
    }

    // Test 5: Pool statistics
    console.log('\n--- Test 5: Active Connections ---');
    console.log(`Active Pools: ${tenantConnector.connections.size}`);

    console.log('\n=== Connection Pool Verification: COMPLETE ===');
    process.exit(0);
}

verifyConnectionPool().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
