import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Globe2,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import * as adminService from '@/services/adminService';

const STATUS_STYLES = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  eligibility_grace: 'border-amber-200 bg-amber-50 text-amber-700',
  pending_dns: 'border-sky-200 bg-sky-50 text-sky-700',
  verified: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  provisioning: 'border-violet-200 bg-violet-50 text-violet-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  suspended: 'border-slate-300 bg-slate-100 text-slate-700',
  removing: 'border-orange-200 bg-orange-50 text-orange-700',
  removed: 'border-slate-200 bg-slate-50 text-slate-500'
};

const formatStatus = (value) => String(value || 'unknown').replace(/_/g, ' ');
const isLocalPreviewHostname = (hostname) => (
  String(hostname || '').trim().toLowerCase().endsWith('.localhost')
);
const storefrontUrl = (domain) => (
  isLocalPreviewHostname(domain?.hostname)
    ? `http://${domain.hostname}:5175`
    : `https://${domain.hostname}`
);
const errorMessage = (error) => (
  error?.response?.data?.message
  || error?.message
  || 'The custom-domain operation failed.'
);

const Field = ({ label, children, helper }) => (
  <label className="block space-y-1.5">
    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
    {children}
    {helper ? <span className="block text-xs text-slate-500">{helper}</span> : null}
  </label>
);

const CopyValue = ({ label, value }) => {
  if (!value) return null;
  const copy = async () => {
    await navigator.clipboard.writeText(String(value));
    toast.success(`${label} copied`);
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all text-xs text-slate-800">{value}</code>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy}>
          <Copy className="h-3.5 w-3.5" />
          <span className="sr-only">Copy {label}</span>
        </Button>
      </div>
    </div>
  );
};

