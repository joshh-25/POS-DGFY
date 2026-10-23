import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { withApiOrigin } from '../../app/runtime/storefrontRuntime.js';

export default function ExternalRedirectPage() {
  const { slug = '' } = useParams();
  const redirectEndpoint = withApiOrigin(`/api/v1/storefront/discovery/external/redirect/${encodeURIComponent(slug)}`);

  useEffect(() => {
    window.location.replace(redirectEndpoint);
  }, [redirectEndpoint]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', padding: 24 }}>
      <section style={{ maxWidth: 420, textAlign: 'center', color: '#0f172a' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Opening partner site…</h1>
        <p style={{ color: '#475569' }}>DGFY is finding the current destination for this listing.</p>
        <p><a href={redirectEndpoint} style={{ color: '#1a4e8d', fontWeight: 700 }}>Continue to partner</a></p>
        <a href="/" style={{ color: '#1a4e8d', fontWeight: 700 }}>Back to map</a>
      </section>
    </main>
  );
}
