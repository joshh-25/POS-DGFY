import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as adminService from '@/services/adminService';
import { WORKFLOW_MODE_VALUES, WORKFLOW_MODE_LABELS } from '@sieitzz/shared-constants/workflowModes';
import { CAPABILITY_MODULES } from '@sieitzz/shared-constants/capabilityModules';

// Only shipped, template-selectable modules are offered as curation choices
// - `locked` modules are compliance-determined (ADR 0056 clause 1) and
// `planned` modules aren't implemented, so validateModuleSelection() would
// reject either one server-side even if we let an admin pick them here.
const SELECTABLE_MODULES = Object.entries(CAPABILITY_MODULES)
    .filter(([, module]) => module.status === 'shipped' && module.enforcement !== 'locked')
    .map(([key, module]) => ({ key, label: module.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

const STATUS_BADGE_VARIANT = {
    draft: 'secondary',
    published: 'default',
    deprecated: 'outline'
};

const EMPTY_DRAFT_FORM = {
    template_key: '',
    label: '',
    base_mode: WORKFLOW_MODE_VALUES[0],
    is_preset: false,
    module_keys: []
};

export default function StoreTemplateManager() {
    const [templates, setTemplates] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [draftForm, setDraftForm] = useState(EMPTY_DRAFT_FORM);
    const [selectedId, setSelectedId] = useState(null);
    const [editModuleKeys, setEditModuleKeys] = useState(null);
    const [editReason, setEditReason] = useState('');
    const [auditLogs, setAuditLogs] = useState([]);

    const load = useCallback(async () => {
        try {
            const response = await adminService.listStoreTemplates(
                statusFilter === 'all' ? {} : { status: statusFilter }
            );
            setTemplates(response.data?.templates || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load Store Templates.');
        }
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

    const selected = useMemo(
        () => templates.find((t) => t.template_id === selectedId) || null,
        [templates, selectedId]
    );

    const action = async (task) => {
        setBusy(true);
        setError('');
        try {
            await task();
            await load();
        } catch (err) {
            setError(err.response?.data?.message || 'Operation failed.');
        } finally {
            setBusy(false);
        }
    };

    const toggleDraftModule = (moduleKey) => {
        setDraftForm((current) => ({
            ...current,
            module_keys: current.module_keys.includes(moduleKey)
                ? current.module_keys.filter((key) => key !== moduleKey)
                : [...current.module_keys, moduleKey]
        }));
    };

    const submitDraft = async (event) => {
        event.preventDefault();
        if (!draftForm.template_key.trim() || !draftForm.label.trim() || draftForm.module_keys.length === 0) {
            setError('Template key, label, and at least one module are required.');
            return;
        }
        await action(() => adminService.createStoreTemplateDraft(draftForm));
        setDraftForm(EMPTY_DRAFT_FORM);
    };

    const selectTemplate = async (template) => {
        setSelectedId(template.template_id);
        setEditModuleKeys(template.status === 'draft' ? [...template.modules] : null);
        setEditReason('');
        try {
            const response = await adminService.listStoreTemplateAuditLogs(template.template_id);
            setAuditLogs(response.data?.logs || []);
        } catch {
            setAuditLogs([]);
        }
    };

    const toggleEditModule = (moduleKey) => {
        setEditModuleKeys((current) => (current.includes(moduleKey)
            ? current.filter((key) => key !== moduleKey)
            : [...current, moduleKey]));
    };

    const saveModules = async () => {
        if (!selected || editReason.trim().length < 3) {
            setError('A reason of at least 3 characters is required to save module changes.');
            return;
        }
        await action(() => adminService.updateStoreTemplateModules(selected.template_id, {
            module_keys: editModuleKeys,
            reason: editReason.trim()
        }));
        setEditReason('');
    };

    const publish = async (template) => {
        const reason = window.prompt(`Publish "${template.label}"? State the reason (min 3 characters).`);
        if (reason == null) return;
        if (reason.trim().length < 3) { setError('A publish reason is required.'); return; }
        await action(() => adminService.publishStoreTemplate(template.template_id, reason.trim()));
    };

    const deprecate = async (template) => {
        const reason = window.prompt(`Deprecate "${template.label}"? State the reason (min 3 characters).`);
        if (reason == null) return;
        if (reason.trim().length < 3) { setError('A deprecate reason is required.'); return; }
        await action(() => adminService.deprecateStoreTemplate(template.template_id, reason.trim()));
    };

    return (
        <section className="mx-auto max-w-6xl space-y-6">
            <header>
                <p className="text-sm font-medium text-[#1A4E8D]">Store Templates</p>
                <h1 className="text-3xl font-semibold text-slate-900">Store Template catalog</h1>
                <p className="mt-2 text-sm text-slate-600">
                    Curate the versioned Capability Module bundles new tenants provision
                    with (issue #178 Phase 14). Publishing freezes a template&apos;s
                    module list — every published template&apos;s content is permanent;
                    to change it, deprecate and create a new one. This page is
                    Platform Master Admin only.
                </p>
            </header>

            {error && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </p>
            )}

            <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Create a draft template</h2>
                <form onSubmit={submitDraft} className="space-y-3">
                    <div className="flex flex-wrap gap-3">
                        <Input
                            required
                            placeholder="template_key (e.g. fnb_counter_service)"
                            value={draftForm.template_key}
                            onChange={(e) => setDraftForm((f) => ({ ...f, template_key: e.target.value }))}
                            className="max-w-xs"
                        />
                        <Input
                            required
                            placeholder="Label"
                            value={draftForm.label}
                            onChange={(e) => setDraftForm((f) => ({ ...f, label: e.target.value }))}
                            className="max-w-xs"
                        />
                        <Select
                            value={draftForm.base_mode}
                            onValueChange={(value) => setDraftForm((f) => ({ ...f, base_mode: value }))}
                        >
                            <SelectTrigger className="w-48">
                                <SelectValue placeholder="Base mode" />
                            </SelectTrigger>
                            <SelectContent>
                                {WORKFLOW_MODE_VALUES.map((mode) => (
                                    <SelectItem key={mode} value={mode}>{WORKFLOW_MODE_LABELS[mode] || mode}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={draftForm.is_preset}
                                onCheckedChange={(checked) => setDraftForm((f) => ({ ...f, is_preset: checked }))}
                            />
                            Canonical preset
                        </label>
                    </div>
                    <fieldset className="grid gap-2 sm:grid-cols-3">
                        <legend className="mb-1 text-xs font-medium text-slate-600">Modules</legend>
                        {SELECTABLE_MODULES.map((module) => (
                            <label key={module.key} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                                <Checkbox
                                    checked={draftForm.module_keys.includes(module.key)}
                                    onCheckedChange={() => toggleDraftModule(module.key)}
                                />
                                {module.label}
                            </label>
                        ))}
                    </fieldset>
                    <Button type="submit" disabled={busy}>Create draft</Button>
                </form>
            </div>

            <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">Filter by status:</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="deprecated">Deprecated</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600">
                        <tr>
                            <th className="p-3">Key</th>
                            <th className="p-3">Label</th>
                            <th className="p-3">Base mode</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Version</th>
                            <th className="p-3">Preset</th>
                            <th className="p-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {templates.map((template) => (
                            <tr className="border-t" key={template.template_id}>
                                <td className="p-3 font-medium">{template.template_key}</td>
                                <td className="p-3">{template.label}</td>
                                <td className="p-3">{WORKFLOW_MODE_LABELS[template.base_mode] || template.base_mode}</td>
                                <td className="p-3">
                                    <Badge variant={STATUS_BADGE_VARIANT[template.status] || 'secondary'}>
                                        {template.status}
                                    </Badge>
                                </td>
                                <td className="p-3">{template.version}</td>
                                <td className="p-3">{template.is_preset ? 'Yes' : 'No'}</td>
                                <td className="space-x-2 p-3">
                                    <Button size="sm" variant="outline" disabled={busy} onClick={() => selectTemplate(template)}>
                                        View
                                    </Button>
                                    {template.status === 'draft' && (
                                        <Button size="sm" disabled={busy} onClick={() => publish(template)}>Publish</Button>
                                    )}
                                    {template.status !== 'deprecated' && (
                                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => deprecate(template)}>
                                            Deprecate
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {!templates.length && (
                            <tr><td className="p-6 text-slate-500" colSpan="7">No templates found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {selected && (
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <h2 className="mb-1 text-sm font-semibold text-slate-900">
                        {selected.label} <span className="font-normal text-slate-500">({selected.template_key})</span>
                    </h2>
                    <p className="mb-3 text-xs text-slate-500">
                        {WORKFLOW_MODE_LABELS[selected.base_mode] || selected.base_mode} • v{selected.version} • {selected.status}
                    </p>

                    {selected.status === 'draft' ? (
                        <div className="space-y-3">
                            <fieldset className="grid gap-2 sm:grid-cols-3">
                                <legend className="mb-1 text-xs font-medium text-slate-600">Modules (editable while draft)</legend>
                                {SELECTABLE_MODULES.map((module) => (
                                    <label key={module.key} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                                        <Checkbox
                                            checked={(editModuleKeys || []).includes(module.key)}
                                            onCheckedChange={() => toggleEditModule(module.key)}
                                        />
                                        {module.label}
                                    </label>
                                ))}
                            </fieldset>
                            <Textarea
                                placeholder="Reason for this change (required, min 3 characters)"
                                value={editReason}
                                onChange={(e) => setEditReason(e.target.value)}
                                rows={2}
                            />
                            <Button disabled={busy} onClick={saveModules}>Save modules</Button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {selected.modules.map((moduleKey) => (
                                <Badge key={moduleKey} variant="secondary">
                                    {CAPABILITY_MODULES[moduleKey]?.label || moduleKey}
                                </Badge>
                            ))}
                        </div>
                    )}

                    <h3 className="mb-2 mt-5 text-xs font-semibold uppercase text-slate-500">Audit log</h3>
                    <div className="space-y-2">
                        {auditLogs.map((log) => (
                            <div key={log.audit_log_id} className="rounded-lg border p-2 text-xs text-slate-600">
                                <span className="font-medium text-slate-800">{log.action}</span>
                                {' '}by {log.actor_username} at {new Date(log.created_at).toLocaleString()}
                                {log.reason && <div className="mt-1 text-slate-500">Reason: {log.reason}</div>}
                            </div>
                        ))}
                        {!auditLogs.length && <p className="text-xs text-slate-400">No audit entries yet.</p>}
                    </div>
                </div>
            )}
        </section>
    );
}
