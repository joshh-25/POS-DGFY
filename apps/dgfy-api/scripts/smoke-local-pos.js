import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

const API_BASE = (process.env.SMOKE_API_BASE || 'http://localhost:5000').replace(/\/$/, '');
const COMPANY_TOKEN = process.env.SMOKE_COMPANY_TOKEN || 'token-original';
const EMAIL = process.env.SMOKE_EMAIL || 'admin@test.com';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Admin123!';

const results = [];

const pushResult = (name, ok, status, message = '') => {
  results.push({ name, ok, status, message });
};

const fetchJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
};

const run = async () => {
  try {
    const health = await fetchJson('/health');
    pushResult('GET /health', health.response.status === 200, health.response.status);

    const validateToken = await fetchJson(`/api/v1/auth/validate-token/${encodeURIComponent(COMPANY_TOKEN)}`);
    pushResult('GET /api/v1/auth/validate-token/:token', validateToken.response.status === 200, validateToken.response.status);

    const login = await fetchJson('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company-token': COMPANY_TOKEN
      },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });

    const token = login.body?.data?.token || null;
    pushResult(
      'POST /api/v1/auth/login',
      login.response.status === 200 && Boolean(token),
      login.response.status,
      token ? '' : 'Missing token in response'
    );

    if (!token) {
      throw new Error('Login did not return a token; cannot continue authenticated smoke checks.');
    }

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'x-company-token': COMPANY_TOKEN
    };

    const authenticatedChecks = [
      '/api/v1/users/me',
      '/api/v1/dashboard/stats',
      '/api/v1/dashboard/low-stock',
      '/api/v1/purchase-orders',
      '/api/v1/suppliers',
      '/api/v1/alerts',
      '/api/v1/pos/catalog?limit=5',
      '/api/v1/sales/transactions?limit=5'
    ];

    for (const endpoint of authenticatedChecks) {
      const res = await fetchJson(endpoint, { headers: authHeaders });
      const ok = res.response.status >= 200 && res.response.status < 300;
      pushResult(`GET ${endpoint}`, ok, res.response.status);
    }

    const failed = results.filter((entry) => !entry.ok);
    const width = Math.max(...results.map((entry) => entry.name.length), 16);
    console.log('\n[SmokePOS] Results');
    console.log('-'.repeat(width + 24));
    for (const entry of results) {
      const marker = entry.ok ? 'PASS' : 'FAIL';
      const suffix = entry.message ? ` (${entry.message})` : '';
      console.log(`${entry.name.padEnd(width)}  ${marker}  ${entry.status}${suffix}`);
    }
    console.log('-'.repeat(width + 24));

    if (failed.length > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('[SmokePOS] failed:', error.message);
    process.exit(1);
  }
};

run();
