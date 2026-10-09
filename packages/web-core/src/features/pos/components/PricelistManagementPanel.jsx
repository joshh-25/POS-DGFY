import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import PricelistArchiveDialog from '../pricelists/PricelistArchiveDialog.jsx';
import PricelistCreateDialog from '../pricelists/PricelistCreateDialog.jsx';
import PricelistItemsEditor from '../pricelists/PricelistItemsEditor.jsx';
import PricelistListView from '../pricelists/PricelistListView.jsx';
import '../pricelists/pricelist.css';
import {
  DESKTOP_TABLE_PAGE_SIZE,
  describeError,
  buildRows,
  getReasonCode,
  PAGE_SIZE_HINT,
  pesoNumber,
  PRICELIST_PAGE_SIZE,
  pesosToCentavos
} from '../pricelists/pricelistPresentation.js';

// Pricelist bulk item-price editor (#698, extends #696/#584/ADR 0066). A fixed_price voucher's
// per-item pricelist -- N prices for N items -- is authored here.
//
// THE SAME BUG CLASS `VoucherManagementPanel.jsx` GUARDS AGAINST applies here too: every publish
// resends the pricelist's own `version` and only the fields this UI actually writes -- never a
// spread of local state that could echo a server-owned field back.
//
// Draft persistence, two DISTINCT layers, per #698's own scope:
//   1. Autosave buffer (this browser, localStorage, `pricelistDraftStore.js`) -- fires on every
//      row edit, debounced. Survives a closed tab or a crash; does NOT survive a different device.
//   2. Draft revision -> publish (server-side, #696). Editing a published pricelist transparently
//      creates/reuses a draft revision on the server (`replacePricelistItemsUseCase`); publishing
//      swaps it into the live row. This UI's "Publish" writes to whichever row the server hands
//      back (`editing_pricelist_id`) and then targets that same id.

