import React from 'react';
import { Link, useOutletContext } from 'react-router-dom';

export default function TenantAccessGate() {
    const { tenant, directoryTarget } = useOutletContext();
    const target = {
        ...directoryTarget,
        hash: `#tenant-${encodeURIComponent(tenant.id)}`
    };
    return (
        <section className="space-y-5" aria-labelledby="tenant-access-gate-title">
            <header className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <h2 id="tenant-access-gate-title" className="text-xl font-semibold text-amber-950">Access controls are awaiting verification</h2>
                <p className="mt-2 text-sm leading-6 text-amber-900">The capability controls remain in the tenant directory until the required staging persistence and publication checks are complete and the production capability-read failure is resolved. The cause of that production failure has not been established.</p>
            </header>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Current verification status</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
                    <li>Issue #1923 still requires a live staging toggle, reload persistence, audited confirmation and read-back, plus public discovery and direct-link verification.</li>
                    <li>Issues #2633 and #2639 have merged repair code, but that does not establish deployed behavior.</li>
                    <li>The recorded production sample showed capability reads unavailable; there is no verified root-cause finding or resolution yet.</li>
                </ul>
                <p className="mt-3 text-sm text-slate-600">No access control or audit entry point was moved while these checks remain outstanding.</p>
                <Link to={target} className="mt-4 inline-flex rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Open {tenant.name} in the tenant directory</Link>
            </div>
        </section>
    );
}
