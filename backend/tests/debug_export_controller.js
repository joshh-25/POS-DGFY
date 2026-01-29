
import { exportSuppliers } from '../src/controllers/supplierCSVController.js';
import * as supplierCSVService from '../src/services/supplierCSVService.js';

// Mock Service
supplierCSVService.exportSuppliers = async (filters) => {
    console.log('--- Service Received Filters ---');
    console.log(filters);
    return { success: true, csvContent: 'mock,csv', count: 0 };
};

// Mock Req/Res
const req = {
    query: {
        ids: '1,2',
        status: 'active'
    }
};

const res = {
    setHeader: (k, v) => console.log(`Set Header: ${k}=${v}`),
    send: (content) => console.log('Sent Content:', content),
    status: (code) => {
        console.log('Status:', code);
        return { json: (j) => console.log('JSON:', j) };
    }
};

async function test() {
    console.log('--- Testing Controller with ids="1,2" ---');
    await exportSuppliers(req, res);
}

test();
