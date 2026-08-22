import { test, expect } from '@playwright/test';
import { API_BASE_URL } from '../helpers/urls.js';

test.describe('Security - CORS Policy checks', () => {
  const surfaces = [
    { name: 'Skupervisor', url: '/login' },
    { name: 'POS', url: '/pos' },
  ];

  for (const surface of surfaces) {
    test(`CORS check: API call resolves successfully from ${surface.name} context`, async ({ page }) => {
      await page.goto(surface.url);
      
      const corsResult = await page.evaluate(async (baseUrl) => {
        try {
          const health = await fetch(`${baseUrl}/api/v1/health`, {
            credentials: 'include'
          });
          const protectedRoute = await fetch(`${baseUrl}/api/v1/dgfy/auth/me`, {
            credentials: 'include'
          });
          return {
            healthStatus: health.status,
            protectedStatus: protectedRoute.status
          };
        } catch (err) {
          return { error: err.message };
        }
      }, API_BASE_URL);
      
      console.log(`${surface.name} CORS result:`, corsResult);
      expect(corsResult.error).toBeUndefined();
      expect(corsResult.healthStatus).toBe(200);
      expect(corsResult.protectedStatus).toBe(401);
    });
  }
});
