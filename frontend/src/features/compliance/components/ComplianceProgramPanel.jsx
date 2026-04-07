import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const fmtDate = (value) => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleString();
};

export default function ComplianceProgramPanel({ isMasterAdmin = false }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [profile, setProfile] = useState(null);
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
  const modeState = profile?.mode_state || null;
  const modeChoiceRequired = profile?.mode_choice_required === true;

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
          <p className="text-xs text-slate-500">Missing profile fields: {(checklist.missing_profile_fields || []).join(', ') || 'None'}</p>
          <p className="text-xs text-slate-500">Missing artifacts: {(checklist.missing_artifacts || []).join(', ') || 'None'}</p>
          <p className="text-xs text-slate-500">Missing peripherals: {(checklist.missing_peripheral_classes || []).join(', ') || 'None'}</p>
          <p className="text-xs text-slate-500">Missing settings: {(checklist.missing_setting_keys || []).join(', ') || 'None'}</p>

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
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <Label>Type ACTIVATE COMPLIANT</Label>
              <Input value={activateText} onChange={(event) => setActivateText(event.target.value)} placeholder="ACTIVATE COMPLIANT" />
              <Button
                type="button"
                disabled={!isMasterAdmin || busy === 'activate' || activateText.trim() !== 'ACTIVATE COMPLIANT' || checklist.ready_for_compliant_activation !== true}
                onClick={() => run('activate', () => complianceService.activateCompliantMode(), 'Compliant mode activated')}
              >
                Activate compliant mode
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
        <CardContent className="space-y-3">
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
