import React, { useEffect, useState } from 'react';
import { Award, Clock, Truck, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import * as analyticsService from '@/services/analyticsService';

export default function SupplierScorecard({ supplierId }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (supplierId) {
            fetchScorecard();
        }
    }, [supplierId]);

    const fetchScorecard = async () => {
        try {
            setLoading(true);
            const response = await analyticsService.getSupplierPerformance(supplierId);
            setData(response.data);
            setError(null);
        } catch (err) {
            console.error('Failed to load supplier scorecard:', err);
            setError('Unable to load scorecard');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200 animate-pulse">
                <div className="w-8 h-8 bg-slate-200 rounded-full"></div>
                <div className="space-y-1">
                    <div className="h-3 w-20 bg-slate-200 rounded"></div>
                    <div className="h-2 w-16 bg-slate-200 rounded"></div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return null; // Fail gracefully by showing nothing
    }

    // Determine colors based on grade
    const gradeColors = {
        'A': 'bg-green-100 text-green-700 border-green-200',
        'B': 'bg-blue-100 text-blue-700 border-blue-200',
        'C': 'bg-yellow-100 text-yellow-700 border-yellow-200',
        'F': 'bg-red-100 text-red-700 border-red-200',
        'N/A': 'bg-slate-100 text-slate-500 border-slate-200'
    };

    // Parse grade (default to N/A)
    const grade = data.grade || 'N/A';
    const metrics = data.metrics || {};
    const colorClass = gradeColors[grade] || gradeColors['N/A'];

    return (
        <div className="flex items-center gap-4 bg-white p-1 pr-4 rounded-xl border border-slate-200 shadow-sm">
            {/* Grade Badge */}
            <div className={cn(
                "flex flex-col items-center justify-center w-12 h-12 rounded-lg border shadow-sm shrink-0",
                colorClass
            )}>
                <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Grade</span>
                <span className="text-xl font-bold leading-none">{grade}</span>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-4 divide-x divide-slate-100">

                {/* On-Time Rate */}
                <div className="flex flex-col pl-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-0.5">
                        <Clock className="w-3.5 h-3.5" />
                        On-Time
                    </div>
                    <span className="text-sm font-bold text-slate-700">
                        {metrics.on_time_delivery_rate || '0%'}
                    </span>
                </div>

                {/* Lead Time */}
                <div className="flex flex-col pl-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-0.5">
                        <Truck className="w-3.5 h-3.5" />
                        Lead Time
                    </div>
                    <span className="text-sm font-bold text-slate-700">
                        {metrics.avg_lead_time_days ? `${metrics.avg_lead_time_days}d` : 'N/A'}
                    </span>
                </div>

                {/* Orders Count */}
                <div className="flex flex-col pl-4 hidden sm:flex">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-0.5">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Orders
                    </div>
                    <span className="text-sm font-bold text-slate-700">
                        {metrics.total_orders || 0}
                    </span>
                </div>
            </div>
        </div>
    );
}
