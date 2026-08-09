import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as adminService from '@/services/adminService';
import {
    TEMPLATE_AUTHORABLE_MODES,
    WORKFLOW_MODE_LABELS,
    getWorkflowModeEngine,
    WORKFLOW_MODE_ENGINE_NOTES
} from '@sieitzz/shared-constants/workflowModes';
import {
    CAPABILITY_MODULES,
    CAPABILITY_MODULE_GROUPS,
    CAPABILITY_MODULE_SURFACES,
    resolveModeFamilyModuleGroups
} from '@sieitzz/shared-constants/capabilityModules';

// Only shipped, template-selectable modules are offered as curation choices
// - `locked` modules are compliance-determined (ADR 0056 clause 1) and
// `planned` modules aren't implemented, so validateModuleSelection() would
// reject either one server-side even if we let an admin pick them here.
// Grouped and ordered per CAPABILITY_MODULE_GROUPS (issue #178 final-touch
// pass) so the grid reads as related clusters instead of an alphabetical
// scatter across families.
const SELECTABLE_MODULE_GROUPS = Object.entries(CAPABILITY_MODULE_GROUPS)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([groupKey, group]) => ({
        key: groupKey,
        label: group.label,
        modules: Object.entries(CAPABILITY_MODULES)
            .filter(([, module]) => module.status === 'shipped' && module.enforcement !== 'locked' && module.group === groupKey)
            .map(([key, module]) => ({ key, label: module.label, description: module.description, surface: module.surface }))
            .sort((a, b) => a.label.localeCompare(b.label))
    }))
    .filter((group) => group.modules.length > 0);

const SURFACE_BADGE_LABEL = {
    [CAPABILITY_MODULE_SURFACES.POS]: 'POS',
    [CAPABILITY_MODULE_SURFACES.STOREFRONT]: 'Storefront',
    [CAPABILITY_MODULE_SURFACES.BACK_OFFICE]: 'Back office'
};

const STATUS_BADGE_VARIANT = {
    draft: 'secondary',
    published: 'default',
    deprecated: 'outline'
};

// is_preset/is_canonical are platform-owned provenance flags, set only by
// the seed migration - never authored through this admin form (issue #178
// final-touch hardening). A template created here is always an
// admin-authored, non-preset row.
const EMPTY_DRAFT_FORM = {
    template_key: '',
    label: '',
    base_mode: TEMPLATE_AUTHORABLE_MODES[0],
    module_keys: []
};

// Base-mode dropdown options: only modes with a native or transitional
// engine (TEMPLATE_AUTHORABLE_MODES) - external-engine modes are hidden
// here and rejected server-side (issue #178 final-touch pass).
const BASE_MODE_OPTIONS = TEMPLATE_AUTHORABLE_MODES.map((mode) => ({
    value: mode,
    label: WORKFLOW_MODE_LABELS[mode] || mode,
    engine: getWorkflowModeEngine(mode),
    engineNote: WORKFLOW_MODE_ENGINE_NOTES[mode]
}));

function EngineBadge({ baseMode }) {
    const engine = getWorkflowModeEngine(baseMode);
    if (engine === 'transitional') {
        const note = WORKFLOW_MODE_ENGINE_NOTES[baseMode];
        return (
            <Badge variant="outline" title={note ? `Planned external engine: ${note}` : 'External engine planned'}>
                Native today · external planned
            </Badge>
        );
    }
    if (engine === 'external') {
        return <Badge variant="secondary">External engine</Badge>;
    }
    return null;
}

