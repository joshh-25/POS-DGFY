import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocation, useNavigate } from 'react-router-dom';
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
  final_review: { title: 'Final Review', actionTarget: '#section-final-review' }
};

const FINAL_REVIEW_REQUIREMENTS = [
  {
    requirementCode: 'submission_system_flow_diagram_mmd',
    checklistCode: 'submission.system_flow_diagram',
    label: 'System flow diagram (Mermaid source)',
    requiresFreshness: false
  },
  {
    requirementCode: 'submission_system_flow_diagram_png',
    checklistCode: 'submission.system_flow_diagram_image',
    label: 'System flow diagram (exported image)',
    requiresFreshness: false
  },
  {
    requirementCode: 'submission_software_specification',
    checklistCode: 'submission.software_specification',
    label: 'Software specification packet',
    requiresFreshness: false
  },
  {
    requirementCode: 'submission_backup_dr_plan',
    checklistCode: 'submission.backup_disaster_recovery_plan',
    label: 'Data backup and disaster recovery plan',
    requiresFreshness: false
  },
  {
    requirementCode: 'submission_filing_instructions',
    checklistCode: 'submission.filing_instructions',
    label: 'Filing instructions',
    requiresFreshness: false
  },
  {
    requirementCode: 'evidence_restore_drill',
    checklistCode: 'submission.restore_drill_evidence',
    label: 'Latest restore drill evidence',
    requiresFreshness: true
  },
  {
    requirementCode: 'evidence_encryption_verification',
    checklistCode: 'submission.encryption_verification_evidence',
    label: 'Latest encryption verification evidence',
    requiresFreshness: true
  }
];

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;
const ACTION_TARGET_HASH_ALIASES = Object.freeze({
  '#section-activation': '#section-final-review'
});
const HASH_ID_PATTERN = /^[A-Za-z][-A-Za-z0-9_:.]*$/;

