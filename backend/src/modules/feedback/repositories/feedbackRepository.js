import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, '../../../../logs/user_feedback.log');

export const feedbackRepository = {
  async append(entry) {
    const logLine = `${JSON.stringify(entry)}\n`;
    await fs.appendFile(LOG_FILE, logLine);
  }
};
