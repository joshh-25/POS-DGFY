import React from 'react';
import { ArrowLeft, Home, MapPinOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function NotFoundPage({
  title = 'Page not found',
  description = 'The page you requested does not exist or is no longer available.',
  homeTo = '/',
  homeLabel = 'Back to dashboard'
}) {
  const navigate = useNavigate();
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <MapPinOff className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.2em] text-blue-700">404</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {canGoBack ? (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go back
            </button>
          ) : null}
          <Link
            to={homeTo}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            {homeLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
