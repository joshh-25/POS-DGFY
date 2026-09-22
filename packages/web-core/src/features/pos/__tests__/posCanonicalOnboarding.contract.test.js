import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
const posSetupModalSource = read('../components/PosTenantSetupModal.jsx');
const posSetupFlowSource = read('../utils/setupFlow.js');
const imsLayoutSource = fs.readFileSync(
  path.resolve(__dirname, '../../../../../../apps/dgfy-ims/Layout.jsx'),
  'utf8'
);

describe('POS-canonical tenant onboarding contract', () => {
  it('keeps Hospitality room setup while omitting catalog-item setup from non-Hospitality onboarding', () => {
    expect(posSetupFlowSource).toContain('POS_TERMINAL_SETUP_STEPS.STARTER_ITEM');
    expect(posSetupFlowSource).toContain("[POS_TERMINAL_SETUP_STEPS.STARTER_ITEM]: 'items'");
    expect(posSetupFlowSource).toContain('isStarterSetupRequired');
    expect(posSetupFlowSource).toContain('getTenantSetupOrder');
    expect(posSetupModalSource).toContain('createHospitalityRoomType');
    expect(posSetupModalSource).toContain("stepKey: 'hospitality_rooms'");
    expect(posSetupModalSource).not.toContain('bulkCreateOnboardingItems');
    expect(posSetupModalSource).not.toContain('Save Starter Item');
  });

  it('removes the IMS wizard owner and exposes only the POS handoff', () => {
    expect(imsLayoutSource).not.toContain('OnboardingSetupModal');
    expect(imsLayoutSource).not.toContain('OnboardingReminderBanner');
    expect(imsLayoutSource).toContain('resolvePosTerminalUrl');
    expect(imsLayoutSource).toContain('buildTenantSetupSearch');
    expect(imsLayoutSource).toContain('Open POS Setup');
  });
});
