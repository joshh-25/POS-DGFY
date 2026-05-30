import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TerminalLockDrawer({
  drawerOpen,
  formData,
  setFormData,
  terminalIdOptions = [],
  terminalRegistry = [],
  terminalRegistryMode = 'warn',
  registryEnforced = false,
  submitting,
  onSubmit
}) {
  const registryOptions = Array.isArray(terminalRegistry)
    ? terminalRegistry.filter((entry) => entry?.is_active !== false)
    : [];

  return (
    <div
      className={`fixed top-0 right-0 h-full w-full max-w-md border-l border-[#CBD5E1] bg-[#F8FAFC] shadow-2xl shadow-slate-950/20 transition-transform duration-300 z-50 ${
        drawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-full flex flex-col">
        <div className="border-b border-[#D8E1EC] bg-white px-5 py-4">
          <div className="flex items-center gap-2.5 text-[#0F172A]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#BFD2EA] bg-[#EAF2FB]">
              <ShieldAlert className="h-4 w-4 text-[#1A4E8D]" />
            </span>
            <h2 className="text-base font-extrabold tracking-tight">Terminal Login Required</h2>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-[#475569]">
            The terminal stays visible for context, but all actions are locked until login succeeds.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5 p-5">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-bold text-[#0F172A]">Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="cashier@company.com"
              autoComplete="username"
              className="h-10 rounded-lg border-[#B8C7DA] bg-white text-sm text-[#0F172A] shadow-sm shadow-slate-200/60 placeholder:text-[#64748B] focus-visible:border-[#1A4E8D] focus-visible:ring-[#1A4E8D]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-bold text-[#0F172A]">Password</Label>
            <Input
              type="password"
              value={formData.password}
              onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="h-10 rounded-lg border-[#B8C7DA] bg-white text-sm text-[#0F172A] shadow-sm shadow-slate-200/60 placeholder:text-[#64748B] focus-visible:border-[#1A4E8D] focus-visible:ring-[#1A4E8D]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-bold text-[#0F172A]">{registryEnforced ? 'Terminal ID (Required)' : 'Terminal ID (Optional)'}</Label>
            {registryEnforced ? (
              <>
                <select
                  value={formData.terminalId || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, terminalId: event.target.value }))}
                  required
                  className="h-10 w-full rounded-lg border border-[#B8C7DA] bg-white px-3 py-2 text-sm text-[#0F172A] shadow-sm shadow-slate-200/60 focus:border-[#1A4E8D] focus:outline-none focus:ring-2 focus:ring-[#1A4E8D] focus:ring-offset-2"
                >
                  <option value="">Select configured terminal</option>
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
                    ? 'Warn mode: terminal ID is optional at unlock. Unregistered IDs are allowed but flagged with policy warnings.'
                    : 'Select the active device/counter identity before opening shifts and checkout.'}
                </p>
              </>
            )}
          </div>
          <Button
            type="submit"
            className="h-10 w-full rounded-lg !bg-[#1A4E8D] text-sm font-extrabold text-white shadow-lg shadow-blue-900/15 hover:!bg-[#143F72] focus-visible:!ring-[#1A4E8D]"
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Login and Unlock'}
          </Button>
        </form>
      </div>
    </div>
  );
}
