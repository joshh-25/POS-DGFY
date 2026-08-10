import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_PORT = Number.parseInt(process.env.FRONTEND_E2E_PORT || '5178', 10);
const FRONTEND_HOST = 'localhost';
const FRONTEND_BASE = `http://${FRONTEND_HOST}:${FRONTEND_PORT}`;
const BACKEND_HEALTH = 'http://127.0.0.1:5000/health';
const RUN_BROWSER_E2E = process.env.RUN_BROWSER_E2E === 'true';

const TEST_USER_SUFFIX = Date.now();
const FRONTEND_LOGIN = {
  email: `session.e2e.${TEST_USER_SUFFIX}@tenant.test`,
  password: 'Admin123!',
  username: `session_e2e_${TEST_USER_SUFFIX}`,
  companyToken: 'token-tenant-a'
};

let backendProc;
let frontendProc;
let browser;
let backendWasAlreadyRunning = false;
let frontendWasAlreadyRunning = false;
let backendShutdownExpected = false;
let frontendShutdownExpected = false;

const waitForHttp = async (url, timeoutMs = 60000) => {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.ok || response.status === 304) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
};

const isHttpUp = async (url) => {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return response.ok || response.status === 304;
  } catch {
    return false;
  }
};

const terminateProcessTree = async (proc) => {
  if (!proc?.pid) return;
  if (proc === frontendProc) {
    frontendShutdownExpected = true;
  }
  if (proc === backendProc) {
    backendShutdownExpected = true;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        stdio: 'ignore'
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }

  proc.kill('SIGTERM');
};

const startFrontendServer = async () => {
  if (await isHttpUp(FRONTEND_BASE)) {
    frontendWasAlreadyRunning = true;
    return;
  }

  const frontendDir = path.join(__dirname, '..', '..', 'frontend');
  let command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  let args = process.platform === 'win32'
    ? ['/c', 'npm', 'run', 'dev', '--', '--port', String(FRONTEND_PORT), '--strictPort']
    : ['run', 'dev', '--', '--port', String(FRONTEND_PORT), '--strictPort'];

  frontendProc = spawn(command, args, {
    cwd: frontendDir,
    stdio: 'pipe',
    env: { ...process.env, VITE_API_URL: '/api/v1' }
  });

  let startupErrorOutput = '';
  frontendProc.stdout.on('data', (chunk) => {
    startupErrorOutput += chunk.toString();
  });
  frontendProc.stderr.on('data', (chunk) => {
    startupErrorOutput += chunk.toString();
  });
  frontendProc.on('exit', (code) => {
    if (code !== 0 && !frontendShutdownExpected) {
      // Helps surface premature startup failures in CI logs.
      console.warn(`[frontend.sessionIsolation.e2e] Frontend dev server exited with code ${code}`);
      if (startupErrorOutput.trim()) {
        console.warn(startupErrorOutput.trim());
      }
    }
  });

  await waitForHttp(FRONTEND_BASE, 90000);
};

const startBackendServer = async () => {
  if (await isHttpUp(BACKEND_HEALTH)) {
    backendWasAlreadyRunning = true;
    return;
  }

  const backendDir = path.join(__dirname, '..');
  const command = process.platform === 'win32' ? 'cmd.exe' : 'node';
  const args = process.platform === 'win32'
    ? ['/c', 'node', 'src/server.js']
    : ['src/server.js'];

  backendProc = spawn(command, args, {
    cwd: backendDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      SKIP_SERVER_START: 'false',
      CORS_ORIGIN: `http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}`
    }
  });

  let startupErrorOutput = '';
  backendProc.stdout.on('data', (chunk) => {
    startupErrorOutput += chunk.toString();
  });
  backendProc.stderr.on('data', (chunk) => {
    startupErrorOutput += chunk.toString();
  });
  backendProc.on('exit', (code) => {
    if (code !== 0 && !backendShutdownExpected) {
      console.warn(`[frontend.sessionIsolation.e2e] Backend server exited with code ${code}`);
      if (startupErrorOutput.trim()) {
        console.warn(startupErrorOutput.trim());
      }
    }
  });

  await waitForHttp(BACKEND_HEALTH, 90000);
};

const ensureBrowserE2EUser = async () => {
  const registerResponse = await fetch('http://127.0.0.1:5000/api/v1/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-token': FRONTEND_LOGIN.companyToken
    },
    body: JSON.stringify({
      username: FRONTEND_LOGIN.username,
      email: FRONTEND_LOGIN.email,
      password: FRONTEND_LOGIN.password
    })
  });

  if (![200, 201, 400, 409].includes(registerResponse.status)) {
    const payload = await registerResponse.text().catch(() => '');
    throw new Error(`Failed to register browser E2E user: HTTP ${registerResponse.status} ${payload}`);
  }

  const loginResponse = await fetch('http://127.0.0.1:5000/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-company-token': FRONTEND_LOGIN.companyToken
    },
    body: JSON.stringify({
      email: FRONTEND_LOGIN.email,
      password: FRONTEND_LOGIN.password
    })
  });

  if (!loginResponse.ok) {
    const payload = await loginResponse.text().catch(() => '');
    throw new Error(`Failed to verify browser E2E credentials: HTTP ${loginResponse.status} ${payload}`);
  }
};

