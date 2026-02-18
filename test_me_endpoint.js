import axios from 'axios';

const testStandardUser = async () => {
    try {
        const loginResponse = await axios.post('http://localhost:5000/api/v1/auth/login', {
            email: 'testuser@sigmacorp.test',
            password: 'Admin123!'
        }, {
            headers: {
                'x-company-token': 'token-sigmacorp2-276c19d1'
            }
        });

        const { token } = loginResponse.data.data;
        console.log('Login successful');

        const meResponse = await axios.get('http://localhost:5000/api/v1/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-company-token': 'token-sigmacorp2-276c19d1'
            }
        });

        console.log('User Profile Permissions:', JSON.stringify(meResponse.data.data.permissions, null, 2));
        console.log('User Profile Type:', typeof meResponse.data.data.permissions);
        console.log('Is Array:', Array.isArray(meResponse.data.data.permissions));

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
};

testStandardUser();
