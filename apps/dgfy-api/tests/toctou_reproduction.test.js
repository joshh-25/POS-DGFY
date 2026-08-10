
import { jest } from '@jest/globals';

// 0. Mock environment
process.env.OPENAI_API_KEY = 'test-key';

// 1. Mock Logger
jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

// 2. Mock OpenAI
class MockOpenAI {
    constructor() {
        this.chat = { completions: { create: jest.fn() } };
    }
}
jest.unstable_mockModule('openai', () => ({
    default: MockOpenAI
}));

// 3. Mock UUID
jest.unstable_mockModule('uuid', () => ({
    v4: () => 'test-uuid'
}));

// 4. Mock System Prompt
jest.unstable_mockModule('../src/config/aiSystemPrompt.js', () => ({
    buildSystemPrompt: jest.fn(),
    getCapabilitiesExplanation: jest.fn(),
    getLimitationsExplanation: jest.fn()
}));

// 5. Mock aiToolExecutor
const mockExecute = jest.fn();
jest.unstable_mockModule('../src/services/aiToolExecutor.js', () => ({
    execute: mockExecute
}));

// 6. Mock aiTools
const mockGetToolByName = jest.fn();
jest.unstable_mockModule('../src/config/aiTools.js', () => ({
    getToolByName: mockGetToolByName,
    getOpenAITools: jest.fn(),
    toolRequiresConfirmation: jest.fn()
}));

// 7. Mock aiContextService
const mockHasPermission = jest.fn();
const mockHasGranularPermission = jest.fn();
jest.unstable_mockModule('../src/services/aiContextService.js', () => ({
    hasPermission: mockHasPermission,
    hasGranularPermission: mockHasGranularPermission,
    buildContext: jest.fn(),
    getPermissionError: (action, role) => `Permission denied: ${action} requires ${role}`,
    getGranularPermissionError: (action, perm) => `Permission denied: ${action} requires ${perm}`
}));

// 8. Import SUT
const { executeConfirmedAction } = await import('../src/services/aiService.js');

describe('TOCTOU Vulnerability Reproduction', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should execute action even if implicit permission is effectively lost (VULNERABILITY REPRODUCTION)', async () => {
        // Setup scenarios:
        // User is 'staff'
        // Tool requires 'admin'
        // Pending action exists (created when user apparently had permission, or via exploit)

        const user = {
            user_id: 123,
            role: 'staff'
        };

        const pendingAction = {
            action_id: 'act-1',
            user_id: 123,
            toolName: 'delete_item',
            args: { item_id: 99 },
            expires_at: new Date(Date.now() + 10000).toISOString()
        };

        // Mock tool definition
        mockGetToolByName.mockReturnValue({
            function: { name: 'delete_item' },
            requiredRole: 'admin'
        });

        // Mock permission check to fail (User is staff, Tool requires admin)
        // NOTE: In the current vulnerable code, executeConfirmedAction doesn't even CALL hasPermission.
        // We mock it returning false just to prove that if it WERE called, it would fail.
        mockHasPermission.mockReturnValue(false);

        // Execute
        // Expectation: Should throw an error due to permission check
        await expect(executeConfirmedAction('act-1', pendingAction, user))
            .resolves.toEqual(expect.objectContaining({
                type: 'error',
                message: expect.stringContaining('Permission denied')
            }));

        // ASSERTION: The tool was NOT executed
        // This confirms the TOCTOU vulnerability is fixed
        expect(mockExecute).not.toHaveBeenCalled();
    });
});
