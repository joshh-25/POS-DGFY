import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

let currentModels = {};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (modelName) => currentModels[modelName]
    }
}));

const { requireWorkflowCapability } = await import('../src/middleware/workflowModeCapability.js');
const { modeHasCapability } = await import('../src/modules/shared/constants/workflowModes.js');

const withWorkflowMode = (mode) => {
    currentModels = {
        SystemSetting: {
            findOne: jest.fn().mockResolvedValue(mode === undefined ? null : { setting_value: mode })
        }
    };
};

const buildProbe = (capability, moduleLabel) => {
    const app = express();
    app.get('/probe',
        requireWorkflowCapability(capability, moduleLabel),
        (_req, res) => res.status(200).json({ success: true })
    );
    return app;
};

// Add-on groups used to be reachable only in F&B, not because the data model
// required it but because `routes/fnb.js` blanket-gated all 24 of its endpoints
// — modifier CRUD included — behind `fnbDining`. The tables were always
// generic (`fnb_item_modifier_groups.item_id` is an FK onto `items`) and both
// checkout resolvers already ignored workflow mode, so the management gate was
// the only thing making add-ons restaurant-only.
describe('modifier management is de-gated from F&B-only', () => {
    const NON_FNB_MODES = [
        'retail',
        'services',
        'msme',
        'hospitality',
        'food_manufacturing',
        'healthcare',
        'ticketing_transport',
        'logistics_distribution',
        'education_institutions'
    ];

    it('grants menuModifiers to every workflow mode, not just F&B', () => {
        expect(modeHasCapability('fnb', 'menuModifiers')).toBe(true);
        NON_FNB_MODES.forEach((mode) => {
            expect(modeHasCapability(mode, 'menuModifiers')).toBe(true);
        });
    });

    it('lets a non-F&B mode through the modifier capability gate', async () => {
        for (const mode of NON_FNB_MODES) {
            withWorkflowMode(mode);
            const response = await request(buildProbe('menuModifiers', 'Menu Modifiers')).get('/probe');
            expect(response.status).toBe(200);
        }
    });

    it('still refuses genuinely restaurant-native endpoints outside F&B', async () => {
        // Dining areas, kitchen tickets, checks, reservations and service
        // charge stay behind `fnbDining` — only the modifier routes moved.
        for (const mode of NON_FNB_MODES) {
            withWorkflowMode(mode);
            const response = await request(buildProbe('fnbDining', 'Food & Beverage')).get('/probe');
            expect(response.status).toBe(403);
            expect(response.body).toEqual(expect.objectContaining({
                success: false,
                error_code: 'WORKFLOW_MODE_CAPABILITY_DENIED',
                errors: expect.objectContaining({ capability: 'fnbDining' })
            }));
        }
    });

    it('keeps F&B itself able to reach both gates', async () => {
        for (const capability of ['menuModifiers', 'fnbDining']) {
            withWorkflowMode('fnb');
            const response = await request(buildProbe(capability, 'F&B')).get('/probe');
            expect(response.status).toBe(200);
        }
    });
});
