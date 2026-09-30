import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readPosFile = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
const paginationSource = fs.readFileSync(path.resolve(__dirname, '../../../../Components/ui/pagination.jsx'), 'utf8');
const appStyles = fs.readFileSync(path.resolve(__dirname, '../../../index.css'), 'utf8');
const paginatedSurfaces = [
  'components/POSTransactionHistoryPanel.jsx',
  'components/PosReportsResponsiveTable.jsx',
  'components/EmployeeManagementPanel.jsx',
  'components/EmployeeCreditManagementPanel.jsx',
  'components/DeliveryPersonnelManagementPanel.jsx',
  'settings/StorefrontReviewsSettings.jsx'
].map(readPosFile);

describe('POS pagination layout contract', () => {
  it('shares one mobile footer surface across History, Reports, and Settings', () => {
    expect(paginationSource).toContain('export const POS_PAGINATION_FOOTER_CLASS');
    paginatedSurfaces.forEach((source) => {
      expect(source).toContain('POS_PAGINATION_FOOTER_CLASS');
    });
    expect(appStyles).toContain('.dgfy-pos-pagination-footer');
    expect(appStyles).not.toContain('.dgfy-pos-history-pagination-footer');
  });

  it('keeps compact phone page-size and page-jump controls inside the footer', () => {
    // The `-suffix` marker was renamed to `-value` ("{n} / page"); page-size
    // labels remain configurable for each paginated surface.
    expect(paginationSource).toContain('dgfy-global-pagination__page-size-value');
    expect(paginationSource).toContain('{selectedPageSize}<span');
    expect(paginationSource).toContain("pageSizeLabel = 'Items per page'");
    expect(paginationSource).toContain('ariaLabel={pageSizeLabel}');
    expect(appStyles).toContain('grid-template-columns: minmax(3.5rem, 1fr) 2.5rem minmax(3.5rem, 1fr) 2.5rem minmax(3.5rem, 1fr);');
    expect(appStyles).toContain('min-width: 0;\n    max-width: 100%;');
    expect(appStyles).toContain('min-width: 3.25rem;\n    padding-inline: 0.5rem;');
    expect(appStyles).toContain('.dgfy-global-pagination__page-size-suffix,\n  .dgfy-global-pagination__go-to-label,\n  .dgfy-global-pagination__go-to-suffix {\n    display: none !important;');
    expect(appStyles).toContain('.dgfy-global-pagination__mobile-go-to-label {\n    display: block;\n    grid-column: 4 / -1;');
    expect(appStyles).toContain('.dgfy-global-pagination__go-to-input {\n    grid-column: 5;\n    grid-row: 2;');
    expect(appStyles).not.toContain('grid-template-columns: minmax(5.5rem, 1fr) 2.5rem minmax(3.5rem, 1fr) 2.5rem minmax(3.75rem, 1fr);');
  });
});
