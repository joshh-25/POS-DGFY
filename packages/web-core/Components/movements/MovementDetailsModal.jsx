import React from 'react';
import { format } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import {
    Package,
    Calendar,
    User,
    FileText,
    MapPin,
    Hash,
    Clock,
    Layers,
    ExternalLink,
    Ban,
    X
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { getMovementConfig, isPositiveMovement, lossReasons } from '../utils/movementConfig.js';
import { formatNumber } from '../../src/lib/numberUtils.js';
import { Link } from 'react-router-dom';
// utils.js stays IMS-only (apps/dgfy-ims root) -- '@' resolves per-app (see each
// vite.config.js), unlike a hardcoded relative path, which breaks once this file's
// on-disk depth relative to apps/dgfy-ims differs (e.g. Docker's flattened /app layout).
import { createPageUrl } from '@/utils.js';

export default function MovementDetailsModal({ movement, open, onClose, onVoid }) {
    if (!movement) return null;

    const config = getMovementConfig(movement.movement_type);
    const Icon = config.icon;
    const isPositive = isPositiveMovement(movement.movement_type);

    const itemName = movement.item?.name || movement.item_name || 'Unknown Item';
    const itemSku = movement.item?.sku_code || movement.sku_code || '';
    const itemUnit = movement.item?.unit_of_measure || movement.unit_of_measure || '';
    const itemId = movement.item?.item_id || movement.item_id;

    const userName = movement.userResponsible?.full_name || movement.userResponsible?.username || 'System';

    const batchId = movement.batch?.batch_id || movement.batch_id;
    const batchExpiry = movement.batch?.expiry_date || movement.expiry_date;

    const movementLocationName = movement.location?.name || movement.location_name || null;
    const sourceLocationName = movement.sourceLocation?.name || movement.source_location_name || movement.from_location || null;
    const destinationLocationName = movement.destinationLocation?.name || movement.destination_location_name || movement.to_location || null;
    const movementLocationId = movement.location_id || movement.location?.location_id || null;
    const sourceLocationId = movement.source_location_id || movement.sourceLocation?.location_id || null;
    const destinationLocationId = movement.destination_location_id || movement.destinationLocation?.location_id || null;

    const lossReasonLabel = movement.loss_reason
        ? lossReasons.find((reason) => reason.value === movement.loss_reason)?.label || movement.loss_reason
        : null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden overflow-y-hidden p-0 sm:w-[calc(100vw-2rem)]">
                <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className={cn("mt-0.5 shrink-0 rounded-xl p-2.5", config.bg)}>
                                <Icon className={cn("h-5 w-5", config.color)} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-600">Stock movement</p>
                                <DialogTitle className="mt-1 truncate text-xl text-slate-950 sm:text-2xl">
                                    {config.label} <span className="font-mono text-sm font-medium text-slate-500">#{movement.movement_id}</span>
                                </DialogTitle>
                                <DialogDescription className="mt-1 text-sm text-slate-500">
                                    See what changed, where, and when.
                                </DialogDescription>
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            onClick={onClose}
                            aria-label="Close movement details"
                            title="Close"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
                    <div className="space-y-5">
                    <div className={cn(
                        "flex items-center justify-between gap-4 rounded-xl border px-4 py-4 sm:px-5 sm:py-5",
                        isPositive
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-red-50 border-red-200"
                    )}>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock change</p>
                            <p className={cn(
                                "mt-1 text-3xl font-bold tracking-tight sm:text-4xl",
                                isPositive ? "text-emerald-600" : "text-red-500"
                            )}>
                                {isPositive ? '+' : '-'}{formatNumber(Math.abs(parseFloat(movement.quantity)), 2)}
                            </p>
                        </div>
                        <Badge className={cn(
                            "shrink-0 border bg-white/70",
                            isPositive ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"
                        )}>
                            {itemUnit || 'units'}
                        </Badge>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="rounded-lg border border-slate-200 bg-white p-2">
                                    <Package className="h-5 w-5 text-slate-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-900">{itemName}</p>
                                    {itemSku && <p className="text-sm text-slate-500">{itemSku}</p>}
                                </div>
                            </div>
                            {itemId && (
                                <Link to={`${createPageUrl("Items")}?item=${itemId}`}>
                                    <Button type="button" variant="outline" size="sm" className="w-full border-slate-300 bg-white text-teal-700 hover:bg-teal-50 hover:text-teal-800 sm:w-auto" aria-label="Open item in Catalog Editor">
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        View item
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <div>
                                <p className="text-xs uppercase tracking-wide text-slate-500">Date and time</p>
                                <p className="text-sm font-medium text-slate-900">
                                    {format(new Date(movement.timestamp || movement.created_at), 'MMM d, yyyy')}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {format(new Date(movement.timestamp || movement.created_at), 'h:mm a')}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <div>
                                <p className="text-xs uppercase tracking-wide text-slate-500">Recorded by</p>
                                <p className="text-sm font-medium text-slate-900">{userName}</p>
                            </div>
                        </div>

                        {movement.reference_id && (
                            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                <Hash className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Reference</p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="bg-slate-50 font-mono text-xs">
                                            {movement.reference_id}
                                        </Badge>
                                        {movement.reference_type && (
                                            <span className="text-xs text-slate-400">({movement.reference_type})</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {batchId && (
                            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">FIFO batch</p>
                                    <p className="text-sm font-medium text-slate-900">Batch #{batchId}</p>
                                    {batchExpiry && (
                                        <p className="text-xs text-slate-500">
                                            Expires: {format(new Date(batchExpiry), 'MMM d, yyyy')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {(movementLocationName || sourceLocationName || destinationLocationName || movementLocationId || sourceLocationId || destinationLocationId) && (
                            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
                                    {movement.movement_type === 'transfer' ? (
                                        <p className="text-sm font-medium text-slate-900">
                                            {sourceLocationName || (sourceLocationId ? `#${sourceLocationId}` : 'N/A')} {'->'} {destinationLocationName || (destinationLocationId ? `#${destinationLocationId}` : 'N/A')}
                                        </p>
                                    ) : (
                                        <p className="text-sm font-medium text-slate-900">
                                            {movementLocationName || (movementLocationId ? `#${movementLocationId}` : 'N/A')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {lossReasonLabel && (
                            <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50/60 p-3">
                                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Loss reason</p>
                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                        {lossReasonLabel}
                                    </Badge>
                                </div>
                            </div>
                        )}
                    </div>

                    {movement.notes && (
                        <>
                            <Separator />
                            <div className="flex items-start gap-3">
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                <div className="flex-1">
                                    <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Notes</p>
                                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                        {movement.notes}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                    </div>
                </div>

                <div className="flex shrink-0 flex-col-reverse justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-4 py-4 sm:flex-row sm:px-6">
                    {onVoid && movement.reference_type !== 'VOID' && !movement.notes?.includes('Voided by') && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() => onVoid(movement)}
                            className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border-red-200"
                        >
                            <Ban className="w-4 h-4 mr-2" />
                            Void stock movement
                        </Button>
                    )}
                    <Button type="button" variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
