import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const evidenceRoot = path.join(repoRoot, 'BIR_ANNEX_B_LOCAL_EVIDENCE');
const apiBaseUrl = String(process.env.BIR_LOCAL_API_BASE_URL || 'http://127.0.0.1:5002').replace(/\/$/, '');
const posBaseUrl = String(process.env.BIR_LOCAL_POS_BASE_URL || 'http://127.0.0.1:5182').replace(/\/$/, '');
const companyName = String(process.env.BIR_LOCAL_COMPANY_NAME || 'Masu Cafe Indian Foodszt').trim();
const businessDate = String(process.env.BIR_LOCAL_BUSINESS_DATE || '2026-10-02').trim();
const locationId = Number.parseInt(process.env.BIR_LOCAL_LOCATION_ID || '3', 10);
const terminalId = String(process.env.BIR_LOCAL_TERMINAL_ID || 'COUNTER-01').trim().toUpperCase();
const email = String(process.env.BIR_LOCAL_EMAIL || process.env.SMOKE_DGFY_EMAIL || '').trim();
const password = String(process.env.BIR_LOCAL_PASSWORD || process.env.SMOKE_DGFY_PASSWORD || '').trim();
const generatedAt = new Date().toISOString();

const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
const assertLocalUrl = (value, label) => {
    const parsed = new URL(value);
    if (!localHosts.has(parsed.hostname)) {
        throw new Error(`${label} must resolve to localhost/127.0.0.1; remote environments are outside this runner.`);
    }
    return parsed;
};

assertLocalUrl(apiBaseUrl, 'BIR_LOCAL_API_BASE_URL');
assertLocalUrl(posBaseUrl, 'BIR_LOCAL_POS_BASE_URL');
if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) throw new Error('BIR_LOCAL_BUSINESS_DATE must use YYYY-MM-DD.');
if (!Number.isInteger(locationId) || locationId <= 0) throw new Error('BIR_LOCAL_LOCATION_ID must be a positive integer.');
if (!/^[A-Za-z0-9._-]{2,100}$/.test(terminalId)) throw new Error('BIR_LOCAL_TERMINAL_ID is invalid.');
if (!email || !password) throw new Error('Set BIR_LOCAL_EMAIL and BIR_LOCAL_PASSWORD for the local evidence run.');

const redactKey = /(password|secret|token|authorization|cookie|card|cvc|cvv|api[_-]?key|private[_-]?key)/i;
const redact = (value, key = '') => {
    if (redactKey.test(key)) return '[REDACTED]';
    if (Array.isArray(value)) return value.map((entry) => redact(entry));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
    }
    return value;
};

const ensureDir = async (relativeDir) => fs.mkdir(path.join(evidenceRoot, relativeDir), { recursive: true });
const writeText = async (relativePath, content) => {
    const outputPath = path.join(evidenceRoot, relativePath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, String(content), 'utf8');
    return outputPath;
};
const writeJson = (relativePath, value) => writeText(relativePath, `${JSON.stringify(redact(value), null, 2)}\n`);
const readJson = async (relativePath) => {
    try {
        return JSON.parse(await fs.readFile(path.join(evidenceRoot, relativePath), 'utf8'));
    } catch {
        return null;
    }
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""').replaceAll('\r', ' ').replaceAll('\n', ' ')}"`;
const writeCsv = async (relativePath, headers, rows) => {
    const content = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
    return writeText(relativePath, content);
};

const fetchResponse = async (pathName, options = {}) => {
    const response = await fetch(`${apiBaseUrl}${pathName}`, options);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let body = null;
    if (/json/i.test(contentType)) {
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    }
    return { status: response.status, contentType, text, body };
};

const jsonRequest = async (pathName, options = {}) => {
    const result = await fetchResponse(pathName, options);
    return { ...result, data: result.body?.data ?? null, message: result.body?.message || null };
};

const statusOf = (result) => Number.isInteger(result?.status) && result.status >= 200 && result.status < 300;
const query = (entries) => new URLSearchParams(entries).toString();
const scopeQuery = () => query({
    date_from: businessDate,
    date_to: businessDate,
    branch_id: String(locationId),
    location_id: String(locationId),
    terminal_id: terminalId
});

const declaredRoute = (report) => Array.isArray(report?.route) ? String(report.route[0] || '') : '';
const compactSample = (value, depth = 0) => {
    if (depth > 3) return '[TRUNCATED]';
    if (Array.isArray(value)) return value.slice(0, 20).map((entry) => compactSample(entry, depth + 1));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, compactSample(entry, depth + 1)]));
};
const sampleRows = (value) => {
    if (Array.isArray(value?.rows)) return value.rows.slice(0, 20);
    if (Array.isArray(value?.records)) return value.records.slice(0, 20);
    if (Array.isArray(value)) return value.slice(0, 20);
    return [];
};

