import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const servicesWorkspaceSource = fs.readFileSync(path.resolve(__dirname, '../components/PosServicesOperationsWorkspace.jsx'), 'utf8');
const userServiceSource = fs.readFileSync(path.resolve(__dirname, '../../../services/userService.js'), 'utf8');

describe('POS Services capability projection contract', () => {
  it('loads API-projected Services capabilities instead of OR-ing unrelated POS grants', () => {
    expect(userServiceSource).toContain("api.get('/users/me/capabilities'");
    expect(terminalPageSource).toContain('payload?.services_capabilities || null');
    expect(terminalPageSource).toContain('servicesCapabilities?.canAccess === true');
    expect(terminalPageSource).not.toContain('viewBookings: hasPermission');
    expect(terminalPageSource).not.toContain('viewResources: hasPermission');
    expect(terminalPageSource).not.toContain('viewBookings: canViewPos');
  });

  it('keeps service API errors visible to the operator instead of silently broadening access', () => {
    expect(servicesWorkspaceSource).toContain('Unable to load Services operations.');
    expect(servicesWorkspaceSource).toContain('toast.error(message)');
    expect(servicesWorkspaceSource).toContain('onAuthorizationFailure(error)');
    expect(terminalPageSource).toContain('The service affordance must fail closed');
    expect(terminalPageSource).toContain('onServiceAuthorizationFailure={refreshServicesCapabilities}');
  });
});
