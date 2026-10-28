import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchOidcInteractionError, validateOidcRestartUrl } from './oidcInteractionService.js';

export default function StorefrontOidcErrorPage() {
  const { id = '' } = useParams();
  const [record, setRecord] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOidcInteractionError(id)
      .then((data) => { if (!cancelled) setRecord(data); })
      .catch(() => { if (!cancelled) setRecord(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [id]);

  const restartUrl = validateOidcRestartUrl(record?.restart_url);
  const message = record?.message || 'This sign-in request expired or could not be completed. Start again from DGLaundry.';
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10 sm:px-6">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#1A4E8D]">DGFY account</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Sign-in needs to restart</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600" role="status">{loaded ? message : 'Loading sign-in details…'}</p>
        {restartUrl ? (
          <a className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#1A4E8D] px-5 text-sm font-bold text-white" href={restartUrl}>Return to DGLaundry</a>
        ) : (
          <Link className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#1A4E8D] px-5 text-sm font-bold text-white" to="/">Go to DGFY</Link>
        )}
      </section>
    </main>
  );
}
