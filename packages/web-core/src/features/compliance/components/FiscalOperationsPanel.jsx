import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, History } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  fetchESalesReports,
  fetchFiscalLedgerIntegrity,
  fetchFiscalTerminalRegistrations,
  generateESalesReport,
  saveFiscalTerminalRegistration,
  updateESalesReportStatus
} from '../../pos/services/posService.js';

const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;

const createDefaultFiscalTerminalForm = () => ({
  terminal_id: '',
  location_id: '',
  min_number: '',
  machine_serial_number: '',
  software_version: '',
  software_serial_number: '',
  ptu_number: '',
  permit_issued_at: '',
  permit_effective_at: '',
  permit_expires_at: '',
  receipt_printer_binding: '',
  cash_drawer_binding: '',
  accreditation_status: 'draft',
  evidence_ref: ''
});

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const sanitizeTerminalRegistryId = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '-')
  .replace(/[^A-Z0-9._-]/g, '');

const normalizePermissions = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((permission) => typeof permission === 'string' ? permission : permission?.key || permission?.permission)
      .filter(Boolean)
      .map((permission) => String(permission));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, permissions]) => (
      Array.isArray(permissions)
        ? permissions.map((permission) => `${key}:${permission}`)
        : []
    ));
  }
  return [];
};

const formatError = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

const fiscalTerminalFormFromRegistration = (registration) => ({
  terminal_id: registration?.terminal_id || '',
  location_id: registration?.location_id || '',
  min_number: registration?.min_number || '',
  machine_serial_number: registration?.machine_serial_number || '',
  software_version: registration?.software_version || '',
  software_serial_number: registration?.software_serial_number || '',
  ptu_number: registration?.ptu_number || '',
  permit_issued_at: String(registration?.permit_issued_at || '').slice(0, 10),
  permit_effective_at: String(registration?.permit_effective_at || '').slice(0, 10),
  permit_expires_at: String(registration?.permit_expires_at || '').slice(0, 10),
  receipt_printer_binding: registration?.receipt_printer_binding || '',
  cash_drawer_binding: registration?.cash_drawer_binding || '',
  accreditation_status: registration?.accreditation_status || 'draft',
  evidence_ref: registration?.evidence_ref || ''
});

