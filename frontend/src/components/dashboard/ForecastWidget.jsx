import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';
import { getStockForecast } from '@/services/forecastService';
import { cn } from "@/lib/utils";

export default function ForecastWidget() {
    const [forecasts, setForecasts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchForecasts = async () => {
            try {
                const response = await getStockForecast(30);
                setForecasts(response.data.forecasts || []);
            } catch (err) {
                const status = err?.response?.status;
                if (status === 401) {
                    setError('Session expired. Please login again.');
                    return;
                }
                if (status === 403) {
                    setError('Forecast access is restricted for this account.');
                    return;
                }
                console.warn('Failed to load forecasts:', err);
                setError('Failed to load forecast data');
            } finally {
                setLoading(false);
            }
        };

        fetchForecasts();
    }, []);

    if (loading) {
        return (
            <Card className="h-full">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <TrendingUp className="w-5 h-5 text-indigo-600" />
                        30-Day Stock Forecast
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center min-h-[200px]">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="h-full border-red-200 bg-red-50">
                <CardContent className="flex items-center justify-center min-h-[200px] text-red-600 font-medium">
                    {error}
                </CardContent>
            </Card>
        );
    }

    // Filter for items that will be depleted soon or have high consumption
    const riskyItems = forecasts
        .filter(f => f.days_until_depletion < 30)
        .sort((a, b) => a.days_until_depletion - b.days_until_depletion)
        .slice(0, 5);

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-600" />
                        Stock Forecast (30 Days)
                    </div>
                    <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        Based on usage
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {riskyItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
                        <TrendingDown className="w-10 h-10 text-emerald-200 mb-2" />
                        <p className="font-medium text-slate-900">Stable Outlook</p>
                        <p className="text-sm">No items predicted to run out in the next 30 days.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {riskyItems.map((item) => (
                            <div key={item.item_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                                    <p className="text-xs text-slate-500">Avg. Daily Usage: {item.avg_daily_consumption.toFixed(1)}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className={cn(
                                        "flex items-center gap-1 font-bold text-sm",
                                        item.days_until_depletion <= 7 ? "text-red-600" : "text-amber-600"
                                    )}>
                                        {item.days_until_depletion <= 0 ? (
                                            <>
                                                <AlertCircle className="w-3 h-3" />
                                                Depleted
                                            </>
                                        ) : (
                                            <>
                                                {Math.floor(item.days_until_depletion)} days left
                                            </>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400">Predicted Stock: {Math.max(0, item.forecasted_stock).toFixed(0)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