export default function PricelistManagementPanel({ disabled = false, canManage = false, sectionId }) {
  const [view, setView] = useState('list');

  const [pricelists, setPricelists] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PRICELIST_PAGE_SIZE, total: 0, total_pages: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PRICELIST_PAGE_SIZE);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [copyPricelists, setCopyPricelists] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [copyFromId, setCopyFromId] = useState('');
  const [creating, setCreating] = useState(false);

  const [confirmArchiveId, setConfirmArchiveId] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [publishingListId, setPublishingListId] = useState(null);

  // Editor state.
  const [editingSourceId, setEditingSourceId] = useState(null); // the id the list handed us
  const [pricelist, setPricelist] = useState(null); // last-known server state of the SOURCE row
  const [editingTargetId, setEditingTargetId] = useState(null); // where the server actually wrote last (may be a draft revision)
  const [editorVersion, setEditorVersion] = useState(null);
  const [rows, setRows] = useState([]);
  const [rowsById, setRowsById] = useState(new Map());
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileIndex, setMobileIndex] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const [restoreBanner, setRestoreBanner] = useState(null); // { rows, savedAt } | null
  const [desktopPage, setDesktopPage] = useState(0);
  const [desktopPageSize, setDesktopPageSize] = useState(DESKTOP_TABLE_PAGE_SIZE);

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
      const data = await listPricelists({
        page,
        limit: pageSize,
        ...(appliedSearch ? { search: appliedSearch } : {})
      });
      setPricelists(Array.isArray(data.pricelists) ? data.pricelists : []);
      setPagination(data.pagination || { page, limit: pageSize, total: 0, total_pages: 0 });
    } catch (error) {
      setListError(describeError(error, 'Failed to load pricelists.'));
    } finally {
      setListLoading(false);
    }
  }, [appliedSearch, page, pageSize]);

  useEffect(() => {
    if (view === 'list') loadList();
  }, [view, loadList]);

  const handleListSearchSubmit = () => {
    setPage(1);
    setAppliedSearch(searchInput.trim());
  };

  useEffect(() => {
    if (searchInput.trim() === appliedSearch) return undefined;
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setAppliedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [appliedSearch, searchInput]);

  const activePricelistsForCopy = useMemo(
    () => (copyPricelists.length > 0 ? copyPricelists : pricelists.filter((row) => row.status === 'active')),
    [copyPricelists, pricelists]
  );

  const loadActivePricelistsForCopy = useCallback(async () => {
    try {
      const data = await listPricelists({ page: 1, limit: 100, status: 'active' });
      setCopyPricelists(Array.isArray(data.pricelists) ? data.pricelists : []);
    } catch {
      // The paginated list remains the fallback so a copy-source fetch cannot block creation.
    }
  }, []);

  const openCreateDialog = () => {
    setCreateName('');
    setCreateDescription('');
    setCopyFromId('');
    setShowCreateDialog(true);
    void loadActivePricelistsForCopy();
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

  const handleListPublish = async (row) => {
    if (!row || String(row.status || '').toLowerCase() !== 'draft') return;
    setPublishingListId(row.pricelist_id);
    try {
      await publishPricelist(row.pricelist_id);
      toast?.success?.('Pricelist published.');
      await loadList();
    } catch (error) {
      toast?.error?.(describeError(error, 'Failed to publish this pricelist.'));
    } finally {
      setPublishingListId(null);
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
  // successful server persistence (rows now match what was just persisted, autosaving them again is a
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
    return rows.filter((row) => (
      row.name.toLowerCase().includes(needle)
      || row.sku_code.toLowerCase().includes(needle)
      || row.category.toLowerCase().includes(needle)
    ));
  }, [rows, search]);

  // #698's own spec asked for a paginated desktop table -- up to ~300 rows on the largest real
  // tenant is unwieldy in one scroll region even with the sticky header. Client-side only: the
  // whole catalog is already loaded in `rows` (one `getItems` call, see PAGE_SIZE_HINT above).
  const desktopTotalPages = Math.max(1, Math.ceil(filteredRows.length / desktopPageSize));
  const pagedRows = useMemo(
    () => filteredRows.slice(desktopPage * desktopPageSize, (desktopPage + 1) * desktopPageSize),
    [desktopPage, desktopPageSize, filteredRows]
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

  // SRP-drift: rows never manually touched whose stored price (what the SERVER has, not the local
  // in-progress edit) no longer matches current SRP. Item.default_sale_price auto-updates from
  // Dispatch Order dispatches, so an untouched row can silently start granting an unintended
  // discount once SRP rises past what was true at authoring time. Centavos comparison (RF-2, PR
  // #752 review) so this never disagrees with the warnings above on the same row.
  const driftedRowCount = useMemo(
    () => rows.filter((row) => !row.is_manual_override && pesosToCentavos(row.unit_price_pesos) !== pesosToCentavos(row.srp_pesos)).length,
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

  // #748: the single place that actually writes edited rows to the server. Publish must funnel
  // through this -- it used to skip persistence and publish whatever `pricelist_items` rows
  // already existed server-side (zero, for a never-published new
  // pricelist), silently discarding every edited price. Returns the id the server actually wrote
  // to (a save can land on a new draft-revision id, not necessarily `editingTargetId`) plus
  // `isDraft`, since `editingTargetId` state isn't readable synchronously by the caller after this
  // resolves.
  const persistRows = async () => {
    const result = await replacePricelistItems(editingTargetId, buildSavePayload());
    setEditingTargetId(result.editing_pricelist_id);
    setEditorVersion(Number(result.pricelist.version));
    skipNextAutosaveRef.current = true;
    applyServerRows(result.items, rows.map((row) => ({
      item_id: row.item_id,
      name: row.name,
      sku_code: row.sku_code,
      category: row.category,
      default_sale_price: row.srp_pesos,
      cost_per_unit: row.cost_per_unit
    })));
    clearPricelistDraft(editingSourceId);
    return { editingPricelistId: result.editing_pricelist_id, isDraft: result.is_draft === true };
  };

  // Publish funnels through persistRows() first so the modal's single primary action never
  // discards edits made since the last server response. Returns whether the error was actually a
  // version conflict, so the caller can fall back to its generic error toast otherwise.
  const handleVersionConflict = async (error) => {
    const reasonCode = getReasonCode(error?.response?.data);
    if (reasonCode !== 'PRICELIST_VERSION_CONFLICT') return false;
    toast?.error?.('This pricelist changed elsewhere. Reloading the latest version.');
    const detail = await getPricelist(editingTargetId).catch(() => null);
    if (detail) {
      setPricelist(detail.pricelist);
      setEditorVersion(Number(detail.pricelist.version));
    }
    return true;
  };

  const handlePublish = async () => {
    setPublishing(true);
    // RF-5 (PR #752 review): a failure AFTER persistRows() succeeded previously reported the same
    // generic "Failed to publish" message as a failure before it -- the merchant had no way to
    // tell their edits were actually saved, the exact ambiguity #748 exists to remove.
    let persisted = false;
    try {
      const { editingPricelistId } = await persistRows();
      persisted = true;
      const result = await publishPricelist(editingPricelistId);
      toast?.success?.('Pricelist published.');
      setEditingSourceId(result.pricelist.pricelist_id);
      setEditingTargetId(result.pricelist.pricelist_id);
      setPricelist(result.pricelist);
      setEditorVersion(Number(result.pricelist.version));
      clearPricelistDraft(editingSourceId);
      // #748: publish never returned to the list -- the editor just stayed open on the
      // now-published pricelist, unlike handleCreate, which does navigate on success.
      backToList();
    } catch (error) {
      if (!(await handleVersionConflict(error))) {
        toast?.error?.(describeError(error, persisted
          ? 'Your changes were saved, but publishing failed. Try Publish again.'
          : 'Failed to publish this pricelist.'));
      }
    } finally {
      setPublishing(false);
    }
  };

  if (view === 'editor') {
    const publishDisabled = publishing
      || disabled
      || !canManage
      || editorLoading
      || !pricelist
      || pricelist.status === 'archived';

    return (
      <PricelistItemsEditor
        disabled={disabled}
        canManage={canManage}
        pricelist={pricelist}
        editorLoading={editorLoading}
        editorError={editorError}
        restoreBanner={restoreBanner}
        driftedRowCount={driftedRowCount}
        onRestoreLocalDraft={restoreLocalDraft}
        onDiscardLocalDraft={discardLocalDraft}
        onRefreshDriftedRows={refreshDriftedRowsToCurrentSrp}
        isMobileViewport={isMobileViewport}
        filteredRows={filteredRows}
        mobileIndex={mobileIndex}
        onMobileIndexChange={setMobileIndex}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setMobileIndex(0);
          setDesktopPage(0);
        }}
        onClearSearch={() => {
          setSearch('');
          setMobileIndex(0);
          setDesktopPage(0);
        }}
        pagedRows={pagedRows}
        desktopTotalPages={desktopTotalPages}
        desktopPage={desktopPage}
        desktopPageSize={desktopPageSize}
        onDesktopPageChange={setDesktopPage}
        onDesktopPageSizeChange={(nextPageSize) => {
          if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) return;
          setDesktopPageSize(nextPageSize);
          setDesktopPage(0);
        }}
        onPriceChange={handlePriceChange}
        onPriceInputKeyDown={handlePriceInputKeyDown}
        publishing={publishing}
        publishDisabled={publishDisabled}
        onBackToList={backToList}
        onPublish={handlePublish}
      />
    );
  }

  return (
    <>
      <PricelistListView
        disabled={disabled}
        canManage={canManage}
        sectionId={sectionId}
        pricelists={pricelists}
        pagination={pagination}
        page={page}
        pageSize={pageSize}
        searchInput={searchInput}
        appliedSearch={appliedSearch}
        listLoading={listLoading}
        listError={listError}
        publishingListId={publishingListId}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleListSearchSubmit}
        onOpenCreate={openCreateDialog}
        onOpenEditor={openEditor}
        onPublish={handleListPublish}
        onOpenArchive={setConfirmArchiveId}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPage(1);
          setPageSize(nextPageSize);
        }}
      />

      <PricelistCreateDialog
        open={showCreateDialog}
        onOpenChange={(open) => { if (!open) setShowCreateDialog(false); }}
        createName={createName}
        onCreateNameChange={setCreateName}
        createDescription={createDescription}
        onCreateDescriptionChange={setCreateDescription}
        activePricelistsForCopy={activePricelistsForCopy}
        copyFromId={copyFromId}
        onCopyFromChange={setCopyFromId}
        creating={creating}
        onCreate={handleCreate}
      />

      <PricelistArchiveDialog
        open={confirmArchiveId != null}
        onOpenChange={(open) => { if (!open) setConfirmArchiveId(null); }}
        archiving={archiving}
        onConfirm={() => handleArchive(confirmArchiveId)}
      />
    </>
  );
}
