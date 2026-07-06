import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

export const PORT = Number.parseInt(process.env.PORT || '5100', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
