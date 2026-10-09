import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Monitor, RefreshCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PosDropdownSelect from './PosDropdownSelect.jsx';
import PosMobileDataCard from './PosMobileDataCard.jsx';
import PosMobileDataDetails from './PosMobileDataDetails.jsx';
import PosShiftRefreshButton from './PosShiftRefreshButton.jsx';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import PosShiftTableScrollHint from './PosShiftTableScrollHint.jsx';
import PosTableActionButton from './PosTableActionButton.jsx';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS,
  POS_SHIFT_SECONDARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';

const normalizeLabel = (label) => String(label || '').replace(/:$/, '').trim();

const getTerminalStatus = (status) => {
  if (status === 'stale') {
    return {
      label: 'Stale',
      className: 'border-amber-200 bg-amber-50 text-amber-800'
    };
  }
  if (status === 'occupied') {
    return {
      label: 'In use',
      className: 'border-blue-200 bg-blue-50 text-[#1A4E8D]'
    };
  }
  return {
    label: 'Available',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800'
  };
};

const formatReason = (reasonCode) => String(reasonCode || '')
  .replace(/^POS_/, '')
  .replace(/_/g, ' ')
  .toLowerCase();

export default function AdminOpenShiftOverview({
  activeShift,
  initialLocationId = null,
  showOpenShiftSummary = true,
  branchLabel,
  summaryRows = [],
  branchDirectoryState = { loading: false, locations: [], errorMessage: '' },
  canViewBranchLocations = false,
  isOnline = true,
  locked = false,
  shiftActionLoading = {},
  refreshLoading = false,
  onViewShiftSummary = () => {},
  onRefreshShiftData = () => {},
  onRefreshBranchTerminals = () => {},
  onViewBranch = async () => false,
  formatDateTime = (value) => value || '—'
}) {
  const locations = useMemo(
    () => (Array.isArray(branchDirectoryState?.locations) ? branchDirectoryState.locations : []),
    [branchDirectoryState?.locations]
  );
  const activeLocationId = Number(activeShift?.location_id || 0);
  const preferredLocationId = Number(initialLocationId || 0);
  const defaultLocationId = activeLocationId || preferredLocationId;
  const [selectedLocationId, setSelectedLocationId] = useState(defaultLocationId);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTerminalKey, setExpandedTerminalKey] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    setSelectedLocationId(defaultLocationId);
    setCurrentPage(1);
    setExpandedTerminalKey('');
  }, [defaultLocationId]);

  useEffect(() => {
    if (locations.length === 0) return;
    const selectedLocationExists = locations.some(
      (location) => Number(location?.location_id || 0) === Number(selectedLocationId || 0)
    );
    if (!selectedLocationExists) {
      setSelectedLocationId(Number(locations[0]?.location_id || 0));
    }
  }, [locations, selectedLocationId]);

  const selectedLocation = locations.find(
    (location) => Number(location?.location_id || 0) === Number(selectedLocationId || 0)
  ) || locations[0] || null;
  const terminals = Array.isArray(selectedLocation?.terminals) ? selectedLocation.terminals : [];
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredTerminals = terminals.filter((terminal) => {
    if (!normalizedQuery) return true;
    const searchableValues = [
      terminal?.label,
      terminal?.terminal_id,
      terminal?.current_operator?.display_name,
      terminal?.shift?.cashier?.display_name
    ];
    return searchableValues.some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery));
  });
  const totalPages = Math.max(1, Math.ceil(filteredTerminals.length / pageSize));
  const visibleTerminals = filteredTerminals.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstVisibleTerminal = filteredTerminals.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const lastVisibleTerminal = Math.min(currentPage * pageSize, filteredTerminals.length);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);
  const getSummaryRow = (label) => summaryRows.find(
    (row) => normalizeLabel(row?.label) === label
  );
  const identityRows = [
    {
      icon: null,
      label: 'Branch',
      value: branchLabel || 'Unassigned',
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    },
    getSummaryRow('Opened By'),
    getSummaryRow('Opened At'),
    getSummaryRow('Business Date')
  ].filter(Boolean);
  const shiftRows = [
    getSummaryRow('Shift ID'),
    getSummaryRow('Opening/Petty Cash'),
    getSummaryRow('Total Sales (excluding opening cash)'),
    getSummaryRow('Expected Cash in Drawer'),
    getSummaryRow('Cash Sales')
  ].filter(Boolean);
  const branchTerminalsRefreshing = Boolean(
    branchDirectoryState?.loading || (!locked && refreshLoading)
  );

  const renderSummaryRows = (rows) => rows.map((row) => {
    const RowIcon = row.icon;
    return (
      <div key={`admin-open-shift-${row.label}`} className="flex min-w-0 items-center gap-3 border-b border-slate-100 py-3 last:border-b-0">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-white text-[#1683F8]">
          {RowIcon ? <RowIcon className="h-4.5 w-4.5" aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-[#1683F8]" aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#5B6B86]">{normalizeLabel(row.label)}</p>
          <p className={`${row.valueClassName || 'text-[13px] font-extrabold text-[#0F172A]'} mt-0.5 break-words leading-6`}>
            {row.value}
          </p>
        </div>
      </div>
    );
  });

  return (
    <div className="space-y-6">
      {showOpenShiftSummary ? (
        <section
          aria-labelledby="pos-admin-current-open-shift-heading"
          data-testid="pos-admin-current-open-shift"
          className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5 sm:p-5"
        >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="pos-admin-current-open-shift-heading" className="text-lg font-black tracking-tight text-[#0B1647] sm:text-xl">
              Current Shift
            </h2>
            <span className="inline-flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[12px] font-extrabold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
              Open
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className={`h-10 rounded-lg px-4 text-[13px] font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
              onClick={onViewShiftSummary}
              disabled={locked || shiftActionLoading.close || shiftActionLoading.summary}
            >
              {shiftActionLoading.summary ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : null}
              {shiftActionLoading.summary ? 'Refreshing...' : 'View Summary'}
            </Button>
            <PosShiftRefreshButton
              label="Refresh shift data"
              onClick={onRefreshShiftData}
              disabled={locked || !isOnline}
              loading={refreshLoading}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-x-6 md:grid-cols-2">
          <div className="min-w-0 md:border-r md:border-slate-200 md:pr-5">
            {renderSummaryRows(identityRows)}
          </div>
          <div className="min-w-0 md:pl-1">
            {renderSummaryRows(shiftRows)}
          </div>
        </div>
        </section>
      ) : null}

      {canViewBranchLocations ? (
        <section
          aria-labelledby="pos-admin-branch-terminals-heading"
          data-testid="pos-admin-branch-terminals"
          className="min-w-0"
          aria-busy={branchDirectoryState?.loading || undefined}
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <h2 id="pos-admin-branch-terminals-heading" className="text-xl font-black tracking-tight text-[#0B1647] sm:text-2xl">
              Terminals
            </h2>

            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center xl:ml-auto">
              {locations.length > 1 ? (
                <label className="flex min-w-0 items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-600">
                  Branch
                  <PosDropdownSelect
                    id="pos-admin-branch-terminals-location"
                    ariaLabel="Branch terminals location"
                    className="w-36 max-w-full shrink-0 sm:w-52"
                    value={selectedLocation?.location_id || ''}
                    onChange={(nextValue) => {
                      setSelectedLocationId(Number(nextValue || 0));
                      setCurrentPage(1);
                      setExpandedTerminalKey('');
                    }}
                    listboxLabel="Branch terminals location options"
                    options={locations.map((location) => ({
                      value: location.location_id,
                      label: location.name
                    }))}
                  />
                </label>
              ) : null}
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
                <label className="relative block min-w-0 flex-1 sm:w-64 sm:flex-none">
                  <span className="sr-only">Search terminal name or ID</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-600" aria-hidden="true" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setCurrentPage(1);
                      setExpandedTerminalKey('');
                    }}
                    placeholder="Search terminal name or ID..."
                    className="h-10 pl-9"
                  />
                </label>
                <PosShiftRefreshButton
                  label="Refresh branch terminals"
                  dataTestId="pos-admin-shift-location-refresh"
                  onClick={onRefreshBranchTerminals}
                  disabled={!isOnline}
                  loading={branchTerminalsRefreshing}
                />
              </div>
            </div>
          </div>

          {!isOnline ? (
            <PosShiftStateNotice
              variant="warning"
              message="Offline — terminal status is from the last available branch snapshot. Refresh and branch viewing are disabled."
              compact
              className="mt-3"
            />
          ) : null}
          {branchDirectoryState?.errorMessage ? (
            <PosShiftStateNotice
              variant="error"
              title={locations.length > 0 ? 'Refresh failed — showing last results' : ''}
              message={branchDirectoryState.errorMessage}
              compact
              className="mt-3"
            />
          ) : null}

          {!selectedLocation && branchDirectoryState?.errorMessage ? null : !selectedLocation && branchDirectoryState?.loading ? (
            <PosShiftStateNotice variant="loading" message="Loading authorized branch terminals..." className="mt-4" />
          ) : !selectedLocation ? (
            <PosShiftStateNotice variant="empty" message="No authorized active branches are available for this account." className="mt-4" />
          ) : branchDirectoryState?.errorMessage && terminals.length === 0 ? null : terminals.length === 0 ? (
            <PosShiftStateNotice variant="empty" message={`No active terminals are registered at ${selectedLocation.name}.`} className="mt-4" />
          ) : filteredTerminals.length === 0 ? (
            <PosShiftStateNotice
              variant="empty"
              message={`No terminals match “${searchQuery.trim()}”. Clear the search to see this branch’s terminals.`}
              className="mt-4"
            />
          ) : (
            <>
              <ul
                className="pos-shift-mobile-view mt-3 grid min-w-0 gap-2 min-[768px]:hidden"
                aria-label={`Branch terminals at ${selectedLocation.name}`}
                data-testid="pos-admin-branch-terminals-mobile-view"
              >
                {visibleTerminals.map((terminal, index) => {
                  const terminalId = String(terminal?.terminal_id || '').trim();
                  const terminalKey = `${selectedLocation.location_id}-${terminalId}`;
                  const status = getTerminalStatus(terminal?.status);
                  const expanded = expandedTerminalKey === terminalKey;
                  const currentOperator = terminal?.current_operator?.display_name
                    || (terminal?.current_operator_status === 'unavailable' ? 'Unavailable' : '—');
                  const shiftOwner = terminal?.shift?.cashier?.display_name || '—';
                  const shiftId = terminal?.shift?.pos_terminal_shift_id
                    ? `#${terminal.shift.pos_terminal_shift_id}`
                    : '—';
                  const reason = formatReason(terminal?.reason_code);
                  const detailsId = `admin-terminal-mobile-details-${index}`;
                  const terminalLabel = terminal?.label || terminalId || 'Unlabeled terminal';

                  return (
                    <li key={`mobile-${terminalKey}`} className="min-w-0">
                      <PosMobileDataCard
                        titleLabel={terminalId || 'Terminal ID unavailable'}
                        title={terminalLabel}
                        fields={[
                          {
                            key: 'status',
                            label: 'Status',
                            value: (
                              <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold ${status.className}`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                                {status.label}
                              </span>
                            ),
                            align: 'right'
                          },
                          { key: 'operator', label: 'Operator', value: currentOperator, align: 'right' }
                        ]}
                        action={(
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Button
                              type="button"
                              className={`h-11 w-11 rounded-lg p-0 ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
                              aria-label={`Open read-only branch monitor for ${selectedLocation.name} from ${terminalLabel}`}
                              title={`Monitor ${terminalLabel}`}
                              onClick={() => void onViewBranch?.({ locationId: Number(selectedLocation.location_id) })}
                              disabled={!selectedLocation.can_view || !isOnline}
                              data-testid={`pos-monitor-branch-terminal-mobile-${terminalKey}`}
                            >
                              <Monitor className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <PosTableActionButton
                              icon={Eye}
                              className="h-11 w-11"
                              onClick={() => setExpandedTerminalKey(expanded ? '' : terminalKey)}
                              aria-expanded={expanded}
                              aria-controls={detailsId}
                              aria-label={`${expanded ? 'Hide' : 'View'} details for ${terminalLabel}`}
                              title={`${expanded ? 'Hide' : 'View'} details for ${terminalLabel}`}
                            />
                          </div>
                        )}
                        expanded={expanded}
                        detailsId={detailsId}
                        detailsLabel={`Additional details for ${terminalLabel}`}
                        details={(
                          <PosMobileDataDetails
                            fields={[
                              { key: 'shift-started', label: 'Shift started', value: terminal?.shift?.opened_at ? formatDateTime(terminal.shift.opened_at) : '—' },
                              { key: 'shift-id', label: 'Shift ID', value: shiftId },
                              { key: 'shift-owner', label: 'Shift owner', value: shiftOwner },
                              { key: 'branch', label: 'Branch', value: selectedLocation.name },
                              { key: 'availability', label: 'Availability', value: reason || 'No additional restriction reported' }
                            ]}
                          />
                        )}
                      />
                    </li>
                  );
                })}
              </ul>

              <div
                className="mt-3 hidden overflow-x-auto rounded-xl border border-blue-100 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] min-[768px]:block"
                role="region"
                aria-label={`Branch terminals at ${selectedLocation.name}`}
                tabIndex={0}
              >
                <PosShiftTableScrollHint />
                <table className="w-full min-w-[850px] border-collapse text-left text-sm" aria-label={`Terminals at ${selectedLocation.name}`}>
                  <thead className="bg-blue-50/70 text-xs font-bold text-[#1A4E8D]">
                    <tr>
                      <th scope="col" className="px-4 py-3">Terminal</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Current Operator</th>
                      <th scope="col" className="px-4 py-3">Shift Started At</th>
                      <th scope="col" className="px-4 py-3">Shift ID</th>
                      <th scope="col" className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTerminals.map((terminal) => {
                      const terminalId = String(terminal?.terminal_id || '').trim();
                      const terminalKey = `${selectedLocation.location_id}-${terminalId}`;
                      const status = getTerminalStatus(terminal?.status);
                      const expanded = expandedTerminalKey === terminalKey;
                      const terminalLabel = terminal?.label || terminalId || 'Unlabeled terminal';
                      const currentOperator = terminal?.current_operator?.display_name
                        || (terminal?.current_operator_status === 'unavailable' ? 'Unavailable' : '—');
                      const shiftOwner = terminal?.shift?.cashier?.display_name || '—';
                      const shiftId = terminal?.shift?.pos_terminal_shift_id
                        ? `#${terminal.shift.pos_terminal_shift_id}`
                        : '—';
                      const reason = formatReason(terminal?.reason_code);

                      return (
                        <React.Fragment key={terminalKey}>
                          <tr className="border-t border-blue-50 text-[#0B1647]">
                            <td className="px-4 py-3.5">
                              <p className="font-extrabold">{terminalLabel}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{terminalId || 'ID unavailable'}</p>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-bold ${status.className}`}>
                                <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
                                {status.label}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">{currentOperator}</td>
                            <td className="px-4 py-3.5">
                              {terminal?.shift?.opened_at ? formatDateTime(terminal.shift.opened_at) : '—'}
                            </td>
                            <td className="px-4 py-3.5 font-semibold">{shiftId}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={`h-10 w-10 rounded-lg p-0 ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                                  aria-label={`${expanded ? 'Hide' : 'View'} details for ${terminalLabel}`}
                                  title={`${expanded ? 'Hide' : 'View'} details for ${terminalLabel}`}
                                  aria-expanded={expanded}
                                  aria-controls={`admin-terminal-details-${terminalKey}`}
                                  onClick={() => setExpandedTerminalKey(expanded ? '' : terminalKey)}
                                >
                                  <Eye className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  className={`h-10 w-10 rounded-lg p-0 ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
                                  aria-label={`Open read-only branch monitor for ${selectedLocation.name} from ${terminalLabel}`}
                                  title={`Monitor ${terminalLabel}`}
                                  onClick={() => void onViewBranch?.({ locationId: Number(selectedLocation.location_id) })}
                                  disabled={!selectedLocation.can_view || !isOnline}
                                  data-testid={`pos-monitor-branch-terminal-${terminalKey}`}
                                >
                                  <Monitor className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr id={`admin-terminal-details-${terminalKey}`} className="border-t border-blue-50 bg-slate-50/70">
                              <td colSpan={6} className="px-4 py-3">
                                <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                                  <div>
                                    <dt className="font-semibold text-slate-500">Shift owner</dt>
                                    <dd className="mt-1 font-bold text-slate-800">{shiftOwner}</dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-slate-500">Current operator</dt>
                                    <dd className="mt-1 font-bold text-slate-800">{currentOperator}</dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-slate-500">Location</dt>
                                    <dd className="mt-1 font-bold text-slate-800">{selectedLocation.name}</dd>
                                  </div>
                                  <div>
                                    <dt className="font-semibold text-slate-500">Availability note</dt>
                                    <dd className="mt-1 font-bold capitalize text-slate-800">{reason || 'No additional restriction reported'}</dd>
                                  </div>
                                </dl>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500" aria-live="polite">
                  Showing {firstVisibleTerminal}–{lastVisibleTerminal} of {filteredTerminals.length} terminals
                </p>
                <nav aria-label="Terminal pages" className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Previous terminal page"
                    className={`h-9 w-9 rounded-lg p-0 ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                    onClick={() => {
                      setCurrentPage((page) => Math.max(1, page - 1));
                      setExpandedTerminalKey('');
                    }}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <span
                    aria-current="page"
                    aria-label={`Page ${currentPage} of ${totalPages}`}
                    className="grid h-9 min-w-9 place-items-center rounded-lg bg-blue-100 px-3 text-sm font-bold text-blue-800"
                  >
                    {currentPage}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Next terminal page"
                    className={`h-9 w-9 rounded-lg p-0 ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                    onClick={() => {
                      setCurrentPage((page) => Math.min(totalPages, page + 1));
                      setExpandedTerminalKey('');
                    }}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </nav>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
