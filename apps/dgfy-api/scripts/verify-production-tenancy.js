
/**
 * Production Verification Script for Nested Tenancy
 * Targets the live production server to ensure isolation and validation logic.
 */

import axios from 'axios';

const BASE_URL = 'https://skupervisor.surebizcorp.com/api/v1';
const ENDPOINT = '/items/validate-composition';

const log = (actor, message, isError = false) => {
    const color = actor === 'Tenant A' ? '\x1b[36m' : actor === 'Tenant B' ? '\x1b[35m' : '\x1b[33m';
    const reset = '\x1b[0m';
    console.log(`${color}[${actor}]${reset} ${message}`);
    if (isError) console.error(message);
};

async function simulateRequest(tenantToken, productId, ingredientIds) {
    try {
        log(tenantToken === 'TOKEN_A' ? 'Tenant A' : 'Tenant B', `Validating: Product ${productId} -> Ingredients [${ingredientIds}]`);

        const response = await axios.post(
            `${BASE_URL}${ENDPOINT}`,
            {
                product_id: productId,
                ingredient_ids: ingredientIds
            },
            {
                headers: {
                    'Authorization': `Bearer ${tenantToken}`, // Assuming standard Bearer token
                    'x-company-token': tenantToken // Some parts of the system might use this
                }
            }
        );

        const data = response.data;
        const nestingLevel = data.data?.nestingLevel;

        log(tenantToken === 'TOKEN_A' ? 'Tenant A' : 'Tenant B', `Result: Success (Level ${nestingLevel})`);
        return data;

    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        log(tenantToken === 'TOKEN_A' ? 'Tenant A' : 'Tenant B', `Result: Error - ${errorMsg}`, true);
        return error.response?.data;
    }
}

async function runProductionTest() {
    console.log('\n🚀 Starting PRODUCTION MULTI-TENANT VERIFICATION 🚀');
    console.log(`Target: ${BASE_URL}\n`);

    // NOTE: You need to replace these with valid production tokens for a meaningful test
    const tokenA = 'YOUR_PROD_TOKEN_A';
    const tokenB = 'YOUR_PROD_TOKEN_B';

    if (tokenA === 'YOUR_PROD_TOKEN_A') {
        console.warn('⚠️  Warning: Using placeholder tokens. Please update the script with real tokens to test auth-protected routes.\n');
    }

    // 1. Request from Tenant A (Simulated)
    // We expect this to hit have its own Redis cache entry on the server
    await simulateRequest(tokenA, 100, [10, 11]);

    // 2. Request from Tenant B (Simulated)
    // We expect this to be isolated from Tenant A's cache
    await simulateRequest(tokenB, 200, [20, 21]);

    console.log('\n✅ Verification requests attempt complete.');
    console.log('Check production logs to confirm Redis keys are scoped by tenant ID.');
}

runProductionTest();
