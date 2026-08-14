import { expect } from '@playwright/test';

// Intentional copy of apps/dgfy-web/tests/e2e/helpers/assertions.js (issue #322 Phase 3):
// see the note in helpers/urls.js in this same directory for why.
/**
 * Registers listeners on the page to intercept runtime script errors, console errors,
 * and page text indicating React Error Boundaries or runtime crashes.
 */
export function registerCrashDetection(page) {
  const errors = [];
  
  page.on('pageerror', (err) => {
    errors.push(`Page Error: ${err.message}`);
  });
  
  page.on('console', (msg) => {
    const text = msg.text();
    // Intercept critical runtime loader or uncaught reference errors
    if (msg.type() === 'error' && (text.includes('is not defined') || text.includes('ReferenceError') || text.includes('uncaught'))) {
      errors.push(`Console Error: ${text}`);
    }
  });

  return {
    assertNoCrashes: async () => {
      const crashKeywords = ['ReferenceError', 'is not defined', 'Cannot read properties of undefined', 'Uncaught'];
      for (const err of errors) {
        if (crashKeywords.some(keyword => err.includes(keyword))) {
          throw new Error(`React runtime crash detected: ${err}`);
        }
      }

      // Check DOM for React Error Boundary components or common error states
      const body = page.locator('body');
      if (await body.count() > 0) {
        const text = await body.innerText();
        if (text.includes('Something went wrong') || text.includes('visibleCatalogRange is not defined') || text.includes('ReferenceError')) {
          throw new Error(`React Error Boundary screen visible: "${text.slice(0, 200)}..."`);
        }
      }
    }
  };
}
