// @vitest-environment jsdom

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BusinessRegistrationSubmissionPage from '../business/pages/BusinessRegistrationSubmissionPage.jsx';

describe('BusinessRegistrationSubmissionPage', () => {
  afterEach(() => cleanup());

  it('explains the approval handoff and provides status and dashboard actions', () => {
    render(
      <MemoryRouter initialEntries={['/business-registration-submission?application_id=app-42']}>
        <BusinessRegistrationSubmissionPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Registration submitted!' })).toBeTruthy();
    expect(screen.getByText(/now under review/i)).toBeTruthy();
    expect(screen.getByText(/email inbox \(or spam folder\)/i)).toBeTruthy();
    expect(screen.queryByText(/no-reply@dgfy\.com/i)).toBeNull();
    expect(screen.getByRole('link', { name: /view registration status/i }).getAttribute('href'))
      .toContain('/register-company/status/app-42');
    expect(screen.getByRole('link', { name: /go to customer dashboard/i }).getAttribute('href'))
      .toBe('/map-dgfy/account/overview');
  });

  it('keeps the dashboard action available when no application reference is present', () => {
    render(
      <MemoryRouter initialEntries={['/business-registration-submission']}>
        <BusinessRegistrationSubmissionPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /view registration status/i })).toBeNull();
    expect(screen.getByRole('link', { name: /go to customer dashboard/i })).toBeTruthy();
  });
});
