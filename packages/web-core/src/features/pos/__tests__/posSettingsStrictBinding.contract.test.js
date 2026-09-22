import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const settingsPagePath = path.resolve(__dirname, '../../../../../../apps/dgfy-ims/Pages/Settings.jsx');
const terminalWorkspacePath = path.resolve(__dirname, '../settings/PosSettingsWorkspace.jsx');
const posSetupPanePath = path.resolve(__dirname, '../settings/PosSetupSettingsPane.jsx');
const posSetupOperationsPanePath = path.resolve(__dirname, '../settings/PosOperationsAccessSection.jsx');
const posTerminalPanePath = path.resolve(__dirname, '../settings/PosTerminalSettingsSection.jsx');
const posTerminalAdvancedModalPath = path.resolve(__dirname, '../settings/PosTerminalAdvancedSettingsModal.jsx');

describe('POS strict location-binding settings visibility contract', () => {
  let settingsPageContent = '';
  let terminalWorkspaceContent = '';
  let posSetupPaneContent = '';
  let posSetupOperationsPaneContent = '';
  let posTerminalPaneContent = '';
  let posTerminalAdvancedModalContent = '';

  beforeAll(() => {
    settingsPageContent = fs.readFileSync(settingsPagePath, 'utf8');
    terminalWorkspaceContent = fs.readFileSync(terminalWorkspacePath, 'utf8');
    posSetupPaneContent = fs.readFileSync(posSetupPanePath, 'utf8');
    posSetupOperationsPaneContent = fs.readFileSync(posSetupOperationsPanePath, 'utf8');
    posTerminalPaneContent = fs.readFileSync(posTerminalPanePath, 'utf8');
    posTerminalAdvancedModalContent = fs.readFileSync(posTerminalAdvancedModalPath, 'utf8');
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

  it('keeps registry policy out of the terminal-only POS setup context', () => {
    const strictBindingStart = terminalWorkspaceContent.indexOf('/* Strict Shift Location Binding */');
    const strictBindingSection = terminalWorkspaceContent.slice(strictBindingStart, strictBindingStart + 1800);
    const terminalSetupStart = terminalWorkspaceContent.indexOf("case 'terminal_setup':");
    const shiftControlsStart = terminalWorkspaceContent.indexOf("case 'shift_controls':", terminalSetupStart);
    const terminalSetupSection = terminalWorkspaceContent.slice(terminalSetupStart, shiftControlsStart);

    expect(strictBindingStart).toBeGreaterThanOrEqual(0);
    expect(terminalSetupStart).toBeGreaterThanOrEqual(0);
    expect(shiftControlsStart).toBeGreaterThan(terminalSetupStart);
    expect(strictBindingSection).toContain('Strict Shift Location Binding');
    expect(strictBindingSection).toContain('Require location-bound terminal readiness for shift open, checkout, and terminal switching.');
    expect(strictBindingSection).toContain("onChange?.('terminalLocationBindingEnforced', enabled === true)");
    expect(strictBindingSection).not.toContain('readiness?.migration_tag');
    expect(terminalWorkspaceContent).toContain('const showTerminalRegistryEditor = !editorSection || editorSection === \'registers\';');
    expect(terminalWorkspaceContent).toContain('const showTerminalOnlyControlsPane = showTerminalOnlyControls');
    expect(terminalSetupSection).toContain('editorSection="terminal_setup"');
    expect(terminalSetupSection).not.toContain('editorSection="registers"');
  });

  it('keeps advanced terminal policies inside a modal with explicit save and cancel actions', () => {
    expect(posTerminalPaneContent).toContain('Advanced Settings');
    expect(posTerminalPaneContent).toContain('PosTerminalAdvancedSettingsModal');
    expect(posTerminalPaneContent).toContain('handleTerminalAdvancedSettingsSave');
    expect(posTerminalAdvancedModalContent).toContain('Voucher Redemption at POS');
    expect(posTerminalAdvancedModalContent).toContain('Save Settings');
    expect(posTerminalAdvancedModalContent).toContain('Cancel');
    expect(posTerminalAdvancedModalContent).toContain("onChange?.('voucherPosRedemptionEnabled', enabled === true)");
    expect(posTerminalPaneContent).not.toContain('When enabled, shift open, checkout, and switch require location-bound terminal policy readiness.');
    expect(posTerminalPaneContent).not.toContain('Voucher Redemption at POS');
  });

  it('forwards POS Setup runtime values across the extracted pane boundary', () => {
    const setupPropsStart = terminalWorkspaceContent.indexOf('const posSetupPaneProps = {');
    const setupPropsSection = terminalWorkspaceContent.slice(setupPropsStart, setupPropsStart + 400);
    const setupPaneSignature = posSetupPaneContent.slice(
      posSetupPaneContent.indexOf('export default function PosSetupSettingsPane({'),
      posSetupPaneContent.indexOf('}) {') + 4
    );

    expect(setupPropsStart).toBeGreaterThanOrEqual(0);
    expect(setupPropsSection).toContain('terminalUser,');
    expect(setupPropsSection).toContain('queueLocationScopeId,');
    expect(setupPaneSignature).toContain('terminalUser,');
    expect(setupPaneSignature).toContain('queueLocationScopeId,');
    expect(posSetupOperationsPaneContent).toContain('queueLocationScopeId={queueLocationScopeId}');
  });
});
