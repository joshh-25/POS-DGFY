
// Native fetch is available in Node 18+ global scope
// No import needed

const BASE_URL = 'http://localhost:5000/api/v1';
const TENANT_TOKEN = 'token-tenant-a';
let AUTH_TOKEN = '';

// Helper for API calls
async function api(method, endpoint, body = null) {
    const headers = {
        'Content-Type': 'application/json',
        'x-company-token': TENANT_TOKEN
    };
    if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error ${res.status} ${endpoint}: ${text}`);
    }
    return res.json();
}

async function run() {
    try {
        console.log('1. Logging in...');
        const loginRes = await api('POST', '/auth/login', {
            email: 'admin@tenant-a.com',
            password: 'Admin123!'
        });
        // FIX: Token is inside data object
        AUTH_TOKEN = loginRes.data.token;
        console.log('   Logged in successfully.');

        // 2. Create Ingredient Item (Stock in kg)
        const ingredientName = `Flour-${Date.now()}`;
        console.log(`2. Creating Ingredient: ${ingredientName} (kg)`);
        const ingredient = await api('POST', '/items', {
            name: ingredientName,
            sku_code: `ING-${Date.now()}`,
            unit_of_measure: 'kg',
            category: 'raw_material',
            current_stock: 100, // 100 kg
            cost_per_unit: 2,
            min_stock_level: 10,
            is_active: true,
            max_capacity: 1000 // REQUIRED
        });
        console.log(`   Ingredient ID: ${ingredient.data.item_id}`);
        const ingId = ingredient.data.item_id;

        // 3. Create Product (unit)
        const productName = `Bread-${Date.now()}`;
        console.log(`3. Creating Product: ${productName} (units)`);
        const product = await api('POST', '/items', {
            name: productName,
            sku_code: `PROD-${Date.now()}`,
            unit_of_measure: 'units',
            category: 'product',
            current_stock: 0,
            cost_per_unit: 10,
            min_stock_level: 0,
            is_active: true,
            product_type: 'finished_goods',
            max_capacity: 1000 // REQUIRED
        });
        console.log(`   Product ID: ${product.data.item_id}`);
        const prodId = product.data.item_id;

        // 4. Create Job Order (Draft)
        console.log('4. Creating Job Order (Draft)');
        // Recipe: 500g of Flour per Bread
        const jo = await api('POST', '/job-orders', {
            product_id: prodId,
            quantity_to_produce: 10, // 10 Breads
            status: 'draft',
            ingredients: [
                {
                    item_id: ingId,
                    quantity_required: 500, // 500 g PER UNIT
                    unit_of_measure: 'g' // RECIPE uses grams
                }
            ]
        });
        console.log('Creates JO Response:', JSON.stringify(jo, null, 2));
        console.log(`   JO ID: ${jo.data?.jo_id}`);
        const joId = jo.data?.jo_id;

        // 5. Finalize JO (Transition to In Progress)
        console.log('5. Finalizing JO (In Progress)');
        await api('PATCH', `/job-orders/${joId}/finalize`);

        // 6. Complete JO
        console.log('6. Completing JO');
        // We produce all 10.
        // Total required in grams: 500 * 10 = 5000g.
        // Expected consumption in kg: 5 kg.
        const completedJo = await api('POST', `/job-orders/${joId}/complete`, {
            quantityProduced: 10
        });

        // 7. Inspect Results
        console.log('7. Inspection Result:');
        console.log('Creates JO Response:', JSON.stringify(completedJo, null, 2));
        const consumedIng = completedJo.data.ingredients_consumed[0];

        console.log(`   Ingredient: ${consumedIng.item_name}`);
        console.log(`   Unit (Stock UOM): ${consumedIng.unit_of_measure}`);
        console.log(`   Quantity Required (Recipe UOM): ${consumedIng.quantity_required}`);
        console.log(`   Quantity Consumed (Stock UOM): ${consumedIng.quantity_consumed}`);

        const required = parseFloat(consumedIng.quantity_required); // 5000 (g)
        const consumed = parseFloat(consumedIng.quantity_consumed); // Expected 5 (kg) if fixed

        console.log(`   Required: ${required} (g)`);
        console.log(`   Consumed: ${consumed} (kg)`);

        const ratio = consumed / required;
        console.log(`   Ratio (Consumed/Required): ${ratio}`);

        if (Math.abs(ratio - 0.001) < 0.000001) {
            console.log('   [SUCCESS] Ratio is 0.001. 5000g correctly converted to 5kg.');
            console.log('   The usage of unit_of_measure column in JOIngredients is VERIFIED.');
        } else if (Math.abs(ratio - 1.0) < 0.000001) {
            console.log('   [FAILURE] Ratio is 1.0. 5000g treated as 5000kg (No Conversion).');
        } else {
            console.log(`   [UNKNOWN] Unexpected ratio: ${ratio}`);
        }

    } catch (err) {
        console.error('\nFAILED:', err.message);
        if (err.message.includes('API Error')) {
            try {
                const jsonPart = err.message.substring(err.message.indexOf('{'));
                const data = JSON.parse(jsonPart);
                console.error('SERVER ERROR DETAILS:', JSON.stringify(data, null, 2));
            } catch (e) {
                // ignore
            }
        }
    }
}

run();
