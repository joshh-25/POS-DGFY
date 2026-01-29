import React, { useState } from 'react';
import {
  Download,
  Monitor,
  FileSpreadsheet,
  Clock,
  ExternalLink
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Dialog for choosing export output preference
 */
export default function ExportOptionsDialog({
  isOpen,
  onClose,
  onSelect,
  entityType,
  totalRecords,
  options = []
}) {
  const [selected, setSelected] = useState(null);

  if (!isOpen) return null;

  const defaultOptions = [
    {
      value: 'display',
      label: 'Display in Chat',
      description: 'Show first 10 rows in the conversation',
      icon: Monitor
    },
    {
      value: 'download',
      label: 'Download File',
      description: 'Generate a CSV file download link (valid for 1 hour)',
      icon: Download
    }
  ];

  const displayOptions = options.length > 0
    ? options.map(opt => ({
        ...opt,
        icon: opt.value === 'display' ? Monitor : Download
      }))
    : defaultOptions;

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Export Options</h3>
              <p className="text-sm text-slate-500">
                {totalRecords} {entityType} ready to export
              </p>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="p-6 space-y-3">
          <p className="text-sm text-slate-600 mb-4">
            How would you like to receive your export?
          </p>

          {displayOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                onClick={() => setSelected(option.value)}
                className={cn(
                  "w-full p-4 rounded-xl border-2 text-left transition-all flex items-start gap-4",
                  selected === option.value
                    ? "border-teal-500 bg-teal-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  selected === option.value
                    ? "bg-teal-500 text-white"
                    : "bg-slate-100 text-slate-600"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className={cn(
                    "font-semibold",
                    selected === option.value ? "text-teal-900" : "text-slate-900"
                  )}>
                    {option.label}
                  </h4>
                  <p className={cn(
                    "text-sm mt-0.5",
                    selected === option.value ? "text-teal-700" : "text-slate-500"
                  )}>
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Download link card component
 */
export function DownloadLinkCard({ download }) {
  if (!download) return null;

  const { url, filename, expires_at, expires_in } = download;

  const handleDownload = () => {
    // Use the full URL including the base API path
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    window.open(`${baseUrl}${url}`, '_blank');
  };

  return (
    <div className="bg-teal-50 rounded-xl border border-teal-200 p-4">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-6 h-6 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-teal-900">{filename}</h4>
          <div className="flex items-center gap-2 mt-1 text-sm text-teal-700">
            <Clock className="w-3.5 h-3.5" />
            <span>Expires in {expires_in || '1 hour'}</span>
          </div>
        </div>
        <Button
          onClick={handleDownload}
          size="sm"
          className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
        >
          <Download className="w-4 h-4" />
          Download
        </Button>
      </div>
    </div>
  );
}
