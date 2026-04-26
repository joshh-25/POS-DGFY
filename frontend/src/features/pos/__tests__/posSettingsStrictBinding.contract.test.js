import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const settingsPagePath = path.resolve(__dirname, '../../../../Pages/Settings.jsx');
const terminalWorkspacePath = path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx');

describe('POS strict location-binding settings visibility contract', () => {
  let settingsPageContent = '';
  let terminalWorkspaceContent = '';

  beforeAll(() => {
    settingsPageContent = fs.readFileSync(settingsPagePath, 'utf8');
    terminalWorkspaceContent = fs.readFileSync(terminalWorkspacePath, 'utf8');
  });

  it('exposes strict location-binding setting and persists it in update payload', () => {
    expect(settingsPageContent).toContain('pos_terminal_location_binding_enforced');
    expect(settingsPageContent).toContain('Strict Shift Location Binding');
    expect(settingsPageContent).toContain('Assign each active terminal to a store location');
    expect(settingsPageContent).toContain('Terminal location');
    expect(settingsPageContent).toContain("handleChange('posTerminalLocationBindingEnforced', checked)");
    expect(settingsPageContent).toContain("handleTerminalRegistryChange(index, 'location_id', event.target.value)");
    expect(settingsPageContent).toContain('pos_terminal_location_binding_enforced: settings.posTerminalLocationBindingEnforced === true');
  });

  it('renders location-binding readiness summary in terminal setup context', () => {
    expect(terminalWorkspaceContent).toContain('Location Binding Readiness');
    expect(terminalWorkspaceContent).toContain('readiness?.migration_tag');
    expect(terminalWorkspaceContent).toContain('ready_for_strict_mode');
  });
});
