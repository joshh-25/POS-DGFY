import React, { useEffect, useMemo, useState } from 'react';
import { FULFILLMENT_STAFF_ROLE_TEMPLATES } from '@sieitzz/shared-constants/fulfillmentStaffRoleTemplates';
import { businessAdminApi, getBusinessAdminErrorMessage } from './businessAdminService.js';

const emptyDraft = { name: '', capabilities: [] };
const copyDraft = (source) => ({ name: source.name, capabilities: [...source.capabilities] });

export default function StaffRolesPanel({ canManage, onSaved }) {
    const [roles, setRoles] = useState([]);
    const [users, setUsers] = useState([]);
    const [catalog, setCatalog] = useState(null);
    const [draft, setDraft] = useState(emptyDraft);
    const [editingId, setEditingId] = useState(null);
    const [userId, setUserId] = useState('');
    const [roleId, setRoleId] = useState('');
    const [grantRows, setGrantRows] = useState([]);
    const [selectedGrantIds, setSelectedGrantIds] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const refresh = async () => {
        const [roleData, userData, catalogData] = await Promise.all([
            businessAdminApi.staffRoles(), businessAdminApi.users(), businessAdminApi.roleCatalog()
        ]);
        setRoles(roleData.roles || []);
        setUsers(Array.isArray(userData) ? userData : []);
        setCatalog(catalogData);
    };
    useEffect(() => {
        let active = true;
        Promise.all([businessAdminApi.staffRoles(), businessAdminApi.users(), businessAdminApi.roleCatalog()])
            .then(([roleData, userData, catalogData]) => {
                if (!active) return;
                setRoles(roleData.roles || []);
                setUsers(Array.isArray(userData) ? userData : []);
                setCatalog(catalogData);
            })
            .catch((failure) => { if (active) setError(getBusinessAdminErrorMessage(failure)); });
        return () => { active = false; };
    }, []);

    const groups = Array.isArray(catalog?.permission_groups) ? catalog.permission_groups : [];
    const templates = FULFILLMENT_STAFF_ROLE_TEMPLATES.filter((template) => template.modes.includes(catalog?.workflow_mode));
    const selectedUser = useMemo(() => users.find((user) => String(user.user_id) === userId), [users, userId]);

    const chooseUser = async (nextId) => {
        setUserId(nextId);
        setRoleId(String(users.find((user) => String(user.user_id) === nextId)?.staff_role_id || ''));
        setGrantRows([]);
        setSelectedGrantIds([]);
        if (!nextId) return;
        try {
            const grants = await businessAdminApi.userLocationGrants(nextId);
            setGrantRows(grants.locations || []);
            setSelectedGrantIds(grants.granted_location_ids || []);
        } catch (failure) { setError(getBusinessAdminErrorMessage(failure)); }
    };

    const run = async (action, successMessage) => {
        setBusy(true); setError(''); setNotice('');
        try {
            const result = await action();
            await refresh();
            setNotice(typeof successMessage === 'function' ? successMessage(result) : successMessage);
            onSaved?.();
            return result;
        } catch (failure) { setError(getBusinessAdminErrorMessage(failure)); }
        finally { setBusy(false); }
    };
    const saveRole = () => run(async () => {
        if (editingId) await businessAdminApi.updateStaffRole(editingId, draft);
        else await businessAdminApi.createStaffRole(draft);
        setEditingId(null); setDraft(emptyDraft);
    }, editingId ? 'Role updated.' : 'Role created.');
    const saveAssignment = () => {
        if (!selectedUser || selectedUser.role !== 'staff') return;
        if (!window.confirm('Assign this staff role and branch access? This clears all per-user permission overrides for the selected account.')) return;
        return run(async () => {
            // Role first: until branch grants are saved, the narrow role cannot act at new locations.
            await businessAdminApi.assignStaffRole(userId, roleId ? Number(roleId) : null);
            try {
                await businessAdminApi.updateUserLocationGrants(userId, selectedGrantIds);
            } catch (failure) {
                await refresh().catch(() => {});
                throw new Error(`Role assignment was saved, but branch grants were not: ${getBusinessAdminErrorMessage(failure)}. Review and retry.`);
            }
        }, 'Staff role and branch grants saved.');
    };
    const toggleCapability = (slug) => setDraft((current) => ({
        ...current,
        capabilities: current.capabilities.includes(slug)
            ? current.capabilities.filter((value) => value !== slug)
            : [...current.capabilities, slug]
    }));
    const toggleGrant = (id) => setSelectedGrantIds((current) => current.includes(id)
        ? current.filter((value) => value !== id) : [...current, id]);

    return <div className="space-y-5" data-testid="staff-roles-panel">
        <div>
            <h3 className="text-sm font-bold">Custom staff roles</h3>
            <p className="text-xs text-slate-600">Create editable roles from a suggestion or choose capabilities yourself. Access is enforced by the server.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        <ul className="space-y-2">
            {roles.map((role) => <li key={role.staff_role_id} className="flex items-center gap-3 rounded border p-2 text-sm">
                <span className="flex-1">{role.name} · {role.is_active ? 'Active' : 'Inactive'} · {role.capabilities?.length || 0} capabilities</span>
                {canManage && <><button type="button" onClick={() => { setEditingId(role.staff_role_id); setDraft(copyDraft(role)); }}>Edit</button>
                    <button type="button" disabled={busy} onClick={() => run(
                        () => businessAdminApi.setStaffRoleStatus(role.staff_role_id, !role.is_active),
                        (result) => {
                            const count = Number(result?.cancelled_invitation_count) || 0;
                            if (role.is_active && result?.invitation_sync_status === 'retry_required') {
                                return `${result.invitation_sync_message} ${count} pending invitation${count === 1 ? '' : 's'} cancelled.`;
                            }
                            return role.is_active && count > 0
                                ? `Role deactivated. ${count} pending invitation${count === 1 ? '' : 's'} cancelled.`
                                : 'Role status updated.';
                        }
                    )}>{role.is_active ? 'Deactivate' : 'Activate'}</button></>}
            </li>)}
        </ul>
        {canManage && <div className="space-y-3 rounded border p-3">
            <h4 className="text-sm font-semibold">{editingId ? 'Edit role' : 'Create role'}</h4>
            {!editingId && <div className="flex gap-2">{templates.map((template) => <button type="button" key={template.key} className="business-admin-button" onClick={() => setDraft(copyDraft(template))}>Use {template.name} suggestion</button>)}</div>}
            <label className="block text-sm">Role name<input className="mt-1 w-full rounded border p-2" value={draft.name} maxLength={120} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded border p-2">
                {groups.map((group) => <fieldset key={group.key} className="space-y-1"><legend className="text-xs font-bold">{group.label}</legend>
                    {Object.entries(group.permissions || {}).map(([key, slug]) => <label key={key} className="mr-3 inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={draft.capabilities.includes(slug)} onChange={() => toggleCapability(slug)} />{slug}</label>)}
                </fieldset>)}
            </div>
            <div className="flex gap-2"><button type="button" className="business-admin-button primary" disabled={busy || !draft.name.trim() || !catalog} onClick={saveRole}>Save role</button>
                {editingId && <button type="button" className="business-admin-button" onClick={() => { setEditingId(null); setDraft(emptyDraft); }}>Cancel</button>}</div>
        </div>}
        {canManage && <div className="space-y-3 rounded border p-3">
            <h4 className="text-sm font-semibold">Assign a role and branch grants</h4>
            <p className="text-xs text-slate-600">Assigning or clearing a staff role clears per-user permission overrides. Use a Staff base account for Warehouse or Delivery.</p>
            <label className="block text-sm">Staff account<select className="mt-1 w-full rounded border p-2" value={userId} onChange={(event) => chooseUser(event.target.value)}><option value="">Select account</option>{users.filter((user) => user.role === 'staff' && user.is_active).map((user) => <option key={user.user_id} value={user.user_id}>{user.username || user.email}</option>)}</select></label>
            {selectedUser && <><label className="block text-sm">Custom role<select className="mt-1 w-full rounded border p-2" value={roleId} onChange={(event) => setRoleId(event.target.value)}><option value="">Clear role</option>{roles.filter((role) => role.is_active).map((role) => <option key={role.staff_role_id} value={role.staff_role_id}>{role.name}</option>)}</select></label>
                <fieldset><legend className="text-sm">Branch grants</legend>{grantRows.map((row) => <label key={row.location_id} className="mr-3 inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={selectedGrantIds.includes(Number(row.location_id))} onChange={() => toggleGrant(Number(row.location_id))} />{row.name}</label>)}</fieldset>
                <button type="button" className="business-admin-button primary" disabled={busy} onClick={saveAssignment}>Save assignment</button></>}
        </div>}
    </div>;
}
