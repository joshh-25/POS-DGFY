import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Plus, 
  Search, 
  Filter, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  ArrowLeftRight,
  RotateCcw,
  AlertCircle,
  Calendar,
  Loader2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "../src/lib/utils.js";
import { useStockMovements, useCreateStockMovement } from '@/hooks/useStockMovements.js';
import { useItems } from '@/hooks/useItems.js';
import MovementCreateModal from '@/components/movements/MovementCreateModal';
import { toast } from 'sonner';

const movementConfig = {
  purchase_receipt: { 
    icon: ArrowDownCircle, 
    color: "text-emerald-600", 
    bg: "bg-emerald-50 border-emerald-200", 
    label: "Purchase Receipt" 
  },
  production_consumption: { 
    icon: ArrowUpCircle, 
    color: "text-red-500", 
    bg: "bg-red-50 border-red-200", 
    label: "Production Consumption" 
  },
  transfer: { 
    icon: ArrowLeftRight, 
    color: "text-blue-500", 
    bg: "bg-blue-50 border-blue-200", 
    label: "Transfer" 
  },
  return: { 
    icon: RotateCcw, 
    color: "text-blue-500", 
    bg: "bg-blue-50 border-blue-200", 
    label: "Return" 
  },
  calculated_loss: { 
    icon: AlertCircle, 
    color: "text-red-600", 
    bg: "bg-red-50 border-red-200", 
    label: "Calculated Loss" 
  }
};

export default function StockMovements() {
  const { stockMovements, loading, error, refetch } = useStockMovements();
  const { items, loading: itemsLoading } = useItems();
  const { createStockMovement, loading: creating } = useCreateStockMovement();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [preselectedItem, setPreselectedItem] = useState(null);

  // Check URL params
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

  const filteredMovements = useMemo(() => {
    if (!stockMovements) return [];
    return stockMovements.filter(mov => {
      const matchesSearch = 
        (mov.item_name || mov.Item?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (mov.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (mov.reference_id || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || mov.movement_type === typeFilter;
      return matchesSearch && matchesType;
    }).sort((a, b) => new Date(b.timestamp || b.created_date || b.created_at) - new Date(a.timestamp || a.created_date || a.created_at));
  }, [stockMovements, searchQuery, typeFilter]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Stock Movements</h1>
          <p className="text-slate-500 mt-1">{filteredMovements.length} transactions</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Record Movement
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
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
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-52">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Movement Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="purchase_receipt">Purchase Receipt</SelectItem>
              <SelectItem value="production_consumption">Production Consumption</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="return">Return</SelectItem>
              <SelectItem value="calculated_loss">Calculated Loss</SelectItem>
            </SelectContent>
          </Select>
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
                <th className="text-left p-4 font-medium text-slate-600">From / To</th>
                <th className="text-left p-4 font-medium text-slate-600">Reference</th>
                <th className="text-left p-4 font-medium text-slate-600">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.map(mov => {
                const config = movementConfig[mov.movement_type] || movementConfig.transfer;
                const Icon = config.icon;
                const isPositive = mov.movement_type === 'purchase_receipt' || mov.movement_type === 'return';
                
                return (
                  <tr key={mov.movement_id || mov.id} className="hover:bg-slate-50 transition-colors">
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
                    <td className="p-4 font-medium text-slate-900">{mov.item_name || mov.Item?.name || 'N/A'}</td>
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
                        {isPositive ? '+' : '-'}{mov.quantity}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 text-sm">
                      {mov.from_location && mov.to_location ? (
                        <div className="flex items-center gap-1">
                          <span>{mov.from_location}</span>
                          <ArrowLeftRight className="w-3 h-3 text-slate-400" />
                          <span>{mov.to_location}</span>
                        </div>
                      ) : (
                        mov.from_location || mov.to_location || '—'
                      )}
                    </td>
                    <td className="p-4">
                      {mov.reference_id ? (
                        <Badge variant="outline" className="bg-slate-50 font-mono">
                          {mov.reference_id}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-600 text-sm max-w-xs truncate">
                      {mov.notes || '—'}
                      {mov.loss_reason && (
                        <Badge variant="outline" className="ml-2 bg-red-50 text-red-700 border-red-200 text-xs">
                          {mov.loss_reason}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
    </div>
  );
}