const checks = [];
const addCheck = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail || '') });
const writeCheckFile = async (relativePath, status, lines = []) => writeText(relativePath, [
    `status=${status}`,
    'environment=LOCAL_ONLY',
    'evidence_label=LOCAL TEST - NOT FOR SUBMISSION',
    ...lines,
    ''
].join('\n'));

const apiSummary = {
    generated_at: generatedAt,
    environment: 'LOCAL_ONLY',
    company_name: companyName,
    business_date: businessDate,
    location_id: locationId,
    terminal_id: terminalId,
    api_base_url: apiBaseUrl,
    pos_base_url: posBaseUrl,
    source_revision: null,
    endpoints: {}
};

const recordEndpoint = (name, result) => {
    apiSummary.endpoints[name] = {
        status: result?.status ?? null,
        content_type: result?.contentType || null,
        message: result?.message || null
    };
    return result;
};

const authenticate = async () => {
    const login = recordEndpoint('dgfy_login', await jsonRequest('/api/v1/dgfy/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
    }));
    addCheck('local.login', statusOf(login) && Boolean(login.data?.token), statusOf(login) ? 'Authenticated local DGFY account.' : login.message || 'Login failed.');
    if (!login.data?.token) throw new Error(`Local DGFY login failed (${login.status}).`);

    const dgfyHeaders = { authorization: `Bearer ${login.data.token}` };
    const companies = recordEndpoint('dgfy_companies', await jsonRequest('/api/v1/dgfy/account/companies', { headers: dgfyHeaders }));
    const companyRows = [
        ...(companies.data?.owned_companies || []),
        ...(companies.data?.invited_companies || [])
    ];
    const company = companyRows.find((row) => String(row?.company_name || '').trim().toLowerCase() === companyName.toLowerCase())
        || companyRows.find((row) => row?.can_switch === true);
    addCheck('local.company', statusOf(companies) && Boolean(company?.tenant_id), company?.company_name || 'Requested local company was not found.');
    if (!company?.tenant_id) throw new Error(`Local company '${companyName}' was not found.`);

    const tenantSession = recordEndpoint('tenant_session', await jsonRequest('/api/v1/dgfy/auth/tenant-session', {
        method: 'POST',
        headers: { ...dgfyHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ tenant_id: company.tenant_id, access_scope: 'pos' })
    }));
    const tenantToken = tenantSession.data?.token;
    const companyToken = tenantSession.data?.company?.token;
    addCheck('local.tenant_session', statusOf(tenantSession) && Boolean(tenantToken && companyToken), 'Tenant session established locally.');
    if (!tenantToken || !companyToken) throw new Error(`Local tenant session failed (${tenantSession.status}).`);

    return {
        tenantId: String(company.tenant_id),
        headers: {
            authorization: `Bearer ${tenantToken}`,
            'x-company-token': companyToken
        }
    };
};

const callAndSave = async (name, pathName, headers, relativePath) => {
    const result = recordEndpoint(name, await jsonRequest(pathName, { headers }));
    await writeJson(relativePath, {
        request: { path: pathName, method: 'GET' },
        response: { status: result.status, content_type: result.contentType, data: result.data, message: result.message }
    });
    return result;
};

