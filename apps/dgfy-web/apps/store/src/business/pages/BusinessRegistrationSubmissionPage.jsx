import React from 'react';
import { Check, ClipboardCheck, LayoutDashboard, Mail } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { resolveSkupervisorUrl } from '../../auth/storefrontSkupervisorLink.js';
import { buildCustomerDashboardOverviewPath } from '../model/businessRegistrationSubmission.js';

export function BusinessRegistrationSubmissionPage() {
  const [searchParams] = useSearchParams();
  const applicationId = String(searchParams.get('application_id') || '').trim();
  const statusUrl = applicationId
    ? resolveSkupervisorUrl(`/register-company/status/${encodeURIComponent(applicationId)}`)
    : '';

  return (
    <main className="min-h-screen bg-[#f6fbff] px-4 py-6 text-[#10233f] sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl items-center justify-center sm:min-h-[calc(100vh-5rem)]">
        <section
          aria-labelledby="business-registration-submission-title"
          className="w-full rounded-3xl border border-[#d7e8ef] bg-white px-5 py-7 text-center shadow-[0_14px_36px_rgba(16,35,63,0.07)] sm:px-10 sm:py-10"
        >
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#edf9f2] text-[#16a34a] ring-8 ring-[#f7fcf9] sm:h-[88px] sm:w-[88px]">
            <Check size={38} strokeWidth={2.5} aria-hidden="true" />
          </div>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.2em] text-[#1f5f9f] sm:text-xs">DGFY Business Registration</p>
          <h1 id="business-registration-submission-title" className="mt-3 text-[28px] font-bold leading-tight sm:text-4xl">
            Registration submitted!
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#667085] sm:text-base">
            Thanks! We&apos;ve received your business registration and it&apos;s now under review.
          </p>
          <p className="mt-2 text-sm leading-6 text-[#667085] sm:text-base">
            We&apos;ll email you when your business is approved.
          </p>

          <div className="mx-auto mt-7 max-w-lg rounded-2xl border border-[#cfe7f2] bg-[#f1faff] p-4 text-left sm:mt-8 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d9f3ff] text-[#1f5f9f]" aria-hidden="true">
                <Mail size={19} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#10233f] sm:text-base">We&apos;ll notify you by email</h2>
                <p className="mt-1 text-xs leading-5 text-[#667085] sm:text-sm">
                  Check your inbox (and spam folder) for updates.
                </p>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-7 grid w-full max-w-lg grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:mt-8">
            {statusUrl ? (
              <a
                href={statusUrl}
                aria-label="View Registration Status"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1f5f9f] px-4 text-sm font-bold text-white transition-colors duration-200 hover:bg-[#174978] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5f9f] focus-visible:ring-offset-2"
              >
                <ClipboardCheck size={17} aria-hidden="true" />
                View Status
              </a>
            ) : null}
            <Link
              to={buildCustomerDashboardOverviewPath()}
              aria-label="Go to Customer Dashboard"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#1f5f9f] bg-white px-4 text-sm font-bold text-[#1f5f9f] transition-colors duration-200 hover:bg-[#f3f8fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5f9f] focus-visible:ring-offset-2"
            >
              <LayoutDashboard size={17} aria-hidden="true" />
              Go to Dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default BusinessRegistrationSubmissionPage;
