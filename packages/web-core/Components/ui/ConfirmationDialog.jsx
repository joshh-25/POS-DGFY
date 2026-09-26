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

const ConfirmationDialog = ({
  open,
  onOpenChange,
  title = "Unsaved Changes",
  message = "You have unsaved changes. Would you like to save them as a draft?",
  onSaveDraft,
  onDiscard,
  onContinueEditing,
  saveDraftLabel = "Save as Draft",
  discardLabel = "Discard Changes",
  continueEditingLabel = "Continue Editing",
  className,
  compact = false
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className || "sm:max-w-md"}>
        <DialogHeader className={compact ? "border-b border-slate-100 p-4 pb-3" : undefined}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className={compact ? "flex-col gap-2 border-t border-slate-100 p-4 pt-3 sm:flex-row" : "flex-col gap-2 sm:flex-row"}>
          <Button
            variant="outline"
            onClick={() => {
              onContinueEditing?.();
              onOpenChange(false);
            }}
          >
            {continueEditingLabel}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onDiscard?.();
              onOpenChange(false);
            }}
          >
            {discardLabel}
          </Button>
          <Button
            onClick={() => {
              onSaveDraft?.();
              onOpenChange(false);
            }}
          >
            {saveDraftLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmationDialog;
