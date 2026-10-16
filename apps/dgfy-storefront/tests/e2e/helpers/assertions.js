// Intentional copy of apps/dgfy-web/tests/e2e/helpers/assertions.js (issue #322 Phase 3):
// see the note in helpers/urls.js in this same directory for why.
/**
 * Registers listeners on the page to intercept runtime script errors, console errors,
 * and page text indicating React Error Boundaries or runtime crashes.
 */
export function registerCrashDetection(page, {
  failOnConsoleErrors = false,
  failOnClientErrors = false,
  failOnRequestFailures = false,
  failOnServerErrors = false,
  ignoreRequestFailure = () => false
} = {}) {
  const errors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const clientErrors = [];
  const serverErrors = [];

  page.on('pageerror', (err) => {
    errors.push(`Page Error: ${err.message}`);
  });

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() !== 'error') return;
    // Chromium emits this generic console error for HTTP responses; the
    // response listener below records the exact URL and status instead.
    if (text.startsWith('Failed to load resource: the server responded with a status of')) return;
    consoleErrors.push(`Console Error: ${text}`);
    // Intercept critical runtime loader or uncaught reference errors.
    if (text.includes('is not defined') || text.includes('ReferenceError') || text.includes('uncaught')) {
      errors.push(`Console Error: ${text}`);
    }
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || 'unknown request failure';
    if (failure === 'net::ERR_ABORTED' || ignoreRequestFailure(request)) return;
    requestFailures.push(`${request.method()} ${request.url()} — ${failure}`);
  });

  page.on('response', (response) => {
    if (response.status() >= 400 && response.status() < 500) {
      clientErrors.push(`${response.request().method()} ${response.url()} — HTTP ${response.status()}`);
    }
    if (response.status() >= 500) {
      serverErrors.push(`${response.request().method()} ${response.url()} — HTTP ${response.status()}`);
    }
  });

  return {
    assertNoCrashes: async (checkpoint = 'browser checkpoint') => {
      const crashKeywords = ['ReferenceError', 'is not defined', 'Cannot read properties of undefined', 'Uncaught'];
      const diagnostics = [
        ...errors,
        ...(failOnConsoleErrors ? consoleErrors : []),
        ...(failOnClientErrors ? clientErrors.map((entry) => `Client error: ${entry}`) : []),
        ...(failOnRequestFailures ? requestFailures.map((entry) => `Request failed: ${entry}`) : []),
        ...(failOnServerErrors ? serverErrors.map((entry) => `Server error: ${entry}`) : [])
      ];
      for (const err of errors) {
        if (crashKeywords.some(keyword => err.includes(keyword))) {
          throw new Error(`[${checkpoint}] React runtime crash detected at ${page.url()}: ${err}`);
        }
      }

      if (failOnConsoleErrors && consoleErrors.length > 0) {
        throw new Error(`[${checkpoint}] Unexpected browser console error at ${page.url()}: ${consoleErrors.join(' | ')}`);
      }
      if (failOnClientErrors && clientErrors.length > 0) {
        throw new Error(`[${checkpoint}] HTTP 4xx response at ${page.url()}: ${clientErrors.join(' | ')}`);
      }
      if (failOnRequestFailures && requestFailures.length > 0) {
        throw new Error(`[${checkpoint}] Failed browser request at ${page.url()}: ${requestFailures.join(' | ')}`);
      }
      if (failOnServerErrors && serverErrors.length > 0) {
        throw new Error(`[${checkpoint}] HTTP 5xx response at ${page.url()}: ${serverErrors.join(' | ')}`);
      }

      // Check DOM for React Error Boundary components or common error states
      const body = page.locator('body');
      if (await body.count() > 0) {
        const text = await body.innerText();
        if (text.includes('Something went wrong') || text.includes('visibleCatalogRange is not defined') || text.includes('ReferenceError')) {
          throw new Error(`[${checkpoint}] React Error Boundary screen visible at ${page.url()}: "${text.slice(0, 200)}..."`);
        }
      }

      return { checkpoint, url: page.url(), diagnostics };
    }
  };
}
