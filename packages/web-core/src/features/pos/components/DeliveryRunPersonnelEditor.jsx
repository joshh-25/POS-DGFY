import React from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Phase 226 (#1273). Whole-roster editor -- the API is a PUT replace (Phase 225's own note: the
// schema's STORED generated column would reject incremental transient states), so this component
// never sends a partial roster. A single radio group makes "exactly one accountable" structural
// rather than merely validated. Registry-pick vs free-text follows DeliveryAssignmentControl.jsx's
// exact datalist + name-match pattern so a registry pick sends delivery_personnel_id and a typed
// name sends delivery_personnel_name -- never both (the server .or().oxor()s on this).

const MAX_ROWS = 20;

const buildRowFromPersonnel = (personnelRow) => ({
  key: `existing-${personnelRow.delivery_run_personnel_id}`,
  name: personnelRow.delivery_personnel_name || '',
  registryId: personnelRow.delivery_personnel_id || null,
  isAccountable: Boolean(personnelRow.is_accountable)
});

const createEmptyRow = () => ({
  key: `new-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
  name: '',
  registryId: null,
  isAccountable: false
});

export default function DeliveryRunPersonnelEditor({
  run = null,
  deliveryPersonnelState = {},
  disabled = false,
  saving = false,
  onSave = async () => false
}) {
  const runId = run?.delivery_run_id || null;
  const initialRows = React.useMemo(() => {
    const personnelRows = Array.isArray(run?.personnel) ? run.personnel : [];
    return personnelRows.length > 0 ? personnelRows.map(buildRowFromPersonnel) : [createEmptyRow()];
  }, [runId, run?.personnel]); // eslint-disable-line react-hooks/exhaustive-deps

  const [rows, setRows] = React.useState(initialRows);

  React.useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const registryPersonnel = Array.isArray(deliveryPersonnelState?.personnel) ? deliveryPersonnelState.personnel : [];
  const registryForbidden = String(deliveryPersonnelState?.accessState || '').trim() === 'forbidden';
  const datalistId = `delivery-run-personnel-options-${runId || 'new'}`;

  const updateRow = (key, patch) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleNameChange = (key, value) => {
    const trimmed = value;
    const matchedEntry = registryPersonnel.find(
      (person) => String(person?.display_name || '').trim().toLowerCase() === trimmed.trim().toLowerCase()
    );
    updateRow(key, { name: trimmed, registryId: matchedEntry ? matchedEntry.delivery_personnel_id : null });
  };

  const handleAccountableChange = (key) => {
    setRows((current) => current.map((row) => ({ ...row, isAccountable: row.key === key })));
  };

  const removeRow = (key) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return;
    setRows((current) => [...current, createEmptyRow()]);
  };

  const nonEmptyRows = rows.filter((row) => row.name.trim().length > 0);
  const accountableCount = nonEmptyRows.filter((row) => row.isAccountable).length;
  const hasDuplicateRegistryId = (() => {
    const seen = new Set();
    for (const row of nonEmptyRows) {
      if (!row.registryId) continue;
      if (seen.has(row.registryId)) return true;
      seen.add(row.registryId);
    }
    return false;
  })();

  const validationError = (() => {
    if (nonEmptyRows.length === 0) return 'Add at least one delivery person.';
    if (nonEmptyRows.length > MAX_ROWS) return `A run supports at most ${MAX_ROWS} personnel.`;
    if (accountableCount !== 1) return 'Exactly one person must be marked accountable.';
    if (hasDuplicateRegistryId) return 'The same registered rider is listed twice.';
    return '';
  })();

  const handleSave = async () => {
    if (validationError) return;
    const personnel = nonEmptyRows.map((row) => (
      row.registryId
        ? { delivery_personnel_id: row.registryId, is_accountable: row.isAccountable }
        : { delivery_personnel_name: row.name.trim(), is_accountable: row.isAccountable }
    ));
    await onSave(personnel);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[#1A4E8D]">Run personnel</p>
        <span className="text-[11px] font-bold text-slate-600">{nonEmptyRows.length} of {MAX_ROWS}</span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <input
              type="text"
              list={registryPersonnel.length > 0 && !registryForbidden ? datalistId : undefined}
              value={row.name}
              maxLength={255}
              autoComplete="off"
              placeholder="Pick a registered rider or type a name"
              onChange={(event) => handleNameChange(row.key, event.target.value)}
              disabled={disabled || saving}
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <input
                type="radio"
                name="run-accountable"
                checked={row.isAccountable}
                onChange={() => handleAccountableChange(row.key)}
                disabled={disabled || saving || row.name.trim().length === 0}
              />
              Accountable
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeRow(row.key)}
              disabled={disabled || saving}
              aria-label="Remove row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {registryPersonnel.length > 0 && !registryForbidden ? (
          <datalist id={datalistId}>
            {registryPersonnel
              .filter((person) => person?.is_active !== false)
              .map((person) => <option key={person.delivery_personnel_id} value={person.display_name} />)}
          </datalist>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled || saving || rows.length >= MAX_ROWS}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add person
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={disabled || saving || Boolean(validationError)} className="!bg-[#2563EB] text-white hover:!bg-[#1D4ED8]">
          <Save className="mr-1 h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save personnel'}
        </Button>
      </div>
      {validationError ? <p className="mt-2 text-[11px] text-amber-700">{validationError}</p> : null}
    </div>
  );
}
