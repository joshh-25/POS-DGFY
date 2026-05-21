import { jest } from '@jest/globals';
import { buildUserManagementToolRegistry } from '../src/modules/ai/usecases/toolHandlers/userManagementToolRegistry.js';

describe('userManagementToolRegistry', () => {
  it('get_users maps user records to chat-safe payload', async () => {
    const getAllUsers = jest.fn().mockResolvedValue([
      {
        user_id: 10,
        username: 'alpha',
        email: 'alpha@example.com',
        role: 'admin',
        is_active: true,
        last_login: '2026-03-04T00:00:00.000Z'
      },
      {
        user_id: 11,
        username: 'beta',
        email: 'beta@example.com',
        role: 'staff',
        is_active: false,
        last_login: null,
        invitation_status: 'pending',
        invitation_delivery_status: 'manual_link',
        invitation_expires_at: '2026-03-11T00:00:00.000Z'
      },
      {
        user_id: 12,
        username: 'gamma',
        email: 'gamma@example.com',
        role: 'staff',
        is_active: false,
        last_login: null,
        invitation_status: 'cancelled',
        invitation_delivery_status: 'manual_link',
        invitation_expires_at: '2026-03-12T00:00:00.000Z'
      }
    ]);

    const registry = buildUserManagementToolRegistry({
      userService: {
        getAllUsers
      },
      tempFileService: {},
      logger: { error: jest.fn() },
      permissions: {}
    });

    const result = await registry.get_users({ args: {} });

    expect(getAllUsers).toHaveBeenCalledWith({ includeInvitations: true });
    expect(result).toEqual({
      count: 3,
      users: [
        {
          id: 10,
          username: 'alpha',
          email: 'alpha@example.com',
          role: 'admin',
          status: 'active',
          last_login: '2026-03-04T00:00:00.000Z',
          invitation_status: null,
          invitation_delivery_status: null,
          invitation_expires_at: null
        },
        {
          id: 11,
          username: 'beta',
          email: 'beta@example.com',
          role: 'staff',
          status: 'pending_invitation',
          last_login: null,
          invitation_status: 'pending',
          invitation_delivery_status: 'manual_link',
          invitation_expires_at: '2026-03-11T00:00:00.000Z'
        },
        {
          id: 12,
          username: 'gamma',
          email: 'gamma@example.com',
          role: 'staff',
          status: 'cancelled_invitation',
          last_login: null,
          invitation_status: 'cancelled',
          invitation_delivery_status: 'manual_link',
          invitation_expires_at: '2026-03-12T00:00:00.000Z'
        }
      ]
    });
  });

  it('update_user_role resolves by email and passes resolved id to service', async () => {
    const updateUserRole = jest.fn().mockResolvedValue({
      user_id: 7,
      username: 'target-user',
      role: 'manager'
    });

    const registry = buildUserManagementToolRegistry({
      userService: {
        getUserByEmail: jest.fn().mockResolvedValue({ user_id: 7 }),
        getUserByUsername: jest.fn(),
        updateUserRole
      },
      tempFileService: {},
      logger: { error: jest.fn() },
      permissions: {}
    });

    const result = await registry.update_user_role({
      args: { email: 'target@example.com', new_role: 'manager' },
      user: { user_id: 99 }
    });

    expect(updateUserRole).toHaveBeenCalledWith(99, 7, { role: 'manager' });
    expect(result).toEqual({
      success: true,
      message: 'User target-user role updated to manager',
      user: {
        id: 7,
        username: 'target-user',
        new_role: 'manager'
      }
    });
  });

  it('create_user_invitation includes manual link when email is not configured', async () => {
    const registry = buildUserManagementToolRegistry({
      userService: {
        createUserInvitation: jest.fn().mockResolvedValue({
          user_id: 15,
          expires_at: '2026-03-11T00:00:00.000Z',
          email_sent: false,
          invitation_token: 'tok_abc123'
        })
      },
      tempFileService: {},
      logger: { error: jest.fn() },
      permissions: {},
      appUrlProvider: () => 'https://app.example.test'
    });

    const result = await registry.create_user_invitation({
      args: { email: 'new.user@example.com', role: 'staff' },
      user: { user_id: 1 }
    });

    expect(result.success).toBe(true);
    expect(result.invitation.token).toBe('tok_abc123');
    expect(result.details['Accept URL']).toBe('https://app.example.test/accept-invite?token=tok_abc123');
    expect(result.message).toContain('Manual Invitation Link');
  });

  it('create_user_invitation labels failed email delivery as manual-link recovery', async () => {
    const registry = buildUserManagementToolRegistry({
      userService: {
        createUserInvitation: jest.fn().mockResolvedValue({
          user_id: 15,
          expires_at: '2026-03-11T00:00:00.000Z',
          email_sent: false,
          delivery_status: 'failed',
          delivery_error: 'SMTP rejected recipient',
          invitation_token: 'tok_abc123'
        })
      },
      tempFileService: {},
      logger: { error: jest.fn() },
      permissions: {},
      appUrlProvider: () => 'https://app.example.test'
    });

    const result = await registry.create_user_invitation({
      args: { email: 'new.user@example.com', role: 'staff' },
      user: { user_id: 1 }
    });

    expect(result.details['Delivery Status']).toBe('Email Failed - Manual Link Ready');
    expect(result.message).toContain('Email Failed - Manual Link Ready');
    expect(result.message).toContain('SMTP rejected recipient');
  });

  it('create_user_invitation labels sent email delivery without exposing a token', async () => {
    const registry = buildUserManagementToolRegistry({
      userService: {
        createUserInvitation: jest.fn().mockResolvedValue({
          user_id: 16,
          expires_at: '2026-03-11T00:00:00.000Z',
          email_sent: true,
          delivery_status: 'sent'
        })
      },
      tempFileService: {},
      logger: { error: jest.fn() },
      permissions: {},
      appUrlProvider: () => 'https://app.example.test'
    });

    const result = await registry.create_user_invitation({
      args: { email: 'sent.user@example.com', role: 'staff' },
      user: { user_id: 1 }
    });

    expect(result.details['Delivery Status']).toBe('Email Sent');
    expect(result.invitation.token).toBeNull();
    expect(result.invitation.url).toBeNull();
  });

  it('create_user_invitation uses token-only manual links even when company token is available', async () => {
    const registry = buildUserManagementToolRegistry({
      userService: {
        createUserInvitation: jest.fn().mockResolvedValue({
          user_id: 15,
          expires_at: '2026-03-11T00:00:00.000Z',
          email_sent: false,
          invitation_token: 'tok_abc123'
        })
      },
      tempFileService: {},
      logger: { error: jest.fn() },
      permissions: {},
      appUrlProvider: () => 'https://app.example.test',
      companyTokenProvider: () => 'token-tenant-xyz'
    });

    const result = await registry.create_user_invitation({
      args: { email: 'new.user@example.com', role: 'staff' },
      user: { user_id: 1 }
    });

    expect(result.details['Accept URL']).toBe('https://app.example.test/accept-invite?token=tok_abc123');
  });

  it('import_users_csv rejects invalid roles before running import', async () => {
    const importUsersFromCSV = jest.fn();

    const registry = buildUserManagementToolRegistry({
      userService: {
        importUsersFromCSV
      },
      tempFileService: {
        parseCsv: jest.fn().mockReturnValue({
          rows: [{ email: 'a@example.com', role: 'owner' }],
          totalRows: 1
        }),
        validateCsvStructure: jest.fn().mockReturnValue({
          valid: true,
          errors: [],
          parseErrors: [],
          summary: { total: 1 }
        })
      },
      logger: { error: jest.fn() },
      permissions: {}
    });

    const result = await registry.import_users_csv({
      args: { csv_content: 'email,role\\na@example.com,owner', _confirmed: true },
      user: { user_id: 1 }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid roles found in CSV');
    expect(importUsersFromCSV).not.toHaveBeenCalled();
  });

  it('import_users_csv reports invitation delivery counts and preserves manual links', async () => {
    const importUsersFromCSV = jest.fn().mockResolvedValue({
      invited: [
        {
          email: 'manual@example.com',
          role: 'staff',
          email_sent: false,
          delivery_status: 'not_configured',
          invitation_url: 'https://app.example.test/accept-invite?token=tok_manual'
        },
        {
          email: 'sent@example.com',
          role: 'manager',
          email_sent: true,
          delivery_status: 'sent',
          invitation_url: null
        }
      ],
      skipped: [{ email: 'dupe@example.com', reason: 'A user with this email already exists' }],
      errors: []
    });

    const registry = buildUserManagementToolRegistry({
      userService: {
        importUsersFromCSV
      },
      tempFileService: {
        parseCsv: jest.fn().mockReturnValue({
          rows: [
            { email: 'manual@example.com', role: 'staff' },
            { email: 'sent@example.com', role: 'manager' }
          ],
          totalRows: 2
        }),
        validateCsvStructure: jest.fn().mockReturnValue({
          valid: true,
          errors: [],
          parseErrors: [],
          summary: { total: 2 }
        })
      },
      logger: { error: jest.fn() },
      permissions: {}
    });

    const result = await registry.import_users_csv({
      args: { csv_content: 'email,role\\nmanual@example.com,staff\\nsent@example.com,manager', _confirmed: true },
      user: { user_id: 99 }
    });

    expect(result.message).toBe('Import completed: 2 invitation(s) created, 1 skipped, 0 error(s).');
    expect(result.details['Manual Links Ready']).toBe('1');
    expect(result.stats).toEqual({
      invited: 2,
      skipped: 1,
      errors: 0,
      manual_links_ready: 1
    });
    expect(result.results.invited[0].invitation_url).toContain('tok_manual');
  });

  it('get_available_permissions returns grouped and flattened payload', async () => {
    const registry = buildUserManagementToolRegistry({
      userService: {},
      tempFileService: {},
      logger: { error: jest.fn() },
      permissions: {
        inventory: {
          view_items: 'inventory:view',
          edit_items: 'inventory:edit'
        },
        users: {
          invite_user: 'users:invite'
        }
      }
    });

    const result = await registry.get_available_permissions({ args: {} });

    expect(result.success).toBe(true);
    expect(result.total_count).toBe(3);
    expect(result.all_permissions).toEqual(['inventory:view', 'inventory:edit', 'users:invite']);
    expect(result.categories.inventory[0]).toEqual({
      key: 'inventory:view',
      description: 'View Items'
    });
  });
});
