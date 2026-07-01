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
      className={`fixed top-0 right-0 h-full w-full max-w-md border-l border-[#CBD5E1] bg-[#F8FAFC] shadow-2xl shadow-slate-950/20 transition-transform duration-300 z-50 ${
        drawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-full overflow-y-auto overscroll-contain">
        <div className="border-b border-[#D8E1EC] bg-white px-5 py-4">
          <div className="flex items-center gap-2.5 text-[#0F172A]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#BFD2EA] bg-[#EAF2FB]">
              <ShieldAlert className="h-4 w-4 text-[#1A4E8D]" />
            </span>
            <h2 className="text-base font-extrabold tracking-tight">Terminal Login Required</h2>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-[#475569]">
            Sign in with DGFY, choose the company and counter, then unlock POS.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5 p-5">
          <div className="rounded-lg border border-[#BFD2EA] bg-white px-3 py-2 text-[12px] leading-5 text-[#334155]">
            <div className="flex items-center gap-2 font-extrabold text-[#0F172A]">
              <KeyRound className="h-4 w-4 text-[#1A4E8D]" />
              DGFY POS unlock
            </div>
            <p className="mt-1">
              Company access is checked against accepted DGFY memberships before a POS session starts.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-email" className="text-[13px] font-bold text-[#0F172A]">DGFY Email</Label>
            <Input
              id="dgfy-pos-email"
              type="email"
              value={formData.email}
              onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="cashier@company.com"
              autoComplete="username"
              className="h-10 rounded-lg border-[#B8C7DA] bg-white text-sm text-[#0F172A] shadow-sm shadow-slate-200/60 placeholder:text-[#64748B] focus-visible:border-[#1A4E8D] focus-visible:ring-[#1A4E8D]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-password" className="text-[13px] font-bold text-[#0F172A]">DGFY Password</Label>
            <Input
              id="dgfy-pos-password"
              type="password"
              value={formData.password}
              onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="h-10 rounded-lg border-[#B8C7DA] bg-white text-sm text-[#0F172A] shadow-sm shadow-slate-200/60 placeholder:text-[#64748B] focus-visible:border-[#1A4E8D] focus-visible:ring-[#1A4E8D]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-company" className="text-[13px] font-bold text-[#0F172A]">Company</Label>
            <select
              id="dgfy-pos-company"
              value={formData.dgfyTenantId || ''}
              onChange={(event) => setFormData((prev) => ({ ...prev, dgfyTenantId: event.target.value }))}
              disabled={!dgfyAuthenticated || dgfyPosState?.loadingCompanies}
              className="h-10 w-full rounded-lg border border-[#B8C7DA] bg-white px-3 py-2 text-sm text-[#0F172A] shadow-sm shadow-slate-200/60 focus:border-[#1A4E8D] focus:outline-none focus:ring-2 focus:ring-[#1A4E8D] focus:ring-offset-2 disabled:bg-[#E2E8F0] disabled:text-[#64748B]"
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
            <p className="rounded-lg border border-[#D8E1EC] bg-white px-3 py-2 text-[11px] leading-4 text-[#475569]">
              {dgfyPosState?.loadingCompanies
                ? 'Loading companies from your DGFY account...'
                : 'Only active companies you own or were invited to appear here.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-terminal-id" className="text-[13px] font-bold text-[#0F172A]">{registryEnforced ? 'Terminal ID (Required)' : 'Terminal ID'}</Label>
            {registryEnforced ? (
              <>
                <select
                  id="dgfy-pos-terminal-id"
                  value={formData.terminalId || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, terminalId: event.target.value }))}
                  required
                  className="h-10 w-full rounded-lg border border-[#B8C7DA] bg-white px-3 py-2 text-sm text-[#0F172A] shadow-sm shadow-slate-200/60 focus:border-[#1A4E8D] focus:outline-none focus:ring-2 focus:ring-[#1A4E8D] focus:ring-offset-2"
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
                <p className="rounded-lg border border-[#D8E1EC] bg-white px-3 py-2 text-[11px] leading-4 text-[#475569]">
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
                  className="h-10 rounded-lg border-[#B8C7DA] bg-white text-sm font-semibold uppercase tracking-wide text-[#1E293B] shadow-sm shadow-slate-200/60 placeholder:text-[#64748B] focus-visible:border-[#1A4E8D] focus-visible:ring-[#1A4E8D]"
                />
                <datalist id="terminal-id-options">
                  {terminalIdOptions.map((terminalId) => (
                    <option key={terminalId} value={terminalId} />
                  ))}
                </datalist>
                <p className="rounded-lg border border-[#D8E1EC] bg-white px-3 py-2 text-[11px] leading-4 text-[#475569]">
                  {terminalRegistryMode === 'warn'
                    ? 'Use COUNTER-01 if no terminals are configured yet. Terminal ID is required for shifts and checkout; unregistered IDs continue in warn mode with policy warnings.'
                    : 'Select the active device/counter identity before opening shifts and checkout.'}
                </p>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dgfy-pos-terminal-password" className="text-[13px] font-bold text-[#0F172A]">Terminal Password</Label>
            <Input
              id="dgfy-pos-terminal-password"
              type="password"
              value={formData.terminalPassword || ''}
              onChange={(event) => setFormData((prev) => ({ ...prev, terminalPassword: event.target.value }))}
              placeholder="Enter the configured terminal password"
              autoComplete="off"
              minLength={8}
              required
              className="h-10 rounded-lg border-[#B8C7DA] bg-white text-sm text-[#0F172A] shadow-sm shadow-slate-200/60 placeholder:text-[#64748B] focus-visible:border-[#1A4E8D] focus-visible:ring-[#1A4E8D]"
            />
            <p className="rounded-lg border border-[#D8E1EC] bg-white px-3 py-2 text-[11px] leading-4 text-[#475569]">
              This password pairs the browser to the selected active terminal. It is separate from the DGFY account password.
            </p>
          </div>
          <Button
            type="submit"
            className="h-10 w-full rounded-lg !bg-[#1A4E8D] text-sm font-extrabold text-white shadow-lg shadow-blue-900/15 hover:!bg-[#143F72] focus-visible:!ring-[#1A4E8D]"
            disabled={submitting}
          >
            {submitting ? 'Unlocking...' : (dgfyAuthenticated ? 'Unlock POS' : 'Sign in and Unlock POS')}
          </Button>
        </form>
        {onLegacySubmit && (
          <div className="px-5 pb-5">
            <details className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
              <summary className="cursor-pointer font-extrabold">Legacy access until June 17, 2027</summary>
              <p className="mt-2 leading-5">
                Existing accepted IMS/POS users without DGFY accounts can keep using legacy login during the grace period.
                Create or link your DGFY account to keep IMS/POS access after June 17, 2027.
              </p>
              <form onSubmit={onLegacySubmit} className="mt-3 space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[11px] leading-4 text-amber-900">
                  <Building2 className="h-4 w-4 shrink-0" />
                  Legacy login uses the email, password, and terminal selected above.
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-9 w-full rounded-lg border-amber-400 bg-white text-xs font-extrabold text-amber-950 hover:bg-amber-100"
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
