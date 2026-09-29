import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminPage = fs.readFileSync(
  path.resolve(__dirname, '../BusinessAdminPage.jsx'),
  'utf8'
);
const businessAdminCss = fs.readFileSync(
  path.resolve(__dirname, '../businessAdmin.css'),
  'utf8'
);

describe('Business Admin Orders pagination contract', () => {
  it('requests and renders no more than 20 invoice rows', () => {
    expect(businessAdminPage).toContain('const BUSINESS_ADMIN_ORDERS_PAGE_SIZE = 20;');
    expect(businessAdminPage).toContain('data.orders.slice(0, BUSINESS_ADMIN_ORDERS_PAGE_SIZE)');
    expect(businessAdminPage).toContain('limit: BUSINESS_ADMIN_ORDERS_PAGE_SIZE');
  });

  it('loads the requested page and exposes previous and next navigation', () => {
    expect(businessAdminPage).toContain('const [ordersPage, setOrdersPage] = useState(1);');
    expect(businessAdminPage).toContain('page: ordersPage');
    expect(businessAdminPage).toContain('<OrdersPagination');
    expect(businessAdminPage).toContain('total_pages');
    expect(businessAdminPage).toContain('onPageChange={setOrdersPage}');
    expect(businessAdminPage).toContain('if (activeSection === \'orders\') setOrdersPage(1);');
  });

  it('keeps the order panel stable during page changes', () => {
    expect(businessAdminPage).toContain('canKeepPaginatedWorkspace');
    expect(businessAdminPage).toContain('refreshError={sectionError}');
    expect(businessAdminPage).toContain('data-testid="business-admin-orders-results"');
    expect(businessAdminPage).toContain('Updating order history…');
    expect(businessAdminPage).toContain('refreshing={refreshing}');
    expect(businessAdminCss).toContain('.business-admin-orders-results.is-refreshing .business-admin-orders-results-content');
  });
});
