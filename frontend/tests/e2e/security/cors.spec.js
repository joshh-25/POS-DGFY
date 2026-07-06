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
          const res = await fetch(`${baseUrl}/auth/lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'cors-test@dgfy.ph' })
          });
          return { status: res.status, ok: res.ok };
        } catch (err) {
          return { error: err.message };
        }
      }, API_BASE_URL);
      
      console.log(`${surface.name} CORS result:`, corsResult);
      expect(corsResult.error).toBeUndefined();
      // 404 means the endpoint was reached successfully (the email is not registered), confirming no CORS block.
      expect(corsResult.status).toBe(404); 
    });
  }
});
