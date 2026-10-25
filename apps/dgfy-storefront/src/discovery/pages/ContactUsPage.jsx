import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DISCOVERY_NAV_ITEMS, DiscoveryHeader, getDiscoveryViewportState } from '../../Components/store/DiscoveryResponsiveLayout.jsx';
import { useStorefrontStore } from '../../store/useStorefrontStore.js';
import { useDiscoveryHeaderAccount } from '../hooks/useDiscoveryHeaderAccount.js';
import { useDiscoveryNavActions } from '../hooks/useDiscoveryNavActions.js';
import { DiscoveryFooter } from '../components/DiscoveryFooter.jsx';
import { getPublicStorefrontSupportContact } from '../../services/supportContactService.js';
import './ContactUsPage.css';

const DISCOVERY_LOGO_SRC = '/dgfy-logo.png';
const CONTACT_FORM_URL = 'https://pin4ms.bblabs.dev/f/dgfy-gateway-1';
const CONTACT_FORM_EMBED_URL = `${CONTACT_FORM_URL}?embed=1`;
const CONTACT_FORM_EMBED_HEIGHT = 600;

export default function ContactUsPage() {
  const navigate = useNavigate();
  const setActiveDiscoveryNavItem = useStorefrontStore((state) => state.discoverySetActiveNavItem);
  const [viewportMode, setViewportMode] = useState(() => getDiscoveryViewportState(window.innerWidth).viewportMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [supportEmail, setSupportEmail] = useState(null);
  const isMobileViewport = viewportMode === 'mobile';
  const {
    accountIdentityContact,
    accountIdentityInitials,
    accountIdentityName,
    accountIdentityRawEmail,
    handleAccountClick,
    isDgfyCustomerSignedIn
  } = useDiscoveryHeaderAccount();
  const navigateToDiscovery = useCallback(() => navigate('/'), [navigate]);

  useEffect(() => {
    const updateViewportMode = () => {
      setViewportMode(getDiscoveryViewportState(window.innerWidth).viewportMode);
    };

    window.addEventListener('resize', updateViewportMode);
    return () => window.removeEventListener('resize', updateViewportMode);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    getPublicStorefrontSupportContact()
      .then(({ email }) => {
        if (isCurrent) setSupportEmail(email);
      })
      .catch(() => {
        if (isCurrent) setSupportEmail(null);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const handleLogoClick = useCallback(() => {
    setMenuOpen(false);
    setActiveDiscoveryNavItem('Explore');
    navigateToDiscovery();
  }, [navigateToDiscovery, setActiveDiscoveryNavItem]);
  const {
    handleDiscoveryMenuToggle,
    handleDiscoveryNavItemClick
  } = useDiscoveryNavActions({
    isDiscoveryMobileViewport: isMobileViewport,
    onNavigateToDiscovery: navigateToDiscovery,
    setActiveDiscoveryNavItem,
    setIsDiscoveryNavMenuOpen: setMenuOpen
  });

  return (
    <div className="contact-us-page">
      <div className="contact-us-page__header-shell">
        <DiscoveryHeader
          viewportMode={viewportMode}
          logoSrc={DISCOVERY_LOGO_SRC}
          onLogoClick={handleLogoClick}
          navItems={DISCOVERY_NAV_ITEMS}
          activeItem="Contact Us"
          isAuthenticated={isDgfyCustomerSignedIn}
          accountLabel="My Account"
          accountName={accountIdentityName}
          accountInitials={accountIdentityInitials}
          accountSubtitle={accountIdentityRawEmail || accountIdentityContact}
          authLabel="Log in / Sign up"
          menuOpen={menuOpen}
          onMenuToggle={handleDiscoveryMenuToggle}
          onItemClick={handleDiscoveryNavItemClick}
          onAuthClick={() => {
            setMenuOpen(false);
            handleAccountClick();
          }}
        />
      </div>

      <main id="main-content" className="contact-us-page__main">
        <div className="contact-us-page__content">
          <div className="contact-us-page__eyebrow">DGFY · CONTACT</div>
          <h1 className="contact-us-page__title">Contact Us</h1>
          <p className="contact-us-page__intro">
            For general questions or business inquiries, use the form below.
          </p>

          <section className="contact-us-page__support-section" aria-labelledby="contact-us-support-title">
            <div className="contact-us-page__support-copy">
              <h2 id="contact-us-support-title">Need help with the DGFY Storefront app?</h2>
              <p>
                Report an app problem, share feedback, or request a feature.
                {supportEmail ? ' You can email our support team directly at ' : ' A support email is not yet available. Use the inquiry form below to reach us.'}
                {supportEmail && (
                  <a className="contact-us-page__support-link" href={`mailto:${supportEmail}`}>
                    {supportEmail}
                  </a>
                )}
              </p>
            </div>
          </section>

          <section className="contact-us-page__form-section" aria-label="Contact inquiry form">
            <div className="contact-us-page__embed-frame-wrap">
              <iframe
                className="contact-us-page__embed-frame"
                src={CONTACT_FORM_EMBED_URL}
                title="DGFY contact inquiry form"
                width="100%"
                height={CONTACT_FORM_EMBED_HEIGHT}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <p className="contact-us-page__embed-fallback">
              If the form doesn’t load,{' '}
              <a href={CONTACT_FORM_URL} target="_blank" rel="noopener noreferrer">
                open the form in a new tab
              </a>.
            </p>
          </section>
        </div>
      </main>

      <DiscoveryFooter
        dgfyHeaderLogo={DISCOVERY_LOGO_SRC}
        isMobileViewport={isMobileViewport}
        anchorId="contact-us-footer"
      />
    </div>
  );
}
