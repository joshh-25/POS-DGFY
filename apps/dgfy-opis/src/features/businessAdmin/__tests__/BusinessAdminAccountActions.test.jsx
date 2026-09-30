// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessAdminAccountActions from '../BusinessAdminAccountActions.jsx';

const logoutMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../packages/web-core/src/services/authService.js', () => ({
    logout: logoutMock
}));

const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
};

const renderActions = (sidebarCollapsed = false) => render(
    <MemoryRouter>
        <BusinessAdminAccountActions sidebarCollapsed={sidebarCollapsed} />
        <LocationProbe />
    </MemoryRouter>
);

describe('BusinessAdminAccountActions', () => {
    afterEach(() => cleanup());

    beforeEach(() => {
        vi.clearAllMocks();
        logoutMock.mockResolvedValue(undefined);
    });

    it('shows direct Switch business and Logout actions in the sidebar', () => {
        renderActions();

        expect(screen.getByRole('link', { name: 'Switch business' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Logout' })).toBeTruthy();
    });

    it('links to business selection without logging out', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('link', { name: 'Switch business' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/dgfy/companies'));
        expect(logoutMock).not.toHaveBeenCalled();
    });

    it('clears the OPIS session and redirects to its sign-in route on logout', async () => {
        renderActions();

        fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
        await waitFor(() => expect(logoutMock).toHaveBeenCalledWith({ redirectTo: '/dgfy/auth' }));
    });

    it('keeps action labels available as tooltips when the sidebar is collapsed', () => {
        renderActions(true);

        expect(screen.getByRole('link', { name: 'Switch business' }).getAttribute('title')).toBe('Switch business');
        expect(screen.getByRole('button', { name: 'Logout' }).getAttribute('title')).toBe('Logout');
    });
});
