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

    // `sentry-trace` is blanked explicitly in the no-trace-header cases below.
    // Once Sentry is initialized anywhere in the process, its HTTP
    // instrumentation injects that header into supertest's own outgoing
    // request, so without this the assertions would depend on which other
    // test files happened to run first under --runInBand.
    const NO_SENTRY_TRACE = '';

    it('generates x-request-id and mirrors it as x-trace-id when no trace header is present', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/probe', (req, res) => {
            res.json({ requestId: req.requestId, traceId: req.traceId });
        });

        const response = await request(app).get('/probe').set('sentry-trace', NO_SENTRY_TRACE);

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
            .set('x-trace-id', 'bad trace with spaces')
            .set('sentry-trace', NO_SENTRY_TRACE);

        expect(response.status).toBe(200);
        expect(response.body.requestId).not.toBe('bad request');
        expect(response.body.traceId).toBe(response.body.requestId);
        expect(response.headers['x-request-id']).toBe(response.body.requestId);
        expect(response.headers['x-trace-id']).toBe(response.body.requestId);
    });

    // The point of the whole change: a browser that propagates distributed
    // tracing sends sentry-trace, and adopting its trace id makes the
    // x-trace-id response header paste-able into Sentry as `trace:<id>`.
    it('adopts an inbound sentry-trace id so x-trace-id matches the Sentry trace', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/probe', (req, res) => {
            res.json({ requestId: req.requestId, traceId: req.traceId });
        });

        const response = await request(app)
            .get('/probe')
            .set('sentry-trace', '4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3-8b2e1f4a6c9d7a10-1');

        expect(response.status).toBe(200);
        expect(response.body.traceId).toBe('4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3');
        expect(response.headers['x-trace-id']).toBe('4a1c0f9e2b7d48a1b6e3c5d7f9a0b2c3');
        // request_id stays independently generated.
        expect(response.body.requestId).not.toBe(response.body.traceId);
    });

    it('ignores a malformed sentry-trace header and falls back to the request id', async () => {
        const app = express();
        app.use(requestContext);
        app.get('/probe', (req, res) => {
            res.json({ requestId: req.requestId, traceId: req.traceId });
        });

        const response = await request(app).get('/probe').set('sentry-trace', 'not-a-trace-header');

        expect(response.status).toBe(200);
        expect(response.body.traceId).toBe(response.body.requestId);
    });
});
