// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessAdminAccountMenu from '../BusinessAdminAccountMenu.jsx';

const logoutMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../packages/web-core/src/services/authService.js', () => ({
    logout: logoutMock
}));

const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
};

const renderMenu = () => render(
    <MemoryRouter>
        <BusinessAdminAccountMenu
            user={{ username: 'pat@example.test' }}
            business={{ name: 'DGFY Demo' }}
        />
        <LocationProbe />
    </MemoryRouter>
);

describe('BusinessAdminAccountMenu', () => {
    afterEach(() => cleanup());

    beforeEach(() => {
        vi.clearAllMocks();
        logoutMock.mockResolvedValue(undefined);
    });

    it('shows the authenticated user and business, and links to business selection', async () => {
        renderMenu();

        fireEvent.click(screen.getByRole('button', { name: 'Account: pat@example.test' }));

        expect(await screen.findByText('Logged in as pat@example.test at DGFY Demo')).toBeTruthy();
        fireEvent.click(screen.getByText('Switch business'));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/dgfy/companies'));
        expect(logoutMock).not.toHaveBeenCalled();
    });

    it('clears the OPIS session and redirects to its sign-in route on logout', async () => {
        renderMenu();

        fireEvent.click(screen.getByRole('button', { name: 'Account: pat@example.test' }));
        fireEvent.click(await screen.findByText('Logout'));

        await waitFor(() => expect(logoutMock).toHaveBeenCalledWith({ redirectTo: '/dgfy/auth' }));
    });
});
