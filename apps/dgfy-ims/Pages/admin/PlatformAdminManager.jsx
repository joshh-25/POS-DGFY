import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as adminService from '@/services/adminService';

const PERMISSIONS = ['admin.feedback', 'admin.tenants', 'admin.dgfy_accounts', 'admin.payments', 'admin.pricing', 'admin.hosting', 'admin.invoices'];

export default function PlatformAdminManager() {
  const [users, setUsers] = useState([]); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [permissions, setPermissions] = useState([]); const [editingUserId, setEditingUserId] = useState(null); const [readiness, setReadiness] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [usersResponse, readinessResponse] = await Promise.all([adminService.listPlatformAdmins(), adminService.getPlatformAdminReadiness()]);
      setUsers(usersResponse.data || []); setReadiness(readinessResponse.data || null);
    } catch (err) { setError(err.response?.data?.message || 'Only the Platform Master Admin can manage these accounts.'); }
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([adminService.listPlatformAdmins(), adminService.getPlatformAdminReadiness()])
      .then(([usersResponse, readinessResponse]) => { if (active) { setUsers(usersResponse.data || []); setReadiness(readinessResponse.data || null); } })
      .catch((err) => { if (active) setError(err.response?.data?.message || 'Only the Platform Master Admin can manage these accounts.'); });
    return () => { active = false; };
  }, []);
  const toggle = (permission) => setPermissions((current) => current.includes(permission) ? current.filter((entry) => entry !== permission) : [...current, permission]);
  const action = async (task) => { setBusy(true); setError(''); try { await task(); await load(); } catch (err) { setError(err.response?.data?.message || 'Operation failed.'); } finally { setBusy(false); } };
  const submit = async (event) => { event.preventDefault(); if (!permissions.length) return; if (editingUserId) { await action(() => adminService.updatePlatformAdminPermissions(editingUserId, permissions)); setEditingUserId(null); setPermissions([]); return; } await action(() => adminService.createPlatformAdmin({ username, password, permissions })); setUsername(''); setPassword(''); setPermissions([]); };
  const remove = async (user) => {
    const reason = window.prompt(`Soft-delete ${user.username}? State the audit reason.`);
    if (reason == null) return;
    if (!reason.trim()) { setError('A deletion reason is required.'); return; }
    await action(() => adminService.deletePlatformAdmin(user.id, reason));
  };
  return <section className="mx-auto max-w-6xl space-y-6"><header><p className="text-sm font-medium text-[#1A4E8D]">Privileged access</p><h1 className="text-3xl font-semibold text-slate-900">Platform Admin users</h1><p className="mt-2 text-sm text-slate-600">Page grants provide all ordinary functions classified under that page. Platform Admin Users is master-only and cannot be assigned.</p></header>
    {readiness?.warning && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{readiness.warning} ({readiness.active_default_password_users} active account{readiness.active_default_password_users === 1 ? '' : 's'}.)</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap gap-3">{!editingUserId && <><Input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="off"/><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} placeholder="Optional password (8+ chars)" autoComplete="new-password"/></>}<Button disabled={busy || !permissions.length}>{editingUserId ? 'Save page access' : 'Create delegated admin'}</Button>{editingUserId && <Button type="button" variant="outline" onClick={() => { setEditingUserId(null); setPermissions([]); }}>Cancel</Button>}</div>{!editingUserId && <p className="mt-2 text-xs text-slate-500">Leave password blank to apply the documented temporary default without exposing it in the UI. An explicit password must be at least 8 characters.</p>}<fieldset className="mt-4 grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium">{editingUserId ? 'Edit allowed pages' : 'Allowed pages'}</legend>{PERMISSIONS.map((permission) => <label key={permission} className="flex min-h-11 items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={permissions.includes(permission)} onChange={() => toggle(permission)}/>{permission}</label>)}</fieldset></form>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-3">Username</th><th className="p-3">Access</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{users.map((user) => <tr className="border-t" key={user.id}><td className="p-3 font-medium">{user.username}{user.is_master && <span className="ml-2 text-xs text-[#1A4E8D]">Master</span>}</td><td className="p-3">{user.is_master ? 'All pages' : user.permissions.join(', ') || 'No pages'}</td><td className="p-3">{user.status}{user.temporary_password_active && <span className="ml-2 text-amber-700">• default-password warning</span>}</td><td className="space-x-2 p-3">{!user.is_master && <><Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditingUserId(user.id); setPermissions(user.permissions || []); }}>Edit access</Button>{user.status === 'active' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => action(() => adminService.suspendPlatformAdmin(user.id, 'Suspended by Platform Master Admin'))}>Suspend</Button> : <Button size="sm" variant="outline" disabled={busy} onClick={() => action(() => adminService.reactivatePlatformAdmin(user.id))}>Reactivate</Button>}<Button size="sm" variant="outline" disabled={busy} onClick={() => action(() => adminService.resetPlatformAdminPassword(user.id))}>Reset password</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(user)}>Delete</Button></>}</td></tr>)}{!users.length && <tr><td className="p-6 text-slate-500" colSpan="4">No Platform Admin users found.</td></tr>}</tbody></table></div>
  </section>;
}
