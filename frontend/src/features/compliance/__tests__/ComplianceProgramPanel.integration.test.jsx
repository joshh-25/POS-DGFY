/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ComplianceProgramPanel from '../components/ComplianceProgramPanel.jsx';

const {
  mockGetComplianceProfile,
  mockListComplianceArtifacts,
  mockListCompliancePeripherals,
  mockListFinalReviewDocuments,
  mockUpdateComplianceProfile,
  mockActivateCompliantMode
} = vi.hoisted(() => ({
  mockGetComplianceProfile: vi.fn(),
  mockListComplianceArtifacts: vi.fn(),
  mockListCompliancePeripherals: vi.fn(),
  mockListFinalReviewDocuments: vi.fn(),
  mockUpdateComplianceProfile: vi.fn(),
  mockActivateCompliantMode: vi.fn()
}));

vi.mock('@/services/complianceService.js', () => ({
  getComplianceProfile: mockGetComplianceProfile,
  listComplianceArtifacts: mockListComplianceArtifacts,
  listCompliancePeripherals: mockListCompliancePeripherals,
  listFinalReviewDocuments: mockListFinalReviewDocuments,
  updateComplianceProfile: mockUpdateComplianceProfile,
  activateCompliantMode: mockActivateCompliantMode,
  selectComplianceMode: vi.fn(),
  upgradeToCompliant: vi.fn(),
  createComplianceArtifact: vi.fn(),
  updateComplianceArtifactVerification: vi.fn(),
  createCompliancePeripheral: vi.fn(),
  updateCompliancePeripheralVerification: vi.fn(),
  upsertFinalReviewDocument: vi.fn(),
  uploadFinalReviewDocument: vi.fn(),
  upsertFinalReviewSignoff: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

const renderPanel = (props = {}, initialEntry = '/settings?tab=compliance') => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <ComplianceProgramPanel isMasterAdmin {...props} />
  </MemoryRouter>
);

const baseProfileResponse = {
  mode_state: 'compliant_pending',
  mode_choice_required: false,
  profile: {
    bir: {
      software_accreditation_number: '',
      software_accreditation_valid_until: '',
      ptu_certificate_number: '',
      tax_classification_controls_confirmed: false,
      non_resettable_grand_total_enabled: false,
      mandatory_receipt_fields_confirmed: false
    },
    npc: {
      dpo_name: '',
      dpo_email: '',
      dps_registration_number: '',
      dps_registration_valid_until: '',
      breach_notification_procedure_confirmed: false
    },
    readiness: {
      tests_passed: false
    }
  },
  checklist: {
    ready_for_compliant_activation: false,
    requirements: [
      {
        code: 'setting.pos_tin_branch',
        label: 'TIN branch',
        section: 'settings',
        status: 'missing',
        action_target: '/settings?tab=pos#receipt-contract-settings'
      }
    ],
    section_progress: {
      profile: { complete: 3, total: 10, missing: 7, status: 'in_progress' },
      settings: { complete: 5, total: 6, missing: 1, status: 'in_progress' },
      artifacts: { complete: 2, total: 2, missing: 0, status: 'complete' },
      peripherals: { complete: 2, total: 2, missing: 0, status: 'complete' }
    },
    activation_blockers: [
      {
        code: 'COMPLIANCE_SETTINGS_INCOMPLETE',
        section: 'settings',
        message: 'Complete required POS setup settings used by fiscal documents.',
        action_target: '/settings?tab=pos#receipt-contract-settings'
      }
    ],
    next_blocking_step: 'settings'
  }
};

describe('ComplianceProgramPanel integration', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockListComplianceArtifacts.mockResolvedValue({ artifacts: [] });
    mockListCompliancePeripherals.mockResolvedValue({ peripherals: [] });
    mockListFinalReviewDocuments.mockResolvedValue({ documents: [], signoff: {} });
    mockUpdateComplianceProfile.mockResolvedValue({ profile: {} });
    mockActivateCompliantMode.mockResolvedValue({ mode_state: 'compliant_active' });

    globalThis.requestAnimationFrame = (callback) => {
      callback();
      return 0;
    };
  });

  it('renders unresolved-count and next-blocking-step guidance from checklist metadata', async () => {
    mockGetComplianceProfile.mockResolvedValue(baseProfileResponse);

    renderPanel();

    expect(await screen.findByText('Lifecycle')).toBeTruthy();
    expect(await screen.findByText('1 unresolved requirement')).toBeTruthy();
    expect(await screen.findByText(/Next blocking step:/i)).toBeTruthy();
  });

  it('shows inline profile errors and focuses the first invalid field on empty profile save', async () => {
    mockGetComplianceProfile.mockResolvedValue(baseProfileResponse);
    const user = userEvent.setup();

    renderPanel();
    await screen.findByText('Compliance Profile & Readiness');

    const saveButton = screen.getByRole('button', { name: /Save compliance profile/i });
    await user.click(saveButton);

    expect(await screen.findByText('Software accreditation number is required.')).toBeTruthy();
    expect(await screen.findByText('Accreditation validity date is required.')).toBeTruthy();

    const focused = document.activeElement;
    expect(focused?.getAttribute('data-profile-error-key')).toBe('bir.software_accreditation_number');
    expect(mockUpdateComplianceProfile).not.toHaveBeenCalled();
  });

  it('submits activate action when checklist is ready and confirmation text is correct', async () => {
    mockGetComplianceProfile.mockResolvedValue({
      ...baseProfileResponse,
      checklist: {
        ...baseProfileResponse.checklist,
        ready_for_compliant_activation: true,
        requirements: [],
        activation_blockers: [],
        next_blocking_step: null
      }
    });
    const user = userEvent.setup();

    renderPanel();
    await screen.findByText('Lifecycle');

    const activateInput = screen.getByPlaceholderText('ACTIVATE COMPLIANT');
    await user.type(activateInput, 'ACTIVATE COMPLIANT');

    const activateButton = screen.getByRole('button', { name: /Activate compliant mode/i });
    expect(activateButton).not.toHaveProperty('disabled', true);
    await user.click(activateButton);

    await waitFor(() => {
      expect(mockActivateCompliantMode).toHaveBeenCalledWith({
        confirmation_text: 'ACTIVATE COMPLIANT'
      });
    });
  });

  it('scrolls to final-review activation section when missing requirement action target is on the current route', async () => {
    mockGetComplianceProfile.mockResolvedValue({
      ...baseProfileResponse,
      checklist: {
        ...baseProfileResponse.checklist,
        requirements: [
          {
            code: 'control.documentary_readiness',
            label: 'Submission documentary readiness',
            section: 'final_review',
            status: 'missing',
            action_target: '/settings?tab=compliance#section-final-review'
          }
        ],
        section_progress: {
          ...baseProfileResponse.checklist.section_progress,
          final_review: { complete: 0, total: 1, missing: 1, status: 'blocked' }
        },
        activation_blockers: [
          {
            code: 'VERIFICATION_REQUIRED',
            section: 'final_review',
            message: 'Submission documentary evidence is incomplete or stale.',
            action_target: '/settings?tab=compliance#section-final-review'
          }
        ],
        next_blocking_step: 'final_review'
      }
    });
    const user = userEvent.setup();

    renderPanel();
    expect(await screen.findByText('Lifecycle')).toBeTruthy();
    const finalReviewSection = document.querySelector('#section-final-review');
    expect(finalReviewSection).toBeTruthy();

    const scrollIntoViewSpy = vi.fn();
    finalReviewSection.scrollIntoView = scrollIntoViewSpy;

    await user.click(screen.getByRole('button', { name: /Fix now/i }));

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps final-review fix action functional in compliant-active mode', async () => {
    mockGetComplianceProfile.mockResolvedValue({
      ...baseProfileResponse,
      mode_state: 'compliant_active',
      checklist: {
        ...baseProfileResponse.checklist,
        requirements: [
          {
            code: 'control.documentary_readiness',
            label: 'Submission documentary readiness',
            section: 'final_review',
            status: 'missing',
            action_target: '/settings?tab=compliance#section-final-review'
          }
        ],
        activation_blockers: [],
        next_blocking_step: 'final_review'
      }
    });
    const user = userEvent.setup();

    renderPanel();
    expect(await screen.findByText('Lifecycle')).toBeTruthy();
    const finalReviewSection = document.querySelector('#section-final-review');
    expect(finalReviewSection).toBeTruthy();

    const scrollIntoViewSpy = vi.fn();
    finalReviewSection.scrollIntoView = scrollIntoViewSpy;

    await user.click(screen.getByRole('button', { name: /Fix now/i }));

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
  });
});
