import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS edit-item "Generate Image (AI)" entry point', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');

    it('imports the shared generate-image service call used by SKUpervisor (#199/#200)', () => {
        expect(workspace).toContain('generateStorefrontCatalogImage');
        expect(workspace).toMatch(/from '@\/services\/storefrontCatalogService\.js'/);
    });

    it('handleGenerateEditImage calls the service and never claims the photo already exists', () => {
        const handlerStart = workspace.indexOf('const handleGenerateEditImage = async (item) => {');
        expect(handlerStart).toBeGreaterThan(-1);
        const handlerEnd = workspace.indexOf('\n  };', handlerStart);
        const handler = workspace.slice(handlerStart, handlerEnd);

        expect(handler).toContain('await generateStorefrontCatalogImage(itemId);');
        // Generation is async (a worker picks it up later) -- the success
        // toast must say "queued", not imply the image is already there.
        expect(handler).toMatch(/toast\.success\(`Image generation queued/);
        expect(handler).toContain('setGeneratingEditImage(true)');
        expect(handler).toContain('setGeneratingEditImage(false)');
    });

    it('the button is gated on canEditItems and disabled while a save/upload/generation is in flight', () => {
        const buttonStart = workspace.indexOf('onClick={() => handleGenerateEditImage(activeEditItem)}');
        expect(buttonStart).toBeGreaterThan(-1);
        const buttonEnd = workspace.indexOf('</Button>', buttonStart);
        const surrounding = workspace.slice(buttonStart - 400, buttonEnd);

        expect(surrounding).toContain('canEditItems &&');
        expect(surrounding).toContain('disabled={savingItem || persistingEditAssets || generatingEditImage}');
        expect(surrounding).toContain("'Regenerate Image (AI)' : 'Generate Image (AI)'");
        expect(surrounding).toContain("'Queuing…'");
    });

    it('resets generatingEditImage when the edit modal closes', () => {
        const closeStart = workspace.indexOf('const closeEdit = ({ force = false } = {}) => {');
        const closeEnd = workspace.indexOf('\n  };', closeStart);
        const closeHandler = workspace.slice(closeStart, closeEnd);

        expect(closeHandler).toContain('setGeneratingEditImage(false);');
    });
});
