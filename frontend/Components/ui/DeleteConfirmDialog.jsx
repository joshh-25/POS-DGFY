import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { Loader2 } from 'lucide-react';

export default function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Confirm Deletion",
  description,
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "destructive",
  loading = false,
  errors = null
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
          {errors && errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800 mb-2">
                Cannot delete. The following issues must be resolved:
              </p>
              <ul className="list-disc list-inside space-y-1">
                {errors.map((error, index) => (
                  <li key={index} className="text-sm text-red-700">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} disabled={loading}>
            {cancelText}
          </Button>
          {!errors && (
            <Button
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
              disabled={loading}
              className={
                variant === "destructive"
                  ? "bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  : ""
              }
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {confirmText}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
