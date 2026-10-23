import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceSource = fs.readFileSync(path.resolve(__dirname, '../services/posService.js'), 'utf8');

describe('POS service endpoint contract', () => {
  it('matches the registered fiscal and eSales backend routes', () => {
    expect(serviceSource).toContain("api.put('/pos/fiscal-terminal-registrations'");
    expect(serviceSource).toContain("api.post('/pos/esales-reports/generate'");
    expect(serviceSource).toContain("api.get('/pos/fiscal-ledger/integrity'");
    expect(serviceSource).not.toContain("api.post('/pos/esales-reports'");
    expect(serviceSource).not.toContain("api.get('/pos/fiscal-ledger-integrity'");
  });

  it('does not expose report helpers for endpoints that the API does not register', () => {
    expect(serviceSource).not.toContain("/pos/reports/top-items");
    expect(serviceSource).not.toContain("/pos/reports/comparison");
    expect(serviceSource).not.toContain("/pos/reports/profit-loss");
  });
});
