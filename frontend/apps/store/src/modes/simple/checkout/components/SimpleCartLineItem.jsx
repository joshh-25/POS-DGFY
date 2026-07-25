import { Trash2 } from 'lucide-react';

export function SimpleCartLineItem({
  activeOrderMethodLabel,
  cartImageErrors,
  isMobileViewport = false,
  line,
  money,
  onImageError,
  onRemoveItem,
  onUpdateQuantity,
  withAssetOrigin
}) {
  const quantity = Math.max(1, Number(line.quantity || 1));
  const lineTotal = (Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0);

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 22, background: '#fff', boxShadow: '0 12px 28px rgba(15,23,42,.06)', padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
            <img
              src={withAssetOrigin(line.image_url)}
              alt={line.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => onImageError(line.item_id)}
            />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>No image</span>
          )}
        </div>
        <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'start', gap: 10 }}>
            <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
              <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 900, color: '#0f172a', lineHeight: 1.2 }}>
                {line.name}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Unit: {money(line.price)} {line.unit_of_measure ? `- ${line.unit_of_measure}` : ''}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', alignSelf: 'center' }}>
              {money(lineTotal)}
            </div>
            <button
              type="button"
              aria-label={`Remove ${line.name}`}
              onClick={() => onRemoveItem(line.item_id)}
              style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, alignSelf: 'center' }}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>
              {activeOrderMethodLabel}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>
              Qty {quantity}
            </span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
            <button
              type="button"
              onClick={() => onUpdateQuantity(line.item_id, Math.max(0, Number(line.quantity || 1) - 1))}
              style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
            >
              -
            </button>
            <span style={{ minWidth: 14, textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => onUpdateQuantity(line.item_id, Number(line.quantity || 1) + 1)}
              style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
