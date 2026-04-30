
import { jest } from '@jest/globals';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import { PERMISSIONS } from '../src/config/permissions.js';

// 1. Mock external services (PayPal, OpenAI, etc.) to isolate the test
jest.unstable_mockModule('../src/services/paypalService.js', () => ({
    paypalService: {
        verifySubscription: jest.fn(),
        getSubscriptionDetails: jest.fn(),
        verifyWebhookSignature: jest.fn().mockResolvedValue(true)
    }
}));

// Mock Logger to silence output
jest.unstable_mockModule('../src/config/logger.js', () => ({
    default: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

// Mock tenantHandler to bypass subscription checks
jest.unstable_mockModule('../src/middleware/tenantHandler.js', () => ({
    tenantHandler: (req, res, next) => {
        const tenant = {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Test Tenant',
            status: 'active',
            plan: 'premium', // CRITICAL: satisfies requirePremium
            subscription_status: 'active'
        };
        req.tenant = tenant;
        dbStore.run({
            tenantId: tenant.id,
            tenantName: tenant.name,
            tenantToken: req.headers['x-company-token'] || 'toctou-tenant',
            User,
            PendingAIAction,
            AIConversation,
            Item
        }, next);
    },
    invalidateTenantLookupCache: jest.fn()
}));

// 2. Import dependencies
const { default: app } = await import('../src/server.js');
const { sequelize, User, PendingAIAction, AIConversation, Item } = await import('../src/models/index.js');
const { generateToken } = await import('../src/services/authService.js');

describe('TOCTOU Integration Test', () => {
    let adminUser;
    let adminToken;
    let conversationId;

    const createDeletableItem = async (nameSuffix) => {
        return Item.create({
            sku_code: `TOCTOU-${nameSuffix}-${Date.now()}`,
            name: `TOCTOU Test Item ${nameSuffix}`,
            category: 'raw_material',
            unit_of_measure: 'pcs',
            current_stock: 10,
            status: 'active'
        });
    };

    beforeAll(async () => {
        // No-op, we sync in beforeEach
    });

    afterAll(async () => {
        await sequelize.close();
    });

    beforeEach(async () => {
        // Clear mocks
        jest.clearAllMocks();

        // Reset Database completely for each test
        await sequelize.sync();
        await PendingAIAction.destroy({ where: {} }).catch(() => null);
        await AIConversation.destroy({ where: {} }).catch(() => null);
        await Item.destroy({ where: { sku_code: { [Op.like]: 'TOCTOU-%' } } }).catch(() => null);
        await User.destroy({ where: { email: 'admin@test.com' } }).catch(() => null);

        // Create Admin User
        // Give them necessary permissions to bypass middleware
        adminUser = await User.create({
            username: 'admin_user',
            email: 'admin@test.com',
            password_hash: 'hash',
            role: 'admin',
            is_active: true,
            permissions: [
                'ai:action',
                'ai:chat',
                PERMISSIONS.INVENTORY.actions.DELETE_ITEMS
            ] // Allow endpoint access and the confirmed delete_item tool.
        });

        adminToken = generateToken(adminUser, { tenantId: '11111111-1111-4111-8111-111111111111' });
        conversationId = uuidv4();

        // Create a conversation
        await AIConversation.create({
            conversation_id: conversationId,
            user_id: adminUser.user_id,
            messages: [],
            last_message_at: new Date(),
            expires_at: new Date(Date.now() + 3600000)
        });
    });

    it('should BLOCK a confirmed action if the user role is downgraded BEFORE confirmation (TOCTOU)', async () => {
        // 1. Setup: Create a pending action for 'delete_item' (requires admin)
        const actionId = uuidv4();

        const item = await createDeletableItem('block');
        await PendingAIAction.create({
            action_id: actionId,
            user_id: adminUser.user_id,
            conversation_id: conversationId,
            action_type: 'delete_item',
            description: 'Delete Item 123',
            action_payload: { item_id: item.item_id, reason: 'TOCTOU block path test' },
            status: 'pending',
            expires_at: new Date(Date.now() + 300000)
        });

        // 2. Attack Simulation: Downgrade User to Manager
        // Manager has 'ai:action' permission (so they pass middleware), 
        // BUT they do not have 'admin' role (so they should fail the tool check).
        await adminUser.update({
            role: 'manager',
            permissions: ['ai:action', 'ai:chat'] // Keep endpoint access
        });

        // 3. Execution: Try to confirm the action
        const response = await request(app)
            .post('/api/v1/ai/confirm')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-company-token', 'toctou-block')
            .send({ actionId: actionId });

        // 4. Verification
        // The controller returns 200 OK even on error (soft error), with success: false
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);

        // This error check confirms it was our PERMISSION check that failed
        expect(response.body.message).toMatch(/You don't have permission/i);
        expect(response.body.message).toMatch(/requires admin/i);

        // Note: The controller currently marks it as 'confirmed' (processed) even if execution failed (returned error result).
        // The important part is that the tool was NOT executed and the response indicated failure.
        const refreshedAction = await PendingAIAction.findByPk(actionId);
        expect(refreshedAction.status).toBe('confirmed');

        let result = refreshedAction.execution_result;
        if (typeof result === 'string') {
            try {
                result = JSON.parse(result);
            } catch (e) {
                // ignore
            }
        }
        expect(result).toBeDefined();
        expect(result.type).toBe('error');

        // Item must remain active because execution was blocked by permission check.
        const itemAfter = await Item.findByPk(item.item_id);
        expect(itemAfter).toBeDefined();
        expect(itemAfter.status).toBe('active');
    });

    it('should ALLOW the action if the user RETAINS their role', async () => {
        // Control test: User stays admin
        const item = await createDeletableItem('allow');
        const actionId = uuidv4();
        await PendingAIAction.create({
            action_id: actionId,
            user_id: adminUser.user_id,
            conversation_id: conversationId,
            action_type: 'delete_item',
            description: `Delete Item ${item.item_id}`,
            action_payload: { item_id: item.item_id, reason: 'TOCTOU allow path test' },
            status: 'pending',
            expires_at: new Date(Date.now() + 300000)
        });

        // No downgrade

        const response = await request(app)
            .post('/api/v1/ai/confirm')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-company-token', 'toctou-allow')
            .send({ actionId: actionId });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        const refreshedAction = await PendingAIAction.findByPk(actionId);
        expect(refreshedAction.status).toBe('confirmed');

        // Action must be applied (soft delete -> inactive)
        const itemAfter = await Item.findByPk(item.item_id);
        expect(itemAfter).toBeDefined();
        expect(itemAfter.status).toBe('inactive');
    });
});
