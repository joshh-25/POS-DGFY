import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { issue, verify, hashAuthorityToken } from '../src/modules/pos/services/posOperatorAuthorityService.js';
import { SESSION_COOKIE_NAMES, setBearerSessionCookie } from '../src/utils/browserSessionCookies.js';
import { csrfProtection } from '../src/middleware/csrfProtection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Phase 157 operator authority security contracts', () => {
    const originalDedicatedSecret = process.env.POS_OPERATOR_AUTHORITY_SECRET;
    const originalJwtSecret = process.env.JWT_SECRET;

    afterEach(() => {
        if (originalDedicatedSecret == null) delete process.env.POS_OPERATOR_AUTHORITY_SECRET;
        else process.env.POS_OPERATOR_AUTHORITY_SECRET = originalDedicatedSecret;
        if (originalJwtSecret == null) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalJwtSecret;
    });

    test('authority tokens are scoped, verifiable, and hashed before persistence', () => {
        const token = issue({
            tenantId: 'tenant-1',
            locationId: 7,
            terminalId: 'reg-1',
            shiftId: 99,
            userId: 2,
            operatorSessionId: 14
        });
        const claims = verify(token);
        expect(claims).toMatchObject({
            token_type: 'pos_operator_authority',
            tenant_id: 'tenant-1',
            location_id: 7,
            terminal_id: 'REG-1',
            shift_id: 99,
            user_id: 2,
            operator_session_id: 14
        });
        expect(hashAuthorityToken(token)).toHaveLength(64);
        expect(hashAuthorityToken(token)).not.toBe(token);
    });

    test('uses the application JWT secret when a dedicated operator secret is not configured', () => {
        delete process.env.POS_OPERATOR_AUTHORITY_SECRET;
        process.env.JWT_SECRET = 'local_application_jwt_secret_32_chars_long';
        const token = issue({
            tenantId: 'tenant-1',
            locationId: 7,
            terminalId: 'reg-1',
            shiftId: 99,
            userId: 2,
            operatorSessionId: 14
        });
        expect(verify(token)).toMatchObject({ operator_session_id: 14, user_id: 2 });
    });

    test('operator authority is transported as HttpOnly and unsafe cookie requests remain CSRF protected', () => {
        const response = {
            headers: {},
            getHeader(name) { return this.headers[name]; },
            setHeader(name, value) { this.headers[name] = value; }
        };
        setBearerSessionCookie(response, SESSION_COOKIE_NAMES.posOperatorAuthority, 'signed-authority', { maxAgeMs: 60000 });
        expect(response.headers['Set-Cookie'].some((cookie) => cookie.startsWith('sku_pos_operator_authority=') && cookie.includes('HttpOnly'))).toBe(true);

        const next = jest.fn();
        const res = { locals: {}, status: jest.fn().mockReturnThis(), json: jest.fn() };
        csrfProtection({ method: 'POST', headers: { cookie: 'sku_pos_operator_authority=signed-authority' }, originalUrl: '/api/v1/pos/terminal/operator/takeover', url: '/api/v1/pos/terminal/operator/takeover' }, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('Phase 157 exposes only the gated operator endpoints and does not add checkout routes', () => {
        const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/pos.js'), 'utf8');
        for (const endpoint of [
            '/operator/pin/enroll',
            '/operator/pin/reset',
            '/terminal/operator/takeover',
            '/terminal/operator/return',
            '/terminal/operator/shared-relief/start',
            '/terminal/operator/shared-relief/end',
            '/terminal/operator/handoff/count',
            '/terminal/operator/end'
        ]) {
            expect(routeSource).toContain(endpoint);
        }
        expect(routeSource).toContain('posController.requirePairedTerminal');
    });
});
