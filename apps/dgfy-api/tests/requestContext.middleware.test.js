import express from 'express';
import request from 'supertest';
import { requestContext } from '../src/middleware/requestContext.js';

describe('requestContext middleware', () => {
    it('uses inbound x-request-id when provided', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/probe', (req, res) => {
            res.json({ requestId: req.requestId, traceId: req.traceId });
        });

        const response = await request(app)
            .get('/probe')
            .set('x-request-id', 'req-test-123')
            .set('x-trace-id', 'trace-test-123');

        expect(response.status).toBe(200);
        expect(response.headers['x-request-id']).toBe('req-test-123');
        expect(response.headers['x-trace-id']).toBe('trace-test-123');
        expect(response.body.requestId).toBe('req-test-123');
        expect(response.body.traceId).toBe('trace-test-123');
    });

    it('generates x-request-id and mirrors it as x-trace-id when missing', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/probe', (req, res) => {
            res.json({ requestId: req.requestId, traceId: req.traceId });
        });

        const response = await request(app).get('/probe');

        expect(response.status).toBe(200);
        expect(typeof response.headers['x-request-id']).toBe('string');
        expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
        expect(response.headers['x-trace-id']).toBe(response.headers['x-request-id']);
        expect(response.body.requestId).toBe(response.headers['x-request-id']);
        expect(response.body.traceId).toBe(response.headers['x-request-id']);
    });

    it('regenerates unsafe inbound context IDs', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/probe', (req, res) => {
            res.json({ requestId: req.requestId, traceId: req.traceId });
        });

        const response = await request(app)
            .get('/probe')
            .set('x-request-id', 'bad request')
            .set('x-trace-id', 'bad trace with spaces');

        expect(response.status).toBe(200);
        expect(response.body.requestId).not.toBe('bad request');
        expect(response.body.traceId).toBe(response.body.requestId);
        expect(response.headers['x-request-id']).toBe(response.body.requestId);
        expect(response.headers['x-trace-id']).toBe(response.body.requestId);
    });
});
