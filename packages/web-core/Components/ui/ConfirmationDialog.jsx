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
  continueEditingLabel = "Continue Editing"
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
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