const findElementByHashTarget = (target) => {
  const normalizedTarget = String(target || '').trim();
  if (!normalizedTarget.startsWith('#')) return null;
  const rawId = normalizedTarget.slice(1);
  if (!rawId) return null;
  let decodedId = rawId;
  try {
    decodedId = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  if (!HASH_ID_PATTERN.test(decodedId)) {
    return null;
  }
  return document.getElementById(decodedId);
};

const slugifyCode = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

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
  const location = useLocation();
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
  const [finalReviewFormByRequirement, setFinalReviewFormByRequirement] = useState({});
  const [finalReviewFiles, setFinalReviewFiles] = useState({});
  const [finalReviewSignoff, setFinalReviewSignoff] = useState({
    engineering_approver: '',
    compliance_approver: '',
    filing_batch_id: '',
    engineering_signed_at: '',
    compliance_signed_at: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, d, f] = await Promise.all([
        complianceService.getComplianceProfile(),
        complianceService.listComplianceArtifacts(),
        complianceService.listCompliancePeripherals(),
        complianceService.listFinalReviewDocuments()
      ]);
      setProfile(p || null);
      setProfileForm(mergeProfile(PROFILE_DEFAULT, p?.profile || {}));
      setProfileErrors({});
      setArtifacts(Array.isArray(a?.artifacts) ? a.artifacts : []);
      setPeripherals(Array.isArray(d?.peripherals) ? d.peripherals : []);
      const loadedDocuments = Array.isArray(f?.documents) ? f.documents : [];
      const formSeed = {};
      FINAL_REVIEW_REQUIREMENTS.forEach((entry) => {
        const existing = loadedDocuments.find((doc) => doc.requirement_code === entry.requirementCode);
        formSeed[entry.requirementCode] = {
          source_type: existing?.source_type || 'upload',
          external_url: existing?.external_url || '',
          freshness_date: existing?.freshness_date ? normalizeDateInput(existing.freshness_date) : ''
        };
      });
      setFinalReviewFormByRequirement(formSeed);
      setFinalReviewFiles({});
      const signoff = f?.signoff || {};
      setFinalReviewSignoff({
        engineering_approver: signoff.engineering_approver || '',
        compliance_approver: signoff.compliance_approver || '',
        filing_batch_id: signoff.filing_batch_id || '',
        engineering_signed_at: normalizeDateInput(signoff.engineering_signed_at),
        compliance_signed_at: normalizeDateInput(signoff.compliance_signed_at)
      });
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
  const documentaryReadinessItems = Array.isArray(checklist?.documentary_readiness?.items)
    ? checklist.documentary_readiness.items
    : [];
  const documentaryItemByCode = documentaryReadinessItems.reduce((acc, item) => {
    if (item?.code) acc[item.code] = item;
    return acc;
  }, {});
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

  const setFinalReviewField = (requirementCode, key, value) => {
    setFinalReviewFormByRequirement((prev) => ({
      ...prev,
      [requirementCode]: {
        ...(prev?.[requirementCode] || {}),
        [key]: value
      }
    }));
  };

  const setSignoffField = (key, value) => {
    setFinalReviewSignoff((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const saveFinalReviewDocument = async (requirement) => {
    const form = finalReviewFormByRequirement?.[requirement.requirementCode] || {};
    await run(
      `final-review-doc-${requirement.requirementCode}`,
      async () => {
        const updated = await complianceService.upsertFinalReviewDocument({
          requirement_code: requirement.requirementCode,
          source_type: form.source_type || 'upload',
          external_url: form.source_type === 'external_url' ? form.external_url || null : null,
          freshness_date: requirement.requiresFreshness && form.freshness_date ? form.freshness_date : null
        });

        const pendingFile = finalReviewFiles?.[requirement.requirementCode] || null;
        if (pendingFile && (form.source_type || 'upload') === 'upload') {
          const documentId = updated?.tenant_compliance_final_review_document_id;
          if (documentId) {
            await complianceService.uploadFinalReviewDocument(documentId, pendingFile);
          }
        }
      },
      'Final review document updated'
    );
  };

  const saveFinalReviewSignoff = async () => {
    await run(
      'final-review-signoff',
      () => complianceService.upsertFinalReviewSignoff(finalReviewSignoff),
      'Final review sign-off metadata updated'
    );
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
    const scrollToHashTarget = (hash) => {
      const normalizedHash = String(hash || '').trim();
      if (!normalizedHash.startsWith('#')) return false;
      const lookup = [normalizedHash, ACTION_TARGET_HASH_ALIASES[normalizedHash]].filter(Boolean);
      for (const currentHash of lookup) {
        const node = findElementByHashTarget(currentHash);
        if (node) {
          node.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return true;
        }
      }
      return false;
    };

    if (normalized.startsWith('#')) {
      if (!scrollToHashTarget(normalized)) {
        toast.info('Target section is not available on this screen yet.');
      }
      return;
    }

    const hashIndex = normalized.indexOf('#');
    if (hashIndex > 0) {
      const routeTarget = normalized.slice(0, hashIndex);
      const hashTarget = normalized.slice(hashIndex);
      const currentRoute = `${location.pathname}${location.search}`;
      if (routeTarget === currentRoute && scrollToHashTarget(hashTarget)) {
        return;
      }
      if (routeTarget === currentRoute) {
        toast.info('Target section is not available on this screen yet.');
        return;
      }
    }
    navigate(normalized);
  };

  useEffect(() => {
    if (loading) return;
    const hashTarget = String(location.hash || '').trim();
    if (!hashTarget.startsWith('#')) return;
    const normalizedHash = ACTION_TARGET_HASH_ALIASES[hashTarget] || hashTarget;
    requestAnimationFrame(() => {
      const node = findElementByHashTarget(normalizedHash);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, [loading, location.hash, modeState]);

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

          <div id="section-final-review" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
            <Label>Final review</Label>
            {modeState === 'compliant_pending' ? (
              <>
                <Label>Type ACTIVATE COMPLIANT</Label>
                <Input value={activateText} onChange={(event) => setActivateText(event.target.value)} placeholder="ACTIVATE COMPLIANT" />
                <Button
                  type="button"
                  disabled={!isMasterAdmin || busy === 'activate' || activateText.trim() !== 'ACTIVATE COMPLIANT' || checklist.ready_for_compliant_activation !== true}
                  onClick={() => run('activate', () => complianceService.activateCompliantMode({ confirmation_text: activateText.trim() }), 'Compliant mode activated')}
                >
                  Activate compliant mode
                </Button>
              </>
            ) : (
              <p className="text-xs text-slate-700">
                {modeChoiceRequired
                  ? 'Select a compliance mode to continue activation planning.'
                  : modeState === 'non_compliant_active'
                    ? 'Upgrade to compliant mode to unlock activation controls.'
                    : 'Compliant mode is active. Review any remaining final-review blockers below.'}
              </p>
            )}
            <div className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Submission Documents</p>
              <p className="text-xs text-slate-600">Auto-valid now; subject to platform review. Platform admin may revoke documentary validity.</p>
              {FINAL_REVIEW_REQUIREMENTS.map((requirement) => {
                const form = finalReviewFormByRequirement?.[requirement.requirementCode] || {};
                const file = finalReviewFiles?.[requirement.requirementCode] || null;
                const checklistItem = documentaryItemByCode?.[requirement.checklistCode] || null;
                const slugId = `final-review-doc-${slugifyCode(requirement.checklistCode)}`;
                return (
                  <div id={slugId} key={requirement.requirementCode} className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">{requirement.label}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${checklistItem?.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                        {checklistItem?.ready ? 'Ready' : 'Missing'}
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <div>
                        <Label className="text-xs">Source</Label>
                        <select
                          className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                          value={form.source_type || 'upload'}
                          onChange={(event) => setFinalReviewField(requirement.requirementCode, 'source_type', event.target.value)}
                        >
                          <option value="upload">Upload file</option>
                          <option value="external_url">External URL</option>
                        </select>
                      </div>
                      {(form.source_type || 'upload') === 'external_url' ? (
                        <div className="md:col-span-2">
                          <Label className="text-xs">External URL</Label>
                          <Input
                            value={form.external_url || ''}
                            onChange={(event) => setFinalReviewField(requirement.requirementCode, 'external_url', event.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                      ) : (
                        <div className="md:col-span-2">
                          <Label className="text-xs">File upload</Label>
                          <Input
                            type="file"
                            onChange={(event) => {
                              const selected = event.target.files?.[0] || null;
                              setFinalReviewFiles((prev) => ({
                                ...prev,
                                [requirement.requirementCode]: selected
                              }));
                            }}
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            {file ? `Selected: ${file.name}` : (checklistItem?.file_name ? `Current: ${checklistItem.file_name}` : 'No file selected')}
                          </p>
                        </div>
                      )}
                    </div>
                    {requirement.requiresFreshness && (
                      <div>
                        <Label className="text-xs">Evidence date</Label>
                        <Input
                          type="date"
                          value={form.freshness_date || ''}
                          onChange={(event) => setFinalReviewField(requirement.requirementCode, 'freshness_date', event.target.value)}
                        />
                      </div>
                    )}
                    {Array.isArray(checklistItem?.quality_issues) && checklistItem.quality_issues.length > 0 && (
                      <p className="text-xs text-amber-700">Issues: {checklistItem.quality_issues.join(', ')}</p>
                    )}
                    {checklistItem?.review_note && (
                      <p className="text-xs text-slate-600">Platform review note: {checklistItem.review_note}</p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy === `final-review-doc-${requirement.requirementCode}`}
                      onClick={() => saveFinalReviewDocument(requirement)}
                    >
                      Save document
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-900">Sign-off Metadata</p>
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <Label className="text-xs">Engineering approver</Label>
                  <Input value={finalReviewSignoff.engineering_approver || ''} onChange={(event) => setSignoffField('engineering_approver', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Compliance approver</Label>
                  <Input value={finalReviewSignoff.compliance_approver || ''} onChange={(event) => setSignoffField('compliance_approver', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Filing batch ID</Label>
                  <Input value={finalReviewSignoff.filing_batch_id || ''} onChange={(event) => setSignoffField('filing_batch_id', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Engineering signed at</Label>
                  <Input type="date" value={finalReviewSignoff.engineering_signed_at || ''} onChange={(event) => setSignoffField('engineering_signed_at', event.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Compliance signed at</Label>
                  <Input type="date" value={finalReviewSignoff.compliance_signed_at || ''} onChange={(event) => setSignoffField('compliance_signed_at', event.target.value)} />
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={busy === 'final-review-signoff'} onClick={saveFinalReviewSignoff}>
                Save sign-off metadata
              </Button>
            </div>
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
