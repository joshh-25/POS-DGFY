import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Search, Filter, Eye, Factory, Clock, Play, CheckCircle, AlertTriangle } from 'lucide-react';
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
import { dummyJobOrders, dummyItems } from '@/components/data/dummyData';
import JOCreateModal from '@/components/jo/JOCreateModal';
import JODetailsModal from '@/components/jo/JODetailsModal';

const statusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Play },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle }
};

export default function JobOrders() {
  const [jobOrders, setJobOrders] = useState(dummyJobOrders);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJO, setSelectedJO] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredJOs = useMemo(() => {
    return jobOrders.filter(jo => {
      const matchesSearch = 
        jo.jo_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        jo.product_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || jo.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  }, [jobOrders, searchQuery, statusFilter]);

  const handleView = (jo) => {
    setSelectedJO(jo);
    setShowDetailsModal(true);
  };

  const handleCreateJO = (joData) => {
    const newJO = {
      ...joData,
      id: `jo-${Date.now()}`,
      jo_number: `JO-${String(jobOrders.length + 1).padStart(3, '0')}`,
      created_date: new Date().toISOString().split('T')[0],
      status: 'draft',
      completion_date: null,
      responsible_user: 'admin@company.com'
    };
    setJobOrders(prev => [...prev, newJO]);
    setShowCreateModal(false);
  };

  const handleStartProduction = (jo) => {
    setJobOrders(prev => prev.map(j => 
      j.id === jo.id ? { ...j, status: 'in_progress' } : j
    ));
  };

  const handleCompleteProduction = (jo) => {
    setJobOrders(prev => prev.map(j => 
      j.id === jo.id ? { 
        ...j, 
        status: 'completed',
        completion_date: new Date().toISOString()
      } : j
    ));
    setShowDetailsModal(false);
  };

  const products = dummyItems.filter(item => item.category === 'product');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Job Orders</h1>
          <p className="text-slate-500 mt-1">{filteredJOs.length} orders</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 mr-2" />
          Create Job Order
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by JO number or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* JO Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 font-medium text-slate-600">JO Number</th>
                <th className="text-left p-4 font-medium text-slate-600">Product</th>
                <th className="text-left p-4 font-medium text-slate-600">Quantity</th>
                <th className="text-left p-4 font-medium text-slate-600">Created Date</th>
                <th className="text-left p-4 font-medium text-slate-600">Status</th>
                <th className="text-left p-4 font-medium text-slate-600">Completed</th>
                <th className="text-left p-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJOs.map(jo => {
                const status = statusConfig[jo.status];
                const StatusIcon = status.icon;
                const hasInsufficientStock = jo.ingredients_consumed?.some(ing => ing.stock_after < 0);
                
                return (
                  <tr key={jo.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <span className="font-semibold text-slate-900">{jo.jo_number}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Factory className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-700">{jo.product_name}</span>
                      </div>
                    </td>
                    <td className="p-4 font-medium text-slate-900">{jo.quantity_to_produce} units</td>
                    <td className="p-4 text-slate-600">{jo.created_date}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("flex items-center gap-1 w-fit", status.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </Badge>
                        {hasInsufficientStock && jo.status === 'draft' && (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">
                      {jo.completion_date 
                        ? format(new Date(jo.completion_date), 'MMM d, yyyy h:mm a')
                        : '—'
                      }
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleView(jo)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {jo.status === 'draft' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleStartProduction(jo)}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          >
                            <Play className="w-4 h-4 mr-1" />
                            Start
                          </Button>
                        )}
                        {jo.status === 'in_progress' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setSelectedJO(jo);
                              setShowDetailsModal(true);
                            }}
                            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Complete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <JOCreateModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateJO}
          products={products}
          items={dummyItems}
        />
      )}
      
      <JODetailsModal
        jo={selectedJO}
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        onComplete={handleCompleteProduction}
      />
    </div>
  );
}