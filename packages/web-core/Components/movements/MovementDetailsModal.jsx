import React from 'react';
import { format } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
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
    Ban
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
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", config.bg)}>
                            <Icon className={cn("w-5 h-5", config.color)} />
                        </div>
                        <div>
                            <span className="text-lg">{config.label}</span>
                            <span className="text-sm text-slate-500 ml-2">
                                #{movement.movement_id}
                            </span>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className={cn(
                        "text-center py-6 rounded-xl border-2",
                        isPositive
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-red-50 border-red-200"
                    )}>
                        <p className={cn(
                            "text-4xl font-bold",
                            isPositive ? "text-emerald-600" : "text-red-500"
                        )}>
                            {isPositive ? '+' : '-'}{formatNumber(Math.abs(parseFloat(movement.quantity)), 2)}
                        </p>
                        <p className="text-slate-500 text-sm mt-1">{itemUnit}</p>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-lg border border-slate-200">
                                    <Package className="w-5 h-5 text-slate-600" />
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-900">{itemName}</p>
                                    <p className="text-sm text-slate-500">{itemSku}</p>
                                </div>
                            </div>
                            {itemId && (
                                <Link to={`${createPageUrl("Items")}?item=${itemId}`}>
                                    <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-700">
                                        <ExternalLink className="w-4 h-4" />
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-start gap-3">
                            <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Date & Time</p>
                                <p className="text-sm font-medium text-slate-900">
                                    {format(new Date(movement.timestamp || movement.created_at), 'MMM d, yyyy')}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {format(new Date(movement.timestamp || movement.created_at), 'h:mm a')}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <User className="w-4 h-4 text-slate-400 mt-0.5" />
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Recorded By</p>
                                <p className="text-sm font-medium text-slate-900">{userName}</p>
                            </div>
                        </div>

                        {movement.reference_id && (
                            <div className="flex items-start gap-3">
                                <Hash className="w-4 h-4 text-slate-400 mt-0.5" />
                                <div>
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Reference</p>
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
                            <div className="flex items-start gap-3">
                                <Layers className="w-4 h-4 text-slate-400 mt-0.5" />
                                <div>
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">FIFO Batch</p>
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
                            <div className="flex items-start gap-3">
                                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                                <div>
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Location</p>
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
                            <div className="flex items-start gap-3">
                                <Clock className="w-4 h-4 text-red-400 mt-0.5" />
                                <div>
                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Loss Reason</p>
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
                                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Notes</p>
                                    <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-200">
                                        {movement.notes}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end pt-4 border-t gap-2">
                    {onVoid && movement.reference_type !== 'VOID' && !movement.notes?.includes('Voided by') && (
                        <Button
                            variant="destructive"
                            onClick={() => onVoid(movement)}
                            className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border-red-200"
                        >
                            <Ban className="w-4 h-4 mr-2" />
                            Void Movement
                        </Button>
                    )}
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