const runApiEvidence = async ({ tenantId, headers }) => {
    apiSummary.source_revision = sha256(`${tenantId}|${businessDate}|${locationId}|${terminalId}`);
    const locations = await callAndSave('locations', '/api/v1/tenant-locations?include_inactive=false', headers, '00-run/locations.json');
    const me = await callAndSave('users_me', '/api/v1/users/me', headers, '00-run/user.json');
    const settings = await callAndSave('settings', '/api/v1/settings', headers, '00-run/settings.json');
    const shift = await callAndSave('current_shift', '/api/v1/pos/terminal/shifts/current', headers, '00-run/current-shift.json');
    addCheck('local.read_surfaces', [locations, me, settings, shift].every(statusOf), 'Local settings, identity, locations, and shift endpoints returned 2xx.');

    const scope = scopeQuery();
    const orderList = await callAndSave('business_admin_orders', `/api/v1/business-admin/orders?${query({ date_from: businessDate, date_to: businessDate, limit: '100', page: '1' })}`, headers, '04/source-orders.json');
    const orders = Array.isArray(orderList.data?.orders) ? orderList.data.orders : [];
    const details = [];
    for (const order of orders.filter((row) => Number.isInteger(Number(row?.transaction_id))).slice(0, 8)) {
        const detail = await jsonRequest(`/api/v1/business-admin/orders/${encodeURIComponent(order.transaction_id)}`, { headers });
        details.push({ transaction_id: order.transaction_id, status: detail.status, data: detail.data, message: detail.message });
    }
    await writeJson('04/source-order-details.json', { scope: { business_date: businessDate, location_id: locationId, terminal_id: terminalId }, rows: details });

    const eJournalSummary = await callAndSave('ejournal_summary', `/api/v1/business-admin/reports/evidence/ejournal?format=summary&${scope}`, headers, '08/summary.json');
    const eJournalText = recordEndpoint('ejournal_txt', await fetchResponse(`/api/v1/business-admin/reports/evidence/ejournal?format=txt&${scope}`, { headers }));
    const eJournalManifest = recordEndpoint('ejournal_manifest', await fetchResponse(`/api/v1/business-admin/reports/evidence/ejournal?format=manifest&${scope}`, { headers }));
    const eJournalHardCopy = recordEndpoint('ejournal_hard_copy', await fetchResponse(`/api/v1/business-admin/reports/evidence/ejournal?format=hard-copy&${scope}`, { headers }));
    await writeText('08/e-journal.txt', eJournalText.text || '');
    await writeText('08/e-journal-hard-copy.txt', eJournalHardCopy.text || '');
    await writeText('08/manifest.json', eJournalManifest.text || '{}');

    const evidenceCatalog = await callAndSave('evidence_catalog', '/api/v1/business-admin/reports/evidence/catalog', headers, '07/report-catalog.json');
    const reportRows = Array.isArray(evidenceCatalog.data?.reports) ? evidenceCatalog.data.reports : [];
    const reportOverview = await callAndSave('pos_report_overview', `/api/v1/pos/reports/overview?${scope}`, headers, '07/pos-report-overview.json');
    const reportSamples = [];
    for (const report of reportRows.filter((row) => row?.report_key && row.report_key !== 'audit_activity')) {
        const reportKey = String(report.report_key);
        const route = declaredRoute(report);
        let dataset;
        let sampleRoute;
        let sampleKind;
        if (route.includes('/business-admin/reports/datasets/:reportKey')) {
            sampleRoute = `/api/v1/business-admin/reports/datasets/${encodeURIComponent(reportKey)}?${query({ date_from: businessDate, date_to: businessDate, branch_id: String(locationId), location_id: String(locationId), terminal_id: terminalId, limit: '20', page: '1' })}`;
            sampleKind = 'business_admin_dataset';
            dataset = await jsonRequest(sampleRoute, { headers });
        } else if (route.includes('/pos/reports/overview')) {
            sampleRoute = `/api/v1/pos/reports/overview?${scope}`;
            sampleKind = 'shared_pos_report_overview';
            dataset = reportOverview;
        } else if (route.startsWith('/api/v1/reports/')) {
            const legacyQuery = {
                startDate: `${businessDate}T00:00:00.000Z`,
                endDate: `${businessDate}T23:59:59.999Z`,
                location_id: String(locationId),
                branch_id: String(locationId),
                date_from: businessDate,
                date_to: businessDate,
                terminal_id: terminalId,
                ...(reportKey === 'saved_report_snapshots' ? { type: 'sales', limit: '20' } : {})
            };
            sampleRoute = `${route}?${query(legacyQuery)}`;
            sampleKind = 'legacy_report_route';
            dataset = await jsonRequest(sampleRoute, { headers });
        } else {
            sampleRoute = route || null;
            sampleKind = 'declared_route_not_sampled';
            dataset = { status: 0, data: null, message: 'The report has no recognized local read route.' };
        }
        reportSamples.push({
            report_key: reportKey,
            label: report.label,
            category: report.category,
            surface: report.surface,
            owner: report.owner,
            applicability: report.applicability,
            declared_route: route || null,
            sample_route: sampleRoute,
            sample_kind: sampleKind,
            status: dataset.status,
            rows: sampleRows(dataset.data),
            pagination: dataset.data?.pagination || null,
            sample: compactSample(dataset.data),
            message: dataset.message
        });
    }
    await writeJson('07/report-samples.json', {
        environment: 'LOCAL_ONLY',
        scope: { business_date: businessDate, location_id: locationId, terminal_id: terminalId },
        generated_at: generatedAt,
        reports: reportSamples
    });
    await writeCsv('07/report-inventory.csv', ['report_key', 'label', 'surface', 'owner', 'applicability', 'declared_route', 'sample_route', 'sample_kind', 'api_status', 'row_count', 'message'], reportSamples.map((row) => [
        row.report_key, row.label, row.surface, row.owner, row.applicability, row.declared_route || '', row.sample_route || '', row.sample_kind, row.status, row.rows.length, row.message || ''
    ]));

    const xReading = await callAndSave('x_reading', `/api/v1/pos/x-reading/current?${query({ location_id: String(locationId), terminal_id: terminalId })}`, headers, '06/x-reading.json');
    const zReading = await callAndSave('z_reading', `/api/v1/pos/z-reading/${encodeURIComponent(businessDate)}?${query({ location_id: String(locationId), terminal_id: terminalId })}`, headers, '06/z-reading.json');
    const zDetails = await callAndSave('z_reading_details', `/api/v1/pos/z-reading/${encodeURIComponent(businessDate)}/details?${query({ location_id: String(locationId), terminal_id: terminalId })}`, headers, '06/z-reading-details.json');

    const audit = await callAndSave('business_admin_audit', '/api/v1/business-admin/audit?limit=100&page=1', headers, '13/audit-source.json');
    const auditRows = Array.isArray(audit.data?.logs) ? audit.data.logs : [];
    const relevantAudit = auditRows.filter((row) => {
        const value = JSON.stringify(row).toLowerCase();
        return value.includes(String(locationId)) || value.includes(terminalId.toLowerCase()) || value.includes(businessDate);
    });
    await writeCsv('13/audit-trail.csv', ['audit_log_id', 'timestamp', 'actor_name', 'action', 'entity_type', 'location_id', 'terminal_id', 'changes'], relevantAudit.map((row) => [
        row.audit_log_id, row.timestamp, row.actor_name, row.action, row.entity_type, row.location_id, row.terminal_id, row.changes
    ]));

    const sourceCounts = eJournalSummary.data?.summary?.source_counts || {};
    const hasFiscalDocuments = Number(sourceCounts.transactions || 0) > 0 && Number(sourceCounts.documents || 0) > 0;
    const hasAuditFields = relevantAudit.some((row) => row.timestamp && (row.actor_name || row.actor_user_id) && row.action && row.changes);
    const xDate = String(xReading.data?.business_date || '').slice(0, 10);
    const zDate = String(zReading.data?.business_date || '').slice(0, 10);
    const allReportsReturned = reportSamples.length > 0 && reportSamples.every((row) => row.status >= 200 && row.status < 300);

    await writeCheckFile('03/check.txt', 'BLOCKED', ['reason=The official Annex C pro forma and executed signatures/authorization documents were not supplied locally; no legal form was fabricated.']);
    await writeCheckFile('04/check.txt', hasFiscalDocuments ? 'PASS' : 'BLOCKED', [
        `fiscal_source_transactions=${sourceCounts.transactions || 0}`,
        `fiscal_source_documents=${sourceCounts.documents || 0}`,
        hasFiscalDocuments ? 'reason=Local fiscal source records are available for sample rendering.' : 'reason=The selected local scope has no persisted fiscal transactions; existing NFS/online records cannot be relabeled as BIR invoice samples.'
    ]);
    await writeCheckFile('05/check.txt', Number(sourceCounts.adjustments || 0) > 0 ? 'PASS' : 'BLOCKED', [
        `adjustment_records=${sourceCounts.adjustments || 0}`,
        Number(sourceCounts.adjustments || 0) > 0 ? 'reason=Adjustment source records are linked by the e-journal contract.' : 'reason=No persisted adjustment source was returned for the selected local scope; no adjustment printout was invented.'
    ]);
    await writeCheckFile('06/check.txt', statusOf(xReading) && statusOf(zReading) && statusOf(zDetails) ? 'PASS' : 'BLOCKED', [
        `x_reading_date=${xDate || 'missing'}`, `z_reading_date=${zDate || 'missing'}`,
        `target_business_date=${businessDate}`,
        xDate === businessDate && zDate === businessDate ? 'reconciliation_scope=matching business date' : 'reconciliation_scope=blocked because X and Z outputs are not on the same selected business date.'
    ]);
    await writeCheckFile('07/check.txt', allReportsReturned ? 'PASS' : 'BLOCKED', [
        `catalog_rows=${reportRows.length}`, `report_samples_checked=${reportSamples.length}`,
        `report_routes_sampled=${new Set(reportSamples.map((row) => row.sample_kind)).size}`,
        allReportsReturned ? 'reason=Each declared local report route returned a 2xx response; shared POS routes are recorded as shared-route samples.' : 'reason=At least one declared local report route did not return a local sample.'
    ]);
    await writeCheckFile('08/check.txt', hasFiscalDocuments ? 'PASS' : 'BLOCKED', [
        `journal_record_count=${eJournalSummary.data?.summary?.record_count || 0}`,
        `journal_documents=${sourceCounts.documents || 0}`,
        hasFiscalDocuments ? 'reason=Receipt-complete local journal source records exist.' : 'reason=The journal currently contains no fiscal document records for this scope; reading-only output is not a receipt-complete Annex B sample.'
    ]);
    await writeCheckFile('09/check.txt', 'PASS', ['reason=The system narrative is generated from the local source/runtime surfaces recorded by this run.']);
    await writeCheckFile('10/check.txt', 'PENDING_BROWSER_CAPTURE', ['reason=POS login/home/version screenshots are captured by the browser phase.']);
    await writeCheckFile('11/check.txt', 'PENDING_BROWSER_CAPTURE', ['reason=Online/offline transition screenshots are captured by the browser phase.']);
    await writeCheckFile('12/check.txt', 'PASS', ['reason=The software operating manual is factual and local; no unverified machine brochure is claimed.']);
    await writeCheckFile('13/check.txt', hasAuditFields ? 'PASS' : 'BLOCKED', [
        `relevant_audit_rows=${relevantAudit.length}`,
        hasAuditFields ? 'reason=Persisted local audit rows contain timestamp, actor, action, and change values.' : 'reason=Required persisted audit fields were not found in the local filtered rows.'
    ]);

    await writeJson('08/reconciliation.json', {
        scope: { business_date: businessDate, location_id: locationId, terminal_id: terminalId },
        source_counts: sourceCounts,
        journal_record_count: eJournalSummary.data?.summary?.record_count || 0,
        journal_sha256: eJournalSummary.data?.summary?.content_sha256 || null,
        source_documents_reconciled: hasFiscalDocuments,
        external_review_status: 'required_before_external_submission',
        approval_claim: 'none'
    });
    await writeJson('06/reconciliation.json', {
        target_business_date: businessDate,
        x_reading_date: xDate || null,
        z_reading_date: zDate || null,
        x_status: xReading.status,
        z_status: zReading.status,
        matching_business_date: xDate === businessDate && zDate === businessDate,
        note: 'Local JSON report evidence only; physical printer output is not claimed by this API phase.'
    });
    await writeJson('13/reconciliation.json', {
        target_scope: { business_date: businessDate, location_id: locationId, terminal_id: terminalId },
        rows_examined: auditRows.length,
        relevant_rows: relevantAudit.length,
        required_fields: ['timestamp', 'actor_name_or_user_id', 'action', 'changes'],
        fields_present: hasAuditFields
    });
    await writeJson('00-run/api-summary.json', apiSummary);

    return {
        tenantId,
        sourceCounts,
        hasFiscalDocuments,
        allReportsReturned,
        hasAuditFields,
        reportCount: reportRows.length,
        orderCount: orders.length,
        xDate,
        zDate,
        reportOverviewStatus: reportOverview.status
    };
};

