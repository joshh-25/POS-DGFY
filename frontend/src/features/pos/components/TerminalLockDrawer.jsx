import React from 'react';
import { Building2, ShieldCheck } from 'lucide-react';
import { Button } from '../../../../Components/ui/button.jsx';
import { Input } from '../../../../Components/ui/input.jsx';
import { Label } from '../../../../Components/ui/label.jsx';

export default function TerminalLockDrawer({
  drawerOpen,
  formData,
  setFormData,
  dgfyPosState = {},
  terminalRegistry = [],
  submitting,
  onSubmit,
  onIdentityChange,
  onUseDifferentAccount,
  onLegacySubmit
}) {
  const dgfyCompanies = Array.isArray(dgfyPosState?.companies) ? dgfyPosState.companies : [];
  const dgfyAuthenticated = Boolean(dgfyPosState?.authenticated);
  const cashierCompanySelection = Boolean(dgfyPosState?.cashierCompanySelection);
  const companySelectionActive = dgfyAuthenticated || cashierCompanySelection;
  const hasCompanyOptions = dgfyCompanies.length > 0;
  const companySelected = Boolean(String(formData.dgfyTenantId || '').trim());

  return (
    <div
      className={`fixed top-0 right-0 z-50 h-full w-full max-w-md border-l shadow-2xl shadow-slate-950/30 transition-transform duration-300 ${
        drawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{
        borderColor: 'rgba(226, 232, 240, 1)',
        background: '#ffffff'
      }}
    >
      <div className="h-full flex flex-col">
        <div className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start gap-3 text-[#0F172A]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-200 bg-blue-50">
              <ShieldCheck className="h-4 w-4 text-[#1A4E8D]" />
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">Terminal Login Required</h2>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="dgfy-pos-email" className="text-[13px] font-bold text-[#0F172A]">DGFY or Cashier Email</Label>
              {companySelectionActive && onUseDifferentAccount ? (
                <button
                  type="button"
                  className="text-xs font-bold text-[#1A4E8D] hover:underline"
                  onClick={onUseDifferentAccount}
                  disabled={submitting}
                >
                  Use different account
                </button>
              ) : null}
            </div>
            <Input
              id="dgfy-pos-email"
              type="text"
              value={formData.email}
              onChange={(event) => {
                const nextEmail = event.target.value;
                if (onIdentityChange) onIdentityChange(nextEmail);
                else setFormData((prev) => ({ ...prev, email: nextEmail }));
              }}
              placeholder="admin@company.com"
              autoComplete="username"
              className="h-12 rounded-2xl border-blue-200 bg-[#f2f7ff] text-sm text-[#0F172A] shadow-none placeholder:text-[#94A3B8] focus-visible:border-[#93C5FD] focus-visible:ring-[#93C5FD]"
            />
          </div>
          {!companySelectionActive ? (
            <div className="space-y-1.5">
              <Label htmlFor="dgfy-pos-password" className="text-[13px] font-bold text-[#0F172A]">Password</Label>
              <Input
                id="dgfy-pos-password"
                type="password"
                value={formData.password}
                onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="h-12 rounded-2xl border-blue-200 bg-[#f2f7ff] text-sm text-[#0F172A] shadow-none placeholder:text-[#94A3B8] focus-visible:border-[#93C5FD] focus-visible:ring-[#93C5FD]"
              />
            </div>
          ) : null}
          {companySelectionActive ? (
            <div className="space-y-1.5">
              <Label htmlFor="dgfy-pos-company" className="text-[13px] font-bold text-[#0F172A]">Company</Label>
              <select
                id="dgfy-pos-company"
                value={formData.dgfyTenantId || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, dgfyTenantId: event.target.value }))}
                disabled={dgfyPosState?.loadingCompanies}
                className="h-12 w-full rounded-2xl border border-blue-200 bg-[#f2f7ff] px-3 py-2 text-sm text-[#0F172A] shadow-none focus:border-[#93C5FD] focus:outline-none focus:ring-2 focus:ring-[#93C5FD] focus:ring-offset-0 disabled:bg-slate-100 disabled:text-[#94A3B8]"
              >
                <option value="">
                  {dgfyPosState?.loadingCompanies ? 'Loading companies...' : 'Select accessible company'}
                </option>
                {dgfyCompanies.map((company) => (
                  <option
                    key={cashierCompanySelection ? company.company_token : company.tenant_id}
                    value={cashierCompanySelection ? company.company_token : company.tenant_id}
                  >
                    {company.company_name || company.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-5 text-[#64748B]">
                {cashierCompanySelection
                  ? 'Choose the company where this cashier will open a shift.'
                  : 'Choose the company to continue. POS will open onboarding first when setup is incomplete.'}
              </p>
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-[11px] leading-5 text-[#64748B]">
            {companySelectionActive
              ? (cashierCompanySelection
                  ? 'POS will load this company’s registered terminals and cashier shift.'
                  : 'After company selection, POS will continue to onboarding or terminal unlock based on company setup.')
              : 'Owners can sign in with a DGFY account. Assigned cashiers continue directly to their registered terminal and shift.'}
          </div>
          <Button
            type="submit"
            className="h-12 w-full rounded-2xl !bg-[#1A4E8D] text-sm font-extrabold text-white shadow-none hover:!bg-[#143F73] focus-visible:!ring-[#93C5FD]"
            disabled={submitting || (companySelectionActive && hasCompanyOptions && !companySelected)}
          >
            {submitting
              ? 'Continuing...'
              : (companySelectionActive ? 'Continue to POS' : 'Sign in')}
          </Button>
        </form>
        {onLegacySubmit && (
          <div className="px-6 pb-6">
            <details className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-[12px] text-amber-900">
              <summary className="cursor-pointer font-extrabold">Legacy access until June 17, 2027</summary>
              <p className="mt-2 leading-6">
                Existing accepted IMS/POS users without DGFY accounts can keep using legacy login during the grace period.
                Create or link your DGFY account to keep IMS/POS access after June 17, 2027.
              </p>
              <form onSubmit={onLegacySubmit} className="mt-3 space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-[11px] leading-5 text-amber-900">
                  <Building2 className="h-4 w-4 shrink-0" />
                  Legacy login uses the email, password, and terminal selected above.
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-10 w-full rounded-xl border-amber-300 bg-white text-xs font-extrabold text-amber-900 hover:bg-amber-100"
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