export default function StorefrontCustomDomainsModal({ open, tenant, onClose }) {
  const [domains, setDomains] = useState([]);
  const [operations, setOperations] = useState([]);
  const [limits, setLimits] = useState({ canonical: 1, aliases: 5 });
  const [loading, setLoading] = useState(false);
  const [actionKey, setActionKey] = useState('');
  const [error, setError] = useState('');
  const [dnsInstructions, setDnsInstructions] = useState(null);
  const [form, setForm] = useState({
    hostname: '',
    role: 'canonical',
    canonical_domain_id: '',
    reason: ''
  });

  const canonical = useMemo(
    () => domains.find((domain) => domain.role === 'canonical' && domain.status !== 'removed') || null,
    [domains]
  );
  const activeAliasCount = useMemo(
    () => domains.filter((domain) => domain.role === 'alias' && domain.status !== 'removed').length,
    [domains]
  );

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminService.listStorefrontDomains(tenant.id);
      const data = response?.data || {};
      setDomains(Array.isArray(data.domains) ? data.domains : []);
      setOperations(Array.isArray(data.operations) ? data.operations : []);
      setLimits(data.limits || { canonical: 1, aliases: 5 });
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (!open) return;
    setDnsInstructions(null);
    setForm({
      hostname: '',
      role: 'canonical',
      canonical_domain_id: '',
      reason: ''
    });
    load();
  }, [open, load]);

  useEffect(() => {
    if (!canonical) return;
    setForm((current) => ({
      ...current,
      role: current.role === 'canonical' ? 'alias' : current.role,
      canonical_domain_id: current.canonical_domain_id || canonical.id
    }));
  }, [canonical]);

  if (!open || !tenant) return null;

  const runAction = async (key, action, successMessage) => {
    setActionKey(key);
    setError('');
    try {
      await action();
      toast.success(successMessage);
      await load();
    } catch (actionError) {
      const message = errorMessage(actionError);
      setError(message);
      toast.error(message);
    } finally {
      setActionKey('');
    }
  };

  const createDomain = async (event) => {
    event.preventDefault();
    setActionKey('create');
    setError('');
    try {
      const response = await adminService.createStorefrontDomain(tenant.id, {
        hostname: form.hostname,
        role: form.role,
        canonical_domain_id: form.role === 'alias' ? form.canonical_domain_id : null,
        reason: form.reason
      });
      setDnsInstructions(response?.data?.dns || null);
      setForm((current) => ({ ...current, hostname: '', reason: '' }));
      toast.success('Domain registered. Publish the DNS records before verification.');
      await load();
    } catch (createError) {
      const message = errorMessage(createError);
      setError(message);
      toast.error(message);
    } finally {
      setActionKey('');
    }
  };

  const requireReason = () => {
    const reason = window.prompt('Enter the required audit reason:')?.trim();
    return reason || null;
  };

  const perform = (domain, actionName) => {
    const reason = requireReason();
    if (!reason) return;
    const key = `${actionName}:${domain.id}`;
    const actions = {
      verify: () => adminService.verifyStorefrontDomain(tenant.id, domain.id, reason),
      retry: () => adminService.retryStorefrontDomain(tenant.id, domain.id, reason),
      canonical: () => adminService.makeCanonicalStorefrontDomain(tenant.id, domain.id, reason),
      dns: () => adminService.checkStorefrontDomainDns(tenant.id, domain.id, reason),
      suspend: () => adminService.suspendStorefrontDomain(tenant.id, domain.id, reason),
      remove: () => adminService.removeStorefrontDomain(tenant.id, domain.id, reason)
    };
    const messages = {
      verify: 'DNS verified and provisioning queued.',
      retry: 'Provisioning retry queued.',
      canonical: 'Canonical-domain change queued.',
      dns: 'DNS drift check passed.',
      suspend: 'Domain suspended and edge cleanup queued.',
      remove: 'Domain removal queued.'
    };
    runAction(key, actions[actionName], messages[actionName]);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-domains-title"
        className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <div className="mb-1 flex items-center gap-2 text-emerald-700">
              <Globe2 className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-[0.18em]">Verified Storefront Domains</span>
            </div>
            <h2 id="custom-domains-title" className="text-xl font-bold text-slate-950">{tenant.name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect a canonical Storefront hostname and up to {limits.aliases || 5} verified aliases.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <div className="border-b border-slate-200 bg-white p-5 lg:border-b-0 lg:border-r sm:p-6">
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <strong>Keep email DNS records.</strong>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Add only the supplied verification and web-routing records. Do not delete MX, SPF, DKIM, or unrelated TXT records.
                  </p>
                </div>
              </div>
            </div>

            <form className="space-y-4" onSubmit={createDomain}>
              <Field label="Hostname" helper="Enter a hostname only—no https://, path, port, or wildcard.">
                <input
                  aria-label="Hostname"
                  required
                  value={form.hostname}
                  onChange={(event) => setForm((current) => ({ ...current, hostname: event.target.value }))}
                  placeholder={canonical ? 'www.example.com' : 'example.com'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-500 focus:ring-2"
                />
              </Field>

              <Field label="Role">
                <select
                  aria-label="Role"
                  value={form.role}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    role: event.target.value,
                    canonical_domain_id: event.target.value === 'alias' ? canonical?.id || '' : ''
                  }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="canonical" disabled={Boolean(canonical)}>Canonical storefront</option>
                  <option value="alias" disabled={!canonical || activeAliasCount >= (limits.aliases || 5)}>Alias redirect</option>
                </select>
              </Field>

              {form.role === 'alias' ? (
                <Field label="Canonical destination">
                  <select
                    aria-label="Canonical destination"
                    required
                    value={form.canonical_domain_id}
                    onChange={(event) => setForm((current) => ({ ...current, canonical_domain_id: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
                  >
                    {canonical ? <option value={canonical.id}>{canonical.hostname}</option> : null}
                  </select>
                </Field>
              ) : null}

              <Field label="Audit reason">
                <textarea
                  aria-label="Audit reason"
                  required
                  maxLength={500}
                  rows={3}
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="Why this hostname is being connected"
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-500 focus:ring-2"
                />
              </Field>

              <Button
                type="submit"
                disabled={actionKey === 'create' || !form.hostname.trim() || !form.reason.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {actionKey === 'create' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                Register domain
              </Button>
            </form>

            {dnsInstructions ? (
              <div className="mt-6 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                  <ShieldCheck className="h-4 w-4" />
                  DNS instructions — copy now
                </div>
                <p className="text-xs leading-5 text-emerald-800">
                  The full verification value is shown only in this registration response.
                </p>
                <CopyValue label="TXT host" value={dnsInstructions.verification_name} />
                <CopyValue label="TXT value" value={dnsInstructions.verification_value} />
                <CopyValue label="A target" value={dnsInstructions.route_a} />
                <CopyValue label="AAAA target" value={dnsInstructions.route_aaaa} />
                <CopyValue label="CNAME target" value={dnsInstructions.route_cname} />
              </div>
            ) : null}
          </div>

          <div className="min-w-0 p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-950">Domain lifecycle</h3>
                <p className="text-xs text-slate-500">Activation happens only after the trusted controller proves TLS and Storefront health.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {error ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            ) : null}

            {loading && domains.length === 0 ? (
              <div className="flex min-h-56 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading domains
              </div>
            ) : domains.length === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <Globe2 className="mb-3 h-10 w-10 text-slate-300" />
                <div className="font-semibold text-slate-800">No custom domain registered</div>
                <p className="mt-1 max-w-sm text-sm text-slate-500">Register the canonical hostname first. DNS verification does not change public traffic by itself.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {domains.map((domain) => {
                  const busy = actionKey.endsWith(domain.id);
                  const isLocalPreview = isLocalPreviewHostname(domain.hostname);
                  const canVerify = ['pending_dns', 'failed'].includes(domain.status);
                  const canRetry = ['failed', 'suspended', 'verified'].includes(domain.status);
                  const canCheckDns = ['active', 'eligibility_grace'].includes(domain.status);
                  const canSuspend = ['active', 'eligibility_grace', 'provisioning', 'verified', 'failed'].includes(domain.status);
                  const canPromote = domain.role === 'alias' && ['verified', 'provisioning', 'active'].includes(domain.status);
                  const canRemove = !['removed', 'removing'].includes(domain.status);
                  return (
                    <article key={domain.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="break-all font-bold text-slate-950">{domain.hostname}</h4>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[domain.status] || STATUS_STYLES.removed}`}>
                              {formatStatus(domain.status)}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">{domain.role}</span>
                            {isLocalPreview ? (
                              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">Local preview</span>
                            ) : null}
                          </div>
                          <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
                            <span>DNS checked: {domain.last_dns_checked_at ? new Date(domain.last_dns_checked_at).toLocaleString() : 'Not yet'}</span>
                            <span>TLS expires: {isLocalPreview ? 'Not required locally' : domain.tls_expires_at ? new Date(domain.tls_expires_at).toLocaleDateString() : 'Not provisioned'}</span>
                            {domain.eligibility_grace_ends_at ? <span>Grace ends: {new Date(domain.eligibility_grace_ends_at).toLocaleString()}</span> : null}
                            {domain.failure_message ? <span className="text-red-600">{domain.failure_message}</span> : null}
                          </div>
                          {isLocalPreview ? (
                            <p className="mt-2 text-xs leading-5 text-sky-700">
                              This hostname is managed by the local preview setup. Public DNS, TLS, suspension, and removal controls are disabled.
                            </p>
                          ) : null}
                        </div>
                        {domain.status === 'active' && domain.role === 'canonical' ? (
                          <a
                            href={storefrontUrl(domain)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            View Store <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {!isLocalPreview && canVerify ? <Button type="button" size="sm" onClick={() => perform(domain, 'verify')} disabled={busy}>Verify DNS</Button> : null}
                        {!isLocalPreview && canRetry ? <Button type="button" size="sm" variant="outline" onClick={() => perform(domain, 'retry')} disabled={busy}>Retry</Button> : null}
                        {!isLocalPreview && canCheckDns ? <Button type="button" size="sm" variant="outline" onClick={() => perform(domain, 'dns')} disabled={busy}>Check DNS</Button> : null}
                        {!isLocalPreview && canPromote ? <Button type="button" size="sm" variant="outline" onClick={() => perform(domain, 'canonical')} disabled={busy}>Make canonical</Button> : null}
                        {!isLocalPreview && canSuspend ? <Button type="button" size="sm" variant="outline" onClick={() => perform(domain, 'suspend')} disabled={busy}>Suspend</Button> : null}
                        {!isLocalPreview && canRemove ? (
                          <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => perform(domain, 'remove')} disabled={busy}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                          </Button>
                        ) : null}
                        {busy ? <Loader2 className="h-4 w-4 animate-spin self-center text-slate-400" /> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {operations.length > 0 ? (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-bold text-slate-900">Recent controller operations</h3>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {operations.slice(0, 8).map((operation) => (
                    <div key={operation.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 text-xs last:border-0">
                      <span className="font-semibold text-slate-700">{formatStatus(operation.operation_type)}</span>
                      <span className="text-slate-500">Attempt {operation.attempts || 0}/{operation.max_attempts || 5}</span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${operation.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : operation.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {formatStatus(operation.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 py-3 text-xs text-slate-500 sm:px-6">
          <span>{domains.filter((domain) => domain.status !== 'removed').length} connected record(s)</span>
          <span>{activeAliasCount}/{limits.aliases || 5} aliases used</span>
        </footer>
      </section>
    </div>
  );
}
