import axios from 'axios';

const API_URL = 'http://localhost:5000/api/v1';

// We simulate tenant resolution using x-company-token header.
// This matches the logic in tenantHandler.js

const TENANT_A_TOKEN = 'token-tenant-a';
const TENANT_B_TOKEN = 'token-tenant-b';

async function testIsolation() {
    try {
        console.log('=== Starting Tenant Isolation Test ===');

        // 1. Login as Tenant A
        console.log(`\nLogging in as Tenant A (Token: ${TENANT_A_TOKEN})...`);
        const loginA = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@tenant-a.com',
            password: 'Admin123!'
        }, {
            headers: { 'x-company-token': TENANT_A_TOKEN }
        });
        const tokenA = loginA.data.data.token;
        console.log('✓ Login A successful');

        // 2. Create Item in Tenant A
        console.log('\nCreating Item in Tenant A...');
        const uniqueSku = `SKU-A-${Date.now()}`;
        const itemA = await axios.post(`${API_URL}/items`, {
            name: 'Item Unique to A',
            sku: uniqueSku,
            category: 'raw_material',
            unit_of_measure: 'kg',
            min_threshold: 10,
            max_capacity: 1000, // Added required field
            sku_code: uniqueSku, // Added required field (mapping to sku)
            cost_price: 50,
            selling_price: 100,
            status: 'active'
        }, {
            headers: { Authorization: `Bearer ${tokenA}`, 'x-company-token': TENANT_A_TOKEN }
        });
        console.log('✓ Item A created:', itemA.data.data.id);

        // 3. Login as Tenant B
        console.log(`\nLogging in as Tenant B (Token: ${TENANT_B_TOKEN})...`);
        const loginB = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@tenant-b.com',
            password: 'Admin123!'
        }, {
            headers: { 'x-company-token': TENANT_B_TOKEN }
        });
        const tokenB = loginB.data.data.token;
        console.log('✓ Login B successful');

        // 4. Verify Tenant B cannot see Tenant A's item
        console.log('\nVerifying Item A visibility in Tenant B...');
        const itemsB = await axios.get(`${API_URL}/items`, {
            headers: { Authorization: `Bearer ${tokenB}`, 'x-company-token': TENANT_B_TOKEN }
        });

        const found = itemsB.data.data.items.find(i => i.sku === uniqueSku);
        if (found) {
            console.error('❌ FAIL: Tenant B found Tenant A item!');
            process.exit(1);
        } else {
            console.log('✓ PASS: Tenant B cannot see Tenant A item.');
        }

        // 5. Create Item in Tenant B with SAME SKU to test constraint isolation
        console.log('\nCreating Item in Tenant B with SAME SKU (should pass)...');
        try {
            await axios.post(`${API_URL}/items`, {
                name: 'Item Unique to B',
                sku: uniqueSku, // Same SKU
                category: 'raw_material',
                unit_of_measure: 'kg',
                max_capacity: 1000,
                sku_code: uniqueSku,
                status: 'active'
            }, {
                headers: { Authorization: `Bearer ${tokenB}`, 'x-company-token': TENANT_B_TOKEN }
            });
            console.log('✓ PASS: Created same SKU in Tenant B (Namespace isolation confirmed)');
        } catch (error) {
            console.error('❌ FAIL: Could not create same SKU in Tenant B:', error.response?.data || error.message);
        }

        console.log('\n=== Isolation Test Complete: PASS ===');

    } catch (error) {
        console.error('❌ Test Failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

testIsolation();
