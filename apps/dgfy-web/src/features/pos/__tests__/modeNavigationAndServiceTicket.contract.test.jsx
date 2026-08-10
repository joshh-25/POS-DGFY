// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { isWorkflowPageVisible, isWorkflowPathBlocked } from '../../settings/workflowMode.js';
import { ServiceTicketPrintView } from '../components/ServiceTicketPrintView.jsx';

describe('Mode Navigation & Service Ticket Contract', () => {
  it('hides Services pages for F&B mode and F&B pages for Services mode', () => {
    // F&B mode
    expect(isWorkflowPageVisible('Fnb', 'fnb')).toBe(true);
    expect(isWorkflowPageVisible('Bookings', 'fnb')).toBe(false);
    expect(isWorkflowPageVisible('Calendar', 'fnb')).toBe(false);
    expect(isWorkflowPathBlocked('/services', 'fnb')).toBe(true);

    // Services mode
    expect(isWorkflowPageVisible('Bookings', 'services')).toBe(true);
    expect(isWorkflowPageVisible('Calendar', 'services')).toBe(true);
    expect(isWorkflowPageVisible('Kitchen', 'services')).toBe(false);
    expect(isWorkflowPageVisible('Tables', 'services')).toBe(false);
    expect(isWorkflowPathBlocked('/fnb', 'services')).toBe(true);
  });

  it('renders ServiceTicketPrintView with operational booking details', () => {
    const dummyBooking = {
      booking_number: 'BKG-2026-0801-99',
      client_name: 'Alice Johnson',
      service_name: 'Deluxe Spa Treatment',
      variation_name: '60 Minutes Package',
      add_ons: [{ name: 'Aromatherapy Oil' }],
      provider_name: 'Sarah Therapist',
      resource_name: 'Suite 3',
      scheduled_at: '2026-08-01 15:30',
      duration_minutes: 60,
      service_notes: 'Prefers lavender scent',
      booking_status: 'Confirmed'
    };

    render(<ServiceTicketPrintView booking={dummyBooking} />);

    expect(screen.getByTestId('service-ticket-print-view')).toBeDefined();
    expect(screen.getByText('SERVICE TICKET')).toBeDefined();
    expect(screen.getByText('BKG-2026-0801-99')).toBeDefined();
    expect(screen.getByText('Alice Johnson')).toBeDefined();
    expect(screen.getByText('Deluxe Spa Treatment')).toBeDefined();
    expect(screen.getByText('60 Minutes Package')).toBeDefined();
    expect(screen.getByText('Aromatherapy Oil')).toBeDefined();
    expect(screen.getByText('Sarah Therapist')).toBeDefined();
    expect(screen.getByText('Suite 3')).toBeDefined();
    expect(screen.getByText('Prefers lavender scent')).toBeDefined();
  });
});
