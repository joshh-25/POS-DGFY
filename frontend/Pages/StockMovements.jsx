import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  Search,
  Filter,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
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
import { Button } from "../Components/ui/button";
import { Input } from "../Components/ui/input";
import { Badge } from "../Components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../Components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../Components/ui/dialog";
import { Textarea } from "../Components/ui/textarea";
import { Label } from "../Components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../Components/ui/select";
import { cn } from "../src/lib/utils.js";
import { useStockMovements, useCreateStockMovement, useMovementStats } from '../src/hooks/useStockMovements.js';
import { usePermission } from '../src/hooks/usePermission';
import { getExportUrl, voidMovement, exportStockMovements } from '../src/services/stockMovementService.js';
import { useItems } from '../src/hooks/useItems.js';
import MovementCreateModal from '../Components/movements/MovementCreateModal';
import MovementDetailsModal from '../Components/movements/MovementDetailsModal';
import { getMovementConfig, isPositiveMovement, getMovementTypes } from '../Components/utils/movementConfig.js';
import { toast } from 'sonner';
import { formatNumber } from '../src/lib/numberUtils.js';

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
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={cn("p-3 rounded-xl border", colorClasses[color])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          {trend > 0 ? (
            <TrendingUp className="w-3 h-3 text-emerald-500" />
          ) : trend < 0 ? (
            <TrendingDown className="w-3 h-3 text-red-500" />
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
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
        active
          ? `${color} shadow-sm`
          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
      {active && (
        <X className="w-3 h-3 ml-1 opacity-60" />
      )}
    </button>
  );
}

export default function StockMovements() {
  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

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
  const { stockMovements, loading, error, pagination, refetch } = useStockMovements(queryParams);
  const { items, loading: itemsLoading } = useItems({ limit: 1000 });
  const { createStockMovement, loading: creating } = useCreateStockMovement();
  const { stats, loading: statsLoading } = useMovementStats({ startDate, endDate });
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
      toast.error(error.message || 'Failed to create stock movement');
    }
  };

  const handleViewMovement = (movement) => {
    setSelectedMovement(movement);
    setShowDetailsModal(true);
  };

  const handleVoidClick = (movement) => {
    setMovementToVoid(movement);
    setVoidReason('');
    setShowVoidDialog(true);
  };

  const confirmVoid = async () => {
    if (!movementToVoid || !voidReason.trim()) return;

    setIsVoiding(true);
    try {
      await voidMovement(movementToVoid.movement_id || movementToVoid.id, voidReason);
      toast.success('Movement voided successfully');
      setShowVoidDialog(false);
      setMovementToVoid(null);
      setVoidReason('');
      setShowDetailsModal(false); // Close details if open
      refetch(); // Refresh list
    } catch (error) {
      toast.error(error.message || 'Failed to void movement');
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

      const blob = await exportStockMovements(filters);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `stock_movements_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Export downloaded successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export stock movements');
    }
  };

  const hasActiveFilters = typeFilters.length > 0 || searchQuery || startDate || endDate;

  if (loading || itemsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-red-800 font-medium">Error loading stock movements</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const movementTypes = getMovementTypes();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Stock Movements</h1>
          <p className="text-slate-500 mt-1">
            {pagination ? `${pagination.total} total movements` : `${filteredMovements.length} movements`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          {canCreate('stock_movements') && (
            <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              Record Movement
            </Button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        {/* Main Filters Row */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by item name, notes, or reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
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
            <SelectTrigger className="w-52">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
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
          <div className="flex gap-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              placeholder="Start Date"
              className="w-40"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              placeholder="End Date"
              className="w-40"
            />
          </div>
        </div>

        {/* Quick Filter Chips - Multi-select */}
        <div className="flex flex-wrap gap-2">
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
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-slate-500 hover:text-slate-700 ml-2"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 font-medium text-slate-600">Date & Time</th>
                <th className="text-left p-4 font-medium text-slate-600">Item</th>
                <th className="text-left p-4 font-medium text-slate-600">Type</th>
                <th className="text-left p-4 font-medium text-slate-600">Quantity</th>
                <th className="text-left p-4 font-medium text-slate-600">Batch</th>
                <th className="text-left p-4 font-medium text-slate-600">Reference</th>
                <th className="text-left p-4 font-medium text-slate-600">By</th>
                <th className="text-left p-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    No movements found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredMovements.map(mov => {
                  const config = getMovementConfig(mov.movement_type);
                  const Icon = config.icon;
                  const isPositive = isPositiveMovement(mov.movement_type);
                  const userName = mov.userResponsible?.username || mov.user_name || '—';

                  return (
                    <tr
                      key={mov.movement_id || mov.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => handleViewMovement(mov)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-slate-600">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <div>
                            <p className="font-medium text-slate-900">
                              {format(new Date(mov.timestamp || mov.created_date || mov.created_at), 'MMM d, yyyy')}
                            </p>
                            <p className="text-xs text-slate-500">
                              {format(new Date(mov.timestamp || mov.created_date || mov.created_at), 'h:mm a')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-slate-900">
                          {mov.item?.name || mov.item_name || 'N/A'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {mov.item?.sku_code || ''}
                        </p>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={cn("flex items-center gap-1 w-fit", config.bg)}>
                          <Icon className={cn("w-3 h-3", config.color)} />
                          {config.label}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          "font-semibold",
                          isPositive ? "text-emerald-600" : "text-red-500"
                        )}>
                          {isPositive ? '+' : ''}{formatNumber(parseFloat(mov.quantity), 2)}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">
                          {mov.item?.unit_of_measure || ''}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {mov.batch_id || mov.batch?.batch_id ? (
                          <Badge variant="outline" className="bg-slate-50 text-xs">
                            #{mov.batch_id || mov.batch?.batch_id}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        {mov.reference_id ? (
                          <Badge variant="outline" className="bg-slate-50 font-mono text-xs">
                            {mov.reference_id}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {userName}
                      </td>
                      <td className="p-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleViewMovement(mov)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {/* Only allow voiding if not already voided */}
                            {mov.reference_type !== 'VOID' && !mov.notes?.includes('Voided by') && canDelete('stock_movements') && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleVoidClick(mov)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  Void Movement
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-500">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} movements
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-slate-600">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= pagination.pages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Void Movement
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to void this movement? This action will reverse the stock adjustment and cannot be undone.
              <br className="mb-2" />
              <span className="font-semibold text-slate-900 block mt-2">
                Reason for voiding is required:
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label htmlFor="voidReason" className="sr-only">Reason</Label>
            <Textarea
              id="voidReason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g., Data entry error, cancelled order..."
              className="resize-none h-24"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowVoidDialog(false)}
              disabled={isVoiding}
            >
              Cancel
            </Button>
            <Button
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
                'Confirm Void'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}