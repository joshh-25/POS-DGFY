import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');
const workspace = fs.readFileSync(workspacePath, 'utf8');

describe('POS batch menu import entry point', () => {
    it('reads the batch flag independently of the single-file PDF import flag', () => {
        expect(workspace).toContain("import { isMenuImportBatchEnabled } from '@/services/menuImportService.js';");
        expect(workspace).toContain('const menuImportBatchEnabled = isMenuImportBatchEnabled();');
        expect(workspace).toContain('const pdfMenuImportEnabled = isPdfMenuImportEnabled();');
        expect(workspace).toContain('const menuImportEntryEnabled = pdfMenuImportEnabled || menuImportBatchEnabled;');
    });

    it('keeps the import entry point behind the same item-create permission gate as Add Item', () => {
        expect(workspace).toContain('{canCreateItems && menuImportEntryEnabled ? (');
        // Desktop and mobile toolbars both render the entry button.
        expect(workspace.match(/\{canCreateItems && menuImportEntryEnabled \? \(/g)).toHaveLength(2);
        expect(workspace).toContain('{menuImportButtonLabel}');
    });

    it('renders the batch wizard in place of the single-file wizard when the batch flag is on', () => {
        expect(workspace).toContain("import MenuImportBatchModal from '@/Components/items/MenuImportBatchModal.jsx';");
        expect(workspace).toContain('{canCreateItems && menuImportBatchEnabled ? (\n        <MenuImportBatchModal');
        expect(workspace).toContain(') : canCreateItems && pdfMenuImportEnabled ? (\n        <PdfMenuImportModal');
    });
});