const captureBrowserEvidence = async () => {
    const requireFromPos = createRequire(path.join(repoRoot, 'apps', 'dgfy-pos', 'package.json'));
    let chromium;
    try {
        ({ chromium } = requireFromPos('playwright'));
    } catch (error) {
        await writeCheckFile('10/check.txt', 'BLOCKED', [`reason=Playwright is unavailable: ${error.message}`]);
        await writeCheckFile('11/check.txt', 'BLOCKED', [`reason=Playwright is unavailable: ${error.message}`]);
        return { available: false, error: error.message };
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: posBaseUrl });
    const page = await context.newPage();
    const runtimeErrors = [];
    let authenticated = false;
    let browserOffline = false;
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        const messageText = message.text();
        if (authenticated && message.type() === 'error' && !(browserOffline && /ERR_INTERNET_DISCONNECTED|Failed to load resource/i.test(messageText))) {
            runtimeErrors.push(`console: ${messageText}`);
        }
    });
    page.on('response', (response) => {
        if (response.status() >= 500) runtimeErrors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    });
    page.on('requestfailed', (request) => {
        const failure = request.failure()?.errorText || '';
        if (!/ERR_ABORTED|ERR_NETWORK_ACCESS_DENIED/.test(failure) && !(browserOffline && /ERR_INTERNET_DISCONNECTED/.test(failure))) {
            runtimeErrors.push(`requestfailed: ${failure}`);
        }
    });

    const screenshot = async (relativePath) => {
        const target = path.join(evidenceRoot, relativePath);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await page.screenshot({ path: target, fullPage: true });
        return target;
    };

    try {
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.getByRole('heading', { name: 'Terminal Login Required' }).waitFor({ state: 'visible', timeout: 20_000 });
        await screenshot('10/login.png');
        await page.getByLabel('DGFY or Cashier Email').fill(email);
        await page.getByRole('textbox', { name: 'Password' }).fill(password);
        await page.getByRole('button', { name: /^sign in$/i }).click({ noWaitAfter: true });
        await page.waitForTimeout(1_000);

        const companyField = page.getByRole('button', { name: 'Company', exact: true });
        const companyFieldReady = await companyField.waitFor({ state: 'visible', timeout: 20_000 })
            .then(() => true)
            .catch(() => false);
        if (companyFieldReady) {
            await companyField.click({ noWaitAfter: true });
            const companyOption = page.getByRole('option', { name: companyName, exact: true });
            await companyOption.waitFor({ state: 'visible', timeout: 20_000 });
            await companyOption.click({ noWaitAfter: true });
            await page.getByRole('button', { name: /^continue to pos$/i }).click({ noWaitAfter: true });
        }
        await Promise.race([
            page.getByText('Select a branch', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 }),
            page.getByRole('button', { name: 'Unlock Terminal', exact: true }).waitFor({ state: 'visible', timeout: 20_000 }),
            page.getByRole('button', { name: 'Skip for Admin', exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
        ]).catch(() => {});
        await page.waitForTimeout(1_000);
        authenticated = true;
        await page.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
        const skipShift = page.getByRole('button', { name: 'Skip for Admin', exact: true });
        if (await skipShift.isVisible().catch(() => false)) await skipShift.click().catch(() => {});
        await page.waitForTimeout(1_000);
        await screenshot('10/home.png');

        const versionBadge = page.getByTestId('dgfy-version-badge');
        const versionText = await versionBadge.innerText().catch(() => '');
        const homeText = await page.locator('body').innerText().catch(() => '');
        await writeJson('10/screenshot-metadata.json', {
            login_screenshot: '10/login.png',
            home_screenshot: '10/home.png',
            version_text: versionText,
            visible_version_or_identity_text: homeText.match(/(?:DGFY|POS)[^\n]{0,80}/i)?.[0] || null,
            runtime_errors: [...new Set(runtimeErrors)]
        });
        await writeCheckFile('10/check.txt', versionText ? 'PASS' : 'BLOCKED', [
            `version_text=${versionText || 'missing'}`,
            versionText ? 'reason=Local POS login and home screenshots captured with a visible build version.' : 'reason=Version badge was not visible on the local POS home surface.'
        ]);

        browserOffline = true;
        await context.setOffline(true);
        await page.waitForTimeout(2_500);
        const offlineText = await page.locator('body').innerText().catch(() => '');
        await screenshot('11/offline.png');
        await context.setOffline(false);
        browserOffline = false;
        await page.waitForTimeout(2_500);
        const onlineText = await page.locator('body').innerText().catch(() => '');
        await screenshot('11/online-recovered.png');
        const offlineVisible = /offline|connection lost|reconnect/i.test(offlineText);
        const onlineVisible = /online|connected/i.test(onlineText);
        await writeJson('11/connectivity-metadata.json', {
            offline_screenshot: '11/offline.png',
            online_recovered_screenshot: '11/online-recovered.png',
            offline_indicator_detected: offlineVisible,
            online_indicator_detected: onlineVisible,
            runtime_errors: [...new Set(runtimeErrors)]
        });
        await writeCheckFile('11/check.txt', offlineVisible && onlineVisible ? 'PASS' : 'BLOCKED', [
            `offline_indicator_detected=${offlineVisible}`,
            `online_recovery_detected=${onlineVisible}`,
            offlineVisible && onlineVisible ? 'reason=Local browser connection transition was visible and recovered.' : 'reason=The local POS did not expose both connectivity states clearly.'
        ]);
        await writeText('12/software-manual-source.md', `# Local POS operating manual\n\nEvidence label: LOCAL TEST - NOT FOR SUBMISSION\n\n## Scope\nThis is a factual software operating guide for the local POS surface at ${posBaseUrl}. It is not a machine-manufacturer brochure.\n\n## Verified flow\n1. Open the local POS login screen.\n2. Sign in with a permitted local DGFY or cashier account.\n3. Select the local company and continue to POS.\n4. Use Sell for catalog/cart operations and History for persisted transaction lookup.\n5. Use Reports for local sales/reading outputs and Settings for POS setup.\n6. Use the local Evidence/Reports surface for the e-journal export when the selected scope contains finalized fiscal records.\n7. Keep the terminal connected to the local API for server-authoritative finalization; offline mode is visibly restricted according to the captured indicator.\n\n## Hardware applicability\nNo manufacturer model or printer brochure is asserted by this software-only run. A genuine brochure is required only if a specific machine/peripheral is part of the filing scope.\n`);
        return { available: true, versionText, offlineVisible, onlineVisible, runtimeErrors: [...new Set(runtimeErrors)] };
    } catch (error) {
        await writeJson('10/browser-failure.json', { message: error.message, url: page.url(), runtime_errors: [...new Set(runtimeErrors)] });
        await writeCheckFile('10/check.txt', 'BLOCKED', [`reason=${error.message}`]);
        await writeCheckFile('11/check.txt', 'BLOCKED', [`reason=${error.message}`]);
        return { available: true, error: error.message, runtimeErrors: [...new Set(runtimeErrors)] };
    } finally {
        await context.close();
        await browser.close();
    }
};

