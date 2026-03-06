import { jest } from '@jest/globals';
import { buildUserManagementToolRegistry } from '../src/modules/ai/usecases/toolHandlers/userManagementToolRegistry.js';

describe('userManagementToolRegistry', () => {
  it('get_users maps user records to chat-safe payload', async () => {
    const registry = buildUserManagementToolRegistry({
      userService: {
        getAllUsers: jest.fn().mockResolvedValue([
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
            last_login: null
          }
        ])
      },
      tempFileService: {},
      logger: { error: jest.fn() },
      permissions: {}
    });

    const result = await registry.get_users({ args: {} });

    expect(result).toEqual({
      count: 2,
      users: [
        {
          id: 10,
          username: 'alpha',
          email: 'alpha@example.com',
          role: 'admin',
          status: 'active',
          last_login: '2026-03-04T00:00:00.000Z'
        },
        {
          id: 11,
          username: 'beta',
          email: 'beta@example.com',
          role: 'staff',
          status: 'inactive',
          last_login: null
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