function ModuleGrid({ idPrefix, baseMode, selectedKeys, onToggle, disabled }) {
    const [showAll, setShowAll] = useState(false);

    const visibleGroupKeys = useMemo(() => {
        const defaultGroups = new Set(resolveModeFamilyModuleGroups(baseMode));
        if (showAll) {
            return new Set(SELECTABLE_MODULE_GROUPS.map((group) => group.key));
        }
        // A group already holding a selected module is force-shown even if
        // the base mode wouldn't otherwise surface it, so switching base
        // mode never silently hides an already-checked box.
        for (const group of SELECTABLE_MODULE_GROUPS) {
            if (group.modules.some((module) => selectedKeys.includes(module.key))) {
                defaultGroups.add(group.key);
            }
        }
        return defaultGroups;
    }, [baseMode, showAll, selectedKeys]);

    const visibleGroups = SELECTABLE_MODULE_GROUPS.filter((group) => visibleGroupKeys.has(group.key));
    const hiddenGroupCount = SELECTABLE_MODULE_GROUPS.length - visibleGroups.length;

    return (
        <fieldset className="space-y-4">
            <div className="flex items-center justify-between">
                <legend className="text-xs font-medium text-slate-600">Modules</legend>
                {hiddenGroupCount > 0 && (
                    <button
                        type="button"
                        className="text-xs font-medium text-[#1A4E8D] underline"
                        onClick={() => setShowAll((current) => !current)}
                    >
                        {showAll ? 'Show only relevant module groups' : `Show all module groups (${hiddenGroupCount} more)`}
                    </button>
                )}
            </div>
            {visibleGroups.map((group) => (
                <div key={group.key} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {group.modules.map((module) => (
                            <label
                                key={module.key}
                                htmlFor={`${idPrefix}-module-${module.key}`}
                                className="flex items-start gap-2 rounded-lg border p-2 text-sm"
                            >
                                <Checkbox
                                    id={`${idPrefix}-module-${module.key}`}
                                    checked={selectedKeys.includes(module.key)}
                                    onCheckedChange={() => onToggle(module.key)}
                                    disabled={disabled}
                                />
                                <span className="space-y-0.5">
                                    <span className="flex items-center gap-1.5">
                                        <span className="font-medium text-slate-800">{module.label}</span>
                                        {module.surface && (
                                            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                                {SURFACE_BADGE_LABEL[module.surface] || module.surface}
                                            </Badge>
                                        )}
                                    </span>
                                    {module.description && (
                                        <span className="block text-xs text-slate-500">{module.description}</span>
                                    )}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            ))}
        </fieldset>
    );
}

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

    const draftBaseModeEngine = getWorkflowModeEngine(draftForm.base_mode);

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
                <form onSubmit={submitDraft} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1">
                            <Label htmlFor="draft-template-key">Template key</Label>
                            <Input
                                id="draft-template-key"
                                required
                                placeholder="fnb_counter_service"
                                value={draftForm.template_key}
                                onChange={(e) => setDraftForm((f) => ({ ...f, template_key: e.target.value }))}
                            />
                            <p className="text-xs text-slate-500">
                                Machine identifier, permanent once published. Lowercase letters, digits,
                                and underscores; starts with a letter.
                            </p>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="draft-template-label">Display label</Label>
                            <Input
                                id="draft-template-label"
                                required
                                placeholder="Counter-Service Eatery"
                                value={draftForm.label}
                                onChange={(e) => setDraftForm((f) => ({ ...f, label: e.target.value }))}
                            />
                            <p className="text-xs text-slate-500">
                                The human name admins and provisioning logs show for this template.
                            </p>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="draft-template-base-mode">Base mode</Label>
                            <Select
                                value={draftForm.base_mode}
                                onValueChange={(value) => setDraftForm((f) => ({ ...f, base_mode: value }))}
                            >
                                <SelectTrigger id="draft-template-base-mode">
                                    <SelectValue placeholder="Base mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    {BASE_MODE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                            {option.engine === 'transitional' ? ' · native today, external planned' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500">
                                The industry type this template builds on. The module list starts from
                                this mode&apos;s default behavior; add or remove modules below.
                            </p>
                            {draftBaseModeEngine === 'transitional' && (
                                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                                    Native today · external engine planned
                                    {WORKFLOW_MODE_ENGINE_NOTES[draftForm.base_mode] ? ` (${WORKFLOW_MODE_ENGINE_NOTES[draftForm.base_mode]})` : ''}.
                                    DGFY currently runs this vertical end-to-end; the product direction is to
                                    move its engine to a sibling app.
                                </p>
                            )}
                        </div>
                    </div>
                    <ModuleGrid
                        idPrefix="draft"
                        baseMode={draftForm.base_mode}
                        selectedKeys={draftForm.module_keys}
                        onToggle={toggleDraftModule}
                    />
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
                            <th className="p-3">Provenance</th>
                            <th className="p-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {templates.map((template) => (
                            <tr className="border-t" key={template.template_id}>
                                <td className="p-3 font-medium">{template.template_key}</td>
                                <td className="p-3">{template.label}</td>
                                <td className="p-3">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span>{WORKFLOW_MODE_LABELS[template.base_mode] || template.base_mode}</span>
                                        <EngineBadge baseMode={template.base_mode} />
                                    </div>
                                </td>
                                <td className="p-3">
                                    <Badge variant={STATUS_BADGE_VARIANT[template.status] || 'secondary'}>
                                        {template.status}
                                    </Badge>
                                </td>
                                <td className="p-3">{template.version}</td>
                                <td className="p-3 space-x-1">
                                    {template.is_canonical && <Badge variant="default">Canonical</Badge>}
                                    {template.is_preset && !template.is_canonical && <Badge variant="secondary">Preset</Badge>}
                                    {!template.is_preset && !template.is_canonical && (
                                        <span className="text-slate-400">—</span>
                                    )}
                                </td>
                                <td className="space-x-2 p-3">
                                    <Button size="sm" variant="outline" disabled={busy} onClick={() => selectTemplate(template)}>
                                        View
                                    </Button>
                                    {template.status === 'draft' && (
                                        <Button size="sm" disabled={busy} onClick={() => publish(template)}>Publish</Button>
                                    )}
                                    {template.status !== 'deprecated' && !template.is_preset && !template.is_canonical && (
                                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => deprecate(template)}>
                                            Deprecate
                                        </Button>
                                    )}
                                    {template.status !== 'deprecated' && (template.is_preset || template.is_canonical) && (
                                        <span className="text-xs text-slate-400" title="Platform preset templates cannot be deprecated">
                                            Platform preset
                                        </span>
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
                    <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{WORKFLOW_MODE_LABELS[selected.base_mode] || selected.base_mode} • v{selected.version} • {selected.status}</span>
                        <EngineBadge baseMode={selected.base_mode} />
                    </p>

                    {selected.status === 'draft' ? (
                        <div className="space-y-3">
                            <ModuleGrid
                                idPrefix="edit"
                                baseMode={selected.base_mode}
                                selectedKeys={editModuleKeys || []}
                                onToggle={toggleEditModule}
                            />
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