export default function FiscalOperationsPanel({
  terminalUser = null,
  accessCapabilities = {},
  locations = [],
  readOnly = false,
  onChanged = null
}) {
  const [fiscalTerminalRegistrations, setFiscalTerminalRegistrations] = useState([]);
  const [fiscalTerminalLoading, setFiscalTerminalLoading] = useState(false);
  const [fiscalTerminalSaving, setFiscalTerminalSaving] = useState(false);
  const [fiscalTerminalForm, setFiscalTerminalForm] = useState(createDefaultFiscalTerminalForm());
  const [esalesReports, setESalesReports] = useState([]);
  const [esalesLoading, setESalesLoading] = useState(false);
  const [esalesSaving, setESalesSaving] = useState(false);
  const [esalesForm, setESalesForm] = useState({ report_month: currentMonthValue(), evidence_ref: '' });
  const [esalesStatusForm, setESalesStatusForm] = useState({});
  const [fiscalLedgerIntegrity, setFiscalLedgerIntegrity] = useState(null);
  const [fiscalLedgerLoading, setFiscalLedgerLoading] = useState(false);

  const permissions = useMemo(() => normalizePermissions(terminalUser?.permissions), [terminalUser?.permissions]);
  const canManageFiscalTerminals = !readOnly && (
    terminalUser?.is_master_admin === true
    || String(terminalUser?.role || '').trim().toLowerCase() === 'admin'
    || accessCapabilities?.manage_fiscal_terminals === true
    || permissions.includes('pos:fiscal_terminals:manage')
  );
  const canManageESalesReports = !readOnly && (
    terminalUser?.is_master_admin === true
    || String(terminalUser?.role || '').trim().toLowerCase() === 'admin'
    || accessCapabilities?.manage_esales_reports === true
    || permissions.includes('pos:esales:manage')
  );
  const terminalLocationOptions = useMemo(() => (Array.isArray(locations) ? locations : [])
    .filter((location) => location?.is_active !== false)
    .map((location) => ({
      ...location,
      location_id: location?.location_id ?? location?.branch_id,
      name: location?.name || location?.branch_name || location?.location_name || 'Unnamed location'
    }))
    .filter((location) => location.location_id != null)
    .sort((left, right) => {
      if (left?.is_primary_storefront === true && right?.is_primary_storefront !== true) return -1;
      if (right?.is_primary_storefront === true && left?.is_primary_storefront !== true) return 1;
      return String(left?.name || '').localeCompare(String(right?.name || ''));
    }), [locations]);

  const fiscalTerminalReadiness = useMemo(() => {
    const registrations = Array.isArray(fiscalTerminalRegistrations) ? fiscalTerminalRegistrations : [];
    const verified = registrations.filter((registration) => registration?.accreditation_status === 'verified');
    const blocked = registrations.filter((registration) => (
      registration?.accreditation_status !== 'verified'
      && (!registration?.min_number
        || !registration?.machine_serial_number
        || !registration?.software_serial_number
        || !registration?.ptu_number
        || !registration?.evidence_ref)
    ));
    return {
      total: registrations.length,
      verified: verified.length,
      blocked: blocked.length,
      ready: verified.length > 0
    };
  }, [fiscalTerminalRegistrations]);

  const loadFiscalTerminalRegistrations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setFiscalTerminalLoading(true);
    try {
      const data = await fetchFiscalTerminalRegistrations();
      setFiscalTerminalRegistrations(Array.isArray(data?.registrations) ? data.registrations : []);
    } catch (error) {
      if (!silent) toast.error(formatError(error, 'Failed to load fiscal terminal registrations.'));
    } finally {
      if (!silent) setFiscalTerminalLoading(false);
    }
  }, []);

  const loadESalesReports = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setESalesLoading(true);
    try {
      const data = await fetchESalesReports();
      setESalesReports(Array.isArray(data?.reports) ? data.reports : []);
    } catch (error) {
      if (!silent) toast.error(formatError(error, 'Failed to load eSales reports.'));
    } finally {
      if (!silent) setESalesLoading(false);
    }
  }, []);

  const loadFiscalLedgerIntegrity = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setFiscalLedgerLoading(true);
    try {
      const data = await fetchFiscalLedgerIntegrity();
      setFiscalLedgerIntegrity(data || null);
    } catch (error) {
      if (!silent) toast.error(formatError(error, 'Failed to verify fiscal ledger integrity.'));
    } finally {
      if (!silent) setFiscalLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiscalTerminalRegistrations({ silent: true });
    loadESalesReports({ silent: true });
    loadFiscalLedgerIntegrity({ silent: true });
  }, [loadESalesReports, loadFiscalLedgerIntegrity, loadFiscalTerminalRegistrations]);

  const setFiscalTerminalField = (field, value) => {
    setFiscalTerminalForm((current) => ({
      ...current,
      [field]: field === 'terminal_id' ? sanitizeTerminalRegistryId(value) : value
    }));
  };

  const saveFiscalTerminal = async () => {
    const terminalId = sanitizeTerminalRegistryId(fiscalTerminalForm.terminal_id);
    if (!terminalId || !TERMINAL_ID_PATTERN.test(terminalId)) {
      toast.error('Fiscal terminal ID must be 2-100 characters and use letters, numbers, dot, underscore, or hyphen.');
      return;
    }
    if (fiscalTerminalForm.accreditation_status === 'verified') {
      const missing = [
        ['min_number', 'MIN number'],
        ['machine_serial_number', 'Machine serial number'],
        ['software_serial_number', 'Software serial number'],
        ['ptu_number', 'PTU number']
      ].filter(([key]) => !String(fiscalTerminalForm[key] || '').trim());
      if (missing.length > 0) {
        toast.error(`Verified terminals require: ${missing.map(([, label]) => label).join(', ')}.`);
        return;
      }
    }
    setFiscalTerminalSaving(true);
    try {
      await saveFiscalTerminalRegistration({
        ...fiscalTerminalForm,
        terminal_id: terminalId,
        location_id: fiscalTerminalForm.location_id ? Number(fiscalTerminalForm.location_id) : null
      });
      toast.success('Fiscal terminal registration saved.');
      setFiscalTerminalForm(createDefaultFiscalTerminalForm());
      await loadFiscalTerminalRegistrations({ silent: true });
      onChanged?.('fiscal-terminal-registration');
    } catch (error) {
      toast.error(formatError(error, 'Failed to save fiscal terminal registration.'));
    } finally {
      setFiscalTerminalSaving(false);
    }
  };

  const generateESales = async () => {
    if (!/^\d{4}-\d{2}$/.test(String(esalesForm.report_month || '').trim())) {
      toast.error('Report month must use YYYY-MM.');
      return;
    }
    setESalesSaving(true);
    try {
      await generateESalesReport(esalesForm);
      toast.success('eSales report package generated.');
      await loadESalesReports({ silent: true });
      onChanged?.('esales-reporting');
    } catch (error) {
      toast.error(formatError(error, 'Failed to generate eSales report.'));
    } finally {
      setESalesSaving(false);
    }
  };

  const setESalesStatusDraft = (reportId, field, value) => {
    setESalesStatusForm((current) => ({
      ...current,
      [reportId]: {
        status: 'submitted',
        status_evidence_ref: '',
        status_note: '',
        ...(current?.[reportId] || {}),
        [field]: value
      }
    }));
  };

  const saveESalesStatus = async (report) => {
    const reportId = report?.pos_esales_report_id;
    const draft = esalesStatusForm?.[reportId] || {};
    if (!reportId) return;
    setESalesSaving(true);
    try {
      await updateESalesReportStatus(reportId, {
        status: draft.status || 'submitted',
        status_evidence_ref: draft.status_evidence_ref || '',
        status_note: draft.status_note || ''
      });
      toast.success('eSales report status updated.');
      await loadESalesReports({ silent: true });
      onChanged?.('esales-reporting');
    } catch (error) {
      toast.error(formatError(error, 'Failed to update eSales report status.'));
    } finally {
      setESalesSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="fiscal-operations-panel">
      <Card id="fiscal-terminal-registration">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-teal-600" />
            Fiscal Terminal Registration
          </CardTitle>
          <CardDescription>
            Register terminal-specific MIN, machine, software, PTU, and evidence data required before fiscal invoice checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`grid gap-3 rounded-md border p-3 text-sm md:grid-cols-3 ${fiscalTerminalReadiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <div><p className="text-xs font-semibold uppercase">Activation readiness</p><p className="font-semibold">{fiscalTerminalReadiness.ready ? 'Verified terminal available' : 'Verified terminal required'}</p></div>
            <div><p className="text-xs font-semibold uppercase">Verified terminals</p><p className="font-semibold">{fiscalTerminalReadiness.verified} of {fiscalTerminalReadiness.total}</p></div>
            <div><p className="text-xs font-semibold uppercase">Records needing evidence</p><p className="font-semibold">{fiscalTerminalReadiness.blocked}</p></div>
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-12">
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Terminal ID</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.terminal_id} onChange={(event) => setFiscalTerminalField('terminal_id', event.target.value)} placeholder="COUNTER-01" /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Location</Label><select disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.location_id || ''} onChange={(event) => setFiscalTerminalField('location_id', event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"><option value="">Unassigned</option>{terminalLocationOptions.map((location) => <option key={`fiscal-terminal-location-${location.location_id}`} value={location.location_id}>{location.name}{location.is_primary_storefront === true ? ' (Primary)' : ''}</option>)}</select></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Accreditation Status</Label><select disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.accreditation_status} onChange={(event) => setFiscalTerminalField('accreditation_status', event.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"><option value="draft">Draft</option><option value="pending_review">Pending Review</option><option value="verified">Verified</option><option value="revoked">Revoked</option></select></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Evidence Reference</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.evidence_ref} onChange={(event) => setFiscalTerminalField('evidence_ref', event.target.value)} placeholder="Filing artifact or approval ref" /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">MIN Number</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.min_number} onChange={(event) => setFiscalTerminalField('min_number', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Machine Serial</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.machine_serial_number} onChange={(event) => setFiscalTerminalField('machine_serial_number', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Software Version</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.software_version} onChange={(event) => setFiscalTerminalField('software_version', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Software Serial</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.software_serial_number} onChange={(event) => setFiscalTerminalField('software_serial_number', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">PTU Number</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.ptu_number} onChange={(event) => setFiscalTerminalField('ptu_number', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Permit Issued</Label><Input disabled={!canManageFiscalTerminals} type="date" value={fiscalTerminalForm.permit_issued_at} onChange={(event) => setFiscalTerminalField('permit_issued_at', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Permit Effective</Label><Input disabled={!canManageFiscalTerminals} type="date" value={fiscalTerminalForm.permit_effective_at} onChange={(event) => setFiscalTerminalField('permit_effective_at', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Permit Expires</Label><Input disabled={!canManageFiscalTerminals} type="date" value={fiscalTerminalForm.permit_expires_at} onChange={(event) => setFiscalTerminalField('permit_expires_at', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-4"><Label className="text-xs text-slate-500">Receipt Printer Binding</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.receipt_printer_binding} onChange={(event) => setFiscalTerminalField('receipt_printer_binding', event.target.value)} /></div>
            <div className="space-y-1 md:col-span-4"><Label className="text-xs text-slate-500">Cash Drawer Binding</Label><Input disabled={!canManageFiscalTerminals} value={fiscalTerminalForm.cash_drawer_binding} onChange={(event) => setFiscalTerminalField('cash_drawer_binding', event.target.value)} /></div>
            <div className="flex items-end gap-2 md:col-span-4"><Button type="button" onClick={saveFiscalTerminal} disabled={!canManageFiscalTerminals || fiscalTerminalSaving}>{fiscalTerminalSaving ? 'Saving...' : 'Save Fiscal Terminal'}</Button><Button type="button" variant="outline" onClick={() => setFiscalTerminalForm(createDefaultFiscalTerminalForm())}>Clear</Button></div>
          </div>
          {!canManageFiscalTerminals && <p className="text-xs text-amber-700">You need fiscal terminal management permission to save terminal accreditation records.</p>}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Terminal</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">MIN</th><th className="px-3 py-2">PTU</th><th className="px-3 py-2">Evidence</th><th className="px-3 py-2">Action</th></tr></thead><tbody>
              {fiscalTerminalRegistrations.map((registration) => <tr key={registration.pos_fiscal_terminal_registration_id || registration.terminal_id} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold text-slate-900">{registration.terminal_id}</td><td className="px-3 py-2">{registration.accreditation_status}</td><td className="px-3 py-2">{registration.min_number || '-'}</td><td className="px-3 py-2">{registration.ptu_number || '-'}</td><td className="px-3 py-2">{registration.evidence_ref || '-'}</td><td className="px-3 py-2"><Button type="button" variant="outline" size="sm" disabled={!canManageFiscalTerminals} onClick={() => setFiscalTerminalForm(fiscalTerminalFormFromRegistration(registration))}>Edit</Button></td></tr>)}
              {!fiscalTerminalLoading && fiscalTerminalRegistrations.length === 0 && <tr><td className="px-3 py-4 text-slate-500" colSpan={6}>No fiscal terminal registrations yet.</td></tr>}
            </tbody></table>
          </div>
        </CardContent>
      </Card>

      <Card id="fiscal-ledger-integrity">
        <CardHeader><CardTitle className="flex items-center gap-2">{fiscalLedgerIntegrity?.ready ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}Fiscal Ledger Integrity</CardTitle><CardDescription>Verify event sequence continuity, previous-hash linkage, and event hash recomputation for the fiscal event ledger.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className={`grid gap-3 rounded-md border p-3 text-sm md:grid-cols-4 ${fiscalLedgerIntegrity?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><div><p className="text-xs font-semibold uppercase">Status</p><p className="font-semibold">{fiscalLedgerIntegrity?.ready ? 'Verified' : 'Needs review'}</p></div><div><p className="text-xs font-semibold uppercase">Events checked</p><p className="font-semibold">{fiscalLedgerIntegrity?.checked_event_count ?? 0}</p></div><div><p className="text-xs font-semibold uppercase">Issues</p><p className="font-semibold">{fiscalLedgerIntegrity?.issue_count ?? 0}</p></div><div><p className="text-xs font-semibold uppercase">Latest sequence</p><p className="font-semibold">{fiscalLedgerIntegrity?.latest_event_sequence || '-'}</p></div></div>
          <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={() => loadFiscalLedgerIntegrity()} disabled={fiscalLedgerLoading}>{fiscalLedgerLoading ? 'Verifying...' : 'Verify Fiscal Ledger'}</Button><span className="text-xs text-slate-500">Last verified: {fiscalLedgerIntegrity?.verified_at ? new Date(fiscalLedgerIntegrity.verified_at).toLocaleString() : 'Not verified in this session'}</span></div>
          {Array.isArray(fiscalLedgerIntegrity?.issues) && fiscalLedgerIntegrity.issues.length > 0 && <div className="overflow-x-auto rounded-lg border border-amber-200"><table className="min-w-full text-left text-xs"><thead className="bg-amber-50 uppercase text-amber-700"><tr><th className="px-3 py-2">Sequence</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Issue</th><th className="px-3 py-2">Invoice</th></tr></thead><tbody>{fiscalLedgerIntegrity.issues.slice(0, 10).map((issue, index) => <tr key={`${issue.code}-${issue.event_sequence}-${index}`} className="border-t border-amber-100"><td className="px-3 py-2">{issue.event_sequence || '-'}</td><td className="px-3 py-2">{issue.event_type || '-'}</td><td className="px-3 py-2 font-semibold">{issue.code}</td><td className="px-3 py-2">{issue.invoice_number || '-'}</td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>

      <Card id="esales-reporting">
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-teal-600" />eSales Reporting Packages</CardTitle><CardDescription>Generate monthly fiscal sales packages, retain checksum evidence, and track submission acknowledgement status.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-12"><div className="space-y-1 md:col-span-3"><Label className="text-xs text-slate-500">Report Month</Label><Input disabled={!canManageESalesReports} type="month" value={esalesForm.report_month} onChange={(event) => setESalesForm((current) => ({ ...current, report_month: event.target.value }))} /></div><div className="space-y-1 md:col-span-6"><Label className="text-xs text-slate-500">Generation Evidence Reference</Label><Input disabled={!canManageESalesReports} value={esalesForm.evidence_ref} onChange={(event) => setESalesForm((current) => ({ ...current, evidence_ref: event.target.value }))} placeholder="Dry run, filing packet, or checksum manifest ref" /></div><div className="flex items-end md:col-span-3"><Button type="button" onClick={generateESales} disabled={!canManageESalesReports || esalesSaving}>{esalesSaving ? 'Working...' : 'Generate eSales Package'}</Button></div></div>
          {!canManageESalesReports && <p className="text-xs text-amber-700">You need eSales report management permission to generate or update report status.</p>}
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Month</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Checksum</th><th className="px-3 py-2">Evidence</th><th className="px-3 py-2">Update</th></tr></thead><tbody>
            {esalesReports.map((report) => { const reportId = report.pos_esales_report_id; const draft = esalesStatusForm?.[reportId] || {}; return <tr key={reportId || report.report_month} className="border-t border-slate-100 align-top"><td className="px-3 py-2 font-semibold text-slate-900">{report.report_month}</td><td className="px-3 py-2">{report.status}</td><td className="px-3 py-2 font-mono text-xs">{String(report.payload_hash || '').slice(0, 16)}...</td><td className="px-3 py-2">{report.evidence_ref || report.status_evidence_ref || '-'}</td><td className="px-3 py-2"><div className="grid min-w-[360px] grid-cols-1 gap-2 md:grid-cols-4"><select disabled={!canManageESalesReports} value={draft.status || 'submitted'} onChange={(event) => setESalesStatusDraft(reportId, 'status', event.target.value)} className="rounded-md border border-slate-200 px-2 py-1 text-xs"><option value="submitted">Submitted</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></select><Input disabled={!canManageESalesReports} className="h-8 text-xs md:col-span-2" value={draft.status_evidence_ref || ''} onChange={(event) => setESalesStatusDraft(reportId, 'status_evidence_ref', event.target.value)} placeholder="Acknowledgement ref" /><Button type="button" variant="outline" size="sm" disabled={!canManageESalesReports || esalesSaving} onClick={() => saveESalesStatus(report)}>Save</Button><Input disabled={!canManageESalesReports} className="h-8 text-xs md:col-span-4" value={draft.status_note || ''} onChange={(event) => setESalesStatusDraft(reportId, 'status_note', event.target.value)} placeholder="Optional status note" /></div></td></tr>; })}
            {!esalesLoading && esalesReports.length === 0 && <tr><td className="px-3 py-4 text-slate-500" colSpan={5}>No eSales reports generated yet.</td></tr>}
          </tbody></table></div>
        </CardContent>
      </Card>
    </div>
  );
}
