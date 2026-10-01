import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');

describe('POS approval administration contract', () => {
    it('registers an authorized POS Admin approval view and keeps it online-only', () => {
        const page = read('src/features/pos/pages/TerminalPage.jsx');
        const layout = read('src/features/pos/components/TerminalPageLayout.jsx');
        const terminalViewModel = read('src/features/pos/hooks/usePosTerminalViewModel.js');
        const sidebar = read('src/features/pos/components/TerminalWorkspaceSidebar.jsx');

        expect(page).toContain("'approvals'");
        expect(page).toContain('POS_VOID_APPROVAL_REVIEW_PERMISSIONS.every');
        expect(page).toContain("nextMode === 'approvals'");
        expect(layout).toContain("posViewMode === 'approvals'");
        expect(layout).toContain('<PosApprovalsWorkspace');
        expect(layout).toContain('inlineVoidApprovalEnabled={inlineVoidApprovalEnabled}');
        expect(terminalViewModel).toContain('voidApprovalQueue');
        expect(terminalViewModel).toContain('openVoidApprovalQueue');
        expect(terminalViewModel).toContain('canReviewVoidApprovals');
        expect(sidebar).toContain('testId="pos-nav-approvals"');
        expect(sidebar).toContain('canReviewVoidApprovals && !isCashierRole');
    });

    it('uses the canonical POS approval endpoints for review decisions', () => {
        const service = read('src/features/pos/services/posService.js');
        const workspace = read('src/features/pos/components/PosApprovalsWorkspace.jsx');

        expect(service).toContain("api.get('/pos/approvals', { params })");
        expect(service).toContain("api.post(`/pos/approvals/${approvalRequestId}/${decision}`, payload)");
        expect(workspace).toContain('fetchPosVoidApprovals({ status: \'pending\', limit: 100 })');
        expect(workspace).toContain('decidePosVoidApproval(getApprovalId(selectedRequest), decision');
        expect(workspace).toContain('POS remains the canonical executor');
    });
});
