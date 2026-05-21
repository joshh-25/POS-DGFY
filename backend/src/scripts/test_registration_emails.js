import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

async function testRegistrationEmails() {
    const emailService = await import('../services/emailService.js');

    console.log('--- TEST REGISTRATION EMAILS ---');

    // Parse arguments
    const args = process.argv.slice(2);
    const emailArg = args.find(a => a.startsWith('--email='));

    if (!emailArg) {
        console.error('❌ Error: Please provide an email address using --email=your@email.com');
        process.exit(1);
    }

    const email = emailArg.split('=')[1];

    console.log(`📧 Target Email: ${email}`);

    try {
        console.log('🚀 Sending Approval Email...');
        await emailService.sendCompanyApprovedEmail({
            email,
            companyName: 'Test Company (Approved)',
            companyToken: 'TEST-TOKEN-123'
        });
        console.log('✅ Approval Email sent.');

        console.log('🚀 Sending Rejection Email...');
        await emailService.sendCompanyRejectedEmail({
            email,
            companyName: 'Test Company (Rejected)',
            rejectionReason: 'This is a test rejection reason.'
        });
        console.log('✅ Rejection Email sent.');

        console.log('\n✨ SUCCESS: Both emails sent! Check your inbox.');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ FAILED:', error.message);
        process.exit(1);
    }
}

testRegistrationEmails();
