import express from 'express';
import request from 'supertest';
import { requestContext } from '../src/middleware/requestContext.js';

describe('requestContext middleware', () => {
    it('uses inbound x-request-id when provided', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/probe', (req, res) => {
            res.json({ requestId: req.requestId });
        });

        const response = await request(app)
            .get('/probe')
            .set('x-request-id', 'req-test-123');

        expect(response.status).toBe(200);
        expect(response.headers['x-request-id']).toBe('req-test-123');
        expect(response.body.requestId).toBe('req-test-123');
    });

    it('generates x-request-id when missing', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/probe', (req, res) => {
            res.json({ requestId: req.requestId });
        });

        const response = await request(app).get('/probe');

        expect(response.status).toBe(200);
        expect(typeof response.headers['x-request-id']).toBe('string');
        expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
        expect(response.body.requestId).toBe(response.headers['x-request-id']);
    });
});
