import axios from 'axios';

const testLogin = async () => {
    const url = 'http://localhost:5000/api/v1/auth/login';
    const payload = {
        email: 'admin@sigmacorp.test',
        password: 'Password123!'
    };
    const headers = {
        'Content-Type': 'application/json',
        'x-company-token': 'token-sigmacorp2-276c19d1'
    };

    console.log(`Sending POST to ${url}`);
    console.log('Headers:', headers);
    console.log('Payload:', payload);

    try {
        const response = await axios.post(url, payload, { headers });
        console.log('✅ Login Success:', response.data);
    } catch (error) {
        if (error.response) {
            console.error('❌ Login Failed:', error.response.status, error.response.statusText);
            console.error('Error Details:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('❌ Network/Other Error:', error.message);
        }
    }
};

testLogin();
