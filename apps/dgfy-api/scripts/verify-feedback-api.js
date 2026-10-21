import axios from 'axios';

const API_URL = 'http://localhost:5000/api/v1';

async function verifyFeedback() {
    console.log('🧪 Starting Feedback API Verification...');

    try {
        // 1. Login
        console.log('🔑 Logging in as admin...');
        const loginResponse = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@test.com',
            password: 'Admin123!'
        });

        const token = loginResponse.data.data.token;
        if (!token) throw new Error('No token received');
        console.log('✅ Login successful');

        // 2. Submit Feedback
        console.log('📝 Submitting test feedback...');
        const feedbackData = {
            type: 'bug',
            description: 'Test feedback logic via automated script',
            url: 'http://localhost:5173/test',
            context: {
                userAgent: 'Node.js Test Script',
                timestamp: new Date().toISOString()
            }
        };

        const feedbackResponse = await axios.post(`${API_URL}/feedback`, feedbackData, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (feedbackResponse.status === 201) {
            console.log('✅ Feedback submitted successfully (201 Created)');
        } else {
            throw new Error(`Unexpected status code: ${feedbackResponse.status}`);
        }

        // 3. Verify durable row by the ID returned by the API.
        const { FeedbackSubmission, sequelize } = await import('../src/models/index.js');
        try {
            const row = await FeedbackSubmission.findByPk(feedbackResponse.data.id);
            if (!row || row.description !== feedbackData.description) {
                throw new Error('Feedback row missing from landlord database');
            }
            console.log('✅ Feedback row persisted with stable ID');
        } finally {
            await sequelize.close();
        }

    } catch (error) {
        console.error('❌ Verification Failed:', error.response ? error.response.data : error.message);
        process.exit(1);
    }
}

verifyFeedback();
