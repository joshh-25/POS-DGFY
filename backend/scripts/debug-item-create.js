
const BASE_URL = 'http://localhost:5000/api/v1';
const TENANT_TOKEN = 'token-tenant-a';
let AUTH_TOKEN = '';

async function run() {
    try {
        // 1. Login
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-company-token': TENANT_TOKEN },
            body: JSON.stringify({ email: 'admin@tenant-a.com', password: 'Admin123!' })
        }).then(r => r.json());

        AUTH_TOKEN = loginRes.data.token;
        console.log('Login Token:', AUTH_TOKEN ? 'OK' : 'FAIL');

        // 2. Create Item payload
        const payload = {
            name: `DebugItem-${Date.now()}`,
            sku_code: `DBG-${Date.now()}`,
            unit_of_measure: 'kg',
            category: 'raw_material',
            current_stock: 100,
            cost_per_unit: 2,
            min_stock_level: 10,
            is_active: true,
            // Optional fields that might be causing issues if missing or wrong type?
            max_capacity: 1000 // Required by schema?
        };

        // Check schema requirements:
        // max_capacity: Joi.number().positive().required()  <-- THIS IS REQUIRED!

        console.log('Sending Payload:', JSON.stringify(payload, null, 2));

        const res = await fetch(`${BASE_URL}/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-company-token': TENANT_TOKEN,
                'Authorization': `Bearer ${AUTH_TOKEN}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log('Response:', JSON.stringify(data, null, 2));

    } catch (err) {
        console.error(err);
    }
}

run();
