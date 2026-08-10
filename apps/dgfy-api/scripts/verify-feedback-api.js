import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        // 3. Verify Log File
        console.log('📂 Verifying log file content...');
        const logPath = path.join(__dirname, '../logs/user_feedback.log');

        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            if (content.includes('Test feedback logic via automated script')) {
                console.log('✅ Log file contains the test entry');
            } else {
                console.error('❌ Log file found but test entry is missing');
                console.log('Content:', content);
            }
        } else {
            console.error('❌ Log file not found at:', logPath);
        }

    } catch (error) {
        console.error('❌ Verification Failed:', error.response ? error.response.data : error.message);
        process.exit(1);
    }
}

verifyFeedback();
