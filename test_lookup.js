import axios from 'axios';

async function testLookup() {
    try {
        const response = await axios.post('http://localhost:5001/api/v1/auth/lookup', {
            email: 'admin@test.com'
        });
        console.log('Lookup Response:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error('Lookup Error:', err.response?.status, err.response?.data || err.message);
    }
}

testLookup();
