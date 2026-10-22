import express from 'express';
import request from 'supertest';
import { jest, describe, expect, it } from '@jest/globals';

const passThrough = (_req, _res, next) => next();
const deniedByPosCapability = (_req, res) => res.status(403).json({
    success: false,
    code: 'TENANT_CAPABILITY_DISABLED',
    capability: 'tenant_pos_enabled'
});

const bootstrapHandler = jest.fn((_req, res) => res.status(200).json({
    success: true,
    data: { business: { name: 'Masu Cafe' } }
}));
const companyHandler = jest.fn((_req, res) => res.status(200).json({ success: true }));
const updateCompanyNameHandler = jest.fn((_req, res) => res.status(200).json({ success: true }));

const handlerNames = [
    'getBootstrap', 'getCompany', 'updateCompanyName', 'getOverview', 'getMultiCompanyOverview', 'listNotifications',
    'markNotificationRead', 'dismissNotification', 'acknowledgeNotification', 'getReports',
    'getPosActivityAnalytics', 'listReportDefinitions', 'listEvidenceCatalog', 'getEJournalEvidence',
    'getReportDataset', 'exportReportDataset', 'getInventoryValuation', 'listInventoryStock',
    'getWorkforce', 'getAttendance', 'endAttendanceShift', 'getFiscal', 'listRecipes', 'listCustomers', 'createCustomer',
    'getCustomerDetail', 'listShifts', 'listOrders', 'getOrderDetail', 'listExpenses', 'createExpense',
    'voidExpense', 'getCommerceMonitoring', 'listSavedReportViews', 'createSavedReportView',
    'deleteSavedReportView', 'listAudit', 'listApprovals', 'decideApproval', 'cancelApproval'
];

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticate: passThrough,
    requireTenantCapability: () => deniedByPosCapability
}));

jest.unstable_mockModule('../src/modules/businessAdmin/middleware/businessAdminRolloutGate.js', () => ({
    requireBusinessAdminDashboardEnabled: passThrough
}));

jest.unstable_mockModule('../src/modules/businessAdmin/controllers/businessAdminHandlers.js', () => ({
    ...Object.fromEntries(handlerNames.map((name) => [name, jest.fn((_req, res) => res.status(200).json({ success: true }))])),
    getBootstrap: bootstrapHandler,
    getCompany: companyHandler,
    updateCompanyName: updateCompanyNameHandler
}));

jest.unstable_mockModule('../src/validators/posValidator.js', () => ({
    validatePosTransactionIdParam: passThrough,
    validateDecideBusinessAdminApproval: passThrough
}));

jest.unstable_mockModule('../src/validators/businessAdminValidator.js', () => ({
    validateBusinessAdminEndAttendanceShift: passThrough,
    validateUpdateBusinessAdminCompanyName: passThrough
}));

const { default: businessAdminRouter } = await import('../src/routes/businessAdmin.js');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/business-admin', businessAdminRouter);
    return app;
};

describe('Business Admin bootstrap capability boundary', () => {
    it('keeps OPIS bootstrap available when the tenant POS capability is disabled', async () => {
        const response = await request(buildApp()).get('/business-admin/bootstrap');

        expect(response.status).toBe(200);
        expect(response.body.data.business.name).toBe('Masu Cafe');
        expect(bootstrapHandler).toHaveBeenCalledTimes(1);
    });

    it('keeps the POS capability gate on operational Business Admin endpoints', async () => {
        const response = await request(buildApp()).get('/business-admin/company');

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({
            code: 'TENANT_CAPABILITY_DISABLED',
            capability: 'tenant_pos_enabled'
        });
        expect(companyHandler).not.toHaveBeenCalled();
    });

    it('keeps canonical business-name updates available when POS is disabled', async () => {
        const response = await request(buildApp())
            .patch('/business-admin/company/name')
            .send({ name: 'Renamed Business' });

        expect(response.status).toBe(200);
        expect(updateCompanyNameHandler).toHaveBeenCalledTimes(1);
    });
});