const loginViaUi = async (page) => {
  const authResponses = [];
  const onResponse = (response) => {
    const url = response.url();
    if (url.includes('/auth/login') || url.includes('/auth/lookup')) {
      authResponses.push({ url, status: response.status() });
    }
  };
  page.on('response', onResponse);

  try {
    await page.goto(`${FRONTEND_BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email', { timeout: 60000 });
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const companyTokenInput = page.locator('#companyToken');
    const signInButton = page.getByRole('button', { name: /Sign In/i });

    await emailInput.fill(FRONTEND_LOGIN.email);
    // Trigger onBlur tenant lookup flow before submit to mirror real user interaction.
    await emailInput.press('Tab');
    await passwordInput.fill(FRONTEND_LOGIN.password);

    // If manual token input is shown, provide a known valid token.
    if (await companyTokenInput.isVisible().catch(() => false)) {
      await companyTokenInput.fill(FRONTEND_LOGIN.companyToken);
    }

    await signInButton.click();

    try {
      await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 15000 });
      return;
    } catch {
      // Fallback for environments where lookup fails and token must be entered manually.
    }

    const manualTokenToggle = page.getByRole('button', { name: /Enter company token manually|Change/i });
    if ((await manualTokenToggle.count()) > 0) {
      await manualTokenToggle.first().click({ timeout: 5000 }).catch(() => {});
    }

    if (await companyTokenInput.isVisible().catch(() => false)) {
      await companyTokenInput.fill(FRONTEND_LOGIN.companyToken);
    }

    await signInButton.click();
    try {
      await page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 30000 });
    } catch (error) {
      const currentPath = new URL(page.url()).pathname;
      const visibleError = await page.locator('.bg-red-50').first().textContent().catch(() => null);
      const lookupWarning = await page.locator('.text-amber-600').first().textContent().catch(() => null);
      const tokenVisible = await companyTokenInput.isVisible().catch(() => false);
      const tokenValue = tokenVisible ? await companyTokenInput.inputValue().catch(() => '') : '';
      throw new Error(
        `Login did not reach dashboard. ` +
        `path=${currentPath}; visibleError=${visibleError || 'none'}; ` +
        `lookupWarning=${lookupWarning || 'none'}; tokenVisible=${String(tokenVisible)}; ` +
        `tokenValue=${tokenValue || 'empty'}; authResponses=${JSON.stringify(authResponses)}; ` +
        `cause=${error instanceof Error ? error.message : String(error)}`
      );
    }
  } finally {
    page.off('response', onResponse);
  }
};

beforeAll(async () => {
  if (!RUN_BROWSER_E2E) return;

  await startBackendServer();
  await ensureBrowserE2EUser();
  await startFrontendServer();
  browser = await chromium.launch({ headless: true });
}, 180000);

afterAll(async () => {
  if (!RUN_BROWSER_E2E) return;

  if (browser) await browser.close();
  if (!backendWasAlreadyRunning) {
    await terminateProcessTree(backendProc);
  }
  if (!frontendWasAlreadyRunning) {
    await terminateProcessTree(frontendProc);
  }
}, 60000);

const maybeIt = RUN_BROWSER_E2E ? it : it.skip;

describe('Frontend Real Browser E2E - Session Isolation', () => {
  maybeIt('logs out all tabs, clears tokens, and prevents protected-route access', async () => {
    const context = await browser.newContext();
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await loginViaUi(pageA);

    const epochBefore = await pageA.evaluate(() => Number.parseInt(localStorage.getItem('authEpoch') || '0', 10));
    const tokenBefore = await pageA.evaluate(() => localStorage.getItem('authToken'));
    expect(tokenBefore).toBeTruthy();

    await pageB.goto(`${FRONTEND_BASE}/items`, { waitUntil: 'domcontentloaded' });
    await pageB.waitForURL((url) => new URL(url).pathname === '/items', { timeout: 30000 });

    const tokenInTabB = await pageB.evaluate(() => localStorage.getItem('authToken'));
    expect(tokenInTabB).toBeTruthy();

    await pageA.getByRole('button', { name: 'Logout' }).click();

    await pageA.waitForURL((url) => new URL(url).pathname === '/login', { timeout: 30000 });
    await pageB.waitForURL((url) => new URL(url).pathname === '/login', { timeout: 30000 });

    const storageAfter = await pageB.evaluate(() => ({
      authToken: localStorage.getItem('authToken'),
      refreshToken: localStorage.getItem('refreshToken'),
      companyToken: localStorage.getItem('companyToken'),
      authEpoch: Number.parseInt(localStorage.getItem('authEpoch') || '0', 10)
    }));

    expect(storageAfter.authToken).toBeNull();
    expect(storageAfter.refreshToken).toBeNull();
    expect(storageAfter.companyToken).toBeNull();
    expect(storageAfter.authEpoch).toBeGreaterThan(epochBefore);

    await pageB.goto(`${FRONTEND_BASE}/items`, { waitUntil: 'domcontentloaded' });
    await pageB.waitForURL((url) => new URL(url).pathname === '/login', { timeout: 30000 });

    await context.close();
  }, 120000);
});
