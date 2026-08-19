import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ChevronLeft, ChevronRight, Pencil, Plus, RefreshCcw, Save, ShieldAlert, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { getItems } from '@/services/itemService.js';
import {
  archivePricelist,
  createPricelist,
  getPricelist,
  listPricelists,
  publishPricelist,
  replacePricelistItems
} from '@/services/pricelistService.js';
import { loadPricelistDraft, savePricelistDraft, clearPricelistDraft } from '../services/pricelistDraftStore.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';

// Pricelist bulk item-price editor (#698, extends #696/#584/ADR 0066). A fixed_price voucher's
// per-item pricelist -- N prices for N items -- is authored here.
//
// THE SAME BUG CLASS `VoucherManagementPanel.jsx` GUARDS AGAINST applies here too: every save
// resends the pricelist's own `version` and only the fields this UI actually writes -- never a
// spread of local state that could echo a server-owned field back.
//
// Draft persistence, two DISTINCT layers, per #698's own scope:
//   1. Autosave buffer (this browser, localStorage, `pricelistDraftStore.js`) -- fires on every
//      row edit, debounced. Survives a closed tab or a crash; does NOT survive a different device.
//   2. Draft revision -> publish (server-side, #696). Editing a published pricelist transparently
//      creates/reuses a draft revision on the server (`replacePricelistItemsUseCase`); publishing
//      swaps it into the live row. This UI's "Save" writes to whichever row the server hands back
//      (`editing_pricelist_id`) and "Publish" targets that same id.

const PAGE_SIZE_HINT = 1000; // items list max limit (itemValidator.js) -- covers every real tenant's catalog in one call.
const DESKTOP_TABLE_PAGE_SIZE = 50; // #698: the desktop table paginates client-side over the already-loaded catalog.

const STATUS_BADGE_CLASS = Object.freeze({
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  archived: 'bg-slate-200 text-slate-500 border-slate-300'
});

const REASON_CODE_MESSAGES = Object.freeze({
  PRICELIST_NOT_FOUND: 'This pricelist could not be found.',
  PRICELIST_VERSION_CONFLICT: 'This pricelist was changed elsewhere. Reloading the latest version.',
  PRICELIST_ARCHIVED_IMMUTABLE: 'Archived pricelists cannot be modified.',
  // #717: raised by POST /:id/archive when at least one voucher still attaches this pricelist.
  PRICELIST_IN_USE_BY_VOUCHER: 'This pricelist is attached to one or more vouchers and cannot be archived. Detach it from every voucher first.',
  PRICELIST_ITEM_REF_NOT_FOUND: 'One or more items on this pricelist could not be found.',
  PRICELIST_NOT_PUBLISHABLE: 'This pricelist is already live and is not a pending draft revision.'
});

const getReasonCode = (data) => String(data?.errors?.reason_code || '').trim();
const describeError = (error, fallback) => {
  const data = error?.response?.data;
  const reasonCode = getReasonCode(data);
  return REASON_CODE_MESSAGES[reasonCode] || data?.message || fallback;
};

const pesoNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const centavosToPesoNumber = (centavos) => Math.round((Number(centavos) || 0)) / 100;
const pesosToCentavos = (pesos) => Math.round(pesoNumber(pesos) * 100);
const money = (pesos) => `₱${pesoNumber(pesos).toFixed(2)}`;
const formatSavedAt = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

/**
 * Build the editable row set: one row per catalog item, always -- an untouched row stays at SRP
 * (`is_manual_override: false`) and contributes zero discount at redemption, which is a coherent
 * "here is your price for everything we sell" contract shape (Pat's explicit call, #698).
 */
const buildRows = (items, pricelistItemsByItemId) => items.map((item) => {
  const itemId = Number(item.item_id);
  const existing = pricelistItemsByItemId.get(itemId);
  const srpPesos = pesoNumber(item.default_sale_price);
  return {
    item_id: itemId,
    name: item.name || `Item #${itemId}`,
    category: item.category || '',
    srp_pesos: srpPesos,
    cost_per_unit: item.cost_per_unit != null ? pesoNumber(item.cost_per_unit) : null,
    unit_price_pesos: existing ? centavosToPesoNumber(existing.unit_price_centavos) : srpPesos,
    is_manual_override: existing ? existing.is_manual_override === true : false
  };
});

