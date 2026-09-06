import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS create-item image upload no longer races the post-create refetch (#1410 repair)', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const handlerStart = workspace.indexOf('const runPostCreateStages = async ({');
    const handlerEnd = workspace.indexOf('\n  };', handlerStart);
    const handler = workspace.slice(handlerStart, handlerEnd);

    it('imports the async-upload-status reader alongside the existing queue calls', () => {
        expect(workspace).toContain('getStorefrontCatalogImageUploadStatus');
        expect(workspace).toMatch(/from '@\/services\/storefrontCatalogService\.js'/);
    });

    it('reuses useItemImageGenerationPoll (parameterized by readStatus) instead of a second bespoke poller', () => {
        expect(workspace).toContain(
            "const { pollItemImageGeneration: pollCatalogImageUploadStatus } = useItemImageGenerationPoll(getStorefrontCatalogImageUploadStatus, CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS);"
        );
    });

    it('RF-2: bounds the create-item poll to its own shorter timeout instead of inheriting the AI-generation path\'s 90s default', () => {
        expect(workspace).toContain('const CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS = 15 * 1000;');
        // The other useItemImageGenerationPoll instantiation (handleGenerateEditImage's path)
        // must keep the hook's own default -- only the create-item call site gets the shorter one.
        expect(workspace).toContain('const { pollItemImageGeneration, cancel: cancelImageGenerationPoll } = useItemImageGenerationPoll();');
    });

    it('runPostCreateStages queues the image, then polls the upload status before returning', () => {
        expect(handlerStart).toBeGreaterThan(-1);
        expect(handler).toContain('queueStorefrontCatalogImage(itemId, imageFiles[0])');
        expect(handler).toContain('queueStorefrontCatalogImages(itemId, imageFiles)');
        expect(handler).toContain('const uploadStatus = await pollCatalogImageUploadStatus(itemId);');

        // The poll must run after the queue call, not before -- otherwise
        // there's nothing to poll for yet.
        const queueIndex = handler.indexOf('queuedImageUpload');
        const pollIndex = handler.indexOf('pollCatalogImageUploadStatus(itemId)');
        expect(queueIndex).toBeGreaterThan(-1);
        expect(pollIndex).toBeGreaterThan(queueIndex);
    });

    it('does not poll when the queue request itself failed (already recorded as a failed stage)', () => {
        const pollBlockStart = handler.indexOf('if (queuedImageUpload)');
        expect(pollBlockStart).toBeGreaterThan(-1);
        // pollCatalogImageUploadStatus must be gated behind the truthy queue
        // result, not called unconditionally.
        const beforeGate = handler.slice(0, pollBlockStart);
        expect(beforeGate).not.toContain('pollCatalogImageUploadStatus(itemId)');
    });

    it('surfaces a soft warning on failure or timeout without throwing or blocking item creation', () => {
        expect(handler).toContain("uploadStatus.status === 'failed'");
        expect(handler).toContain("uploadStatus.status === 'timeout'");
        expect(handler).toMatch(/toast\.warning\(`Item #\$\{itemId\} was created, but its image failed to process/);
        expect(handler).toMatch(/toast\.warning\(`Item #\$\{itemId\} was created.*still processing/);
        // Neither branch re-throws or pushes into failedStages -- both are
        // purely informational, so item creation still completes.
        expect(handler).not.toMatch(/failedStages\.push[\s\S]{0,20}uploadStatus/);
    });

    it('finalizeCreatedItem still refetches after runPostCreateStages resolves, now with the image already processed in the common case', () => {
        expect(workspace).toContain('const finalizeCreatedItem = async ({ barcode = \'\', warningMessage = \'\', action = \'created\' } = {}) => {');
        expect(workspace).toContain('await Promise.all([loadItems(), loadPosFolders()]);');
    });
});
