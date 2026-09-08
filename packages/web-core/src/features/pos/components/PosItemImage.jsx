import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getPendingPosItemImagePreviews, subscribeToPendingPosItemImagePreviews } from '../services/posPendingItemImagePreviewStore.js';
import { acquirePosImagePreview } from '../services/posImagePreview.js';
import { resolvePosCatalogImageSources } from '../utils/posCheckoutTerminalUtils.js';
import { getBrowserSessionSnapshot } from '../../../services/browserSession.js';

// A bounded, in-memory per-version budget survives card navigation, not logout.
const failures = new Map();
if (typeof window !== 'undefined') {
  ['auth:logout', 'auth:session-expired', 'auth:session-updated'].forEach((event) => {
    window.addEventListener(event, () => failures.clear());
  });
}

export default React.memo(function PosItemImage({ item, className, style, ...props }) {
  const previews = useSyncExternalStore(subscribeToPendingPosItemImagePreviews, getPendingPosItemImagePreviews, getPendingPosItemImagePreviews);
  const pending = previews[String(item.item_id)];
  const sources = resolvePosCatalogImageSources(item);
  const target = pending?.readyUrl || pending?.url || sources.src;
  const [loaded, setLoaded] = useState('');
  const loadedScope = useRef('');
  const session = getBrowserSessionSnapshot();
  const scope = `${session.companyToken}:${session.generation}`;
  const [failed, setFailed] = useState('');
  const [retry, setRetry] = useState(0);
  const leases = useRef(new Map());
  const currentTarget = useRef(target);
  currentTarget.current = target;

  useEffect(() => {
    if (pending?.file && !leases.current.has(pending.file)) {
      const lease = acquirePosImagePreview(pending.file);
      lease.promise.catch(() => {});
      leases.current.set(pending.file, lease);
    }
  }, [pending?.file]);
  useEffect(() => () => {
    leases.current.forEach((lease) => lease.release());
    leases.current.clear();
  }, []);
  useEffect(() => {
    if (failed !== target || !target) return undefined;
    const count = failures.get(target) || 0;
    if (count > 3) return undefined;
    const timer = setTimeout(() => { setFailed(''); setRetry((value) => value + 1); }, 1000 * (2 ** Math.max(0, count - 1)));
    return () => clearTimeout(timer);
  }, [failed, target]);

  const unavailable = failed === target || (failures.get(target) || 0) > 3;
  const displayed = (loadedScope.current === scope ? loaded : '') || (pending?.readyUrl ? pending?.url : '') || '';
  return <>
    {displayed && displayed !== target ? <img {...props} src={displayed} className={className} style={style} width={144} height={144} decoding="async" /> : null}
    {target && !unavailable ? <img
      {...props}
      key={`${target}:${retry}`}
      src={target}
      width={144}
      height={144}
      decoding="async"
      className={className}
      style={{ ...style, ...(displayed && displayed !== target ? { position: 'absolute', inset: 0, opacity: 0 } : {}) }}
      onLoad={() => {
        if (currentTarget.current !== target) return;
        loadedScope.current = scope;
        setLoaded(target);
        setFailed('');
        failures.delete(target);
        leases.current.forEach((lease, file) => {
          if (!pending?.file || file !== pending.file || target === pending.readyUrl) {
            lease.release();
            leases.current.delete(file);
          }
        });
      }}
      onError={() => {
        if (currentTarget.current !== target) return;
        failures.set(target, (failures.get(target) || 0) + 1);
        if (failures.size > 256) failures.delete(failures.keys().next().value);
        setFailed(target);
      }}
    /> : null}
    {unavailable ? <button type="button" className="absolute bottom-0 left-0 z-10 rounded bg-white/95 px-1 text-[10px] text-blue-700" onClick={(event) => {
      event.stopPropagation(); failures.delete(target); setFailed(''); setRetry((value) => value + 1);
    }}>Retry image</button> : null}
    {pending?.status === 'failed' ? <span className="absolute bottom-0 right-0 z-10 rounded bg-white/95 px-1 text-[10px] text-slate-700" role="status">
      Upload failed; edit to retry
    </span> : null}
  </>;
});
