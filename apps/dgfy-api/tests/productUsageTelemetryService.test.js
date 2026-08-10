import { describe, it, expect, jest } from '@jest/globals';
import {
  buildTrackProductUsageEvent,
  buildTrackProductUsageFromResult
} from '../src/services/productUsageTelemetryService.js';

describe('productUsageTelemetryService', () => {
  it('tracks product usage events with normalized engagement payload fields', async () => {
    const engagementTracker = jest.fn().mockResolvedValue({ created: true });
    const trackProductUsageEvent = buildTrackProductUsageEvent({
      engagementTracker,
      loggerInstance: { warn: jest.fn() },
      nowProvider: () => new Date('2026-03-06T00:00:00.000Z')
    });

    await trackProductUsageEvent({
      req: {
        method: 'GET',
        originalUrl: '/api/v1/dashboard/stats',
        requestId: 'req-product-1',
        headers: {
          'x-trace-id': 'trace-1',
          'x-session-id': 'sess-1',
          'user-agent': 'Mozilla/5.0'
        }
      },
      user: { user_id: 7, tenant_id: 'tenant-1' },
      eventType: 'dashboard_stats_viewed',
      surface: 'dashboard',
      action: 'view_stats',
      metadata: { total_items: 50 }
    });

    expect(engagementTracker).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'dashboard_stats_viewed',
      eventCategory: 'product_usage',
      eventVersion: 1,
      tenantId: 'tenant-1',
      userId: 7,
      requestId: 'req-product-1',
      traceId: 'trace-1',
      sessionId: 'sess-1',
      outcome: 'success',
      surface: 'dashboard',
      platform: 'backend_api',
      actorType: 'authenticated_user',
      isInternalActor: false,
      isBotSuspected: false,
      metadata: expect.objectContaining({
        total_items: 50,
        action: 'view_stats',
        surface: 'dashboard',
        route: '/api/v1/dashboard/stats',
        method: 'GET',
        user_agent: 'Mozilla/5.0'
      })
    }));
  });

  it('classifies internal and bot-like traffic from request context', async () => {
    const engagementTracker = jest.fn().mockResolvedValue({ created: true });
    const trackProductUsageEvent = buildTrackProductUsageEvent({
      engagementTracker,
      loggerInstance: { warn: jest.fn() }
    });

    await trackProductUsageEvent({
      req: {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)'
        }
      },
      user: { user_id: 1, tenant_id: 'tenant-1', is_master_admin: true },
      eventType: 'analytics_anomalies_viewed',
      surface: 'analytics',
      action: 'view_anomalies'
    });

    expect(engagementTracker).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'internal_admin',
      isInternalActor: true,
      isBotSuspected: true
    }));
  });

  it('tracks failure outcomes from application results', async () => {
    const trackProductUsageEvent = jest.fn().mockResolvedValue({ created: true });
    const trackProductUsageFromResult = buildTrackProductUsageFromResult({
      trackProductUsageEvent
    });

    await trackProductUsageFromResult({
      req: { requestId: 'req-product-2', method: 'POST' },
      user: { user_id: 9, tenant_id: 'tenant-2' },
      eventType: 'purchase_order_created',
      surface: 'purchase_orders',
      action: 'create_purchase_order',
      result: {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'supplier_id is required',
          statusCode: 400
        }
      }
    });

    expect(trackProductUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'purchase_order_created',
      surface: 'purchase_orders',
      action: 'create_purchase_order',
      outcome: 'failure',
      failureCode: 'VALIDATION_FAILED',
      failureReason: 'supplier_id is required',
      metadata: expect.objectContaining({
        status_code: 400
      })
    }));
  });

  it('skips tracking when identity is missing', async () => {
    const engagementTracker = jest.fn();
    const trackProductUsageEvent = buildTrackProductUsageEvent({
      engagementTracker,
      loggerInstance: { warn: jest.fn() }
    });

    const result = await trackProductUsageEvent({
      req: { requestId: 'req-product-3' },
      user: null,
      eventType: 'inventory_items_viewed',
      surface: 'inventory',
      action: 'list_items'
    });

    expect(result).toEqual({
      skipped: true,
      reason: 'missing_identity'
    });
    expect(engagementTracker).not.toHaveBeenCalled();
  });
});
