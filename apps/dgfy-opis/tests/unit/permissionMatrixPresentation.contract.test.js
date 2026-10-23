import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const permissionMatrix = fs.readFileSync(
    path.resolve(__dirname, '../../../../packages/web-core/Components/users/PermissionMatrix.jsx'),
    'utf8'
);

describe('Permission matrix presentation contract', () => {
    it('renders the POS button permission workspace without accordion-only controls', () => {
        expect(permissionMatrix).toContain("Search,");
        expect(permissionMatrix).toContain("ShoppingCart,");
        expect(permissionMatrix).toContain('Search buttons...');
        expect(permissionMatrix).toContain('aria-label="POS destinations and permission groups"');
        expect(permissionMatrix).toContain('Enable {activeButton.label} Button');
        expect(permissionMatrix).not.toContain('ChevronDown');
        expect(permissionMatrix).not.toContain('ChevronRight');
        expect(permissionMatrix).not.toContain('max-h-96');
    });

    it('renders accessible permission checkboxes and preserves the save contract', () => {
        expect(permissionMatrix).toContain('className="peer sr-only"');
        expect(permissionMatrix).toContain('Select All');
        expect(permissionMatrix).toContain('Grant Visible');
        expect(permissionMatrix).toContain('Revoke Visible');
        expect(permissionMatrix).toContain('rounded-full border-2');
        expect(permissionMatrix).toContain('peer-focus-visible:ring-2');
        expect(permissionMatrix).toContain('border-teal-600 bg-teal-600 text-white');
        expect(permissionMatrix).toContain('normalizePermissionSelections');
        expect(permissionMatrix).toContain('Existing function selections are preserved');
    });
});
