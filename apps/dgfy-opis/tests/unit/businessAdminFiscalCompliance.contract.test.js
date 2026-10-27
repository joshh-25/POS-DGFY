import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminPage = fs.readFileSync(
  path.resolve(__dirname, '../../src/features/businessAdmin/BusinessAdminPage.jsx'),
  'utf8'
);
const fiscalOperationsPanel = fs.readFileSync(
  path.resolve(__dirname, '../../../../packages/web-core/src/features/compliance/components/FiscalOperationsPanel.jsx'),
  'utf8'
);
const compliancePanel = fs.readFileSync(
  path.resolve(__dirname, '../../../../packages/web-core/src/features/compliance/components/ComplianceProgramPanel.jsx'),
  'utf8'
);

describe('OPIS fiscal and BIR workspace contract', () => {
  it('mounts the shared compliance and fiscal operations controls in the OPIS Fiscal & BIR workspace', () => {
    expect(businessAdminPage).toContain('ComplianceProgramPanel');
    expect(businessAdminPage).toContain('FiscalOperationsPanel');
    expect(businessAdminPage).toContain('navigationRootPath="/fiscal"');
    expect(businessAdminPage).toContain('accessCapabilities={bootstrap?.access?.capabilities || {}}');
    expect(businessAdminPage).toContain('if (activeSection === \'fiscal\') return <FiscalWorkspace');
  });

  it('keeps fiscal controls API-backed and permission-gated', () => {
    expect(fiscalOperationsPanel).toContain("fetchFiscalTerminalRegistrations");
    expect(fiscalOperationsPanel).toContain("saveFiscalTerminalRegistration");
    expect(fiscalOperationsPanel).toContain("fetchFiscalLedgerIntegrity");
    expect(fiscalOperationsPanel).toContain("generateESalesReport");
    expect(fiscalOperationsPanel).toContain("updateESalesReportStatus");
    expect(fiscalOperationsPanel).toContain("accessCapabilities?.manage_fiscal_terminals === true");
    expect(fiscalOperationsPanel).toContain("accessCapabilities?.manage_esales_reports === true");
  });

  it('maps legacy compliance settings action targets into the OPIS fiscal workspace', () => {
    expect(compliancePanel).toContain('navigationRootPath = \'\'');
    expect(compliancePanel).toContain("if (tab === 'compliance') return `${navigationRootPath}${parsed.hash || ''}`;");
    expect(compliancePanel).toContain("if (tab === 'pos') return `/settings/pos${parsed.hash || ''}`;");
  });
});
