import React from 'react';
import { Link } from 'react-router-dom';
import { resolveStorefrontHomeUrl } from '../../dgfyRouteHelpers.js';
import bgModals from '../../../assets/dgfy/bg-modals.webp';
import dgfyLogo from '../../../assets/dgfy/dgfy-logo.png';

const BUSINESS_REGISTRATION_ENTRY = '/register-company?source=dgfy&auth=login#business-registration';
const storefrontHomeUrl = resolveStorefrontHomeUrl();

// `homeHref` / `businessRegistrationTo` default to the skupervisor targets this hero
// has always used. The storefront copy of the auth pages hosts both destinations
// same-origin (`/` and `/business/grow`) and overrides them.
export default function DgfyAuthHero({
  homeHref = storefrontHomeUrl,
  businessRegistrationTo = BUSINESS_REGISTRATION_ENTRY,
  showRegistrationCard = true
}) {
  return (
    <aside
      className="relative flex h-full w-full min-h-screen flex-col overflow-hidden"
      style={{
        backgroundImage: `url("${bgModals}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Content Container */}
      <div className="relative z-10 flex h-full flex-col justify-between p-10 lg:p-14">
        {/* Logo */}
        <div className="flex flex-shrink-0 items-center">
          <a href={homeHref} aria-label="Back to DGFY storefront">
            <img src={dgfyLogo} alt="DGFY" className="h-10 w-auto object-contain" />
          </a>
        </div>

        {showRegistrationCard ? (
          <div
            className="mt-auto flex flex-col gap-4 rounded-3xl border border-white/20 p-8 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:gap-6"
            style={{ background: 'rgba(255, 255, 255, 0.9)' }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xl font-black leading-tight tracking-tight text-[#0F172A]">
                Register your business<br />with your DGFY account
              </p>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#475569]">
                Use your existing DGFY account to<br />create and manage your business profile.
              </p>
            </div>
            <Link
              to={businessRegistrationTo}
              className="flex-shrink-0 rounded-2xl px-6 py-3.5 text-sm font-bold shadow-lg shadow-blue-900/20 transition-all hover:scale-105 hover:bg-[#0F172A] hover:shadow-blue-900/30"
              style={{ background: '#1A4E8D', color: '#FFFFFF', whiteSpace: 'nowrap' }}
            >
              Register Business
            </Link>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
