import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { format, addDays } from 'date-fns';

export default function POReceiptModal({ po, open, onClose, onConfirm }) {
  const [items, setItems] = useState(
    po.items.map(item => {
      // Auto-calculate expiry date if item has shelf_life_days
      let calculatedExpiry = null;
      if (item.fifo_enabled && item.shelf_life_days) {
        calculatedExpiry = format(addDays(new Date(), item.shelf_life_days), 'yyyy-MM-dd');
      }
      return {
        ...item,
        quantity_received: item.quantity_received || item.quantity,
        quality_check: item.quality_check || 'pass',
        expiry_date: item.expiry_date || calculatedExpiry || ''
      };
    })
  );
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [notes, setNotes] = useState(po.notes || '');

  const updateItem = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleConfirm = () => {
    // Convert empty strings to 0 for number fields
    const cleanedItems = items.map(item => ({
      ...item,
      quantity_received: item.quantity_received === '' ? 0 : item.quantity_received,
      expiry_date: item.expiry_date || null // Include expiry date
    }));
    const allReceived = cleanedItems.every(item => item.quantity_received === item.quantity);
    const anyReceived = cleanedItems.some(item => item.quantity_received > 0);

    onConfirm({
      items: cleanedItems,
      status: allReceived ? 'received' : (anyReceived ? 'partial' : 'pending'),
      delivery_rating: deliveryRating,
      notes
    });
  };

  const markAllReceived = () => {
    setItems(prev => prev.map(item => ({
      ...item,
      quantity_received: item.quantity,
      quality_check: 'pass'
    })));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Items - {po.po_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4">
            <div>
              <p className="text-sm text-slate-500">Supplier</p>
              <p className="font-semibold text-slate-900">{po.supplier_name}</p>
            </div>
            <Button variant="outline" size="sm" onClick={markAllReceived}>
              Mark All Received
            </Button>
          </div>

          {/* Items */}
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-slate-900">{item.item_name}</span>
                  <Badge variant="outline">Ordered: {item.quantity}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Quantity Received</Label>
                    <Input
                      type="number"
                      min={0}
                      max={item.quantity}
                      value={item.quantity_received}
                      onChange={(e) => updateItem(idx, 'quantity_received', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Quality Check</Label>
                    <Select
                      value={item.quality_check}
                      onValueChange={(v) => updateItem(idx, 'quality_check', v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pass">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                            Pass
                          </div>
                        </SelectItem>
                        <SelectItem value="fail">
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-500" />
                            Fail
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Expiry Date - shown for FIFO-enabled items */}
                {item.fifo_enabled && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <Label className="text-xs font-medium text-blue-700">Expiry Date</Label>
                        {item.shelf_life_days && (
                          <span className="text-xs text-slate-500">
                            (Auto: +{item.shelf_life_days} days)
                          </span>
                        )}
                      </div>
                      <Input
                        type="date"
                        value={item.expiry_date || ''}
                        onChange={(e) => updateItem(idx, 'expiry_date', e.target.value)}
                        className="bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Delivery Rating */}
          <div className="space-y-2">
            <Label>Delivery Rating</Label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setDeliveryRating(star)}
                  className="focus:outline-none"
                >
                  <Star
                    className={cn(
                      "w-8 h-8 transition-colors",
                      star <= deliveryRating ? "text-amber-500" : "text-slate-200"
                    )}
                    fill={star <= deliveryRating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this delivery..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="pt-8">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} className="bg-teal-600 hover:bg-teal-700">
            Confirm Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}