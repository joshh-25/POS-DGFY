import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS create-item image upload completes without blocking on optimization', () => {
    const workspace = fs.readFileSync(workspacePath, 'utf8');
    const handlerStart = workspace.indexOf('const runPostCreateStages = async ({');
    const handlerEnd = workspace.indexOf('\n  };', handlerStart);
    const handler = workspace.slice(handlerStart, handlerEnd);

    it('stages the first selected image as an immediate local catalog preview', () => {
        expect(workspace).toContain('stagePendingPosItemImagePreview({ itemId, file: selectedImageFiles[0] })');
    });

    it('binds the accepted background job to the local preview', () => {
        expect(handler).toContain('bindPendingPosItemImagePreviewJob({');
        expect(handler).toContain('jobId: imageUploadJob.job_id');
    });

    it('queues single and gallery uploads without polling for image processing', () => {
        expect(handlerStart).toBeGreaterThan(-1);
        expect(handler).toContain('queueStorefrontCatalogImage(itemId, imageFiles[0])');
        expect(handler).toContain('queueStorefrontCatalogImages(itemId, imageFiles)');
        expect(handler).not.toContain('pollCatalogImageUploadStatus');
        expect(workspace).not.toContain('CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS');
    });

    it('marks the preview failed when the queue request is rejected', () => {
        expect(handler).toContain('markPendingPosItemImagePreviewFailed({ itemId, attemptId: imageAttemptId })');
    });

    it('uses customer-facing recovery copy with the item name and exact readiness guidance', () => {
        expect(workspace).toContain("was created, but setup needs attention. Your item was saved and will not be duplicated.");
        expect(workspace).toContain('requirement?.fix_hint || requirement?.label');
        expect(workspace).not.toContain('Resume setup retries only unfinished post-create stages');
    });

    it('finalizeCreatedItem refetches immediately after the queue acknowledgement', () => {
        expect(workspace).toContain('const finalizeCreatedItem = async ({ barcode = \'\', warningMessage = \'\', action = \'created\' } = {}) => {');
        expect(workspace).toContain('await Promise.all([loadItems(), loadPosFolders()]);');
    });
});
