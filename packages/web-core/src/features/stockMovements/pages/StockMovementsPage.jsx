import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  Search,
  Filter,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  TrendingUp,
  TrendingDown,
  Activity,
  X,
  MoreHorizontal,
  Ban,
  AlertTriangle
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils.js";
import {
  useFeatureStockMovements,
  useFeatureCreateStockMovement,
  useFeatureMovementStats,
  useFeatureStockMovementItems,
  voidFeatureMovement,
  exportFeatureStockMovements,
} from '@/src/features/stockMovements';
import { usePermission } from '@/hooks/usePermission';
import MovementCreateModal from '@/components/movements/MovementCreateModal';
import MovementDetailsModal from '@/components/movements/MovementDetailsModal';
import { getMovementConfig, isPositiveMovement, getMovementTypes } from '@/components/utils/movementConfig.js';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/numberUtils.js';
import { normalizeApiError } from '@/src/utils/errorHandler.js';

// Stats Card Component
function StatsCard({ title, value, subtitle, icon: Icon, color = "teal", trend }) {
  const colorClasses = {
    teal: "bg-teal-50 text-teal-600 border-teal-200",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    red: "bg-red-50 text-red-600 border-red-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200"
  };

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-950 tabular-nums">{value}</p>
          {subtitle && <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={cn("shrink-0 rounded-xl border p-2.5", colorClasses[color])}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          {trend > 0 ? (
            <TrendingUp className="h-3 w-3 text-emerald-500" aria-hidden="true" />
          ) : trend < 0 ? (
            <TrendingDown className="h-3 w-3 text-red-500" aria-hidden="true" />
          ) : null}
          <span className={trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-500" : "text-slate-400"}>
            {trend > 0 ? '+' : ''}{trend}% this week
          </span>
        </div>
      )}
    </div>
  );
}

