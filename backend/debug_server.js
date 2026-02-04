
import express from 'express';
// import { validateRegister } from './src/validators/authValidator.js';
import { tenantHandler } from './src/middleware/tenantHandler.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());

app.use(tenantHandler);

app.post('/manual/register', (req, res) => {
    console.log('Manual register reached');
    // console.log('Body:', req.body); // Let's log body
    res.json({ success: true });
});

app.use((err, req, res, next) => {
    console.error('ERROR HANDLER CAUGHT:', err);
    res.status(500).json({ error: err.message });
});

app.listen(5006, () => {
    console.log('Debug server running on 5006');
});
