import { auditGrandMatadorCatalog } from '../src/modules/storefrontDomains/migration/grandMatadorCatalogAudit.js';

const endpoint = String(process.env.GRANDMATADOR_CATALOG_URL || 'https://api.grandmatador.com/api/v1/catalog').trim();
const pages = [];
let nextUrl = endpoint;
let pageCount = 0;

while (nextUrl) {
    pageCount += 1;
    if (pageCount > 100) throw new Error('Catalog pagination exceeded the safety limit.');
    const response = await fetch(nextUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Catalog request failed with HTTP ${response.status}.`);
    const page = await response.json();
    pages.push(page);
    nextUrl = String(page?.products?.next_page_url || '').trim();
}

const report = auditGrandMatadorCatalog(pages);
process.stdout.write(`${JSON.stringify({ audited_at: new Date().toISOString(), ...report }, null, 2)}\n`);
if (!report.import_ready) process.exitCode = 1;