export default function PricelistManagementPanel({ disabled = false, canManage = false, sectionId }) {
  const [view, setView] = useState('list');

  const [pricelists, setPricelists] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [copyFromId, setCopyFromId] = useState('');
  const [creating, setCreating] = useState(false);

  const [confirmArchiveId, setConfirmArchiveId] = useState(null);
  const [archiving, setArchiving] = useState(false);

  // Editor state.
  const [editingSourceId, setEditingSourceId] = useState(null); // the id the list handed us
  const [pricelist, setPricelist] = useState(null); // last-known server state of the SOURCE row
  const [editingTargetId, setEditingTargetId] = useState(null); // where the server actually wrote last (may be a draft revision)
  const [editorVersion, setEditorVersion] = useState(null);
  const [rows, setRows] = useState([]);
  const [rowsById, setRowsById] = useState(new Map());
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileIndex, setMobileIndex] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const [restoreBanner, setRestoreBanner] = useState(null); // { rows, savedAt } | null
  const [isDraftRevision, setIsDraftRevision] = useState(false);
  const [desktopPage, setDesktopPage] = useState(0);

  const autosaveTimerRef = useRef(null);
  const skipNextAutosaveRef = useRef(false);
  const focusFirstRowOnPageChangeRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => setIsMobileViewport(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const data = await listPricelists({ limit: 100 });
      setPricelists(Array.isArray(data.pricelists) ? data.pricelists : []);
    } catch (error) {
      setListError(describeError(error, 'Failed to load pricelists.'));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'list') loadList();
  }, [view, loadList]);

  const activePricelistsForCopy = useMemo(
    () => pricelists.filter((row) => row.status === 'active'),
    [pricelists]
  );

  const openCreateDialog = () => {
    setCreateName('');
    setCreateDescription('');
    setCopyFromId('');
    setShowCreateDialog(true);
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast?.error?.('Name is required.');
      return;
    }
    setCreating(true);
    try {
      const payload = { name: createName.trim(), description: createDescription.trim() || null };
      if (copyFromId) payload.copy_from_pricelist_id = Number(copyFromId);
      const result = await createPricelist(payload);
      toast?.success?.('Pricelist created.');
      setShowCreateDialog(false);
      await loadList();
      openEditor(result.pricelist);
    } catch (error) {
      toast?.error?.(describeError(error, 'Failed to create pricelist.'));
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (pricelistId) => {
    setArchiving(true);
    try {
      await archivePricelist(pricelistId);
      toast?.success?.('Pricelist archived.');
      setConfirmArchiveId(null);
      await loadList();
    } catch (error) {
      toast?.error?.(describeError(error, 'Failed to archive pricelist.'));
    } finally {
      setArchiving(false);
    }
  };

  const applyServerRows = useCallback((items, catalogItems) => {
    const byItemId = new Map(items.map((item) => [Number(item.item_id), item]));
    const built = buildRows(catalogItems, byItemId);
    setRows(built);
    setRowsById(new Map(built.map((row) => [row.item_id, row])));
  }, []);

  const openEditor = async (summaryRow) => {
    setView('editor');
    setEditingSourceId(summaryRow.pricelist_id);
    setEditingTargetId(summaryRow.pricelist_id);
    setIsDraftRevision(false);
    setEditorError('');
    setEditorLoading(true);
    setSearch('');
    setMobileIndex(0);
    setRestoreBanner(null);
    skipNextAutosaveRef.current = true;
    try {
      const [detail, catalog] = await Promise.all([
        getPricelist(summaryRow.pricelist_id),
        getItems({ limit: PAGE_SIZE_HINT })
      ]);
      setPricelist(detail.pricelist);
      setEditorVersion(Number(detail.pricelist.version));
      const catalogItems = Array.isArray(catalog?.items) ? catalog.items : [];
      applyServerRows(Array.isArray(detail.items) ? detail.items : [], catalogItems);

      // Restore-draft banner: a localStorage autosave newer than the server's own row exists.
      const localDraft = loadPricelistDraft(summaryRow.pricelist_id);
      if (Object.keys(localDraft.rows).length > 0) {
        setRestoreBanner(localDraft);
      }
    } catch (error) {
      setEditorError(describeError(error, 'Failed to load this pricelist.'));
    } finally {
      setEditorLoading(false);
    }
  };

  const backToList = () => {
    setView('list');
    setPricelist(null);
    setRows([]);
    setRowsById(new Map());
    setRestoreBanner(null);
  };

  const updateRow = (itemId, patch) => {
    setRows((current) => current.map((row) => (row.item_id === itemId ? { ...row, ...patch } : row)));
  };

  const handlePriceChange = (itemId, value) => {
    updateRow(itemId, { unit_price_pesos: value === '' ? '' : pesoNumber(value), is_manual_override: true });
  };

  const restoreLocalDraft = () => {
    if (!restoreBanner) return;
    setRows((current) => current.map((row) => {
      const draftRow = restoreBanner.rows[row.item_id];
      return draftRow ? { ...row, unit_price_pesos: draftRow.unit_price_pesos, is_manual_override: draftRow.is_manual_override } : row;
    }));
    setRestoreBanner(null);
    toast?.success?.('Draft restored.');
  };

  const discardLocalDraft = () => {
    clearPricelistDraft(editingSourceId);
    setRestoreBanner(null);
  };

  // Autosave: debounced write to localStorage on every row change. Skipped once right after a
  // fresh load (server state just arrived, nothing to autosave yet) and once right after a
  // successful server save (rows now match what was just persisted, autosaving them again is a
  // needless write, not a correctness issue -- this is purely to reduce localStorage churn).
  useEffect(() => {
    if (view !== 'editor' || !editingSourceId || rows.length === 0) return undefined;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return undefined;
    }
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const rowsForStorage = rows.reduce((accumulator, row) => {
        accumulator[row.item_id] = { unit_price_pesos: pesoNumber(row.unit_price_pesos), is_manual_override: row.is_manual_override };
        return accumulator;
      }, {});
      savePricelistDraft(editingSourceId, rowsForStorage);
    }, 500);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [rows, view, editingSourceId]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(needle) || row.category.toLowerCase().includes(needle));
  }, [rows, search]);

  // #698's own spec asked for a paginated desktop table -- up to ~300 rows on the largest real
  // tenant is unwieldy in one scroll region even with the sticky header. Client-side only: the
  // whole catalog is already loaded in `rows` (one `getItems` call, see PAGE_SIZE_HINT above).
  const desktopTotalPages = Math.max(1, Math.ceil(filteredRows.length / DESKTOP_TABLE_PAGE_SIZE));
  const pagedRows = useMemo(
    () => filteredRows.slice(desktopPage * DESKTOP_TABLE_PAGE_SIZE, (desktopPage + 1) * DESKTOP_TABLE_PAGE_SIZE),
    [filteredRows, desktopPage]
  );
  // A new search (or the catalog itself changing) can leave `desktopPage` pointing past the end.
  useEffect(() => {
    setDesktopPage((page) => Math.min(page, desktopTotalPages - 1));
  }, [desktopTotalPages]);
  // After `setDesktopPage` advances (from the keyboard-nav handler below, page-boundary case),
  // the newly-visible rows render on the next tick -- focus their first price input then, not now.
  useEffect(() => {
    if (!focusFirstRowOnPageChangeRef.current) return;
    focusFirstRowOnPageChangeRef.current = false;
    const firstInput = document.querySelector('[data-price-row]');
    firstInput?.focus?.();
    firstInput?.select?.();
  }, [desktopPage]);

  // #698's own spec: "Tab/Enter advances to the next row" on the desktop table's price input --
  // a spreadsheet-style bulk-entry flow across up to ~300 rows. Enter never submits anything here
  // (no <form>), so without this it's a dead key; Tab's native focus order already lands on the
  // next row's input within one page, but not across a page boundary, which this also handles.
  const handlePriceInputKeyDown = (event, itemId) => {
    if (event.key !== 'Enter' && event.key !== 'Tab') return;
    if (event.key === 'Tab' && event.shiftKey) return; // let native reverse-tab behave normally
    const currentIndex = pagedRows.findIndex((row) => row.item_id === itemId);
    if (currentIndex === -1) return;
    // RF-5 (PR #702 review): preventDefault only when there's actually somewhere to advance to --
    // calling it unconditionally trapped Tab on the last row of the last page, since neither branch
    // below would run and native focus-out was already suppressed.
    if (currentIndex < pagedRows.length - 1) {
      event.preventDefault();
      const nextInput = document.querySelector(`[data-price-row="${pagedRows[currentIndex + 1].item_id}"]`);
      nextInput?.focus?.();
      nextInput?.select?.();
    } else if (desktopPage < desktopTotalPages - 1) {
      event.preventDefault();
      focusFirstRowOnPageChangeRef.current = true;
      setDesktopPage((page) => page + 1);
    }
  };

  // #698: warn when a typed price is at or above SRP -- voucherBenefitPolicy.js clamps at zero, so
  // that row silently produces no discount otherwise.
  const rowNoDiscountWarning = (row) => pesoNumber(row.unit_price_pesos) >= row.srp_pesos;
  // Warn only, never block -- allow_below_cost lives on the VOUCHER, and a pricelist is authored
  // before it is attached to one (#697's guard is what actually enforces it, at redemption).
  const rowBelowCostWarning = (row) => row.cost_per_unit != null && pesoNumber(row.unit_price_pesos) < row.cost_per_unit;

  // SRP-drift: rows never manually touched whose stored price (what the SERVER has, not the local
  // in-progress edit) no longer matches current SRP. Item.default_sale_price auto-updates from
  // Dispatch Order dispatches, so an untouched row can silently start granting an unintended
  // discount once SRP rises past what was true at authoring time.
  const driftedRowCount = useMemo(
    () => rows.filter((row) => !row.is_manual_override && pesoNumber(row.unit_price_pesos) !== row.srp_pesos).length,
    [rows]
  );
  const refreshDriftedRowsToCurrentSrp = () => {
    setRows((current) => current.map((row) => (
      !row.is_manual_override ? { ...row, unit_price_pesos: row.srp_pesos } : row
    )));
    toast?.success?.(`Refreshed ${driftedRowCount} row(s) to current SRP.`);
  };

  const buildSavePayload = () => ({
    version: editorVersion,
    items: rows
      .filter((row) => pesoNumber(row.unit_price_pesos) > 0 || row.is_manual_override)
      .map((row) => ({
        item_id: row.item_id,
        unit_price_centavos: pesosToCentavos(row.unit_price_pesos),
        is_manual_override: row.is_manual_override === true
      }))
  });

  const handleSave = async () => {
    setSaving(true);
    setEditorError('');
    try {
      const result = await replacePricelistItems(editingTargetId, buildSavePayload());
      setEditingTargetId(result.editing_pricelist_id);
      setEditorVersion(Number(result.pricelist.version));
      setIsDraftRevision(result.is_draft === true);
      skipNextAutosaveRef.current = true;
      applyServerRows(result.items, rows.map((row) => ({
        item_id: row.item_id,
        name: row.name,
        category: row.category,
        default_sale_price: row.srp_pesos,
        cost_per_unit: row.cost_per_unit
      })));
      clearPricelistDraft(editingSourceId);
      toast?.success?.(result.is_draft
        ? 'Saved as a draft revision. Publish when ready to go live.'
        : 'Pricelist saved.');
    } catch (error) {
      const reasonCode = getReasonCode(error?.response?.data);
      if (reasonCode === 'PRICELIST_VERSION_CONFLICT') {
        toast?.error?.('This pricelist changed elsewhere. Reloading the latest version.');
        const detail = await getPricelist(editingTargetId).catch(() => null);
        if (detail) {
          setPricelist(detail.pricelist);
          setEditorVersion(Number(detail.pricelist.version));
        }
      } else {
        toast?.error?.(describeError(error, 'Failed to save this pricelist.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const result = await publishPricelist(editingTargetId);
      toast?.success?.('Pricelist published.');
      setEditingSourceId(result.pricelist.pricelist_id);
      setEditingTargetId(result.pricelist.pricelist_id);
      setPricelist(result.pricelist);
      setEditorVersion(Number(result.pricelist.version));
      setIsDraftRevision(false);
      clearPricelistDraft(editingSourceId);
    } catch (error) {
      toast?.error?.(describeError(error, 'Failed to publish this pricelist.'));
    } finally {
      setPublishing(false);
    }
  };

  if (view === 'editor') {
    const currentMobileRow = filteredRows[Math.min(mobileIndex, Math.max(0, filteredRows.length - 1))] || null;

    return (
      <div className="grid gap-3" id={sectionId}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={backToList} className="mb-1 h-7 px-2 text-xs">
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Back to pricelists
            </Button>
            <h3 className="text-sm font-black text-[#0F172A]">{pricelist?.name || 'Pricelist'}</h3>
            {pricelist && (
              <Badge className={`mt-1 border text-[10px] ${STATUS_BADGE_CLASS[pricelist.status] || ''}`}>
                {pricelist.status}{isDraftRevision ? ' · unpublished draft revision' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search items..."
              className="h-8 w-48 text-xs"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setMobileIndex(0); setDesktopPage(0); }}
            />
            <Button type="button" size="sm" variant="outline" disabled={saving || disabled || !canManage} onClick={handleSave} className="h-8 text-xs">
              <Save className="mr-1 h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save'}
            </Button>
            {(isDraftRevision || pricelist?.status === 'draft') && (
              <Button type="button" size="sm" disabled={publishing || disabled || !canManage} onClick={handlePublish} className="h-8 text-xs">
                <Upload className="mr-1 h-3.5 w-3.5" /> {publishing ? 'Publishing...' : 'Publish'}
              </Button>
            )}
          </div>
        </div>

        {editorError && <p className="text-xs font-semibold text-rose-600">{editorError}</p>}

        {restoreBanner && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <span>Unsaved draft from {formatSavedAt(restoreBanner.savedAt)} found in this browser.</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={restoreLocalDraft}>Restore</Button>
              {/* RF-6 (PR #702 review): Discard permanently erases another user's local autosave on
                  a shared POS terminal -- gate it, unlike Restore (which only mutates local React
                  state and is harmless for a viewer to preview). */}
              <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" disabled={disabled || !canManage} onClick={discardLocalDraft}>Discard</Button>
            </div>
          </div>
        )}

        {driftedRowCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
            <span className="inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> {driftedRowCount} row(s) are still priced at an older SRP snapshot.</span>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" disabled={disabled || !canManage} onClick={refreshDriftedRowsToCurrentSrp}>
              <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Refresh to current SRP
            </Button>
          </div>
        )}

        {editorLoading ? (
          <p className="text-xs text-slate-500">Loading catalog...</p>
        ) : isMobileViewport ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            {currentMobileRow ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500">Item {mobileIndex + 1} of {filteredRows.length}</span>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={mobileIndex === 0} onClick={() => setMobileIndex((i) => Math.max(0, i - 1))}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={mobileIndex >= filteredRows.length - 1} onClick={() => setMobileIndex((i) => Math.min(filteredRows.length - 1, i + 1))}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-black text-[#0F172A]">{currentMobileRow.name}</p>
                  <p className="text-[11px] text-slate-500">{currentMobileRow.category}</p>
                  <p className="mt-1 text-[11px] text-slate-500">SRP: {money(currentMobileRow.srp_pesos)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#0F172A]">Voucher price (PHP)</Label>
                  <Input
                    type="number" min="0" step="0.01" className="h-10 text-sm"
                    disabled={disabled || !canManage}
                    value={currentMobileRow.unit_price_pesos}
                    onChange={(e) => handlePriceChange(currentMobileRow.item_id, e.target.value)}
                  />
                  {rowNoDiscountWarning(currentMobileRow) && <p className="text-[11px] font-semibold text-amber-700">At or above SRP -- this row grants no discount.</p>}
                  {rowBelowCostWarning(currentMobileRow) && <p className="text-[11px] font-semibold text-rose-600">Below item cost ({money(currentMobileRow.cost_per_unit)}).</p>}
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs" disabled={mobileIndex >= filteredRows.length - 1} onClick={() => setMobileIndex((i) => Math.min(filteredRows.length - 1, i + 1))}>
                  Next item <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            ) : <p className="text-xs text-slate-500">No items match your search.</p>}
          </div>
        ) : (
          <div className="min-w-0 max-w-full rounded-lg border">
            <div className="overflow-x-auto overflow-y-auto max-h-[32rem]">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="p-3 text-left font-medium text-slate-600">Item</th>
                  <th className="p-3 text-left font-medium text-slate-600">Category</th>
                  <th className="p-3 text-left font-medium text-slate-600">SRP</th>
                  <th className="p-3 text-left font-medium text-slate-600">Voucher price (PHP)</th>
                  <th className="p-3 text-left font-medium text-slate-600">Warnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedRows.map((row) => {
                  const noDiscount = rowNoDiscountWarning(row);
                  const belowCost = rowBelowCostWarning(row);
                  return (
                    <tr key={row.item_id} className={(noDiscount || belowCost) ? 'bg-amber-50/50' : undefined}>
                      <td className="p-3 font-semibold text-slate-800">{row.name}</td>
                      <td className="p-3 text-slate-500">{row.category}</td>
                      <td className="p-3 text-slate-500">{money(row.srp_pesos)}</td>
                      <td className="p-3">
                        <Input
                          type="number" min="0" step="0.01" className="h-8 w-28 text-sm"
                          disabled={disabled || !canManage}
                          data-price-row={row.item_id}
                          value={row.unit_price_pesos}
                          onChange={(e) => handlePriceChange(row.item_id, e.target.value)}
                          onKeyDown={(e) => handlePriceInputKeyDown(e, row.item_id)}
                        />
                      </td>
                      <td className="p-3 text-[11px] font-semibold">
                        {noDiscount && <p className="text-amber-700">No discount at this price.</p>}
                        {belowCost && <p className="text-rose-600">Below cost ({money(row.cost_per_unit)}).</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            {desktopTotalPages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                <span>
                  Page {desktopPage + 1} of {desktopTotalPages} ({filteredRows.length} items)
                </span>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={desktopPage === 0} onClick={() => setDesktopPage((p) => Math.max(0, p - 1))}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={desktopPage >= desktopTotalPages - 1} onClick={() => setDesktopPage((p) => Math.min(desktopTotalPages - 1, p + 1))}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3" id={sectionId}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-[#0F172A]">Pricelists</h3>
        <Button type="button" size="sm" disabled={disabled || !canManage} onClick={openCreateDialog} className="h-8 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" /> New pricelist
        </Button>
      </div>

      {listError && <p className="text-xs font-semibold text-rose-600">{listError}</p>}

      {listLoading ? (
        <p className="text-xs text-slate-500">Loading...</p>
      ) : pricelists.length === 0 ? (
        <p className="text-xs text-slate-500">No pricelists yet. Create one to set per-item prices for a wholesale voucher.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-left font-medium text-slate-600">Name</th>
                <th className="p-3 text-left font-medium text-slate-600">Status</th>
                <th className="p-3 text-left font-medium text-slate-600">Created</th>
                <th className="p-3 text-right font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pricelists.map((row) => (
                <tr key={row.pricelist_id}>
                  <td className="p-3 font-semibold text-slate-800">{row.name}</td>
                  <td className="p-3">
                    <Badge className={`border text-[10px] ${STATUS_BADGE_CLASS[row.status] || ''}`}>{row.status}</Badge>
                  </td>
                  <td className="p-3 text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}</td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openEditor(row)}>
                        <Pencil className="mr-1 h-3 w-3" /> {canManage ? 'Edit items' : 'View items'}
                      </Button>
                      {row.status !== 'archived' && (
                        <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] text-rose-600" disabled={disabled || !canManage} onClick={() => setConfirmArchiveId(row.pricelist_id)}>
                          <Archive className="mr-1 h-3 w-3" /> Archive
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h4 className="mb-3 text-sm font-black text-[#0F172A]">New pricelist</h4>
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#0F172A]">Name</Label>
                <Input className="h-9 text-sm" value={createName} onChange={(e) => setCreateName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-[#0F172A]">Description (optional)</Label>
                <Input className="h-9 text-sm" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
              </div>
              {activePricelistsForCopy.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-[#0F172A]">Copy prices from (optional)</Label>
                  <select className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm" value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}>
                    <option value="">Start blank (SRP for every item)</option>
                    {activePricelistsForCopy.map((row) => (
                      <option key={row.pricelist_id} value={row.pricelist_id}>{row.name}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">One-time copy of prices -- not a live link to the source pricelist.</p>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="button" size="sm" disabled={creating} onClick={handleCreate}>{creating ? 'Creating...' : 'Create'}</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmActionDialog
        open={confirmArchiveId != null}
        onOpenChange={(open) => { if (!open) setConfirmArchiveId(null); }}
        title="Archive this pricelist?"
        description="Archived pricelists can no longer be attached to a voucher or edited. Vouchers already using it keep resolving against its last-published prices."
        confirmLabel={archiving ? 'Archiving...' : 'Archive'}
        variant="destructive"
        onConfirm={() => handleArchive(confirmArchiveId)}
      />
    </div>
  );
}
