import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const appStyles = fs.readFileSync(path.resolve(webCoreRoot, 'src/index.css'), 'utf8');

describe('POS transaction history toolbar responsive styles', () => {
    it('stacks phone controls and keeps tablet portrait controls in one row', () => {
        const phoneToolbarStyles = appStyles.match(
            /\/\* Keep primary search\/actions[\s\S]*?\[data-testid="pos-history-toolbar"\] \{([^}]+)\}/
        )?.[1] || '';
        const tabletPortraitToolbarStyles = appStyles.match(
            /\/\* Tablet portrait inherits the phone history surface\.[\s\S]*?\[data-testid="pos-history-toolbar"\] \{([^}]+)\}/
        )?.[1] || '';

        expect(phoneToolbarStyles).toContain('flex-direction: column;');
        expect(phoneToolbarStyles).not.toContain('flex-direction: row;');
        expect(tabletPortraitToolbarStyles).toContain('flex-direction: row;');
    });
});
