import React, { useEffect, useState } from 'react';
import { Download, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  downloadBusinessAdminEJournalEvidence,
  getBusinessAdminEJournalEvidence,
  getBusinessAdminEvidenceCatalog
} from '../api/businessAdminReportsApi.js';

const localDateInputValue = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const extractErrorMessage = (error) => (
  error?.response?.data?.message
  || error?.response?.data?.error?.message
  || error?.message
  || 'Please try again.'
);

export default function EvidencePanel({ activeLocations = [] }) {
  const [catalog, setCatalog] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [query, setQuery] = useState({
    date_from: localDateInputValue(),
    date_to: localDateInputValue(),
    branch_id: '',
    terminal_id: ''
  });
  const [evidence, setEvidence] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const [downloadFormat, setDownloadFormat] = useState('txt');

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError('');
    getBusinessAdminEvidenceCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((error) => {
        if (!cancelled) setCatalogError(extractErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const updateQuery = (key, value) => setQuery((previous) => ({ ...previous, [key]: value }));

  const validateQuery = () => {
    if (!query.date_from || !query.date_to || query.date_from !== query.date_to) {
      return 'Use one business date for an e-journal file.';
    }
    if (!String(query.branch_id).trim()) return 'Select a branch before checking evidence.';
    if (!String(query.terminal_id).trim()) return 'Enter the terminal identifier before checking evidence.';
    return '';
  };

  const checkEvidence = async () => {
    const validationMessage = validateQuery();
    if (validationMessage) {
      setEvidenceError(validationMessage);
      return;
    }
    setEvidenceLoading(true);
    setEvidenceError('');
    try {
      setEvidence(await getBusinessAdminEJournalEvidence(query));
    } catch (error) {
      setEvidence(null);
      setEvidenceError(extractErrorMessage(error));
    } finally {
      setEvidenceLoading(false);
    }
  };

  const downloadEvidence = async () => {
    const validationMessage = validateQuery();
    if (validationMessage) {
      setEvidenceError(validationMessage);
      return;
    }
    setEvidenceLoading(true);
    setEvidenceError('');
    try {
      const response = await downloadBusinessAdminEJournalEvidence(query, downloadFormat);
      const blob = response?.data instanceof Blob ? response.data : new Blob([response?.data || '']);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `e-journal-${query.date_from}.${downloadFormat === 'manifest' ? 'json' : downloadFormat === 'html' ? 'html' : 'txt'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setEvidenceError(extractErrorMessage(error));
    } finally {
      setEvidenceLoading(false);
    }
  };

  const reports = Array.isArray(catalog?.reports) ? catalog.reports : [];
  const summary = catalog?.summary;
  const resultSummary = evidence?.summary;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <h3 className="font-semibold text-blue-950">Local BIR readiness evidence</h3>
            <p className="mt-1 text-sm text-blue-900">
              This reviewer view uses immutable fiscal snapshots and the internal <code>EJOURNAL-READINESS-0.1</code> contract.
              It is local readiness evidence only; external BIR/provider grammar review is still required.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
              <FileText className="h-5 w-5 text-blue-700" />
              Report applicability catalog
            </h3>
            <p className="mt-1 text-sm text-slate-500">Read-only registry coverage, source ownership, filters, and evidence boundaries.</p>
          </div>
          {summary ? <Badge variant="outline">{summary.registry_report_count} registry reports</Badge> : null}
        </div>
        {catalogLoading ? <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading evidence catalog…</div> : null}
        {catalogError ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{catalogError}</p> : null}
        {!catalogLoading && !catalogError ? (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="p-3 font-medium">Report</th>
                  <th className="p-3 font-medium">Source of truth</th>
                  <th className="p-3 font-medium">Filters / formats</th>
                  <th className="p-3 font-medium">Applicability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((report) => (
                  <tr key={report.report_key}>
                    <td className="p-3 align-top">
                      <div className="font-medium text-slate-900">{report.label}</div>
                      <div className="text-xs text-slate-500">{report.report_key}</div>
                    </td>
                    <td className="p-3 align-top text-slate-600">{report.source_of_truth}</td>
                    <td className="p-3 align-top text-slate-600">
                      <div>{report.filters?.join(', ') || 'Declared by report definition'}</div>
                      <div className="text-xs text-slate-500">{report.formats?.join(', ') || 'No export format declared'}</div>
                    </td>
                    <td className="p-3 align-top">
                      <Badge variant="outline" className="mb-1">{report.applicability}</Badge>
                      <div className="text-xs text-slate-500">{report.applicability_reason}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-slate-900">Receipt-complete e-journal export</h3>
          <p className="mt-1 text-sm text-slate-500">One bounded, deterministic file per business date, branch, and terminal.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="evidence-business-date">Business date</Label>
            <Input id="evidence-business-date" type="date" value={query.date_from} onChange={(event) => {
              const value = event.target.value;
              setQuery((previous) => ({ ...previous, date_from: value, date_to: value }));
            }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="evidence-branch">Branch</Label>
            {activeLocations.length > 0 ? (
              <Select value={query.branch_id || undefined} onValueChange={(value) => updateQuery('branch_id', value)}>
                <SelectTrigger id="evidence-branch"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {activeLocations.map((location) => (
                    <SelectItem key={`evidence-location-${location.location_id}`} value={String(location.location_id)}>{location.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : <Input id="evidence-branch" inputMode="numeric" value={query.branch_id} onChange={(event) => updateQuery('branch_id', event.target.value)} placeholder="Branch ID" />}
          </div>
          <div className="space-y-2">
            <Label htmlFor="evidence-terminal">Terminal ID</Label>
            <Input id="evidence-terminal" value={query.terminal_id} onChange={(event) => updateQuery('terminal_id', event.target.value.toUpperCase())} placeholder="COUNTER-01" />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={checkEvidence} disabled={evidenceLoading} className="flex-1">
              {evidenceLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Check evidence
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select value={downloadFormat} onValueChange={setDownloadFormat}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="txt">Raw .txt</SelectItem>
              <SelectItem value="hard-copy">Hard-copy .txt</SelectItem>
              <SelectItem value="html">Printable HTML</SelectItem>
              <SelectItem value="manifest">Manifest .json</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={downloadEvidence} disabled={evidenceLoading}>
            <Download className="mr-2 h-4 w-4" /> Download evidence
          </Button>
        </div>
        {evidenceError ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{evidenceError}</p> : null}
        {resultSummary ? (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 md:grid-cols-4">
            <div><span className="block text-xs text-emerald-700">Status</span><strong>Deterministic evidence ready</strong></div>
            <div><span className="block text-xs text-emerald-700">Records</span><strong>{resultSummary.record_count}</strong></div>
            <div><span className="block text-xs text-emerald-700">Source file</span><strong className="break-all">{resultSummary.filename}</strong></div>
            <div><span className="block text-xs text-emerald-700">SHA-256</span><strong className="break-all font-mono text-xs">{resultSummary.content_sha256}</strong></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
