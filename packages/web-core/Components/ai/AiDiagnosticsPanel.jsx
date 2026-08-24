/**
 * AiDiagnosticsPanel
 *
 * Runs a real-time AI capability and knowledge gap check for the current tenant.
 * Surfaces three classes of gaps:
 *
 *   1. Feature Gaps    — system actions the AI cannot perform
 *   2. Knowledge Gaps  — tenant data or context the AI cannot access
 *   3. Coverage Metrics — per-category AI coverage percentages
 *
 * Designed to be rendered inside a Dialog/Modal.
 */

import React, { useState, useCallback } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  RefreshCw,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getDiagnostics } from '@/services/aiService';
import { cn } from '@/lib/utils';

// Severity visual styles
const SEVERITY = {
  high: {
    icon: XCircle,
    iconColor: 'text-red-500',
    badge: 'bg-red-100 text-red-700 border-red-200'
  },
  medium: {
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700 border-amber-200'
  },
  low: {
    icon: Info,
    iconColor: 'text-slate-400',
    badge: 'bg-slate-100 text-slate-600 border-slate-200'
  }
};

export default function AiDiagnosticsPanel({ onClose }) {
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('gaps');

  // One-time onboarding hint — dismissed per browser via localStorage
  const [showHint, setShowHint] = useState(
    () => !localStorage.getItem('ai_diagnostics_seen')
  );

  const dismissHint = useCallback(() => {
    localStorage.setItem('ai_diagnostics_seen', '1');
    setShowHint(false);
  }, []);

  const runCheck = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDiagnostics();
      setReport(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to run diagnostics. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Group capability gaps by category for display
  const gapsByCategory = report?.capability_gaps?.reduce((acc, gap) => {
    if (!acc[gap.category]) acc[gap.category] = [];
    acc[gap.category].push(gap);
    return acc;
  }, {}) ?? {};

  const coveragePct = report?.feature_coverage?.coverage_pct ?? 0;

  return (
    <div className="bg-white">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-teal-600 shrink-0" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800 leading-none">AI Capability Checker</h3>
            <p className="text-xs text-slate-500 mt-1">Analyze system coverage for your tenant</p>
          </div>
          {report && (
            <Badge variant="outline" className="ml-2 text-xs px-2 py-0.5 bg-white">
              {coveragePct}% covered
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8 rounded-full hover:bg-slate-200"
              onClick={onClose}
              title="Close"
            >
              <X className="w-4 h-4 text-slate-500" />
            </Button>
          )}
        </div>
      </div>

      {/* Panel Body */}
      <div className="p-6 space-y-6">
        {/* One-time onboarding hint */}
        {showHint && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="flex-1 text-sm text-amber-900 leading-snug">
              Run a check to see what SKUpervisor can and cannot do with your tenant data.
            </p>
            <button
              onClick={dismissHint}
              className="text-amber-500 hover:text-amber-700 shrink-0 mt-0.5"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Run Check Button */}
        <Button
          onClick={runCheck}
          disabled={isLoading}
          size="default"
          className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2 h-10 shadow-sm"
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          {isLoading ? 'Running Analysis...' : report ? 'Re-run Analysis' : 'Run Analysis'}
        </Button>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            {error}
          </p>
        )}

        {/* Empty state */}
        {!report && !isLoading && !error && (
          <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-xl">
            <ShieldAlert className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              Click "Run Analysis" to generate a coverage report.
            </p>
          </div>
        )}

        {/* Results */}
        {report && (
          <>
            {/* Overall coverage bar */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 font-medium">Global Feature Coverage</span>
                <span className="font-bold text-slate-800 text-base">{coveragePct}%</span>
              </div>
              <Progress value={coveragePct} className="h-3" />
              <div className="flex justify-between text-xs text-slate-500 pt-1">
                <span>{report.feature_coverage.covered} capabilities fully operational</span>
                <span>{report.feature_coverage.gaps} detected gap{report.feature_coverage.gaps !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full h-10 bg-slate-100 p-1 grid grid-cols-3">
                <TabsTrigger value="gaps" className="text-xs sm:text-sm">
                  Gaps ({report.feature_coverage.gaps})
                </TabsTrigger>
                <TabsTrigger value="knowledge" className="text-xs sm:text-sm">
                  Knowledge ({report.knowledge_gaps?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="covered" className="text-xs sm:text-sm">
                  Covered
                </TabsTrigger>
              </TabsList>

              {/* ── Capability Gaps Tab ── */}
              <TabsContent value="gaps" className="mt-4 max-h-[400px] overflow-y-auto pr-2 space-y-6">
                {Object.keys(gapsByCategory).length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm">No feature gaps detected. The AI has full coverage.</p>
                  </div>
                )}
                {Object.entries(gapsByCategory).map(([category, gaps]) => (
                  <div key={category}>
                    <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3 border-b border-slate-100 pb-1">
                      {category}
                    </h4>
                    <div className="space-y-3">
                      {gaps.map(gap => {
                        const sev = SEVERITY[gap.severity] ?? SEVERITY.low;
                        const SevIcon = sev.icon;
                        return (
                          <div key={gap.id} className="flex gap-3 bg-white border border-slate-100 rounded-lg p-3 shadow-sm">
                            <SevIcon className={cn('w-4 h-4 shrink-0 mt-0.5', sev.iconColor)} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-slate-700 text-sm">{gap.feature}</p>
                                <Badge className={cn('text-[10px] border shrink-0 capitalize px-1.5 py-0', sev.badge)}>
                                  {gap.severity}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                {gap.recommendation}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* ── Knowledge Gaps Tab ── */}
              <TabsContent value="knowledge" className="mt-4 max-h-[400px] overflow-y-auto pr-2 space-y-3">
                {(report.knowledge_gaps ?? []).length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm">No knowledge gaps detected.</p>
                  </div>
                )}
                {(report.knowledge_gaps ?? []).map(gap => {
                  const sev = SEVERITY[gap.severity] ?? SEVERITY.low;
                  const SevIcon = sev.icon;
                  return (
                    <div key={gap.id} className="flex gap-3 items-start bg-white border border-slate-100 rounded-lg p-3">
                      <SevIcon className={cn('w-4 h-4 shrink-0 mt-0.5', sev.iconColor)} />
                      <p className="text-sm text-slate-600 leading-snug">{gap.description}</p>
                    </div>
                  );
                })}
              </TabsContent>

              {/* ── Covered Capabilities Tab ── */}
              <TabsContent value="covered" className="mt-4 max-h-[400px] overflow-y-auto pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(report.covered_capabilities ?? []).map(cap => (
                    <div key={cap.id} className="flex items-center gap-2 text-xs p-2 rounded-md hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-slate-600 flex-1 min-w-0 truncate" title={cap.feature}>{cap.feature}</span>
                      <code className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
                        {cap.tool}
                      </code>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <Separator />

            {/* Tenant Data Snapshot */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Tenant Data Snapshot</p>
              <div className="grid grid-cols-4 gap-4 text-xs">
                <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
                  <div className="text-slate-500 mb-1">Active Items</div>
                  <div className="font-bold text-slate-700 text-lg">{report.tenant_data.active_items}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
                  <div className="text-slate-500 mb-1">Suppliers</div>
                  <div className="font-bold text-slate-700 text-lg">{report.tenant_data.active_suppliers}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
                  <div className="text-slate-500 mb-1">POs</div>
                  <div className="font-bold text-slate-700 text-lg">{report.tenant_data.total_pos}</div>
                  {report.tenant_data.archived_pos > 0 && <div className="text-[10px] text-slate-400 mt-1">{report.tenant_data.archived_pos} archived</div>}
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
                  <div className="text-slate-500 mb-1">JOs</div>
                  <div className="font-bold text-slate-700 text-lg">{report.tenant_data.total_jos}</div>
                  {report.tenant_data.archived_jos > 0 && <div className="text-[10px] text-slate-400 mt-1">{report.tenant_data.archived_jos} archived</div>}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 text-right mt-3">
                Last checked: {new Date(report.generated_at).toLocaleTimeString()}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
