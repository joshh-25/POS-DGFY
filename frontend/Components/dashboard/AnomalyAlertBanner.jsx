import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Activity, X } from 'lucide-react';
import { cn } from "@/lib/utils";
import * as analyticsService from '@/services/analyticsService';

export default function AnomalyAlertBanner() {
    const [anomalies, setAnomalies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        fetchAnomalies();
    }, []);

    const fetchAnomalies = async () => {
        try {
            const response = await analyticsService.getAnomalies({ days: 30 });
            setAnomalies(response.data || []);
        } catch (err) {
            console.error('Failed to fetch anomalies:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !visible || anomalies.length === 0) return null;

    const criticalCount = anomalies.filter(a => a.severity === 'CRITICAL').length;

    // Determine banner styling based on severity
    const isCritical = criticalCount > 0;
    const bannerColor = isCritical
        ? "bg-red-50 border-red-200 text-red-900"
        : "bg-amber-50 border-amber-200 text-amber-900";

    const iconColor = isCritical ? "text-red-600" : "text-amber-600";
    const buttonHover = isCritical ? "hover:bg-red-100" : "hover:bg-amber-100";

    return (
        <div className={cn("rounded-lg border px-4 py-3 shadow-sm transition-all", bannerColor)}>
            <div className="flex items-start justify-between">
                <div className="flex gap-3">
                    <Activity className={cn("h-5 w-5 mt-0.5 shrink-0", iconColor)} />
                    <div>
                        <h3 className="font-medium text-sm flex items-center gap-2">
                            {anomalies.length} Anomaly Alerts Detected
                            {isCritical && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    {criticalCount} Critical
                                </span>
                            )}
                        </h3>
                        <p className={cn("text-xs mt-1 opacity-90", isCritical ? "text-red-800" : "text-amber-800")}>
                            {expanded
                                ? "Review the suspicious inventory activities below."
                                : "Unusual consumption patterns or losses detected. Expand to view details."}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className={cn("p-1.5 rounded-md transition-colors", buttonHover)}
                    >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={() => setVisible(false)}
                        className={cn("p-1.5 rounded-md transition-colors", buttonHover)}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="mt-3 space-y-2 pl-8 border-t border-black/5 pt-3">
                    {anomalies.map((anomaly, index) => (
                        <div key={index} className="text-sm border-b border-black/5 last:border-0 pb-2 last:pb-0">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs uppercase tracking-wide opacity-70">
                                    {anomaly.type.replace('_', ' ')}
                                </span>
                                <span className="text-xs opacity-60">
                                    {anomaly.date || new Date().toLocaleDateString()}
                                </span>
                            </div>
                            <p className="font-medium mt-0.5">{anomaly.name}</p>
                            <p className="text-xs opacity-90">{anomaly.details}</p>
                        </div>
                    ))}
                    <div className="pt-2">
                        <p className="text-xs text-center opacity-60">
                            Check stock levels manually before making adjustments.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
