import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function TerminalLockDrawer({
  drawerOpen,
  formData,
  setFormData,
  submitting,
  onSubmit
}) {
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
            <Label>Company Token (Optional)</Label>
            <Input
              value={formData.companyToken}
              onChange={(event) => setFormData((prev) => ({ ...prev, companyToken: event.target.value }))}
              placeholder="Auto-lookup runs when left blank"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Login and Unlock'}
          </Button>
        </form>
      </div>
    </div>
  );
}
