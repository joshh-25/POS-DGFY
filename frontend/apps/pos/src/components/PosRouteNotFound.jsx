import React from 'react';
import { Link } from 'react-router-dom';

export default function PosRouteNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#1A4E8D]">DGFY POS</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Route not available</h1>
        <p className="mt-2 text-sm text-slate-600">
          This standalone POS app serves the DGFY terminal. Sales reports open in SKUpervisor.
        </p>
        <Link
          to="/terminal"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-[#1A4E8D] px-5 text-sm font-bold text-white hover:bg-[#143F73]"
        >
          Open POS Terminal
        </Link>
      </section>
    </main>
  );
}
