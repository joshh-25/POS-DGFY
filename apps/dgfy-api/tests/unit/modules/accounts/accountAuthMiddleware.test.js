import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { buildAccountAuthMiddleware } from '../../../../src/modules/accounts/middleware/accountAuthMiddleware.js';
import { ApplicationResult } from '../../../../src/shared/contracts/applicationResult.js';

/**
 * Fast, fully-mocked unit tests for accountAuthMiddleware.js's WR-05 fix:
 * jwt.verify() must be pinned to an explicit algorithms allowlist
 * (['HS256']) rather than inferring the algorithm from the token header.
 * Exercised behaviorally (sign real tokens with different algorithms and
 * assert accept/reject), not by spying on jwt.verify's call args, so the
 * test proves the actual runtime behavior rather than an implementation
 * detail.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const makeAccount = (overrides = {}) => ({
    id: 'acct-1',
    email: 'jane@example.com',
    status: 'active',
    ...overrides
});

const makeReqResNext = (token) => {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    };
    const next = jest.fn();
    return { req, res, next };
};

describe('buildAccountAuthMiddleware algorithm pinning (WR-05)', () => {
    it('accepts a token signed with the pinned HS256 algorithm', async () => {
        const account = makeAccount();
        const getAccount = jest.fn().mockResolvedValue(ApplicationResult.success({ account }));
        const middleware = buildAccountAuthMiddleware({ getAccount });
        const token = jwt.sign(
            { token_scope: 'dgfy_account_session', account_id: account.id },
            process.env.JWT_SECRET,
            { algorithm: 'HS256' }
        );
        const { req, res, next } = makeReqResNext(token);

        await middleware(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.account.id).toBe(account.id);
    });

    it('rejects a token signed with a non-allowlisted algorithm (HS384) even with the correct secret', async () => {
        const account = makeAccount();
        const getAccount = jest.fn();
        const middleware = buildAccountAuthMiddleware({ getAccount });
        const token = jwt.sign(
            { token_scope: 'dgfy_account_session', account_id: account.id },
            process.env.JWT_SECRET,
            { algorithm: 'HS384' }
        );
        const { req, res, next } = makeReqResNext(token);

        await middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(getAccount).not.toHaveBeenCalled();
    });

    it('rejects a request with no bearer token', async () => {
        const getAccount = jest.fn();
        const middleware = buildAccountAuthMiddleware({ getAccount });
        const { req, res, next } = makeReqResNext(null);

        await middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(getAccount).not.toHaveBeenCalled();
    });
});
