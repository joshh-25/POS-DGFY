import { test, expect } from '@playwright/test';

test.describe('Security - HTTP Headers', () => {
  test('Verify critical security headers are present in responses', async ({ page }) => {
    const response = await page.goto('/login');
    const headers = response.headers();
    
    console.log('Returned Headers Keys:', Object.keys(headers));
    
    expect(response).not.toBeNull();

    // Local app configs and production-like preview must expose the same baseline.
    // Missing headers are a gate failure, not an advisory warning.
    const csp = headers['content-security-policy'];
    const xContentType = headers['x-content-type-options'];
    const referrer = headers['referrer-policy'];
    
    console.log('CSP Value:', csp);
    console.log('X-Content-Type-Options Value:', xContentType);
    console.log('Referrer-Policy Value:', referrer);
    
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(xContentType).toBe('nosniff');
    expect(referrer).toBe('strict-origin-when-cross-origin');
  });
});
