import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import * as complianceService from '@/services/complianceService.js';

const MODE_LABEL = {
  non_compliant_active: 'Non-compliant active',
  compliant_pending: 'Compliant pending',
  compliant_active: 'Compliant active'
};

const ARTIFACT_TYPES = [
  'bir_accreditation_certificate',
  'bir_ptu_document',
  'npc_dps_certificate',
  'bsp_ops_certificate',
  'ops_security_controls_attestation',
  'other'
];

const DEVICE_CLASSES = ['receipt_printer', 'cash_drawer', 'scanner', 'payment_terminal', 'other'];

const PROFILE_DEFAULT = {
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
  bsp: {
    ops_registration_required: false,
    ops_registration_status: 'not_required',
    ops_registration_number: '',
    ops_registration_valid_until: '',
    payment_control_reviewed: false
  },
  readiness: {
    tests_passed: false,
    last_tested_at: ''
  }
};

const PROFILE_LABELS = {
  'bir.software_accreditation_number': 'BIR software accreditation number',
  'bir.software_accreditation_valid_until': 'BIR accreditation valid until',
  'bir.tax_classification_controls_confirmed': 'Tax classification controls confirmed',
  'bir.non_resettable_grand_total_enabled': 'Non-resettable grand total enabled',
  'bir.mandatory_receipt_fields_confirmed': 'Mandatory receipt fields confirmed',
  'npc.dpo_name': 'DPO name',
  'npc.dpo_email': 'DPO email',
  'npc.dps_registration_number': 'DPS registration number',
  'npc.dps_registration_valid_until': 'DPS registration valid until',
  'npc.breach_notification_procedure_confirmed': 'Breach notification procedure confirmed',
  'bsp.ops_registration_status': 'OPS registration status',
  'bsp.payment_control_reviewed': 'Payment control reviewed',
  'readiness.tests_passed': 'Readiness tests passed'
};

const SETTING_LABELS = {
  pos_business_name: 'Business name',
  pos_tin_branch: 'TIN branch',
  pos_address: 'Business address',
  pos_ptu_number: 'PTU number',
  pos_min_number: 'MIN number',
  pos_accreditation_number: 'Accreditation number'
};

const ARTIFACT_LABELS = {
  bir_accreditation_certificate: 'BIR accreditation certificate',
  bir_ptu_document: 'BIR PTU document',
  npc_dps_certificate: 'NPC DPS certificate',
  bsp_ops_certificate: 'BSP OPS certificate',
  ops_security_controls_attestation: 'OPS controls attestation'
};

const PERIPHERAL_LABELS = {
  receipt_printer: 'Receipt printer',
  cash_drawer: 'Cash drawer',
  scanner: 'Scanner',
  payment_terminal: 'Payment terminal'
};

const STEP_ORDER = ['profile', 'settings', 'artifacts', 'peripherals'];

const STEP_META = {
  profile: { title: 'Profile', actionTarget: '#section-profile' },
  settings: { title: 'Settings', actionTarget: '/settings?tab=pos#receipt-contract-settings' },
  artifacts: { title: 'Artifacts', actionTarget: '#section-artifacts' },
  peripherals: { title: 'Peripherals', actionTarget: '#section-peripherals' },
  final_review: { title: 'Final Review', actionTarget: '#section-activation' }
};

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const fmtDate = (value) => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleString();
};

const mergeProfile = (base, incoming) => {
  const output = { ...base };
  Object.keys(incoming || {}).forEach((key) => {
    const incomingValue = incoming[key];
    const baseValue = base?.[key];
    if (
      incomingValue
      && typeof incomingValue === 'object'
      && !Array.isArray(incomingValue)
      && baseValue
      && typeof baseValue === 'object'
      && !Array.isArray(baseValue)
    ) {
      output[key] = mergeProfile(baseValue, incomingValue);
      return;
    }
    output[key] = incomingValue;
  });
  return output;
};

const normalizeDateInput = (value) => {
  if (!value) return '';
  const asString = String(value).trim();
  const directMatch = asString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];
  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const prettifyFieldKey = (field) => {
  if (!field) return '';
  if (PROFILE_LABELS[field]) return PROFILE_LABELS[field];
  if (field.startsWith('setting.')) {
    const key = field.replace('setting.', '');
    return SETTING_LABELS[key] || key;
  }
  if (field.startsWith('artifact.')) {
    const key = field.replace('artifact.', '');
    return ARTIFACT_LABELS[key] || key;
  }
  if (field.startsWith('peripheral.')) {
    const key = field.replace('peripheral.', '');
    return PERIPHERAL_LABELS[key] || key;
  }
  return field;
};