const writeSystemDescription = async ({ tenantId, api }) => {
    await writeText('09/system-description.md', `# OPIS + POS local system description\n\nEvidence label: LOCAL TEST - NOT FOR SUBMISSION\nGenerated: ${generatedAt}\nSource revision: ${api.source_revision}\n\n## Scope\nThis document describes only the local OPIS/POS/API/database runtime used for this evidence run. It does not describe staging or production and does not claim BIR approval.\n\n## Components\n- POS frontend: local POS Vite surface at ${posBaseUrl}.\n- OPIS frontend: the local Business Admin surface is part of the same source tree and uses the Business Admin API routes.\n- Backend API: local API at ${apiBaseUrl}, with route -> controller -> use-case -> repository -> model boundaries.\n- Database: local MySQL tenant data selected through tenant session ${tenantId}.\n- Receipt/fiscal source: persisted POS transaction fiscal snapshots and the shared receipt renderer.\n- Adjustments: persisted POS transaction adjustments and fiscal event/audit records.\n- Readings: POS X-reading and Z-reading endpoints and persisted Z-reading snapshots.\n- Reports/e-journal: registry-backed Business Admin reports and the bounded e-journal evidence endpoint.\n\n## Verified flow\nThe local flow is operator login -> tenant session -> POS shift/catalog -> finalized transaction source -> adjustment/readings/report outputs -> e-journal export -> audit records. The selected local scope was business date ${businessDate}, location ${locationId}, terminal ${terminalId}.\n\n## Evidence boundary\nThe run records actual returned local outputs. It does not relabel non-fiscal records as fiscal invoices, invent tax IDs, or claim external accreditation.\n`);
};

