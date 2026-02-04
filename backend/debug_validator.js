
import { validateRegister } from './src/validators/authValidator.js';

console.log('Test starting...');
try {
    const req = {
        body: {
            username: 'testuser116',
            email: 'testuser116@bblabs.it',
            password: 'Password123!'
        }
    };
    const res = {
        status: (code) => ({
            json: (data) => console.log('Response:', code, data)
        })
    };
    const next = (err) => {
        if (err) console.error('Next error:', err);
        else console.log('Next called (Success)');
    };

    validateRegister(req, res, next);
} catch (e) {
    console.error('CRASH:', e);
    console.error(e.stack);
}