const deriveRequirements = (checklist = {}) => {
  if (Array.isArray(checklist.requirements) && checklist.requirements.length > 0) {
    return checklist.requirements;
  }

  const generated = [];
  (checklist.missing_profile_fields || []).forEach((field) => {
    generated.push({
      code: `profile.${field}`,
      label: prettifyFieldKey(field),
      section: 'profile',
      status: 'missing',
      action_target: '#section-profile'
    });
  });
  (checklist.missing_setting_keys || []).forEach((key) => {
    generated.push({
      code: `setting.${key}`,
      label: SETTING_LABELS[key] || key,
      section: 'settings',
      status: 'missing',
      action_target: '/settings?tab=pos#receipt-contract-settings'
    });
  });
  (checklist.missing_artifacts || []).forEach((key) => {
    generated.push({
      code: `artifact.${key}`,
      label: ARTIFACT_LABELS[key] || key,
      section: 'artifacts',
      status: 'missing',
      action_target: '#section-artifacts'
    });
  });
  (checklist.missing_peripheral_classes || []).forEach((key) => {
    generated.push({
      code: `peripheral.${key}`,
      label: PERIPHERAL_LABELS[key] || key,
      section: 'peripherals',
      status: 'missing',
      action_target: '#section-peripherals'
    });
  });
  return generated;
};

const buildProfileErrors = (profileForm = {}) => {
  const errors = {};
  if (!String(profileForm?.bir?.software_accreditation_number || '').trim()) {
    errors['bir.software_accreditation_number'] = 'Software accreditation number is required.';
  }
  if (!String(profileForm?.bir?.software_accreditation_valid_until || '').trim()) {
    errors['bir.software_accreditation_valid_until'] = 'Accreditation validity date is required.';
  }
  if (profileForm?.bir?.tax_classification_controls_confirmed !== true) {
    errors['bir.tax_classification_controls_confirmed'] = 'Confirm tax classification controls.';
  }
  if (profileForm?.bir?.non_resettable_grand_total_enabled !== true) {
    errors['bir.non_resettable_grand_total_enabled'] = 'Confirm non-resettable grand total control.';
  }
  if (profileForm?.bir?.mandatory_receipt_fields_confirmed !== true) {
    errors['bir.mandatory_receipt_fields_confirmed'] = 'Confirm mandatory receipt fields control.';
  }
  if (!String(profileForm?.npc?.dpo_name || '').trim()) {
    errors['npc.dpo_name'] = 'DPO name is required.';
  }
  if (!String(profileForm?.npc?.dpo_email || '').trim()) {
    errors['npc.dpo_email'] = 'DPO email is required.';
  }
  if (!String(profileForm?.npc?.dps_registration_number || '').trim()) {
    errors['npc.dps_registration_number'] = 'DPS registration number is required.';
  }
  if (!String(profileForm?.npc?.dps_registration_valid_until || '').trim()) {
    errors['npc.dps_registration_valid_until'] = 'DPS registration validity date is required.';
  }
  if (profileForm?.npc?.breach_notification_procedure_confirmed !== true) {
    errors['npc.breach_notification_procedure_confirmed'] = 'Confirm breach notification procedure.';
  }
  if (profileForm?.readiness?.tests_passed !== true) {
    errors['readiness.tests_passed'] = 'Readiness tests must be marked as passed.';
  }
  return errors;
};

const PROFILE_ERROR_FIELD_ORDER = [
  'bir.software_accreditation_number',
  'bir.software_accreditation_valid_until',
  'bir.tax_classification_controls_confirmed',
  'bir.non_resettable_grand_total_enabled',
  'bir.mandatory_receipt_fields_confirmed',
  'npc.dpo_name',
  'npc.dpo_email',
  'npc.dps_registration_number',
  'npc.dps_registration_valid_until',
  'npc.breach_notification_procedure_confirmed',
  'readiness.tests_passed'
];

