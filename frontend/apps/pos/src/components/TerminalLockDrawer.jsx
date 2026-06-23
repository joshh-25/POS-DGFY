import React from 'react';
import { Building2, KeyRound, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TerminalLockDrawer({
  drawerOpen,
  formData,
  setFormData,
  dgfyPosState = {},
  terminalIdOptions = [],
  terminalRegistry = [],
  terminalRegistryMode = 'warn',
  registryEnforced = false,
  submitting,
  onSubmit,
  onLegacySubmit
}) {
  const registryOptions = Array.isArray(terminalRegistry)
    ? terminalRegistry.filter((entry) => entry?.is_active !== false)
    : [];
  const dgfyCompanies = Array.isArray(dgfyPosState?.companies) ? dgfyPosState.companies : [];
  const dgfyAuthenticated = Boolean(dgfyPosState?.authenticated);

  return (
    <div
      className={`fixed top-0 right-0 z-50 h-full w-full max-w-md border-l shadow-2xl shadow-slate-950/30 transition-transform duration-300 ${
        drawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{
        borderColor: 'rgba(251, 191, 36, 0.18)',
        background: 'linear-gradient(180deg, #1c1917 0%, #292524 100%)'
      }}
    >
      <div className="h-full flex flex-col">
        <div className="border-b border-white/10 bg-black/10 px-5 py-5">
          <div className="flex items-center gap-2.5 text-white">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-200/20 bg-gradient-to-br from-amber-400 to-orange-600 shadow-lg shadow-orange-950/30">
              <ShieldAlert className="h-4 w-4 text-white" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-100/75">Cashier Access</p>
              <h2 className="text-base font-extrabold tracking-tight">Unlock POS Terminal</h2>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5 p-5">
          <div className="rounded-2xl border border-amber-200/15 bg-white/[0.05] px-3 py-3 text-[12px] leading-5 text-amber-50/80">
            <div className="flex items-center gap-2 font-extrabold text-white">
              <KeyRound className="h-4 w-4 text-amber-200" />
              DGFY POS unlock
            </div>
            <p className="mt-1">
              Company access is checked against accepted DGFY memberships before a POS session starts.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-email" className="text-[13px] font-bold text-white">DGFY Email</Label>
            <Input
              id="dgfy-pos-email"
              type="email"
              value={formData.email}
              onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="cashier@company.com"
              autoComplete="username"
              className="h-11 rounded-xl border-white/10 bg-white/[0.08] text-sm text-white shadow-none placeholder:text-amber-50/45 focus-visible:border-amber-300 focus-visible:ring-amber-300"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-password" className="text-[13px] font-bold text-white">DGFY Password</Label>
            <Input
              id="dgfy-pos-password"
              type="password"
              value={formData.password}
              onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="h-11 rounded-xl border-white/10 bg-white/[0.08] text-sm text-white shadow-none placeholder:text-amber-50/45 focus-visible:border-amber-300 focus-visible:ring-amber-300"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-company" className="text-[13px] font-bold text-white">Company</Label>
            <select
              id="dgfy-pos-company"
              value={formData.dgfyTenantId || ''}
              onChange={(event) => setFormData((prev) => ({ ...prev, dgfyTenantId: event.target.value }))}
              disabled={!dgfyAuthenticated || dgfyPosState?.loadingCompanies}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm text-white shadow-none focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-0 disabled:bg-white/[0.05] disabled:text-amber-50/45"
            >
              <option value="">
                {dgfyAuthenticated ? 'Select accessible company' : 'Sign in to load companies'}
              </option>
              {dgfyCompanies.map((company) => (
                <option key={company.tenant_id} value={company.tenant_id}>
                  {company.company_name}
                </option>
              ))}
            </select>
            <p className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] leading-4 text-amber-50/75">
              {dgfyPosState?.loadingCompanies
                ? 'Loading companies from your DGFY account...'
                : 'Only active companies you own or were invited to appear here.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-terminal-id" className="text-[13px] font-bold text-white">{registryEnforced ? 'Terminal ID (Required)' : 'Terminal ID'}</Label>
            {registryEnforced ? (
              <>
                <select
                  id="dgfy-pos-terminal-id"
                  value={formData.terminalId || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, terminalId: event.target.value }))}
                  required
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm text-white shadow-none focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-0"
                >
                  <option value="">
                    {registryOptions.length > 0 ? 'Select configured terminal' : 'No active terminals configured'}
                  </option>
                  {registryOptions.map((entry) => (
                    <option key={entry.terminal_id} value={entry.terminal_id}>
                      {entry.label ? `${entry.label} (${entry.terminal_id})` : entry.terminal_id}
                    </option>
                  ))}
                </select>
                <p className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] leading-4 text-amber-50/75">
                  Required in enforce mode. Terminal choices are managed by admin in Settings &gt; POS Setup &gt; Terminal Registry.
                </p>
              </>
            ) : (
              <>
                <Input
                  id="dgfy-pos-terminal-id"
                  value={formData.terminalId || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, terminalId: event.target.value }))}
                  placeholder="COUNTER-01"
                  list="terminal-id-options"
                  autoComplete="off"
                  className="h-11 rounded-xl border-white/10 bg-white/[0.08] text-sm font-semibold uppercase tracking-wide text-white shadow-none placeholder:text-amber-50/45 focus-visible:border-amber-300 focus-visible:ring-amber-300"
                />
                <datalist id="terminal-id-options">
                  {terminalIdOptions.map((terminalId) => (
                    <option key={terminalId} value={terminalId} />
                  ))}
                </datalist>
                <p className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] leading-4 text-amber-50/75">
                  {terminalRegistryMode === 'warn'
                    ? 'Use COUNTER-01 if no terminals are configured yet. Terminal ID is required for shifts and checkout; unregistered IDs continue in warn mode with policy warnings.'
                    : 'Select the active device/counter identity before opening shifts and checkout.'}
                </p>
              </>
            )}
          </div>
          <Button
            type="submit"
            className="h-11 w-full rounded-xl border border-amber-200/20 !bg-gradient-to-r !from-amber-500 !to-orange-600 text-sm font-extrabold text-white shadow-lg shadow-orange-950/30 hover:!from-amber-400 hover:!to-orange-500 focus-visible:!ring-amber-300"
            disabled={submitting}
          >
            {submitting ? 'Unlocking...' : (dgfyAuthenticated ? 'Unlock POS' : 'Sign in and Unlock POS')}
          </Button>
        </form>
        {onLegacySubmit && (
          <div className="px-5 pb-5">
            <details className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-3 py-3 text-[12px] text-amber-50">
              <summary className="cursor-pointer font-extrabold">Legacy access until June 17, 2027</summary>
              <p className="mt-2 leading-5">
                Existing accepted IMS/POS users without DGFY accounts can keep using legacy login during the grace period.
                Create or link your DGFY account to keep IMS/POS access after June 17, 2027.
              </p>
              <form onSubmit={onLegacySubmit} className="mt-3 space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-amber-200/20 bg-black/10 px-3 py-2 text-[11px] leading-4 text-amber-50">
                  <Building2 className="h-4 w-4 shrink-0" />
                  Legacy login uses the email, password, and terminal selected above.
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 w-full rounded-xl border-amber-300/30 bg-white/10 text-xs font-extrabold text-white hover:bg-white/15"
                  disabled={submitting}
                >
                  {submitting ? 'Checking legacy access...' : 'Use Legacy Grace Login'}
                </Button>
              </form>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
