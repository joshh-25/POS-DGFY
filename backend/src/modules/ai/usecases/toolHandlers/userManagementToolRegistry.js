const buildResolveUser = ({ userService }) => {
    return async (args) => {
        const { target_user_id, email, username } = args;
        let resolvedUser = null;

        if (email) {
            const userByEmail = await userService.getUserByEmail(email);
            if (userByEmail) {
                if (resolvedUser && resolvedUser.user_id !== userByEmail.user_id) {
                    throw new Error(`Conflict: Resolved user by ID/Username (ID: ${resolvedUser.user_id}) does not match provided Email (ID: ${userByEmail.user_id})`);
                }
                resolvedUser = userByEmail;
            } else {
                throw new Error(`User with email '${email}' not found`);
            }
        }

        if (username) {
            const userByName = await userService.getUserByUsername(username);
            if (userByName) {
                if (resolvedUser && resolvedUser.user_id !== userByName.user_id) {
                    throw new Error(`Conflict: Resolved user (ID: ${resolvedUser.user_id}) does not match provided Username (ID: ${userByName.user_id})`);
                }
                resolvedUser = userByName;
            } else {
                throw new Error(`User with username '${username}' not found`);
            }
        }

        if (target_user_id) {
            if (resolvedUser && parseInt(target_user_id, 10) !== resolvedUser.user_id) {
                throw new Error(`Conflict: Resolved user (ID: ${resolvedUser.user_id}) does not match provided target_user_id (${target_user_id})`);
            }

            if (!resolvedUser) {
                return target_user_id;
            }
        }

        if (resolvedUser) {
            return resolvedUser.user_id;
        }

        if (target_user_id) {
            return target_user_id;
        }

        throw new Error('No valid user identifier provided (target_user_id, email, or username required)');
    };
};

const buildGetAvailablePermissions = ({ permissions }) => {
    return async () => {
        const formatted = {};

        for (const [category, perms] of Object.entries(permissions)) {
            formatted[category] = Object.entries(perms).map(([key, value]) => ({
                key: value,
                description: key.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
            }));
        }

        const flatList = Object.values(permissions).flatMap((category) => Object.values(category));

        return {
            success: true,
            categories: formatted,
            all_permissions: flatList,
            total_count: flatList.length,
            message: `There are ${flatList.length} available permissions across ${Object.keys(permissions).length} categories.`
        };
    };
};

const buildInviteAcceptanceUrl = ({ appUrl, invitationToken, companyToken }) => {
    const params = new URLSearchParams({ token: invitationToken });
    const normalizedCompanyToken = String(companyToken || '').trim();
    if (normalizedCompanyToken) {
        params.set('company', normalizedCompanyToken);
    }
    return `${appUrl}/accept-invite?${params.toString()}`;
};