export default function ComplianceProgramPanel({ isMasterAdmin = false }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(PROFILE_DEFAULT);
  const [profileErrors, setProfileErrors] = useState({});
  const [artifacts, setArtifacts] = useState([]);
  const [peripherals, setPeripherals] = useState([]);
  const [modeChoice, setModeChoice] = useState('non_compliant');
  const [confirmText, setConfirmText] = useState('');
  const [upgradeText, setUpgradeText] = useState('');
  const [activateText, setActivateText] = useState('');
  const [artifactForm, setArtifactForm] = useState({ artifact_type: ARTIFACT_TYPES[0], artifact_name: '' });
  const [peripheralForm, setPeripheralForm] = useState({
    terminal_id: '',
    is_shared: false,
    device_class: DEVICE_CLASSES[0],
    brand: '',
    model: '',
    serial_number: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, d] = await Promise.all([
        complianceService.getComplianceProfile(),
        complianceService.listComplianceArtifacts(),
        complianceService.listCompliancePeripherals()
      ]);
      setProfile(p || null);
      setProfileForm(mergeProfile(PROFILE_DEFAULT, p?.profile || {}));
      setProfileErrors({});
      setArtifacts(Array.isArray(a?.artifacts) ? a.artifacts : []);
      setPeripherals(Array.isArray(d?.peripherals) ? d.peripherals : []);
      if (p?.mode_state && p.mode_state !== 'non_compliant_active') {
        setModeChoice('compliant');
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to load compliance data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const checklist = profile?.checklist || {};
  const requirements = deriveRequirements(checklist);
  const sectionProgress = checklist.section_progress || {};
  const modeState = profile?.mode_state || null;
  const modeChoiceRequired = profile?.mode_choice_required === true;
  const activationBlockers = Array.isArray(checklist.activation_blockers) ? checklist.activation_blockers : [];
  const missingRequirements = requirements.filter((entry) => entry.status !== 'complete');
  const unresolvedRequirementCount = missingRequirements.length;
  const nextBlockingStepKey = String(checklist.next_blocking_step || '').trim();
  const nextBlockingStepMeta = STEP_META[nextBlockingStepKey] || null;
  const firstIncompleteStepIndex = STEP_ORDER.findIndex((stepKey) => {
    const progress = sectionProgress?.[stepKey];
    return !progress || progress.status !== 'complete';
  });
  const stepProgress = {
    profile: sectionProgress?.profile || { complete: 0, total: 0, status: 'not_started' },
    settings: sectionProgress?.settings || { complete: 0, total: 0, status: 'not_started' },
    artifacts: sectionProgress?.artifacts || { complete: 0, total: 0, status: 'not_started' },
    peripherals: sectionProgress?.peripherals || { complete: 0, total: 0, status: 'not_started' },
    final_review: {
      complete: Math.max(0, requirements.length - missingRequirements.length),
      total: requirements.length,
      status: checklist.ready_for_compliant_activation ? 'complete' : 'blocked'
    }
  };
  const activationBlockingReasons = [
    !isMasterAdmin ? 'Master admin access is required.' : null,
    activateText.trim() !== 'ACTIVATE COMPLIANT' ? 'Confirmation text must match ACTIVATE COMPLIANT.' : null,
    checklist.ready_for_compliant_activation !== true ? 'Checklist is not ready yet. Complete all missing profile, artifact, peripheral, and settings requirements.' : null
  ].filter(Boolean);

  const run = async (key, fn, successMsg) => {
    setBusy(key);
    try {
      await fn();
      toast.success(successMsg);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, 'Compliance action failed'));
    } finally {
      setBusy('');
    }
  };

  const verifyArtifact = (id, action) => run(`a-${id}-${action}`, () => (
    complianceService.updateComplianceArtifactVerification(id, { action, verification_note: `dashboard ${action}` })
  ), `Artifact ${action}d`);

  const verifyPeripheral = (id, action) => run(`p-${id}-${action}`, () => (
    complianceService.updateCompliancePeripheralVerification(id, { action, verification_note: `dashboard ${action}` })
  ), `Peripheral ${action}d`);

  const setProfileField = (section, key, value) => {
    setProfileForm((prev) => ({
      ...prev,
      [section]: {
        ...(prev?.[section] || {}),
        [key]: value
      }
    }));
    setProfileErrors((prev) => {
      const next = { ...prev };
      delete next[`${section}.${key}`];
      return next;
    });
  };

  const openActionTarget = (target) => {
    const normalized = String(target || '').trim();
    if (!normalized) return;
    if (normalized.startsWith('#')) {
      const node = document.querySelector(normalized);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    navigate(normalized);
  };

  const focusFirstProfileError = (errors) => {
    const firstFieldKey = PROFILE_ERROR_FIELD_ORDER.find((key) => Boolean(errors?.[key]));
    if (!firstFieldKey) return;
    requestAnimationFrame(() => {
      const target = document.querySelector(`[data-profile-error-key="${firstFieldKey}"]`);
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    });
  };

  const getStepStatus = (sectionKey) => {
    const progress = stepProgress?.[sectionKey] || { status: 'not_started' };
    if (sectionKey === 'final_review') {
      return progress.status;
    }
    if (progress.status === 'complete') {
      return 'complete';
    }
    const stepIndex = STEP_ORDER.indexOf(sectionKey);
    if (firstIncompleteStepIndex !== -1 && stepIndex > firstIncompleteStepIndex) {
      return 'blocked';
    }
    return progress.status || 'not_started';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compliance Program</CardTitle>
          <CardDescription>Loading compliance profile...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
          <CardDescription>Dual-mode lifecycle with irreversible transitions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-700">Mode: <strong>{MODE_LABEL[modeState] || 'Not selected'}</strong></p>
          <p className="text-sm text-slate-700">Selection required: <strong>{modeChoiceRequired ? 'Yes' : 'No'}</strong></p>
          <p className="text-xs text-slate-500">Checklist ready: {checklist.ready_for_compliant_activation ? 'Yes' : 'No'}</p>
          {checklist.ready_for_compliant_activation !== true && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">
                {unresolvedRequirementCount} unresolved requirement{unresolvedRequirementCount === 1 ? '' : 's'}
              </p>
              {nextBlockingStepMeta && (
                <p className="mt-1">
                  Next blocking step: <strong>{nextBlockingStepMeta.title}</strong>
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activation Steps</p>
            <div className="grid gap-2 md:grid-cols-5">
              {Object.entries(STEP_META).map(([sectionKey, meta]) => {
                const progress = stepProgress?.[sectionKey] || { complete: 0, total: 0, status: 'not_started' };
                const effectiveStatus = getStepStatus(sectionKey);
                const statusLabel = effectiveStatus === 'complete'
                  ? 'Complete'
                  : effectiveStatus === 'in_progress'
                    ? 'In progress'
                    : effectiveStatus === 'not_started'
                      ? 'Not started'
                      : 'Blocked';
                return (
                  <button
                    key={sectionKey}
                    type="button"
                    onClick={() => openActionTarget(meta.actionTarget)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <p className="text-sm font-semibold text-slate-900">{meta.title}</p>
                    <p className="text-xs text-slate-500">{statusLabel} ({progress.complete}/{progress.total})</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Missing Requirements</p>
            {missingRequirements.length === 0 ? (
              <p className="text-sm text-emerald-700">No remaining requirements.</p>
            ) : (
              <div className="space-y-2">
                {missingRequirements.map((entry) => (
                  <div key={entry.code} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{entry.label || prettifyFieldKey(entry.code)}</p>
                      <p className="text-xs text-slate-500">Section: {entry.section}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => openActionTarget(entry.action_target)}>
                      Fix now
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {modeChoiceRequired && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <Label>Mode choice (one-time and irreversible)</Label>
              <select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={modeChoice} onChange={(event) => setModeChoice(event.target.value)}>
                <option value="non_compliant">non_compliant</option>
                <option value="compliant">compliant</option>
              </select>
              <Label>Type I UNDERSTAND</Label>
              <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="I UNDERSTAND" />
              <Button
                type="button"
                disabled={!isMasterAdmin || busy === 'select' || confirmText.trim() !== 'I UNDERSTAND'}
                onClick={() => run('select', () => complianceService.selectComplianceMode(modeChoice), 'Mode selected')}
              >
                Select mode
              </Button>
            </div>
          )}

          {!modeChoiceRequired && modeState === 'non_compliant_active' && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-2">
              <Label>Type UPGRADE TO COMPLIANT</Label>
              <Input value={upgradeText} onChange={(event) => setUpgradeText(event.target.value)} placeholder="UPGRADE TO COMPLIANT" />
              <Button
                type="button"
                disabled={!isMasterAdmin || busy === 'upgrade' || upgradeText.trim() !== 'UPGRADE TO COMPLIANT'}
                onClick={() => run('upgrade', () => complianceService.upgradeToCompliant(), 'Moved to compliant pending')}
              >
                Upgrade to compliant
              </Button>
            </div>
          )}

          {modeState === 'compliant_pending' && (
            <div id="section-activation" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <Label>Type ACTIVATE COMPLIANT</Label>
              <Input value={activateText} onChange={(event) => setActivateText(event.target.value)} placeholder="ACTIVATE COMPLIANT" />
              <Button
                type="button"
                disabled={!isMasterAdmin || busy === 'activate' || activateText.trim() !== 'ACTIVATE COMPLIANT' || checklist.ready_for_compliant_activation !== true}
                onClick={() => run('activate', () => complianceService.activateCompliantMode({ confirmation_text: activateText.trim() }), 'Compliant mode activated')}
              >
                Activate compliant mode
              </Button>
              {activationBlockers.length > 0 && (
                <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2">
                  {activationBlockers.map((blocker) => (
                    <div key={`${blocker.code}-${blocker.section}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-amber-800">{blocker.message}</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => openActionTarget(blocker.action_target)}>
                        Go to step
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {activationBlockingReasons.length > 0 && (
                <p className="text-xs text-slate-600">
                  Activation blocked: {activationBlockingReasons.join(' ')}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance Profile &amp; Readiness</CardTitle>
          <CardDescription>Complete required BIR/NPC/BSP profile data used by activation checklist rules.</CardDescription>
        </CardHeader>
        <CardContent id="section-profile">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const validationErrors = buildProfileErrors(profileForm);
              setProfileErrors(validationErrors);
              if (Object.keys(validationErrors).length > 0) {
                focusFirstProfileError(validationErrors);
                toast.error('Please resolve required profile fields before saving.');
                return;
              }
              run('update-profile', () => complianceService.updateComplianceProfile({
                bir: {
                  software_accreditation_number: (profileForm?.bir?.software_accreditation_number || '').trim(),
                  software_accreditation_valid_until: profileForm?.bir?.software_accreditation_valid_until || '',
                  ptu_certificate_number: (profileForm?.bir?.ptu_certificate_number || '').trim(),
                  tax_classification_controls_confirmed: profileForm?.bir?.tax_classification_controls_confirmed === true,
                  non_resettable_grand_total_enabled: profileForm?.bir?.non_resettable_grand_total_enabled === true,
                  mandatory_receipt_fields_confirmed: profileForm?.bir?.mandatory_receipt_fields_confirmed === true
                },
                npc: {
                  dpo_name: (profileForm?.npc?.dpo_name || '').trim(),
                  dpo_email: (profileForm?.npc?.dpo_email || '').trim(),
                  dps_registration_number: (profileForm?.npc?.dps_registration_number || '').trim(),
                  dps_registration_valid_until: profileForm?.npc?.dps_registration_valid_until || '',
                  breach_notification_procedure_confirmed: profileForm?.npc?.breach_notification_procedure_confirmed === true
                },
                bsp: {
                  ops_registration_required: profileForm?.bsp?.ops_registration_required === true,
                  ops_registration_status: (profileForm?.bsp?.ops_registration_status || 'not_required').trim() || 'not_required',
                  ops_registration_number: (profileForm?.bsp?.ops_registration_number || '').trim(),
                  ops_registration_valid_until: profileForm?.bsp?.ops_registration_valid_until || '',
                  payment_control_reviewed: profileForm?.bsp?.payment_control_reviewed === true
                },
                readiness: {
                  tests_passed: profileForm?.readiness?.tests_passed === true,
                  last_tested_at: profileForm?.readiness?.last_tested_at || ''
                }
              }), 'Compliance profile updated');
            }}
          >
            {Object.keys(profileErrors).length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3" role="alert" aria-live="assertive">
                <p className="text-sm font-semibold text-red-700">Please fix the following before saving:</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-red-700">
                  {Object.entries(profileErrors).map(([key, value]) => (
                    <li key={key}>{prettifyFieldKey(key)}: {value}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-900">BIR Profile</p>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Software accreditation number</Label>
                  <Input
                    value={profileForm?.bir?.software_accreditation_number || ''}
                    onChange={(event) => setProfileField('bir', 'software_accreditation_number', event.target.value)}
                    placeholder="BIR software accreditation number"
                    aria-invalid={Boolean(profileErrors['bir.software_accreditation_number'])}
                    data-profile-error-key="bir.software_accreditation_number"
                  />
                  {profileErrors['bir.software_accreditation_number'] && (
                    <p className="text-xs text-red-600">{profileErrors['bir.software_accreditation_number']}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Accreditation valid until</Label>
                  <Input
                    type="date"
                    value={normalizeDateInput(profileForm?.bir?.software_accreditation_valid_until)}
                    onChange={(event) => setProfileField('bir', 'software_accreditation_valid_until', event.target.value)}
                    aria-invalid={Boolean(profileErrors['bir.software_accreditation_valid_until'])}
                    data-profile-error-key="bir.software_accreditation_valid_until"
                  />
                  {profileErrors['bir.software_accreditation_valid_until'] && (
                    <p className="text-xs text-red-600">{profileErrors['bir.software_accreditation_valid_until']}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>PTU certificate number (optional)</Label>
                  <Input
                    value={profileForm?.bir?.ptu_certificate_number || ''}
                    onChange={(event) => setProfileField('bir', 'ptu_certificate_number', event.target.value)}
                    placeholder="PTU certificate reference"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm?.bir?.tax_classification_controls_confirmed === true}
                  onChange={(event) => setProfileField('bir', 'tax_classification_controls_confirmed', event.target.checked)}
                  data-profile-error-key="bir.tax_classification_controls_confirmed"
                />
                Tax classification controls confirmed
              </label>
              {profileErrors['bir.tax_classification_controls_confirmed'] && (
                <p className="text-xs text-red-600">{profileErrors['bir.tax_classification_controls_confirmed']}</p>
              )}
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm?.bir?.non_resettable_grand_total_enabled === true}
                  onChange={(event) => setProfileField('bir', 'non_resettable_grand_total_enabled', event.target.checked)}
                  data-profile-error-key="bir.non_resettable_grand_total_enabled"
                />
                Non-resettable grand total enabled
              </label>
              {profileErrors['bir.non_resettable_grand_total_enabled'] && (
                <p className="text-xs text-red-600">{profileErrors['bir.non_resettable_grand_total_enabled']}</p>
              )}
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm?.bir?.mandatory_receipt_fields_confirmed === true}
                  onChange={(event) => setProfileField('bir', 'mandatory_receipt_fields_confirmed', event.target.checked)}
                  data-profile-error-key="bir.mandatory_receipt_fields_confirmed"
                />
                Mandatory receipt fields confirmed
              </label>
              {profileErrors['bir.mandatory_receipt_fields_confirmed'] && (
                <p className="text-xs text-red-600">{profileErrors['bir.mandatory_receipt_fields_confirmed']}</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-900">NPC Profile</p>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>DPO name</Label>
                  <Input
                    value={profileForm?.npc?.dpo_name || ''}
                    onChange={(event) => setProfileField('npc', 'dpo_name', event.target.value)}
                    placeholder="Data Protection Officer"
                    aria-invalid={Boolean(profileErrors['npc.dpo_name'])}
                    data-profile-error-key="npc.dpo_name"
                  />
                  {profileErrors['npc.dpo_name'] && (
                    <p className="text-xs text-red-600">{profileErrors['npc.dpo_name']}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>DPO email</Label>
                  <Input
                    type="email"
                    value={profileForm?.npc?.dpo_email || ''}
                    onChange={(event) => setProfileField('npc', 'dpo_email', event.target.value)}
                    placeholder="dpo@company.com"
                    aria-invalid={Boolean(profileErrors['npc.dpo_email'])}
                    data-profile-error-key="npc.dpo_email"
                  />
                  {profileErrors['npc.dpo_email'] && (
                    <p className="text-xs text-red-600">{profileErrors['npc.dpo_email']}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>DPS registration number</Label>
                  <Input
                    value={profileForm?.npc?.dps_registration_number || ''}
                    onChange={(event) => setProfileField('npc', 'dps_registration_number', event.target.value)}
                    placeholder="NPC DPS registration number"
                    aria-invalid={Boolean(profileErrors['npc.dps_registration_number'])}
                    data-profile-error-key="npc.dps_registration_number"
                  />
                  {profileErrors['npc.dps_registration_number'] && (
                    <p className="text-xs text-red-600">{profileErrors['npc.dps_registration_number']}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>DPS registration valid until</Label>
                  <Input
                    type="date"
                    value={normalizeDateInput(profileForm?.npc?.dps_registration_valid_until)}
                    onChange={(event) => setProfileField('npc', 'dps_registration_valid_until', event.target.value)}
                    aria-invalid={Boolean(profileErrors['npc.dps_registration_valid_until'])}
                    data-profile-error-key="npc.dps_registration_valid_until"
                  />
                  {profileErrors['npc.dps_registration_valid_until'] && (
                    <p className="text-xs text-red-600">{profileErrors['npc.dps_registration_valid_until']}</p>
                  )}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm?.npc?.breach_notification_procedure_confirmed === true}
                  onChange={(event) => setProfileField('npc', 'breach_notification_procedure_confirmed', event.target.checked)}
                  data-profile-error-key="npc.breach_notification_procedure_confirmed"
                />
                Breach notification procedure confirmed
              </label>
              {profileErrors['npc.breach_notification_procedure_confirmed'] && (
                <p className="text-xs text-red-600">{profileErrors['npc.breach_notification_procedure_confirmed']}</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-900">BSP Controls (if required)</p>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={profileForm?.bsp?.ops_registration_required === true}
                    onChange={(event) => setProfileField('bsp', 'ops_registration_required', event.target.checked)}
                  />
                  OPS registration required
                </label>
                <div className="space-y-1">
                  <Label>OPS registration status</Label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={profileForm?.bsp?.ops_registration_status || 'not_required'}
                    onChange={(event) => setProfileField('bsp', 'ops_registration_status', event.target.value)}
                  >
                    <option value="not_required">not_required</option>
                    <option value="pending">pending</option>
                    <option value="active">active</option>
                    <option value="expired">expired</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>OPS registration number</Label>
                  <Input
                    value={profileForm?.bsp?.ops_registration_number || ''}
                    onChange={(event) => setProfileField('bsp', 'ops_registration_number', event.target.value)}
                    placeholder="BSP OPS registration number"
                  />
                </div>
                <div className="space-y-1">
                  <Label>OPS registration valid until</Label>
                  <Input
                    type="date"
                    value={normalizeDateInput(profileForm?.bsp?.ops_registration_valid_until)}
                    onChange={(event) => setProfileField('bsp', 'ops_registration_valid_until', event.target.value)}
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm?.bsp?.payment_control_reviewed === true}
                  onChange={(event) => setProfileField('bsp', 'payment_control_reviewed', event.target.checked)}
                />
                Payment control reviewed
              </label>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Readiness</p>
              <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm?.readiness?.tests_passed === true}
                  onChange={(event) => setProfileField('readiness', 'tests_passed', event.target.checked)}
                  data-profile-error-key="readiness.tests_passed"
                />
                Readiness tests passed
              </label>
              {profileErrors['readiness.tests_passed'] && (
                <p className="text-xs text-red-600">{profileErrors['readiness.tests_passed']}</p>
              )}
              <div className="space-y-1">
                <Label>Last tested at (optional)</Label>
                <Input
                  type="datetime-local"
                  value={profileForm?.readiness?.last_tested_at ? profileForm.readiness.last_tested_at.slice(0, 16) : ''}
                  onChange={(event) => setProfileField('readiness', 'last_tested_at', event.target.value)}
                />
              </div>
            </div>

            <Button type="submit" disabled={busy === 'update-profile'}>
              Save compliance profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" id="section-artifacts">
          <form
            className="grid gap-2 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!artifactForm.artifact_name.trim()) {
                toast.error('Artifact name is required');
                return;
              }
              run('create-artifact', () => complianceService.createComplianceArtifact({
                artifact_type: artifactForm.artifact_type,
                artifact_name: artifactForm.artifact_name.trim()
              }), 'Artifact submitted');
              setArtifactForm({ artifact_type: ARTIFACT_TYPES[0], artifact_name: '' });
            }}
          >
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={artifactForm.artifact_type} onChange={(event) => setArtifactForm((prev) => ({ ...prev, artifact_type: event.target.value }))}>
              {ARTIFACT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <Input value={artifactForm.artifact_name} onChange={(event) => setArtifactForm((prev) => ({ ...prev, artifact_name: event.target.value }))} placeholder="Artifact name" />
            <Button type="submit" disabled={busy === 'create-artifact'}>Add artifact</Button>
          </form>

          {artifacts.map((artifact) => (
            <div key={artifact.tenant_compliance_artifact_id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{artifact.artifact_name}</p>
              <p className="text-xs text-slate-500">status: {artifact.status} | verification: {artifact.verification_status}</p>
              <p className="text-xs text-slate-500">verified at: {fmtDate(artifact.verified_at)}</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!isMasterAdmin} onClick={() => verifyArtifact(artifact.tenant_compliance_artifact_id, 'verify')}>Verify</Button>
                <Button type="button" size="sm" variant="outline" disabled={!isMasterAdmin} onClick={() => verifyArtifact(artifact.tenant_compliance_artifact_id, 'reject')}>Reject</Button>
                <Button type="button" size="sm" variant="outline" disabled={!isMasterAdmin} onClick={() => verifyArtifact(artifact.tenant_compliance_artifact_id, 'revoke')}>Revoke</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Peripherals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" id="section-peripherals">
          <form
            className="grid gap-2 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!peripheralForm.brand.trim() || !peripheralForm.model.trim() || !peripheralForm.serial_number.trim()) {
                toast.error('Brand, model, and serial are required');
                return;
              }
              run('create-peripheral', () => complianceService.createCompliancePeripheral({
                terminal_id: peripheralForm.terminal_id.trim() || null,
                is_shared: peripheralForm.is_shared,
                device_class: peripheralForm.device_class,
                brand: peripheralForm.brand.trim(),
                model: peripheralForm.model.trim(),
                serial_number: peripheralForm.serial_number.trim()
              }), 'Peripheral submitted');
              setPeripheralForm({ terminal_id: '', is_shared: false, device_class: DEVICE_CLASSES[0], brand: '', model: '', serial_number: '' });
            }}
          >
            <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={peripheralForm.device_class} onChange={(event) => setPeripheralForm((prev) => ({ ...prev, device_class: event.target.value }))}>
              {DEVICE_CLASSES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <Input value={peripheralForm.brand} onChange={(event) => setPeripheralForm((prev) => ({ ...prev, brand: event.target.value }))} placeholder="Brand" />
            <Input value={peripheralForm.model} onChange={(event) => setPeripheralForm((prev) => ({ ...prev, model: event.target.value }))} placeholder="Model" />
            <Input value={peripheralForm.serial_number} onChange={(event) => setPeripheralForm((prev) => ({ ...prev, serial_number: event.target.value }))} placeholder="Serial number" />
            <Input value={peripheralForm.terminal_id} onChange={(event) => setPeripheralForm((prev) => ({ ...prev, terminal_id: event.target.value }))} placeholder="Terminal ID (optional)" />
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm"><input type="checkbox" checked={peripheralForm.is_shared} onChange={(event) => setPeripheralForm((prev) => ({ ...prev, is_shared: event.target.checked }))} />Shared device</label>
            <Button type="submit" disabled={busy === 'create-peripheral'}>Add peripheral</Button>
          </form>

          {peripherals.map((device) => (
            <div key={device.tenant_compliance_peripheral_id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{device.brand} {device.model} ({device.device_class})</p>
              <p className="text-xs text-slate-500">terminal: {device.terminal_id || 'shared/unbound'} | shared: {device.is_shared ? 'yes' : 'no'}</p>
              <p className="text-xs text-slate-500">status: {device.status} | verification: {device.verification_status}</p>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!isMasterAdmin} onClick={() => verifyPeripheral(device.tenant_compliance_peripheral_id, 'verify')}>Verify</Button>
                <Button type="button" size="sm" variant="outline" disabled={!isMasterAdmin} onClick={() => verifyPeripheral(device.tenant_compliance_peripheral_id, 'reject')}>Reject</Button>
                <Button type="button" size="sm" variant="outline" disabled={!isMasterAdmin} onClick={() => verifyPeripheral(device.tenant_compliance_peripheral_id, 'revoke')}>Revoke</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
