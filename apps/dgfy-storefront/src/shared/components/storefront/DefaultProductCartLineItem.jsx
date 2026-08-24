import { Minus, Package, Plus, Trash2 } from 'lucide-react';

const DEFAULT_BRAND = '#1a4e8d';

/**
 * Default/Retail's own cart line item row. Mirrors
 * modes/simple/checkout/components/SimpleCartLineItem.jsx's functionality, kept as its own
 * file per the "independent trees" pattern rather than importing MSME's component.
 *
 * Layout matches F&B's inline cart line item (FnbCartDrawerContent.jsx) — divider-separated
 * rows, quantity badge on the thumbnail, unified pill quantity stepper — using this mode's own
 * blue brand color for the badge instead of F&B's orange.
 */
export function DefaultProductCartLineItem({
  cartImageErrors,
  isMobileViewport = false,
  isRetailMode = false,
  line,
  money,
  onImageError,
  onRemoveItem,
  onUpdateQuantity,
  withAssetOrigin
}) {
  const quantity = Math.max(1, Number(line.quantity || 1));
  const lineTotal = (Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0);
  const imageSize = isMobileViewport ? 72 : 78;

  return (
    <div style={{ borderBottom: '1px solid #e2e8f0', padding: isMobileViewport ? '2px 0 12px' : '4px 0 14px', display: 'grid', gap: isMobileViewport ? 8 : 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${imageSize}px minmax(0, 1fr)`, gap: isMobileViewport ? 12 : 14, alignItems: 'start' }}>
        <div style={{ position: 'relative', width: imageSize, height: imageSize, borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 6, right: 6, minWidth: 24, height: 24, padding: '0 7px', borderRadius: 999, background: DEFAULT_BRAND, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, boxShadow: '0 8px 18px rgba(26,69,134,0.18)', zIndex: 1 }}>
            {quantity}
          </div>
          {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
            <img
              src={withAssetOrigin(line.image_url)}
              alt={line.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => onImageError(line.item_id)}
            />
          ) : (
            <Package size={isMobileViewport ? 24 : 28} color="#cbd5e1" />
          )}
        </div>
        <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'start', gap: 10 }}>
            <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
              <div style={{ fontSize: isRetailMode && isMobileViewport ? 14 : (isMobileViewport ? 15 : 16), fontWeight: isRetailMode ? 700 : 900, color: '#0f172a', lineHeight: isRetailMode ? 1.2 : 1.15 }}>
                {line.name}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {line.unit_of_measure ? `Per ${line.unit_of_measure}` : 'Per item'}
              </div>
            </div>
            <div style={{ fontSize: isMobileViewport ? 14 : 15, fontWeight: isRetailMode ? 700 : 900, color: '#0f172a', whiteSpace: 'nowrap', alignSelf: 'center' }}>
              {money(lineTotal)}
            </div>
            <button
              type="button"
              aria-label={`Remove ${line.name}`}
              onClick={() => onRemoveItem(line.item_id)}
              style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, alignSelf: 'center' }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: 2 }}>
            <div style={{ display: 'inline-grid', gridTemplateColumns: '32px minmax(24px, auto) 32px', alignItems: 'center', justifyItems: 'center', borderRadius: 999, border: '1px solid #e2e8f0', background: '#ffffff', boxShadow: '0 4px 10px rgba(15,23,42,0.04)', padding: '2px 4px', gap: 4 }}>
              <button
                type="button"
                onClick={() => onUpdateQuantity(line.item_id, Math.max(0, Number(line.quantity || 1) - 1))}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
              >
                <Minus size={14} strokeWidth={2.5} />
              </button>
              <span style={{ minWidth: 24, textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => onUpdateQuantity(line.item_id, Number(line.quantity || 1) + 1)}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
