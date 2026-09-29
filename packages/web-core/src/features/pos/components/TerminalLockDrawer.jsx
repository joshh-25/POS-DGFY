import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from '../../../../Components/ui/button.jsx';
import { Input } from '../../../../Components/ui/input.jsx';
import { Label } from '../../../../Components/ui/label.jsx';
import PosTextSizeControl from './PosTextSizeControl.jsx';

export default function TerminalLockDrawer({
  drawerOpen,
  formData,
  setFormData,
  dgfyPosState = {},
  emailCompanyLookup = {},
  terminalRegistry = [],
  submitting,
  onSubmit,
  onDayCloseSubmit,
  onIdentityChange,
  onUseDifferentAccount,
  onLegacySubmit,
  terminalUser = null,
  posTextSize,
  onPosTextSizeChange
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const dgfyCompanies = Array.isArray(dgfyPosState?.companies) ? dgfyPosState.companies : [];
  const dgfyAuthenticated = Boolean(dgfyPosState?.authenticated);
  const cashierCompanySelection = Boolean(dgfyPosState?.cashierCompanySelection);
  const companySelectionActive = dgfyAuthenticated || cashierCompanySelection;
  const hasCompanyOptions = dgfyCompanies.length > 0;
  const companySelected = Boolean(String(formData.dgfyTenantId || '').trim());
  const lookupStatus = String(emailCompanyLookup?.status || 'idle').trim();
  const lookupCompanies = Array.isArray(emailCompanyLookup?.companies) ? emailCompanyLookup.companies : [];
  const lookupMessage = String(emailCompanyLookup?.message || '').trim();
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const companyDropdownRef = useRef(null);
  const companyOptions = [
    {
      value: '',
      label: dgfyPosState?.loadingCompanies ? 'Loading companies...' : 'Select accessible company'
    },
    ...dgfyCompanies.map((company) => ({
      value: String(cashierCompanySelection ? company.company_token : company.tenant_id),
      label: company.company_name || company.name
    }))
  ];
  const selectedCompanyValue = String(formData.dgfyTenantId || '');
  const selectedCompanyOption = companyOptions.find((option) => option.value === selectedCompanyValue) || companyOptions[0];

  useEffect(() => {
    if (!companyDropdownOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!companyDropdownRef.current?.contains(event.target)) setCompanyDropdownOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setCompanyDropdownOpen(false);
        companyDropdownRef.current?.querySelector('button')?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [companyDropdownOpen]);

  const handleCompanySelection = (value) => {
    setFormData((prev) => ({ ...prev, dgfyTenantId: String(value) }));
    setCompanyDropdownOpen(false);
    companyDropdownRef.current?.querySelector('button')?.focus();
  };

  const handleCompanyTriggerKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setCompanyDropdownOpen((open) => !open);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    if (!companyDropdownOpen) {
      setCompanyDropdownOpen(true);
      return;
    }
    const selectedIndex = companyOptions.findIndex((option) => option.value === selectedCompanyValue);
    const startIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (startIndex + direction + companyOptions.length) % companyOptions.length;
    handleCompanySelection(companyOptions[nextIndex].value);
  };

  return (
    <div
      className={`dgfy-pos-terminal-lock-drawer fixed top-0 right-0 z-50 h-full w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-contain border-l shadow-2xl shadow-slate-950/30 touch-pan-y transition-transform duration-300 ${
        drawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{
        borderColor: 'rgba(226, 232, 240, 1)',
        background: '#ffffff'
      }}
    >
      <div className="flex min-h-full flex-col">
        <div className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start gap-3 text-[#0F172A]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-200 bg-blue-50">
              <ShieldCheck className="h-4 w-4 text-[#1A4E8D]" />
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">Terminal Login Required</h2>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-[#0F172A]">Display</p>
              <p className="text-[11px] leading-5 text-[#64748B]">Adjust POS text size for this device.</p>
            </div>
            <PosTextSizeControl
              id="pos-text-size-lock-drawer"
              value={posTextSize}
              onChange={onPosTextSizeChange}
              className="shrink-0"
            />
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
            {lookupStatus !== 'idle' ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-[#475569]">
                {lookupStatus === 'loading' ? (
                  <p>Looking up company access for this email...</p>
                ) : null}
                {lookupStatus === 'single' ? (
                  <p>
                    Company: <span className="font-extrabold text-[#0F172A]">{lookupCompanies[0]?.company_name || lookupCompanies[0]?.name || 'Unknown company'}</span>
                  </p>
                ) : null}
                {lookupStatus === 'multiple' ? (
                  <p>
                    This email is linked to: <span className="font-extrabold text-[#0F172A]">{lookupCompanies.map((company) => company?.company_name || company?.name).filter(Boolean).join(', ')}</span>
                  </p>
                ) : null}
                {lookupStatus === 'none' ? (
                  <p>No company was found for this email yet.</p>
                ) : null}
                {lookupStatus === 'error' ? (
                  <p>{lookupMessage || 'Company lookup is temporarily unavailable.'}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          {!companySelectionActive ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dgfy-pos-password" className="text-[13px] font-bold text-[#0F172A]">Password</Label>
                <div className="relative">
                  <Input
                    id="dgfy-pos-password"
                    type={passwordVisible ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="h-12 rounded-2xl border-blue-200 bg-[#f2f7ff] pr-12 text-base text-[#0F172A] shadow-none placeholder:text-[#94A3B8] focus-visible:border-[#93C5FD] focus-visible:ring-[#93C5FD] md:text-sm"
                  />
                  <button
                    type="button"
                    aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                    aria-pressed={passwordVisible}
                    className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-2xl text-[#64748B] hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#93C5FD]"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                  >
                    {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                <input
                  type="checkbox"
                  checked={formData.rememberDevice === true}
                  onChange={(event) => {
                    const rememberDevice = event.target.checked;
                    setFormData((prev) => ({
                      ...prev,
                      rememberDevice
                    }));
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#1A4E8D]"
                />
                <span className="space-y-0.5">
                  <span className="block text-[12px] font-extrabold text-[#0F172A]">Remember this device for 30 days</span>
                  <span className="block text-[11px] leading-5 text-[#64748B]">
                    Uses a secure session cookie. Your password is not stored by the POS.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
          {companySelectionActive ? (
            <div className="space-y-1.5">
              <Label htmlFor="dgfy-pos-company" className="text-[13px] font-bold text-[#0F172A]">Company</Label>
              <div ref={companyDropdownRef} className="relative">
                <button
                  id="dgfy-pos-company"
                  type="button"
                  aria-label="Company"
                  aria-haspopup="listbox"
                  aria-expanded={companyDropdownOpen}
                  aria-controls="dgfy-pos-company-options"
                  disabled={dgfyPosState?.loadingCompanies}
                  data-company-value={selectedCompanyValue}
                  onClick={() => setCompanyDropdownOpen((open) => !open)}
                  onKeyDown={handleCompanyTriggerKeyDown}
                  className="dgfy-pos-company-select flex h-12 w-full items-center justify-between rounded-2xl border border-blue-200 bg-[#f2f7ff] px-4 py-2 text-left text-sm font-semibold text-[#0F172A] shadow-none transition-[border-color,background-color,box-shadow] hover:border-blue-300 hover:bg-[#f7faff] focus:border-[#93C5FD] focus:outline-none focus:ring-2 focus:ring-[#93C5FD] focus:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-[#94A3B8]"
                >
                  <span className={!selectedCompanyValue ? 'text-slate-500' : 'text-[#0F172A]'}>
                    {selectedCompanyOption.label}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-[#1A4E8D] transition-transform ${companyDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {companyDropdownOpen && (
                  <div
                    id="dgfy-pos-company-options"
                    role="listbox"
                    aria-label="Accessible companies"
                    className="dgfy-pos-company-select-menu absolute inset-x-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5"
                  >
                    {companyOptions.map((option) => {
                      const isSelected = option.value === selectedCompanyValue;
                      return (
                        <button
                          key={option.value || 'empty-company'}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleCompanySelection(option.value)}
                          className={`dgfy-pos-company-select-option flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${isSelected
                            ? 'bg-blue-50 text-[#1A4E8D]'
                            : 'text-[#0F172A] hover:bg-slate-50 hover:text-[#1A4E8D]'}`}
                        >
                          <span className="min-w-0 truncate">{option.label}</span>
                          {isSelected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
          {companySelectionActive && onDayCloseSubmit ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-2xl border-[#1A4E8D] text-sm font-extrabold text-[#1A4E8D] shadow-none hover:bg-blue-50"
              onClick={onDayCloseSubmit}
              disabled={submitting || (hasCompanyOptions && !companySelected)}
            >
              Day Close / Z-reading
            </Button>
          ) : null}
          {companySelectionActive && onDayCloseSubmit ? (
            <p className="text-center text-[11px] leading-5 text-[#64748B]">
              Opens Day Close only. It will not open a cashier shift or unlock selling.
            </p>
          ) : null}
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