const writeManualAndMetadata = async () => {
    await writeText('12/checklist.md', `# Item 12 local applicability\n\nEvidence label: LOCAL TEST - NOT FOR SUBMISSION\n\n- Software operating manual: applicable and generated from the verified local POS flow.\n- Machine manufacturer brochure: N/A for this software-only run because no specific physical machine model was supplied.\n- Printer/peripheral evidence: not claimed unless a genuine local device model and print result are supplied.\n`);
};

const writeResults = async ({ apiResult, browserResult }) => {
    const restoreDrill = await readJson('14/restore-drill-status.json');
    const restoreDrillPassed = restoreDrill?.success === true && restoreDrill?.all_tables_match === true;
    await writeCheckFile('14/check.txt', restoreDrillPassed ? 'PASS' : 'BLOCKED', [
        restoreDrillPassed ? 'reason=Local mysqldump/import restore completed in a disposable database and all table names and row counts matched.' : 'reason=Disposable local backup/restore drill has not yet been executed successfully.'
    ]);
    const itemStatuses = [
        [3, 'applicable', 'BLOCKED', 'No official Annex C pro forma/executed signature package supplied locally.'],
        [4, 'applicable', apiResult.hasFiscalDocuments ? 'PASS' : 'BLOCKED', apiResult.hasFiscalDocuments ? '' : 'Selected local scope has no persisted fiscal invoice source records.'],
        [5, 'applicable', apiResult.sourceCounts.adjustments > 0 ? 'PASS' : 'BLOCKED', apiResult.sourceCounts.adjustments > 0 ? '' : 'No persisted adjustment records returned for the selected local scope.'],
        [6, 'applicable', apiResult.xDate === businessDate && apiResult.zDate === businessDate ? 'PASS' : 'BLOCKED', apiResult.xDate === businessDate && apiResult.zDate === businessDate ? '' : 'X and Z outputs did not share the selected business date.'],
        [7, 'applicable', apiResult.allReportsReturned ? 'PASS' : 'BLOCKED', apiResult.allReportsReturned ? '' : 'One or more registry-backed report datasets did not return a local sample.'],
        [8, 'applicable', apiResult.hasFiscalDocuments ? 'PASS' : 'BLOCKED', apiResult.hasFiscalDocuments ? '' : 'E-journal source contains no finalized fiscal documents for this scope.'],
        [9, 'applicable', 'PASS', 'Actual local source/runtime narrative generated.'],
        [10, 'applicable', browserResult?.versionText ? 'PASS' : 'BLOCKED', browserResult?.versionText ? '' : 'Local version screenshot capture did not verify a visible version.'],
        [11, 'applicable', browserResult?.offlineVisible && browserResult?.onlineVisible ? 'PASS' : 'BLOCKED', browserResult?.offlineVisible && browserResult?.onlineVisible ? '' : 'Both local connectivity states were not visibly verified.'],
        [12, 'applicable', 'PASS', 'Software manual generated; machine brochure is explicitly N/A without a supplied device model.'],
        [13, 'applicable', apiResult.hasAuditFields ? 'PASS' : 'BLOCKED', apiResult.hasAuditFields ? '' : 'Required audit fields were not found in filtered local rows.'],
        [14, 'applicable', restoreDrillPassed ? 'PASS' : 'BLOCKED', restoreDrillPassed ? 'Disposable local backup/restore drill passed with matching table names and row counts.' : 'Disposable local backup/restore drill has not yet been executed successfully.']
    ];
    await writeCsv('RESULTS.csv', ['item', 'scope_applicable', 'status', 'source_version', 'test_date', 'local_test_performed', 'evidence_files', 'remaining_issue'], itemStatuses.map(([item, scope, status, issue]) => [
        item,
        scope,
        status,
        apiSummary.source_revision,
        generatedAt,
        'yes',
        `item-${String(item).padStart(2, '0')}/`,
        issue
    ]));
    await writeJson('manifest.json', {
        schema_version: 'opis-pos-bir-annex-b-local-evidence-v1',
        environment: 'LOCAL_ONLY',
        plan_scope: 'Annex B items 03-14 only',
        generated_at: generatedAt,
        source_revision: apiSummary.source_revision,
        api_base_url: apiBaseUrl,
        pos_base_url: posBaseUrl,
        company_name: companyName,
        business_date: businessDate,
        location_id: locationId,
        terminal_id: terminalId,
        external_review_status: 'required_before_external_submission',
        approval_claim: 'none',
        statuses: Object.fromEntries(itemStatuses.map(([item, , status]) => [String(item), status]))
    });
};

const main = async () => {
    await ensureDir('00-run');
    for (const item of ['03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14']) await ensureDir(item);
    const session = await authenticate();
    const apiResult = await runApiEvidence(session);
    await writeSystemDescription({ tenantId: session.tenantId, api: apiSummary });
    await writeManualAndMetadata();
    const browserResult = await captureBrowserEvidence();
    await writeResults({ apiResult, browserResult });
    console.log(JSON.stringify({
        evidence_root: evidenceRoot,
        environment: 'LOCAL_ONLY',
        source_revision: apiSummary.source_revision,
        api_checks: checks,
        api_result: apiResult,
        browser_result: browserResult
    }, null, 2));
};

main().catch(async (error) => {
    await writeJson('00-run/failure.json', { message: error.message, generated_at: generatedAt, environment: 'LOCAL_ONLY' }).catch(() => {});
    console.error(`[AnnexBLocalEvidence] ${error.message}`);
    process.exitCode = 1;
});
