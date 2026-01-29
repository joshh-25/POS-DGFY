import React from 'react';
import { Table, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { cn } from "@/lib/utils";

/**
 * Preview table for CSV import/export data
 */
export default function CsvPreviewTable({ data, type = 'import' }) {
  if (!data) return null;

  const { headers, rows, sample_rows, showing, total, total_records } = data;
  const displayRows = rows || sample_rows || [];
  const displayHeaders = headers || [];
  const totalCount = total || total_records || displayRows.length;

  if (displayRows.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500">
        <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-400" />
        <p>No data to display</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">
            {type === 'import' ? 'Import Preview' : 'Export Data'}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          Showing {showing || displayRows.length} of {totalCount} rows
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {displayHeaders.map((header, idx) => (
                <th
                  key={idx}
                  className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider border-b"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-slate-50">
                {Array.isArray(row) ? (
                  // Array format (from export preview)
                  row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {formatCellValue(cell)}
                    </td>
                  ))
                ) : (
                  // Object format (from import preview)
                  displayHeaders.map((header, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {formatCellValue(row[header])}
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {totalCount > displayRows.length && (
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-center">
          <span className="text-xs text-slate-500">
            {totalCount - displayRows.length} more rows not shown
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Format cell value for display
 */
function formatCellValue(value) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400">-</span>;
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return value.toLocaleString();
  }

  const str = String(value);

  // Truncate long values
  if (str.length > 50) {
    return (
      <span title={str}>
        {str.substring(0, 47)}...
      </span>
    );
  }

  return str;
}

/**
 * Import summary component
 */
export function CsvImportSummary({ summary, errors }) {
  if (!summary) return null;

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-slate-700">{summary.totalRows}</div>
          <div className="text-xs text-slate-500">Total Rows</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-emerald-700">{summary.validRows}</div>
          <div className="text-xs text-emerald-600">Valid</div>
        </div>
        <div className={cn(
          "rounded-lg p-3 text-center",
          summary.invalidRows > 0 ? "bg-red-50" : "bg-slate-50"
        )}>
          <div className={cn(
            "text-lg font-bold",
            summary.invalidRows > 0 ? "text-red-700" : "text-slate-700"
          )}>
            {summary.invalidRows}
          </div>
          <div className={cn(
            "text-xs",
            summary.invalidRows > 0 ? "text-red-600" : "text-slate-500"
          )}>
            Invalid
          </div>
        </div>
      </div>

      {/* Errors */}
      {errors && errors.length > 0 && (
        <div className="bg-red-50 rounded-lg p-3 border border-red-100">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700">Validation Errors</span>
          </div>
          <ul className="text-sm text-red-700 space-y-1">
            {errors.slice(0, 5).map((error, idx) => (
              <li key={idx}>• {error.message || error}</li>
            ))}
            {errors.length > 5 && (
              <li className="text-red-600">+{errors.length - 5} more errors</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
