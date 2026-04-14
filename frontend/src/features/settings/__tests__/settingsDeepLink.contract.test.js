import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import {
  normalizeSettingsHash,
  resolveSettingsDeepLink,
  resolveSettingsTab,
  SETTINGS_HASH_TO_TAB,
  SETTINGS_TABS,
  withSettingsTabInSearch
} from '../settingsDeepLink.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const settingsPagePath = path.resolve(__dirname, '../../../../Pages/Settings.jsx');
const compliancePanelPath = path.resolve(__dirname, '../../compliance/components/ComplianceProgramPanel.jsx');
const compliancePolicyEnginePath = path.resolve(__dirname, '../../../../../backend/src/modules/compliance/policy/compliancePolicyEngine.js');
const posCheckoutTerminalPath = path.resolve(__dirname, '../../pos/components/POSCheckoutTerminal.jsx');
const terminalPageLayoutPath = path.resolve(__dirname, '../../pos/components/TerminalPageLayout.jsx');
const SETTINGS_TARGET_PATTERN = /\/settings\?tab=[a-z]+[^\s'"`)]*/g;

describe('settings deep-link contract', () => {
  it('keeps tab contract stable', () => {
    expect(SETTINGS_TABS).toEqual([
      'profile',
      'company',
      'subscription',
      'pos',
      'compliance',
      'system'
    ]);
  });

  it('maps all required cross-surface section hashes to a tab', () => {
    expect(SETTINGS_HASH_TO_TAB['#receipt-contract-settings']).toBe('pos');
    expect(SETTINGS_HASH_TO_TAB['#section-profile']).toBe('compliance');
    expect(SETTINGS_HASH_TO_TAB['#section-artifacts']).toBe('compliance');
    expect(SETTINGS_HASH_TO_TAB['#section-peripherals']).toBe('compliance');
    expect(SETTINGS_HASH_TO_TAB['#section-final-review']).toBe('compliance');
  });

  it('keeps known hash targets backed by real section ids', () => {
    const settingsContent = fs.readFileSync(settingsPagePath, 'utf8');
    const complianceContent = fs.readFileSync(compliancePanelPath, 'utf8');

    expect(settingsContent).toContain('id="receipt-contract-settings"');
    expect(complianceContent).toContain('id="section-profile"');
    expect(complianceContent).toContain('id="section-artifacts"');
    expect(complianceContent).toContain('id="section-peripherals"');
    expect(complianceContent).toContain('id="section-final-review"');
  });

  it('keeps cross-surface settings targets emitted by policy and POS code resolvable', () => {
    const emittedTargets = new Set();
    [
      compliancePolicyEnginePath,
      posCheckoutTerminalPath,
      terminalPageLayoutPath
    ].forEach((sourcePath) => {
      const source = fs.readFileSync(sourcePath, 'utf8');
      for (const match of source.matchAll(SETTINGS_TARGET_PATTERN)) {
        emittedTargets.add(match[0]);
      }
    });

    expect(emittedTargets.size).toBeGreaterThan(0);

    for (const target of emittedTargets) {
      const parsed = new URL(target, 'http://localhost');
      const tab = parsed.searchParams.get('tab');
      expect(SETTINGS_TABS).toContain(tab);

      if (parsed.hash) {
        const normalizedHash = normalizeSettingsHash(parsed.hash);
        expect(SETTINGS_HASH_TO_TAB[normalizedHash]).toBeDefined();
      }
    }
  });

  it('resolves alias hashes and hash-driven tabs', () => {
    const resolved = resolveSettingsDeepLink({
      search: '?tab=pos',
      hash: '#section-activation',
      subscriptionEnabled: true
    });
    expect(resolved.tab).toBe('compliance');
    expect(resolved.normalizedHash).toBe('#section-final-review');
    expect(resolved.hashStatus).toBe('known');
  });

  it('falls back invalid and disabled subscription tabs to profile', () => {
    expect(resolveSettingsTab('unknown', { subscriptionEnabled: true })).toBe('profile');
    expect(resolveSettingsTab('subscription', { subscriptionEnabled: false })).toBe('profile');
  });

  it('preserves unrelated query params when setting tab', () => {
    const params = withSettingsTabInSearch('?paypal_setup=success&foo=bar', 'system');
    expect(params.get('tab')).toBe('system');
    expect(params.get('paypal_setup')).toBe('success');
    expect(params.get('foo')).toBe('bar');
  });
});
