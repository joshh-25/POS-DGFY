import { jest } from '@jest/globals';

// Use unstable_mockModule for ESM mocking support
await jest.unstable_mockModule('../src/services/userService.js', () => ({
    createUserInvitation: jest.fn(),
}));

const { inviteUser } = await import('../src/controllers/userController.js');
const userService = await import('../src/services/userService.js');
const { validateInviteUser } = await import('../src/validators/userValidator.js'); // Import middleware

describe('inviteUser Validation & Controller', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            user: { user_id: 1, role: 'admin' },
            body: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    // Test Middleware
    test('Middleware: should reject invalid email', () => {
        req.body = { email: 'invalid-email', role: 'staff' };

        // Mock next to throw if called
        const nextSpy = jest.fn();

        validateInviteUser(req, res, nextSpy);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            message: 'Validation failed'
        }));
        expect(nextSpy).not.toHaveBeenCalled();
    });

    test('Middleware: should reject invalid role', () => {
        req.body = { email: 'test@example.com', role: 'god_mode' };

        const nextSpy = jest.fn();

        validateInviteUser(req, res, nextSpy);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(nextSpy).not.toHaveBeenCalled();
    });

    test('Middleware: should pass valid data and attach to req.validatedData', () => {
        req.body = { email: 'test@example.com', role: 'admin' };

        validateInviteUser(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.validatedData).toEqual({ email: 'test@example.com', role: 'admin' });
    });

    // Test Controller
    test('Controller: should use validatedData and call service', async () => {
        // Mock middleware setting validatedData
        req.validatedData = { email: 'test@example.com', role: 'staff' };

        userService.createUserInvitation.mockResolvedValue({ user_id: 2 });

        await inviteUser(req, res, next);

        expect(userService.createUserInvitation).toHaveBeenCalledWith(1, { email: 'test@example.com', role: 'staff' });
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