// Quick Filter Chip Component
function FilterChip({ label, active, onClick, icon: Icon, color }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${active ? 'Remove' : 'Apply'} ${label} filter`}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2",
        active
          ? `${color} shadow-sm`
          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
      {active && (
        <X className="ml-1 h-3 w-3 opacity-60" aria-hidden="true" />
      )}
    </button>
  );
}

export default function StockMovements() {
  // Pagination state
  const [page, setPage] = useState(1);
  const limit = 20;

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilters, setTypeFilters] = useState([]); // Array for multi-select
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [preselectedItem, setPreselectedItem] = useState(null);

  // Void Dialog State
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [movementToVoid, setMovementToVoid] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Build query params - we'll filter client-side for multi-type since backend expects single type
  const queryParams = useMemo(() => {
    const params = { page, limit };
    // For single type, send to backend; for multi-type, we'll filter client-side
    if (typeFilters.length === 1) params.movement_type = typeFilters[0];
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return params;
  }, [page, limit, typeFilters, startDate, endDate]);

  // Fetch data
  const { stockMovements, loading, error, pagination, refetch } = useFeatureStockMovements(queryParams);
  const { items, loading: itemsLoading } = useFeatureStockMovementItems({ limit: 1000 });
  const { createStockMovement } = useFeatureCreateStockMovement();
  const { stats, loading: statsLoading } = useFeatureMovementStats({ startDate, endDate });
  const { canCreate, canDelete } = usePermission();

  // Check URL params for item pre-selection
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('item');
    const action = params.get('action');

    if (itemId && items) {
      const item = items.find(i => (i.item_id || i.id) == itemId);
      if (item) {
        setSearchQuery(item.name);
        if (action === 'create') {
          setPreselectedItem(item);
          setShowCreateModal(true);
        }
      }
    }
  }, [items]);

  // Client-side filtering (search + multi-type filter)
  const filteredMovements = useMemo(() => {
    if (!stockMovements) return [];

    return stockMovements.filter(mov => {
      // Type filter (if multiple types selected, filter client-side)
      if (typeFilters.length > 1) {
        if (!typeFilters.includes(mov.movement_type)) return false;
      }

      // Search filter
      if (searchQuery) {
        const itemName = mov.item?.name || mov.item_name || '';
        const notes = mov.notes || '';
        const reference = mov.reference_id || '';
        const searchLower = searchQuery.toLowerCase();

        if (!itemName.toLowerCase().includes(searchLower) &&
          !notes.toLowerCase().includes(searchLower) &&
          !reference.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      return true;
    });
  }, [stockMovements, searchQuery, typeFilters]);

  const handleCreateMovement = async (movementData) => {
    try {
      await createStockMovement(movementData);
      toast.success('Stock movement recorded successfully');
      refetch();
      setShowCreateModal(false);
      setPreselectedItem(null);
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(error.message || 'Failed to create stock movement');
      }
    }
  };

  const handleViewMovement = (movement) => {
    setSelectedMovement(movement);
    setShowDetailsModal(true);
  };

  const handleVoidClick = (movement) => {
    setShowDetailsModal(false);
    setSelectedMovement(null);
    setMovementToVoid(movement);
    setVoidReason('');
    setShowVoidDialog(true);
  };

  const confirmVoid = async () => {
    if (!movementToVoid || !voidReason.trim()) return;

    setIsVoiding(true);
    try {
      await voidFeatureMovement(movementToVoid.movement_id || movementToVoid.id, voidReason);
      toast.success('Movement voided successfully');
      setShowVoidDialog(false);
      setMovementToVoid(null);
      setVoidReason('');
      setShowDetailsModal(false); // Close details if open
      refetch(); // Refresh list
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(error.message || 'Failed to void movement');
      }
    } finally {
      setIsVoiding(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= (pagination?.pages || 1)) {
      setPage(newPage);
    }
  };

  const clearFilters = () => {
    setTypeFilters([]);
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  // Toggle a type filter (add if not present, remove if present)
  const toggleTypeFilter = (type) => {
    setTypeFilters(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
    setPage(1);
  };

  const handleExport = async () => {
    try {
      const filters = {
        startDate,
        endDate,
        ...(typeFilters.length === 1 && { movement_type: typeFilters[0] })
      };

      const blob = await exportFeatureStockMovements(filters);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `stock_movements_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Export downloaded successfully');
    } catch (error) {
      console.error('Export failed:', error);
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error('Failed to export stock movements');
      }
    }
  };

  const hasActiveFilters = typeFilters.length > 0 || searchQuery || startDate || endDate;
  const activeFilterCount = typeFilters.length + [searchQuery, startDate, endDate].filter(Boolean).length;

  if (loading || itemsLoading) {
    return (
      <div
        className="flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 shadow-sm"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-7 w-7 animate-spin text-teal-600" aria-hidden="true" />
        <span className="sr-only">Loading stock movements</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-5 shadow-sm" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="font-semibold text-red-900">Error loading stock movements</p>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const movementTypes = getMovementTypes();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Inventory operations</p>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Stock Movements</h1>
          <p className="mt-1 text-sm text-slate-500">
            {pagination ? `${pagination.total} total movements` : `${filteredMovements.length} movements`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleExport} className="h-10">
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export
          </Button>
          {canCreate('stock_movements') && (
            <Button type="button" onClick={() => setShowCreateModal(true)} className="h-10 bg-teal-600 shadow-sm hover:bg-teal-700">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Record Movement
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          <StatsCard
            title="Stock In"
            value={formatNumber(stats.totalIn, 0)}
            subtitle="Total received"
            icon={ArrowDownCircle}
            color="emerald"
          />
          <StatsCard
            title="Stock Out"
            value={formatNumber(stats.totalOut, 0)}
            subtitle="Total consumed"
            icon={ArrowUpCircle}
            color="red"
          />
          <StatsCard
            title="Net Change"
            value={`${stats.netChange >= 0 ? '+' : ''}${formatNumber(stats.netChange, 0)}`}
            subtitle="Overall impact"
            icon={stats.netChange >= 0 ? TrendingUp : TrendingDown}
            color={stats.netChange >= 0 ? "emerald" : "red"}
          />
          <StatsCard
            title="This Week"
            value={stats.recentCount}
            subtitle="Recent movements"
            icon={Activity}
            color="blue"
          />
        </div>
      )}

      {/* Filters */}
      <section
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5"
        aria-labelledby="stock-movement-filters-heading"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="stock-movement-filters-heading" className="text-sm font-semibold text-slate-900">Filter movements</h2>
          </div>
          {hasActiveFilters && (
            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
              {activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}
            </span>
          )}
        </div>

        {/* Main Filters Row */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_11rem_11rem]">
          <div className="min-w-0">
            <Label htmlFor="stock-movements-search" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                id="stock-movements-search"
                aria-label="Search stock movements"
                placeholder="Search by item name, notes, or reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full pl-10"
              />
            </div>
          </div>
          <div className="min-w-0">
            <Label htmlFor="stock-movements-type" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Type
            </Label>
            <Select
              value={typeFilters.length === 1 ? typeFilters[0] : 'all'}
              onValueChange={(v) => {
                if (v === 'all') {
                  setTypeFilters([]);
                } else {
                  setTypeFilters([v]);
                }
                setPage(1);
              }}
            >
              <SelectTrigger id="stock-movements-type" aria-label="Filter by movement type" className="h-11 w-full">
                <Filter className="mr-2 h-4 w-4 text-slate-400" aria-hidden="true" />
                <SelectValue>
                  {typeFilters.length === 0 ? 'All Types' :
                    typeFilters.length === 1 ? movementTypes.find(t => t.value === typeFilters[0])?.label :
                      `${typeFilters.length} Types Selected`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {movementTypes.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="stock-movements-from" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              From
            </Label>
            <Input
              id="stock-movements-from"
              type="date"
              aria-label="From date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="h-11 w-full"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="stock-movements-to" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              To
            </Label>
            <Input
              id="stock-movements-to"
              type="date"
              aria-label="To date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="h-11 w-full"
            />
          </div>
        </div>

        {/* Quick Filter Chips - Multi-select */}
        <div className="border-t border-slate-100 pt-4" aria-label="Quick movement filters">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick filters</span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="mt-3 overflow-x-auto overscroll-x-contain pb-1" role="region" aria-label="Movement type quick filters">
            <div className="flex min-w-max flex-nowrap gap-2">
              {movementTypes.map(type => {
                const config = getMovementConfig(type.value);
                const isActive = typeFilters.includes(type.value);
                return (
                  <FilterChip
                    key={type.value}
                    label={type.label}
                    icon={type.icon}
                    active={isActive}
                    color={config.bg}
                    onClick={() => toggleTypeFilter(type.value)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Movements Table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40" aria-labelledby="stock-movement-history-heading">
        <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 id="stock-movement-history-heading" className="text-base font-semibold text-slate-950">Movement history</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {pagination ? `${pagination.total} movements in scope` : `${filteredMovements.length} movements in scope`}
            </p>
          </div>
          <span className="text-xs text-slate-400">Select a row to view details</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date & Time</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Item</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Location</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Batch</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Reference</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">By</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-0">
                    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-12 text-center">
                      <span className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-500">
                        <Activity className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <p className="font-semibold text-slate-900">No movements found matching your criteria.</p>
                      <p className="mt-1 max-w-sm text-sm text-slate-500">
                        Try adjusting the search, movement type, or date range.
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="mt-4 text-sm font-semibold text-teal-700 underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMovements.map(mov => {
                  const config = getMovementConfig(mov.movement_type);
                  const Icon = config.icon;
                  const isPositive = isPositiveMovement(mov.movement_type);
                  const userName = mov.userResponsible?.username || mov.user_name || '-';
                  const movementLocationLabel = mov.movement_type === 'transfer'
                    ? `${mov.sourceLocation?.name || (mov.source_location_id ? `#${mov.source_location_id}` : 'N/A')} -> ${mov.destinationLocation?.name || (mov.destination_location_id ? `#${mov.destination_location_id}` : 'N/A')}`
                    : (mov.location?.name || (mov.location_id ? `#${mov.location_id}` : '-'));

                  return (
                    <tr
                      key={mov.movement_id || mov.id}
                      tabIndex={0}
                      className="cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-teal-50/50 focus-visible:outline-none"
                      onClick={() => handleViewMovement(mov)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleViewMovement(mov);
                        }
                      }}
                    >
                      <td className="whitespace-nowrap px-4 py-4 align-middle">
                        <div className="flex items-center gap-2 text-slate-600">
                          <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                          <div>
                            <p className="font-semibold text-slate-900">
                              {format(new Date(mov.timestamp || mov.created_date || mov.created_at), 'MMM d, yyyy')}
                            </p>
                            <p className="text-xs text-slate-500">
                              {format(new Date(mov.timestamp || mov.created_date || mov.created_at), 'h:mm a')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[220px] px-4 py-4 align-middle">
                        <p className="truncate font-semibold text-slate-900" title={mov.item?.name || mov.item_name || 'N/A'}>
                          {mov.item?.name || mov.item_name || 'N/A'}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {mov.item?.sku_code || ''}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <Badge variant="outline" className={cn("flex items-center gap-1 w-fit", config.bg)}>
                          <Icon className={cn("h-3 w-3", config.color)} aria-hidden="true" />
                          {config.label}
                        </Badge>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-4 align-middle text-sm text-slate-600" title={movementLocationLabel}>
                        {movementLocationLabel}
                      </td>
                      <td className="px-4 py-4 text-right align-middle">
                        <div className="whitespace-nowrap">
                          <span className={cn(
                            "font-semibold tabular-nums",
                            isPositive ? "text-emerald-600" : "text-red-500"
                          )}>
                            {isPositive ? '+' : ''}{formatNumber(parseFloat(mov.quantity), 2)}
                          </span>
                          <span className="ml-1 text-xs text-slate-400">
                            {mov.item?.unit_of_measure || ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-middle text-sm text-slate-600">
                        {mov.batch_id || mov.batch?.batch_id ? (
                          <Badge variant="outline" className="bg-slate-50 text-xs">
                            #{mov.batch_id || mov.batch?.batch_id}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="max-w-[180px] px-4 py-4 align-middle">
                        {mov.reference_id ? (
                          <Badge variant="outline" className="block w-fit max-w-full truncate bg-slate-50 font-mono text-xs" title={mov.reference_id}>
                            {mov.reference_id}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-4 align-middle text-sm text-slate-600" title={userName}>
                        {userName}
                      </td>
                      <td className="px-4 py-4 text-right align-middle" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 p-0"
                              aria-label={`Actions for ${mov.item?.name || mov.item_name || 'movement'}`}
                              title="Movement actions"
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-48 p-1.5">
                            <DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Movement actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleViewMovement(mov)} className="min-h-10 gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium">
                              <Eye className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                              <span>View details</span>
                            </DropdownMenuItem>
                            {/* Only allow voiding if not already voided */}
                            {mov.reference_type !== 'VOID' && !mov.notes?.includes('Voided by') && canDelete('stock_movements') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleVoidClick(mov)}
                                  className="min-h-10 gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-red-600 focus:bg-red-50 focus:text-red-700 [&_svg]:text-red-600"
                                >
                                  <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
                                  <span>Void movement</span>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="text-sm text-slate-500">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} movements
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="min-w-24 text-center text-sm text-slate-600">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= pagination.pages}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Create Modal */}
      {showCreateModal && (
        <MovementCreateModal
          open={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setPreselectedItem(null);
          }}
          onSubmit={handleCreateMovement}
          items={items || []}
          preselectedItem={preselectedItem}
        />
      )}

      {/* Details Modal */}
      <MovementDetailsModal
        movement={selectedMovement}
        open={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedMovement(null);
        }}
        onVoid={handleVoidClick}
      />

      {/* Void Confirmation Dialog */}
      <Dialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-md flex-col overflow-hidden overflow-y-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 space-y-0 border-b border-red-100 bg-white px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-xl text-red-700 sm:text-2xl">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  Void stock movement
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm text-slate-600">
                  Reverse the recorded stock change. This cannot be undone.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setShowVoidDialog(false)}
                disabled={isVoiding}
                aria-label="Close void movement dialog"
                title="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">This action restores the previous stock balance.</p>
              <p className="mt-1">A reason is required before continuing.</p>
            </div>
            {movementToVoid && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected movement</p>
                <p className="mt-1 truncate font-semibold text-slate-900">
                  {movementToVoid.item?.name || movementToVoid.item_name || 'Selected item'}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatNumber(Math.abs(Number(movementToVoid.quantity || 0)), 2)} {movementToVoid.item?.unit_of_measure || movementToVoid.unit_of_measure || 'units'}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="voidReason" className="text-sm font-semibold text-slate-800">
                Reason for voiding <span className="text-red-600" aria-hidden="true">*</span>
              </Label>
            <Textarea
              id="voidReason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g., Data entry error, cancelled order..."
              aria-required="true"
              className="min-h-24 resize-none"
            />
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowVoidDialog(false)}
              disabled={isVoiding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmVoid}
              disabled={!voidReason.trim() || isVoiding}
            >
              {isVoiding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Voiding...
                </>
                ) : (
                'Void movement'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