export const buildUserManagementToolRegistry = ({
    userService,
    tempFileService,
    logger,
    permissions,
    appUrlProvider = () => process.env.APP_URL || 'http://localhost:5173',
    companyTokenProvider = () => null
}) => {
    const resolveUser = buildResolveUser({ userService });
    const getAvailablePermissions = buildGetAvailablePermissions({ permissions });

    const handlers = {
        get_users: async () => {
            const users = await userService.getAllUsers();
            return {
                count: users.length,
                users: users.map((user) => ({
                    id: user.user_id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    status: user.is_active ? 'active' : 'inactive',
                    last_login: user.last_login
                }))
            };
        },

        update_user_role: async ({ args, user }) => {
            const resolvedId = await resolveUser(args);
            const updatedUser = await userService.updateUserRole(user.user_id, resolvedId, { role: args.new_role });

            return {
                success: true,
                message: `User ${updatedUser.username} role updated to ${args.new_role}`,
                user: {
                    id: updatedUser.user_id,
                    username: updatedUser.username,
                    new_role: updatedUser.role
                }
            };
        },

        toggle_user_status: async ({ args, user }) => {
            const resolvedId = await resolveUser(args);
            const updatedUser = await userService.toggleUserStatus(user.user_id, resolvedId, args.is_active);

            return {
                success: true,
                message: `User ${updatedUser.username} is now ${args.is_active ? 'active' : 'inactive'}`,
                user: {
                    id: updatedUser.user_id,
                    username: updatedUser.username,
                    status: updatedUser.is_active ? 'active' : 'inactive'
                }
            };
        },

        remove_user_from_company: async ({ args, user }) => {
            const resolvedId = await resolveUser(args);
            const removedUser = await userService.removeUserFromCompany(user.user_id, resolvedId);

            return {
                success: true,
                message: `User "${removedUser.username}" has been removed from the company`,
                details: {
                    User: removedUser.username,
                    Email: removedUser.email,
                    Role: removedUser.role.charAt(0).toUpperCase() + removedUser.role.slice(1),
                    'Removed At': new Date(removedUser.removed_at).toLocaleString(),
                    Status: 'Removed from Company'
                },
                note: 'The user can no longer log in. A new invitation would be required if they need to rejoin.',
                user: {
                    id: removedUser.user_id,
                    username: removedUser.username,
                    email: removedUser.email,
                    role: removedUser.role
                }
            };
        },

        update_user_permissions: async ({ args, user }) => {
            const resolvedId = await resolveUser(args);
            const updatedUser = await userService.updateUserPermissionsAI(user.user_id, resolvedId, args.permissions);

            return {
                success: true,
                message: `Permissions updated for user ${updatedUser.username}`,
                details: {
                    User: updatedUser.username,
                    Role: updatedUser.role,
                    'Permission Count': String(args.permissions.length),
                    Status: 'Updated'
                },
                related_entity: {
                    type: 'user',
                    id: updatedUser.user_id,
                    label: updatedUser.username
                },
                user: {
                    id: updatedUser.user_id,
                    username: updatedUser.username,
                    role: updatedUser.role,
                    permissions: args.permissions
                }
            };
        },

        create_user_invitation: async ({ args, user }) => {
            const result = await userService.createUserInvitation(user.user_id, {
                email: args.email,
                role: args.role
            });

            const response = {
                success: true,
                message: result.email_sent
                    ? `Invitation email sent to ${args.email}`
                    : `Invitation created for ${args.email} (email not configured - see token below)`,
                details: {
                    Email: args.email,
                    Role: args.role.charAt(0).toUpperCase() + args.role.slice(1),
                    'Expires In': '7 days',
                    Status: result.email_sent ? 'Email Sent' : 'Pending (Email not configured)'
                },
                related_entity: {
                    type: 'user_invitation',
                    id: result.user_id,
                    label: args.email
                },
                invitation: {
                    user_id: result.user_id,
                    email: args.email,
                    role: args.role,
                    expires_at: result.expires_at,
                    email_sent: result.email_sent
                }
            };

            if (!result.email_sent && result.invitation_token) {
                const appUrl = appUrlProvider();
                const companyToken = String(result.company_token || companyTokenProvider() || '').trim() || null;
                const acceptUrl = buildInviteAcceptanceUrl({
                    appUrl,
                    invitationToken: result.invitation_token,
                    companyToken
                });
                response.details['Invitation Token'] = result.invitation_token;
                response.details['Accept URL'] = acceptUrl;
                response.invitation.token = result.invitation_token;
                response.message += `\n\n**Manual Invitation Link:**\n${acceptUrl}`;
            }

            return response;
        },

        get_company_join_link: async () => {
            const companyToken = companyTokenProvider();
            const appUrl = appUrlProvider();
            if (!companyToken) {
                return {
                    success: false,
                    message: 'Unable to retrieve company token. Please copy it from Settings → Company tab.'
                };
            }
            const joinLink = `${appUrl}/register?token=${companyToken}`;
            return {
                success: true,
                message: `Here is the shareable registration link for your company:\n\n**${joinLink}**\n\nShare this link with new team members — it pre-fills the company token so they can register directly.`,
                data: { join_link: joinLink, company_token: companyToken }
            };
        },

        export_users_csv: async ({ args, user }) => {
            const { output_preference = 'ask_user' } = args;

            try {
                const users = await userService.getUsersForExport();

                if (users.length === 0) {
                    return {
                        success: true,
                        message: 'No users found to export.',
                        total_records: 0
                    };
                }

                const columns = [
                    { key: 'user_id', label: 'User ID' },
                    { key: 'username', label: 'Username' },
                    { key: 'email', label: 'Email' },
                    { key: 'role', label: 'Role' },
                    { key: 'is_active', label: 'Active' },
                    { key: 'permission_count', label: 'Permission Count' },
                    { key: 'is_master_admin', label: 'Master Admin' },
                    { key: 'last_login', label: 'Last Login' }
                ];

                const filename = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
                const csvContent = tempFileService.generateCsv(users, columns);

                if (output_preference === 'display') {
                    const displayRows = users.slice(0, 10);
                    return {
                        success: true,
                        output_mode: 'display',
                        entity_type: 'users',
                        total_records: users.length,
                        preview: {
                            headers: columns.map((column) => column.label),
                            rows: displayRows.map((row) => columns.map((column) => {
                                const value = row[column.key];
                                if (typeof value === 'boolean') {
                                    return value ? 'Yes' : 'No';
                                }
                                return value || '';
                            })),
                            showing: displayRows.length,
                            total: users.length
                        },
                        message: `Showing first ${displayRows.length} of ${users.length} users.${users.length > 10 ? ' Use download option for full data.' : ''}`
                    };
                }

                if (output_preference === 'download') {
                    const fileInfo = await tempFileService.storeTemporaryFile(
                        csvContent,
                        filename,
                        user.user_id
                    );

                    return {
                        success: true,
                        output_mode: 'download',
                        entity_type: 'users',
                        total_records: users.length,
                        download: {
                            url: fileInfo.downloadUrl,
                            filename: fileInfo.filename,
                            expires_at: fileInfo.expiresAt,
                            expires_in: fileInfo.expiresIn
                        },
                        message: `Export ready! ${users.length} users exported. Download link valid for 1 hour.`
                    };
                }

                return {
                    success: true,
                    output_mode: 'ask_preference',
                    entity_type: 'users',
                    total_records: users.length,
                    message: `Ready to export ${users.length} users. How would you like to receive the data?`,
                    options: [
                        { value: 'display', label: 'Display in chat (first 10 rows)' },
                        { value: 'download', label: 'Generate download link' }
                    ]
                };
            } catch (error) {
                logger.error('Error in exportUsersCsv:', error);
                return { error: error.message || 'Failed to export users' };
            }
        },

        import_users_csv: async ({ args, user }) => {
            const { csv_content, _confirmed = false } = args;

            try {
                if (!csv_content) {
                    return {
                        error: 'No CSV content provided. Please attach a CSV file or paste the CSV data.',
                        success: false
                    };
                }

                const parsed = tempFileService.parseCsv(csv_content);
                if (parsed.error) {
                    return { error: parsed.error };
                }

                const validation = tempFileService.validateCsvStructure(parsed, ['email']);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: 'Validation failed',
                        validation_errors: validation.errors,
                        parse_errors: validation.parseErrors,
                        summary: validation.summary
                    };
                }

                const validRoles = ['staff', 'cashier', 'po', 'do', 'jo', 'manager', 'admin'];
                const rowsWithInvalidRoles = parsed.rows.filter((row) => row.role && !validRoles.includes(row.role.toLowerCase()));

                if (rowsWithInvalidRoles.length > 0) {
                    return {
                        success: false,
                        error: 'Invalid roles found in CSV',
                        invalid_rows: rowsWithInvalidRoles.slice(0, 5).map((row) => ({
                            email: row.email,
                            invalid_role: row.role
                        })),
                        valid_roles: validRoles,
                        message: `Found ${rowsWithInvalidRoles.length} row(s) with invalid roles. Valid roles are: ${validRoles.join(', ')}`
                    };
                }

                if (_confirmed) {
                    const userData = parsed.rows.map((row) => ({
                        email: row.email,
                        role: (row.role || 'staff').toLowerCase()
                    }));

                    const result = await userService.importUsersFromCSV(userData, user.user_id);
                    return {
                        success: true,
                        message: `Import completed: ${result.invited} invitation(s) sent, ${result.skipped} skipped, ${result.errors.length} error(s).`,
                        details: {
                            'Invitations Sent': String(result.invited),
                            Skipped: String(result.skipped),
                            Errors: String(result.errors.length)
                        },
                        stats: {
                            invited: result.invited,
                            skipped: result.skipped,
                            errors: result.errors.length
                        },
                        results: result
                    };
                }

                const preview = parsed.rows.slice(0, 5).map((row) => ({
                    email: row.email,
                    role: (row.role || 'staff').toLowerCase()
                }));

                return {
                    success: true,
                    requires_confirmation: true,
                    entity_type: 'users',
                    preview: {
                        headers: ['Email', 'Role'],
                        sample_rows: preview,
                        total_rows: parsed.totalRows
                    },
                    summary: {
                        total: parsed.totalRows,
                        with_role: parsed.rows.filter((row) => row.role).length,
                        default_role: parsed.rows.filter((row) => !row.role).length
                    },
                    message: `Ready to send ${parsed.totalRows} invitation(s). ${parsed.rows.filter((row) => !row.role).length} will use default role (staff). Please confirm to proceed.`
                };
            } catch (error) {
                logger.error('Error in importUsersCsv:', error);
                return { error: error.message || 'Failed to import users' };
            }
        },

        get_available_permissions: async () => getAvailablePermissions()
    };

    return handlers;
};
