/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PosDiscountManagementPane from '../settings/PosDiscountManagementPane.jsx';
import {
  createDiscountRule,
  deleteDiscountRule,
  getDiscountRules,
  updateDiscountRule
} from '@/services/settingsService.js';

vi.mock('@/services/settingsService.js', () => ({
  createDiscountRule: vi.fn(),
  deleteDiscountRule: vi.fn(),
  getDiscountRules: vi.fn(),
  updateDiscountRule: vi.fn()
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
  posToast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

const existingRule = {
  discount_rule_id: 12,
  name: 'PWD',
  method: 'percentage',
  percentage: 15,
  description: 'Existing statutory discount',
  is_enabled: true,
  is_approved: true,
  configuration_source: 'seed',
  configuration_version: 4,
  updated_at: '2026-09-25T08:00:00.000Z'
};

beforeEach(() => {
  vi.clearAllMocks();
  getDiscountRules.mockResolvedValue([existingRule]);
  createDiscountRule.mockResolvedValue({ ...existingRule, discount_rule_id: 13 });
  deleteDiscountRule.mockResolvedValue({ discount_rule_id: existingRule.discount_rule_id, deleted: true });
  updateDiscountRule.mockResolvedValue({ ...existingRule, percentage: 10, configuration_version: 5 });
});

afterEach(cleanup);

describe('POS discount management pane', () => {
  it('lists configured rules and creates an approved, enabled percentage rule', async () => {
    render(<PosDiscountManagementPane canEdit />);

    expect(await screen.findByRole('heading', { name: 'Discount Management' })).toBeTruthy();
    expect(screen.getByText('PWD')).toBeTruthy();
    expect(screen.getByText('15%')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(screen.queryByText(/A discount is available during checkout/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add discount' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Discount Name'), { target: { value: 'Employee Discount' } });
    fireEvent.change(within(dialog).getByLabelText('Discount Rate (%)'), { target: { value: '12' } });
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Active Status' }));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'POS Approval Status' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add discount' }));

    await waitFor(() => expect(createDiscountRule).toHaveBeenCalledWith({
      name: 'Employee Discount',
      percentage: 12,
      description: null,
      is_enabled: true,
      is_approved: true
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('updates the loaded rule with its optimistic concurrency version', async () => {
    render(<PosDiscountManagementPane canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Discount Rate (%)'), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Active Status' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateDiscountRule).toHaveBeenCalledWith(12, {
      name: 'PWD',
      percentage: 10,
      description: 'Existing statutory discount',
      is_enabled: false,
      is_approved: true,
      expected_configuration_version: 4
    }));
  });

  it('keeps the management list view-only without edit permission', async () => {
    render(<PosDiscountManagementPane canEdit={false} />);

    expect(await screen.findByText('PWD')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add discount' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByText(/View-only access/)).toBeTruthy();
  });

  it('deletes an unused discount after confirmation', async () => {
    render(<PosDiscountManagementPane canEdit />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Delete "PWD" permanently/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete discount' }));

    await waitFor(() => expect(deleteDiscountRule).toHaveBeenCalledWith(12));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the delete confirmation open when the API blocks deletion', async () => {
    deleteDiscountRule.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { message: 'This discount cannot be deleted because it has been used in transactions.' }
      }
    });
    render(<PosDiscountManagementPane canEdit />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete discount' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain('This discount cannot be deleted');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
