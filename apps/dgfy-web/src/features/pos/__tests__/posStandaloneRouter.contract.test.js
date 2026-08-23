import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const standalonePosMainPath = path.resolve(__dirname, '../../../../apps/pos/src/main.jsx');

describe('standalone POS router compatibility contract', () => {
    it('opts the active HashRouter into the React Router v7 compatibility flags', () => {
        const source = fs.readFileSync(standalonePosMainPath, 'utf8');

        expect(source).toContain('<HashRouter');
        expect(source).toContain('v7_startTransition: true');
        expect(source).toContain('v7_relativeSplatPath: true');
    });
});
