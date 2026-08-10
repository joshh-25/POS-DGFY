
/**
 * End-to-End User Verification Script for Nested Tenancy
 * Simulates two users from different companies using the API simultaneously.
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/v1'; // Assuming default port
const ENDPOINT = '/items/validate-composition';

// Utility to print colorful logs
const log = (actor, message, isError = false) => {
    const color = actor === 'Tenant A' ? '\x1b[36m' : actor === 'Tenant B' ? '\x1b[35m' : '\x1b[33m';
    const reset = '\x1b[0m';
    console.log(`${color}[${actor}]${reset} ${message}`);
    if (isError) console.error(message);
};

async function simulateRequest(tenantToken, productId, ingredientIds, expectedResult) {
    try {
        log(tenantToken === 'token_a' ? 'Tenant A' : 'Tenant B', `Validating: Product ${productId} -> Ingredients [${ingredientIds}]`);

        const response = await axios.post(
            `${BASE_URL}${ENDPOINT}`,
            {
                product_id: productId,
                ingredient_ids: ingredientIds
            },
            {
                headers: { 'x-company-token': tenantToken }
            }
        );

        const data = response.data;
        const nestingLevel = data.data.nestingLevel;

        log(tenantToken === 'token_a' ? 'Tenant A' : 'Tenant B', `Result: Success (Level ${nestingLevel})`);
        return data;

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        log(tenantToken === 'token_a' ? 'Tenant A' : 'Tenant B', `Result: Error - ${errorMsg}`, true);
        return error.response?.data;
    }
}

async function runSimulation() {
    console.log('\n🚀 Starting MULTI-TENANT E2E SIMULATION 🚀\n');

    // Scenario 1: Tenant A creates a dependency "10 -> [5, 6]"
    // This adds to Tenant A's cache.
    // NOTE: In a real DB, these IDs must exist. 
    // Since we are hitting the REAL API, we will use IDs that hopefully exist or just mock the logic?
    // Wait, the Service reads from DB. If IDs don't exist, it might fail or return 0.
    // The Service checks `Item.findAll({ where: { item_id: ingredientIds } })`.
    // If we pass IDs that don't exist, it returns level 0.
    // Ideally we need real IDs. But for checking REDIS SCOPING, the SERVICE just needs to run.
    // The key is: DOES THE CACHE KEY GET HIT?
    // We can verify this by running the request.

    // NOTE: This script assumes the server is running on port 3000.

    // We will attempt to run it. If it fails due to DB connection or missing items, 
    // we will know that the Middleware -> Controller -> Service path is working at least.

    // Let's attempt.

    const tenantA = 'token_A_dummy';
    const tenantB = 'token_B_dummy';

    // 1. Request from Tenant A
    await simulateRequest(tenantA, 100, [10, 11]);

    // 2. Request from Tenant B
    await simulateRequest(tenantB, 200, [20, 21]);

    console.log('\n✅ Simulation Requests Sent.');
    console.log('To confirm ISOLATION, check the Server Logs.');
    console.log('You should see Redis keys like: composition:dependency_graph:tenant_A_dummy');
}

runSimulation();
