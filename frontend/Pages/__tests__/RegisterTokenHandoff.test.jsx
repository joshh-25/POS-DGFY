/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const apiMock = vi.hoisted(() => ({
  get: vi.fn()
}));

const registerMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/services/api.js', () => ({
  default: apiMock
}));

vi.mock('../../src/services/authService.js', () => ({
  register: registerMock
}));

import Register from '../Register.jsx';

const renderRegister = (initialEntry = '/register?token=token-autofoods-12345678') => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<div>Login screen</div>} />
    </Routes>
  </MemoryRouter>
);

describe('Register token handoff', () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    registerMock.mockReset();
    apiMock.get.mockResolvedValue({
      data: {
        data: {
          company_name: 'Auto Foods',
          status: 'active'
        }
      }
    });
    registerMock.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('collapses the company token when it is already included in the registration link', async () => {
    renderRegister();

    await screen.findByText('Auto Foods');
    expect(screen.queryByLabelText('Company Token *')).toBeNull();
    expect(screen.getByText('Company token included in your registration link')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    expect(screen.getByLabelText('Company Token *').value).toBe('token-autofoods-12345678');
  });

  it('registers with the hidden token and required phone number', async () => {
    renderRegister();

    await screen.findByText('Auto Foods');
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'teammate' }
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'teammate@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Phone Number'), {
      target: { value: '+63 912 345 6789' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPass1!' }
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'StrongPass1!' }
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(registerMock).toHaveBeenCalledWith({
      username: 'teammate',
      email: 'teammate@example.com',
      phone_number: '+63 912 345 6789',
      password: 'StrongPass1!'
    }, 'token-autofoods-12345678'));
    expect(screen.getByText('Login screen')).toBeTruthy();
  });

  it('rejects invalid phone numbers before submitting registration', async () => {
    renderRegister();

    await screen.findByText('Auto Foods');
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'teammate' }
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'teammate@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Phone Number'), {
      target: { value: 'bad-phone-ext' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPass1!' }
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'StrongPass1!' }
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/phone number must be 7-40 characters/i)).toBeTruthy();
    expect(registerMock).not.toHaveBeenCalled();
  });
});
