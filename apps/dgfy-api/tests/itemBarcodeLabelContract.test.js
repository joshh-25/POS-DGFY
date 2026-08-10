import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryPath = path.resolve(__dirname, '../src/modules/inventory/repositories/itemRepository.js');

describe('item barcode label contract', () => {
    const source = fs.readFileSync(repositoryPath, 'utf8');

    it('defines layout metadata for every supported browser-printable label type', () => {
        expect(source).toContain('const BARCODE_LABEL_LAYOUTS = Object.freeze({');
        for (const labelType of ['item', 'shelf', 'package', 'case', 'batch', 'service', 'ticket', 'booking']) {
            expect(source).toContain(`${labelType}: {`);
        }
        expect(source).toContain('width_mm');
        expect(source).toContain('height_mm');
        expect(source).toContain('primary_payload');
    });

    it('audits normalized label type and returns print contract layout intent', () => {
        expect(source).toContain('normalizeBarcodeLabelType(labelType)');
        expect(source).toContain("eventType: 'barcode.label_print_intent'");
        expect(source).toContain('layout_purpose: layout.purpose');
        expect(source).toContain('human_readable_type: layout.title');
        expect(source).toContain('layout,');
    });
});
