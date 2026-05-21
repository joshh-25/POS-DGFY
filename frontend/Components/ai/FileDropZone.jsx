import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileSpreadsheet,
  X,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * File drop zone for CSV import
 */
export default function FileDropZone({
  onFileSelect,
  onTextPaste,
  accept = '.csv',
  maxSize = 5 * 1024 * 1024, // 5MB default
  disabled = false
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');

  const fileInputRef = useRef(null);
  const textAreaRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const droppedFile = e.dataTransfer.files[0];
    processFile(droppedFile);
  }, [disabled]);

  const handleFileInput = (e) => {
    const selectedFile = e.target.files[0];
    processFile(selectedFile);
  };

  const processFile = async (selectedFile) => {
    setError(null);

    if (!selectedFile) {
      return;
    }

    // Check file type
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    // Check file size
    if (selectedFile.size > maxSize) {
      setError(`File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }

    setFile(selectedFile);

    // Read file content
    try {
      const content = await readFileContent(selectedFile);
      onFileSelect?.(content, selectedFile.name);
    } catch (err) {
      setError('Failed to read file');
    }
  };

  const readFileContent = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handlePasteSubmit = () => {
    if (pastedText.trim()) {
      onTextPaste?.(pastedText.trim());
    }
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const togglePasteMode = () => {
    setPasteMode(!pasteMode);
    setPastedText('');
    setError(null);
    setFile(null);
  };

  if (pasteMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Paste CSV Data</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePasteMode}
            className="text-slate-500"
          >
            Use File Upload
          </Button>
        </div>

        <textarea
          ref={textAreaRef}
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder="Paste your CSV data here...&#10;&#10;Example:&#10;sku_code,name,category,max_capacity,unit_of_measure&#10;SKU-001,Widget A,raw_material,100,pcs"
          className="w-full h-48 p-3 text-sm font-mono border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
          disabled={disabled}
        />

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={togglePasteMode}
            disabled={disabled}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handlePasteSubmit}
            disabled={!pastedText.trim() || disabled}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            Parse CSV
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
          isDragging
            ? "border-teal-500 bg-teal-50"
            : file
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />

        {file ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-emerald-900">{file.name}</p>
              <p className="text-sm text-emerald-600">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="text-slate-500 hover:text-slate-700 gap-1"
            >
              <X className="w-4 h-4" />
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center",
              isDragging ? "bg-teal-100" : "bg-slate-100"
            )}>
              <Upload className={cn(
                "w-6 h-6",
                isDragging ? "text-teal-600" : "text-slate-400"
              )} />
            </div>
            <div>
              <p className="font-medium text-slate-700">
                {isDragging ? 'Drop file here' : 'Drag & drop a CSV file'}
              </p>
              <p className="text-sm text-slate-500">
                or click to browse
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Paste Alternative */}
      <div className="flex items-center justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={togglePasteMode}
          disabled={disabled}
          className="text-slate-500"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Or paste CSV text
        </Button>
      </div>
    </div>
  );
}
