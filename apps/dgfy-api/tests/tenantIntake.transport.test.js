import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { fail, ok } from '../src/modules/shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const names = ['capabilities', 'propose', 'extract', 'get', 'list', 'edit', 'reject', 'confirm'];
jest.unstable_mockModule('../src/modules/tenantIntake/index.js', () => ({
    tenantIntakeUseCases: Object.fromEntries(names.map((name) => [name, jest.fn()]))
}));
const { buildTenantIntakeHandlers } = await import('../src/modules/tenantIntake/controllers/tenantIntakeHandlers.js');
const { buildTenantIntakeRouter } = await import('../src/routes/adminTenantIntake.js');
const fixture = () => {
    const cases = Object.fromEntries(names.map((name) => [name, jest.fn(async () => ok({ statusCode: name === 'propose' ? 201 : 200,
        payload: { success: true, data: { action: name } } }))]));
    const app = express(); app.use(express.json());
    app.use('/api/v1/admin/tenant-intake', buildTenantIntakeRouter({ handlers: buildTenantIntakeHandlers(cases),
        authenticate: (req, res, next) => {
            if (!req.get('x-test-auth')) return res.status(401).json({ success: false });
            req.admin = { admin_id: 'operator-id', username: 'operator', permissions: ['admin.tenants', 'admin.dgfy_accounts'] }; next();
        } }));
    return { app, cases };
};

test.each([
    ['get', '/capabilities', 'capabilities'], ['post', '/proposals', 'propose'],
    ['post', '/proposals/extract', 'extract'], ['get', '/proposals', 'list'],
    ['get', '/proposals/id-1', 'get'], ['patch', '/proposals/id-1', 'edit'],
    ['post', '/proposals/id-1/reject', 'reject'], ['post', '/proposals/id-1/confirm', 'confirm']
])('%s %s is authenticated and dispatches only %s', async (method, path, name) => {
    const { app, cases } = fixture();
    expect((await request(app)[method](`/api/v1/admin/tenant-intake${path}`)).status).toBe(401);
    const response = await request(app)[method](`/api/v1/admin/tenant-intake${path}`).set('x-test-auth', 'true').send({ human_confirmed: true, payload_hash: 'reviewed-hash' });
    expect(response.status).toBe(name === 'propose' ? 201 : 200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.action).toBe(name);
    expect(cases[name]).toHaveBeenCalledTimes(1);
    expect(cases[name].mock.calls[0][0].actor.id).toBe('operator-id');
    for (const other of names.filter((value) => value !== name)) expect(cases[other]).not.toHaveBeenCalled();
});
test('confirmation domain failure retains 409 status and safe details', async () => {
    const { app, cases } = fixture();
    cases.confirm.mockResolvedValue(fail(new DomainError(DomainErrorCode.CONFLICT, 'Proposal changed.', { details: { proposal_id: 'id-1' } })));
    const response = await request(app).post('/api/v1/admin/tenant-intake/proposals/id-1/confirm').set('x-test-auth', 'true').send({ payload_hash: 'old' });
    expect(response.status).toBe(409); expect(response.body.errors).toEqual({ proposal_id: 'id-1' });
});
test('multipart extract forwards bytes once and oversized upload never reaches use case', async () => {
    const { app, cases } = fixture();
    const response = await request(app).post('/api/v1/admin/tenant-intake/proposals/extract').set('x-test-auth', 'true')
        .field('target', 'OFFICIAL').field('reason', 'Operator request').attach('file', Buffer.from('business details'), 'intake.txt');
    expect(response.status).toBe(200);
    expect(cases.extract.mock.calls[0][0].file.buffer.toString()).toBe('business details');
    expect(cases.extract.mock.calls[0][0].body.reason).toBe('Operator request');
    cases.extract.mockClear();
    const oversized = await request(app).post('/api/v1/admin/tenant-intake/proposals/extract').set('x-test-auth', 'true')
        .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1), 'oversized.txt');
    expect(oversized.status).toBe(400); expect(cases.extract).not.toHaveBeenCalled();
});
