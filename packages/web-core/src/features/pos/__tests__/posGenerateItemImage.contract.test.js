import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS edit-item "Generate Image (AI)" entry point', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const handlerStart = workspace.indexOf('const handleGenerateEditImage = async (item) => {');
    const handlerEnd = workspace.indexOf('\n  };', handlerStart);
    const handler = workspace.slice(handlerStart, handlerEnd);

    it('imports the shared generate-image service call used by SKUpervisor (#199/#200)', () => {
        expect(workspace).toContain('generateStorefrontCatalogImage');
        expect(workspace).toMatch(/from '@\/services\/storefrontCatalogService\.js'/);
    });

    it('imports and uses the item-image generation status poll hook', () => {
        expect(workspace).toContain("import { useItemImageGenerationPoll } from '../hooks/useItemImageGenerationPoll.js';");
        expect(workspace).toContain('const { pollItemImageGeneration, cancel: cancelImageGenerationPoll } = useItemImageGenerationPoll();');
    });

    it('handleGenerateEditImage queues, then polls, before ever claiming the photo exists', () => {
        expect(handlerStart).toBeGreaterThan(-1);
        expect(handler).toContain('await generateStorefrontCatalogImage(itemId);');
        expect(handler).toContain('const result = await pollItemImageGeneration(itemId);');
        // The old "queued" toast fired immediately and told the operator
        // nothing further -- it must be gone in favor of a real outcome.
        expect(handler).not.toMatch(/toast\.success\(`Image generation queued/);
    });

    it('reports a real success only once the poll resolves completed, refreshing the catalog', () => {
        const completedBranchStart = handler.indexOf("result.status === 'completed'");
        expect(completedBranchStart).toBeGreaterThan(-1);
        const completedBranch = handler.slice(completedBranchStart, handler.indexOf("} else if", completedBranchStart));

        expect(completedBranch).toContain('await loadItems();');
        expect(completedBranch).toContain('notifyPosCatalogUpdated();');
        expect(completedBranch).toMatch(/toast\.success\(`Image generated for/);
    });

    it('reports a real failure with the worker\'s own error message, not silence', () => {
        expect(handler).toContain("result.status === 'failed'");
        expect(handler).toMatch(/toast\.error\(`Image generation failed for/);
        expect(handler).toContain('result.error_message');
    });

    it('treats a cancelled poll (modal closed mid-flight) as silent -- no toast for an item no longer in view', () => {
        expect(handler).toContain("result.status === 'cancelled'");
        const cancelledLine = handler.split('\n').find((line) => line.includes("'cancelled'"));
        expect(cancelledLine).toMatch(/return;/);
    });

    it('button label reflects queuing vs. generating vs. idle, and is disabled through both in-flight states', () => {
        const buttonStart = workspace.indexOf('onClick={() => handleGenerateEditImage(activeEditItem)}');
        expect(buttonStart).toBeGreaterThan(-1);
        const buttonEnd = workspace.indexOf('</Button>', buttonStart);
        const surrounding = workspace.slice(buttonStart - 400, buttonEnd);

        expect(surrounding).toContain('canEditItems &&');
        expect(surrounding).toContain('disabled={savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh || generatingEditImage || pollingEditImage}');
        expect(surrounding).toContain("'Regenerate Image (AI)' : 'Generate Image (AI)'");
        expect(surrounding).toContain("'Queuing…'");
        expect(surrounding).toContain("'Generating…'");
    });

    it('closeEdit cancels an in-flight poll and blocks closing while generating/polling, resetting both flags', () => {
        const closeStart = workspace.indexOf('const closeEdit = ({ force = false } = {}) => {');
        const closeEnd = workspace.indexOf('\n  };', closeStart);
        const closeHandler = workspace.slice(closeStart, closeEnd);

        expect(closeHandler).toContain('generatingEditImage || pollingEditImage');
        expect(closeHandler).toContain('cancelImageGenerationPoll();');
        expect(closeHandler).toContain('setGeneratingEditImage(false);');
        expect(closeHandler).toContain('setPollingEditImage(false);');
    });
});
