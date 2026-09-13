import React from 'react';
import { Camera, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  fetchOrderPackingEvidenceImage,
  fetchOrderPackingEvidenceList,
  uploadOrderPackingEvidence
} from '../services/posService.js';

const MAX_IMAGES = 6;

const revokeImages = (images) => {
  images.forEach((image) => {
    if (image?.url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(image.url);
    }
  });
};

export default function PackingEvidenceControl({
  order,
  canTransactPos = false,
  canViewPos = false,
  locked = false,
  isOnline = true
}) {
  const packed = Boolean(order?.packed_at) || order?.fulfillment_status === 'packed';
  const orderId = order?.pos_transaction_id;
  const [count, setCount] = React.useState(() => Number(order?.packing_evidence_count) || 0);
  const [uploading, setUploading] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [loadingViewer, setLoadingViewer] = React.useState(false);
  const [images, setImages] = React.useState([]);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    setCount(Number(order?.packing_evidence_count) || 0);
  }, [order?.packing_evidence_count]);

  React.useEffect(() => () => revokeImages(images), [images]);

  if (!packed || !orderId) return null;

  const remaining = Math.max(0, MAX_IMAGES - count);
  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0 || uploading) return;
    if (remaining <= 0) {
      toast.error(`This order already has the maximum of ${MAX_IMAGES} evidence images.`);
      return;
    }
    if (files.length > remaining) {
      toast.warning(`Only ${remaining} more evidence image${remaining === 1 ? '' : 's'} can be attached.`);
    }

    setUploading(true);
    try {
      const result = await uploadOrderPackingEvidence(orderId, files.slice(0, remaining));
      setCount(Number(result?.total_count) || count + files.slice(0, remaining).length);
      toast.success('Packing evidence attached.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Packing evidence could not be attached.');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleViewer = async () => {
    if (viewerOpen) {
      setViewerOpen(false);
      return;
    }
    setLoadingViewer(true);
    const loadedImages = [];
    try {
      const payload = await fetchOrderPackingEvidenceList(orderId);
      const metadata = Array.isArray(payload?.images) ? payload.images : [];
      for (const image of metadata) {
        loadedImages.push({
          ...image,
          url: await fetchOrderPackingEvidenceImage(orderId, image.image_id)
        });
      }
      revokeImages(images);
      setImages(loadedImages);
      setCount(Number(payload?.total_count) || loadedImages.length);
      setViewerOpen(true);
    } catch (error) {
      revokeImages(loadedImages);
      toast.error(error?.response?.data?.message || 'Packing evidence could not be loaded.');
    } finally {
      setLoadingViewer(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/70 p-2.5" data-testid={`packing-evidence-${orderId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-700">Packing evidence: {count} / {MAX_IMAGES}</p>
          <p className="text-[11px] text-slate-500">Optional — attach zero or more photos after packing.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {canTransactPos && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                aria-label="Select packing evidence images"
                disabled={locked || !isOnline || uploading || remaining === 0}
                onChange={handleFileChange}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={locked || !isOnline || uploading || remaining === 0}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-1.5 h-3.5 w-3.5" />}
                Attach evidence photos
              </Button>
            </>
          )}
          {canViewPos && count > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loadingViewer}
              onClick={handleToggleViewer}
            >
              {loadingViewer ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : viewerOpen ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              {viewerOpen ? 'Hide evidence photos' : 'View evidence photos'}
            </Button>
          )}
        </div>
      </div>
      {viewerOpen && (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Packing evidence photos">
          {images.map((image, index) => (
            <img
              key={image.image_id}
              src={image.url}
              alt={`Packing evidence ${index + 1}`}
              className="aspect-square w-full rounded border border-slate-200 object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
