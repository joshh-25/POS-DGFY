import React, { useId } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';

export default function TenantActionDialog({
    open,
    onOpenChange,
    title,
    description,
    children,
    submitLabel,
    onSubmit,
    submitting = false,
    submitDisabled = false,
    destructive = false
}) {
    const titleId = useId();
    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            if (!submitting) onOpenChange(nextOpen);
        }}>
            <DialogContent aria-labelledby={titleId}>
                <form onSubmit={(event) => {
                    event.preventDefault();
                    void onSubmit(event);
                }}>
                    <DialogHeader>
                        <DialogTitle id={titleId}>{title}</DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 px-6 py-4">{children}</div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant={destructive ? 'destructive' : 'default'}
                            disabled={submitting || submitDisabled}
                        >
                            {submitting ? 'Working...' : submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
