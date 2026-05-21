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
      className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-slate-200 transition-transform duration-300 z-50 ${
        drawerOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-full flex flex-col">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold">Terminal Login Required</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            The terminal stays visible for context, but all actions are locked until login succeeds.
          </p>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="cashier@company.com"
              autoComplete="username"
            />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input
              type="password"
              value={formData.password}
              onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1">
            <Label>{registryEnforced ? 'Terminal ID (Required)' : 'Terminal ID (Optional)'}</Label>
            {registryEnforced ? (
              <>
                <select
                  value={formData.terminalId || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, terminalId: event.target.value }))}
                  required
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select configured terminal</option>
                  {registryOptions.map((entry) => (
                    <option key={entry.terminal_id} value={entry.terminal_id}>
                      {entry.label ? `${entry.label} (${entry.terminal_id})` : entry.terminal_id}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
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
                />
                <datalist id="terminal-id-options">
                  {terminalIdOptions.map((terminalId) => (
                    <option key={terminalId} value={terminalId} />
                  ))}
                </datalist>
                <p className="text-xs text-slate-500">
                  {terminalRegistryMode === 'warn'
                    ? 'Warn mode: terminal ID is optional at unlock. Unregistered IDs are allowed but flagged with policy warnings.'
                    : 'Select the active device/counter identity before opening shifts and checkout.'}
                </p>
              </>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Login and Unlock'}
          </Button>
        </form>
      </div>
    </div>
  );
}
