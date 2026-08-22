import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');
dotenv.config({ path: join(__dirname, '..', '.env') });
// Reuse the ignored local E2E fixture when the caller has not supplied
// explicit smoke credentials. This keeps the smoke command runnable with the
// same local account used by the POS browser tests without copying secrets
// into the API .env file or source code.
dotenv.config({ path: process.env.SMOKE_ENV_FILE || join(repoRoot, 'dgfy-web', '.env.e2e') });

const API_BASE = (process.env.SMOKE_API_BASE || 'http://localhost:5000').replace(/\/$/, '');
const DGFY_EMAIL = process.env.SMOKE_DGFY_EMAIL || process.env.SMOKE_EMAIL || process.env.E2E_TEST_USER_EMAIL || '';
const DGFY_PASSWORD = process.env.SMOKE_DGFY_PASSWORD || process.env.SMOKE_PASSWORD || process.env.E2E_TEST_USER_PASSWORD || '';
const TENANT_ID = process.env.SMOKE_TENANT_ID || process.env.E2E_TEST_TENANT_ID || '';
const COMPANY_NAME = process.env.SMOKE_COMPANY_NAME || process.env.E2E_TEST_COMPANY_NAME || '';

const results = [];

const pushResult = (name, ok, status, message = '') => {
  results.push({ name, ok, status, message });
};

const printResults = () => {
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
  return failed;
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

const resolveSmokeCompany = (companies) => {
  const acceptedCompanies = companies.filter((company) => company?.can_switch);
  const normalizedTenantId = String(TENANT_ID || '').trim();
  const normalizedCompanyName = String(COMPANY_NAME || '').trim().toLowerCase();
  const selectedByTenantId = normalizedTenantId
    ? acceptedCompanies.find((company) => String(company?.tenant_id || '').trim() === normalizedTenantId)
    : null;
  const selectedByName = normalizedCompanyName
    ? acceptedCompanies.find((company) => String(company?.company_name || '').trim().toLowerCase() === normalizedCompanyName)
    : null;

  if (selectedByTenantId || selectedByName) return selectedByTenantId || selectedByName;
  if (!normalizedTenantId && !normalizedCompanyName && acceptedCompanies.length === 1) {
    return acceptedCompanies[0];
  }
  return null;
};

const run = async () => {
  try {
    const health = await fetchJson('/health');
    pushResult('GET /health', health.response.status === 200, health.response.status);

    if (!DGFY_EMAIL || !DGFY_PASSWORD) {
      pushResult(
        'Local smoke credentials',
        false,
        'CONFIG',
        'Set SMOKE_DGFY_EMAIL and SMOKE_DGFY_PASSWORD, or provide the local .env.e2e fixture.'
      );
      const failed = printResults();
      process.exitCode = failed.length > 0 ? 1 : 0;
      return;
    }

    const login = await fetchJson('/api/v1/dgfy/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: DGFY_EMAIL, password: DGFY_PASSWORD })
    });
    const dgfyToken = String(login.body?.data?.token || '').trim();
    pushResult(
      'POST /api/v1/dgfy/auth/login',
      login.response.status === 200 && Boolean(dgfyToken),
      login.response.status,
      dgfyToken ? '' : 'DGFY login did not return a session token.'
    );

    if (!dgfyToken) {
      printResults();
      process.exitCode = 1;
      return;
    }

    const dgfyHeaders = {
      Authorization: `Bearer ${dgfyToken}`
    };
    const companiesResult = await fetchJson('/api/v1/dgfy/account/companies', {
      headers: dgfyHeaders
    });
    const companies = [
      ...(Array.isArray(companiesResult.body?.data?.owned_companies) ? companiesResult.body.data.owned_companies : []),
      ...(Array.isArray(companiesResult.body?.data?.invited_companies) ? companiesResult.body.data.invited_companies : [])
    ];
    const selectedCompany = resolveSmokeCompany(companies);
    pushResult(
      'GET /api/v1/dgfy/account/companies',
      companiesResult.response.status === 200 && Boolean(selectedCompany),
      companiesResult.response.status,
      companiesResult.response.status !== 200
        ? 'DGFY company discovery failed.'
        : selectedCompany
          ? ''
          : 'Set SMOKE_TENANT_ID or SMOKE_COMPANY_NAME when the account has multiple POS companies.'
    );

    if (!selectedCompany?.tenant_id) {
      printResults();
      process.exitCode = 1;
      return;
    }

    const tenantSession = await fetchJson('/api/v1/dgfy/auth/tenant-session', {
      method: 'POST',
      headers: {
        ...dgfyHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenant_id: selectedCompany.tenant_id,
        access_scope: 'pos'
      })
    });
    const token = String(tenantSession.body?.data?.token || '').trim();
    const companyToken = String(tenantSession.body?.data?.company?.token || '').trim();
    pushResult(
      'POST /api/v1/dgfy/auth/tenant-session',
      tenantSession.response.status === 200 && Boolean(token) && Boolean(companyToken),
      tenantSession.response.status,
      token && companyToken ? '' : 'Tenant session did not return the required POS session fields.'
    );

    if (!token) {
      throw new Error('Tenant session did not return a token; cannot continue authenticated smoke checks.');
    }

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'x-company-token': companyToken
    };

    const authenticatedChecks = [
      '/api/v1/users/me',
      '/api/v1/tenant-locations?include_inactive=false',
      '/api/v1/settings',
      '/api/v1/pos/catalog?limit=5',
      '/api/v1/pos/device/status',
      '/api/v1/pos/terminal/shifts/current'
    ];

    for (const endpoint of authenticatedChecks) {
      const res = await fetchJson(endpoint, { headers: authHeaders });
      const ok = res.response.status >= 200 && res.response.status < 300;
      pushResult(`GET ${endpoint}`, ok, res.response.status);
    }

    const failed = printResults();
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
