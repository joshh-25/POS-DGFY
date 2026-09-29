import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest, describe, expect, it } from '@jest/globals';
import { buildGetBusinessAdminOverviewUseCase } from '../src/modules/businessAdmin/usecases/businessAdminOverviewUseCase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Business Admin notifications and audit ownership contracts', () => {
    it('projects Overview notifications from the canonical user-scoped snapshot repository', async () => {
        const overviewRepository = {
            listUserLocationGrantIds: jest.fn(),
            getOverview: jest.fn().mockResolvedValue({
                summary: { total_sales: 100 },
                alerts: [{ code: 'legacy_overview_alert' }]
            })
        };
        const notificationRepository = {
            list: jest.fn().mockResolvedValue([{
                notification_id: 17,
                type: 'failed_payment',
                severity: 'critical',
                message: 'Payment failed',
                read_at: null
            }])
        };
        const useCase = buildGetBusinessAdminOverviewUseCase({
            businessAdminOverviewRepository: overviewRepository,
            businessAdminAlertSnapshotRepository: notificationRepository
        });

        const result = await useCase({
            query: { date_from: '2026-09-21', date_to: '2026-09-21' },
            user: { user_id: 7, role: 'admin' },
            tenant: { id: 'tenant-1', name: 'Demo Business' }
        });

        expect(result.success).toBe(true);
        expect(notificationRepository.list).toHaveBeenCalledWith({
            userId: 7,
            branchIds: null,
            status: 'open',
            includeDismissed: false,
            limit: 8
        });
        expect(result.data.notifications).toEqual([expect.objectContaining({ notification_id: 17 })]);
        expect(result.data.alerts).toBe(result.data.notifications);
        expect(result.data).not.toHaveProperty('scheduled_alerts');
    });

    it('keeps the legacy activity endpoint as a redirect to canonical Audit', () => {
        const routeSource = fs.readFileSync(
            path.resolve(__dirname, '../src/routes/businessAdmin.js'),
            'utf8'
        );

        expect(routeSource).toContain("router.get('/activity', (req, res) => {");
        expect(routeSource).toContain('res.redirect(308, `${req.baseUrl}/audit${query}`)');
        expect(routeSource).not.toContain('businessAdminHandlers.listActivity');
    });

    it('does not retain the mixed notification lifecycle activity projection', () => {
        const useCaseSource = fs.readFileSync(
            path.resolve(__dirname, '../src/modules/businessAdmin/usecases/businessAdminNotificationUseCase.js'),
            'utf8'
        );
        const repositorySource = fs.readFileSync(
            path.resolve(__dirname, '../src/modules/businessAdmin/repositories/businessAdminAlertSnapshotRepository.js'),
            'utf8'
        );

        expect(useCaseSource).not.toContain('buildListBusinessAdminActivityUseCase');
        expect(useCaseSource).not.toContain('notificationLifecycle');
        expect(repositorySource).not.toContain('listLifecycle');
    });
});
