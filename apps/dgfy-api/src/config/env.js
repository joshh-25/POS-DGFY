import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

export const PORT = Number.parseInt(process.env.PORT || '5100', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const DGFY_BACKEND_BASE_URL = (
    process.env.DGFY_BACKEND_BASE_URL
    || (NODE_ENV === 'production' ? 'http://backend:5000' : 'http://localhost:5000')
).replace(/\/+$/, '');
