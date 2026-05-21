import React, { useEffect, useState } from 'react';
import { DollarSign, TrendingDown, TrendingUp, AlertOctagon } from 'lucide-react';
import { cn } from "@/lib/utils";
import * as analyticsService from '@/services/analyticsService';
import { formatNumber } from '@/lib/numberUtils';

export default function CostAnalysisWidget({ dateFilters = {} }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
    }, [dateFilters.startDate, dateFilters.endDate]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const response = await analyticsService.getCostAnalysis({
                startDate: dateFilters.startDate,
                endDate: dateFilters.endDate
            });
            setData(response.data);
            setError(null);
        } catch (err) {
            console.error('Failed to load cost analysis:', err);
            setError('Failed to load cost analysis data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-8 bg-red-50 text-red-700 rounded-2xl border border-red-200">
                <p>{error || 'No data available'}</p>
            </div>
        );
    }

    const { summary } = data;
    const cogs = parseFloat(summary.total_cogs);
    const waste = parseFloat(summary.total_waste_value);
    const efficiency = parseFloat(summary.efficiency_ratio.replace('%', ''));

    // Determine status color for efficiency
    const efficiencyColor = efficiency >= 90 ? 'text-emerald-600' : efficiency >= 80 ? 'text-amber-600' : 'text-red-600';
    const efficiencyBg = efficiency >= 90 ? 'bg-emerald-50' : efficiency >= 80 ? 'bg-amber-50' : 'bg-red-50';

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* COGS Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <DollarSign className="w-5 h-5 text-blue-600" />
                        </div>
                        <h3 className="text-sm font-medium text-slate-500">Cost of Goods Sold</h3>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">₱{formatNumber(cogs, 2)}</p>
                    <p className="text-xs text-slate-400 mt-2">Value of consumed inventory</p>
                </div>

                {/* Waste Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-red-50 rounded-lg">
                            <TrendingDown className="w-5 h-5 text-red-600" />
                        </div>
                        <h3 className="text-sm font-medium text-slate-500">Total Waste Value</h3>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">₱{formatNumber(waste, 2)}</p>
                    <p className="text-xs text-slate-400 mt-2">Value of lost/spoiled inventory</p>
                </div>

                {/* Efficiency Card */}
                <div className={cn("rounded-2xl border border-slate-200 p-6", efficiencyBg)}>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                            <TrendingUp className={cn("w-5 h-5", efficiencyColor)} />
                        </div>
                        <h3 className={cn("text-sm font-medium", efficiencyColor)}>Efficiency Ratio</h3>
                    </div>
                    <p className={cn("text-3xl font-bold", efficiencyColor)}>{efficiency}%</p>
                    <p className={cn("text-xs mt-2 opacity-80", efficiencyColor)}>
                        COGS vs. Total Inventory Outflow
                    </p>
                </div>
            </div>

            {/* Visual Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8">
                <h3 className="font-semibold text-slate-900 mb-6">Cost Breakdown</h3>

                <div className="relative h-12 bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                        className="h-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm transition-all duration-500"
                        style={{ width: `${efficiency}%` }}
                    >
                        {efficiency > 10 && `COGS (${efficiency}%)`}
                    </div>
                    <div
                        className="h-full bg-red-500 flex items-center justify-center text-white font-bold text-sm transition-all duration-500"
                        style={{ width: `${100 - efficiency}%` }}
                    >
                        {100 - efficiency > 10 && `Waste (${(100 - efficiency).toFixed(1)}%)`}
                    </div>
                </div>

                <div className="flex justify-between mt-4 text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span>Production Consumption (Good)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <span>Waste / Loss / Spoilage (Bad)</span>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center text-slate-500 text-sm">
                Calculations based on weighted average cost at time of movement.
            </div>
        </div>
    );
}
