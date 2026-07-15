import { describe, it, expect, jest } from '@jest/globals';
import { buildOptionalAuthenticateAccount } from '../../src/modules/storefront/routes.js';

/**
 * WR-05 fix (10-REVIEW.md): `buildOptionalAuthenticateAccount` wraps the
 * accounts module's REQUIRED authenticateAccount middleware into an
 * OPTIONAL pass-through for storefront's checkout-identity routes. The
 * previous implementation passed the REAL `next` directly to
 * authenticateAccount AND could ALSO invoke `next()` again from the
 * `.catch()` handler if authenticateAccount's returned promise rejected
 * AFTER already calling `next()` synchronously on its success path — a
 * double-next() bug. This suite proves `next()` is invoked AT MOST ONCE
 * per request across every combination of success/failure/late-rejection.
 */

const makeReq = (withAuthHeader = true) => ({
    headers: withAuthHeader ? { authorization: 'Bearer sometoken' } : {}
});

describe('buildOptionalAuthenticateAccount (WR-05)', () => {
    it('calls next() immediately (never touches authenticateAccount) when no Authorization header is present', async () => {
        const authenticateAccount = jest.fn();
        const next = jest.fn();
        const middleware = buildOptionalAuthenticateAccount(authenticateAccount);

        middleware(makeReq(false), {}, next);

        expect(authenticateAccount).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() exactly once when authenticateAccount succeeds synchronously', async () => {
        const next = jest.fn();
        const authenticateAccount = jest.fn((req, res, innerNext) => {
            req.account = { id: 'acct-1' };
            innerNext();
        });
        const middleware = buildOptionalAuthenticateAccount(authenticateAccount);

        const req = makeReq(true);
        middleware(req, {}, next);
        // Flush the Promise.resolve(...).catch() microtask queue.
        await Promise.resolve();
        await Promise.resolve();

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() exactly once when authenticateAccount rejects (401 via res.status().json())', async () => {
        const next = jest.fn();
        const authenticateAccount = jest.fn((req, res) => {
            res.status(401).json({ success: false });
        });
        const middleware = buildOptionalAuthenticateAccount(authenticateAccount);

        middleware(makeReq(true), {}, next);
        await Promise.resolve();
        await Promise.resolve();

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() exactly once when authenticateAccount throws/rejects with an unhandled error', async () => {
        const next = jest.fn();
        const authenticateAccount = jest.fn(async () => {
            throw new Error('unexpected middleware error');
        });
        const middleware = buildOptionalAuthenticateAccount(authenticateAccount);

        middleware(makeReq(true), {}, next);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('WR-05 core regression: calls next() only ONCE when authenticateAccount calls next() on its success path AND its own returned promise later rejects', async () => {
        const next = jest.fn();
        let rejectLate;
        const authenticateAccount = jest.fn((req, res, innerNext) => {
            // Success path: call next() synchronously (attaches req.account).
            req.account = { id: 'acct-1' };
            innerNext();
            // ... but the middleware's OWN async work continues and later
            // rejects for an unrelated reason (e.g. a downstream .then()
            // inside authenticateAccount throwing after next() already
            // fired) — this is exactly the scenario the bug required.
            return new Promise((resolve, reject) => {
                rejectLate = reject;
            });
        });
        const middleware = buildOptionalAuthenticateAccount(authenticateAccount);

        middleware(makeReq(true), {}, next);
        // next() has already fired synchronously from authenticateAccount's
        // success path.
        expect(next).toHaveBeenCalledTimes(1);

        // Now the late rejection fires — the OLD implementation would have
        // called next() a SECOND time here via `.catch(() => next())`.
        rejectLate(new Error('late unrelated rejection'));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(next).toHaveBeenCalledTimes(1);
    });
});
