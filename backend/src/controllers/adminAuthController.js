import jwt from 'jsonwebtoken';

// Hardcoded admin credentials (as requested by client)
const ADMIN_USERNAME = 'skupervisor';
const ADMIN_PASSWORD = '252378';

export const adminLogin = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Validate hardcoded credentials
        if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate admin JWT token
        const token = jwt.sign(
            {
                username: ADMIN_USERNAME,
                role: 'admin',
                type: 'admin' // Distinguish from regular user tokens
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' } // Admin sessions last 8 hours
        );

        res.json({
            success: true,
            message: 'Admin login successful',
            token,
            admin: { username: ADMIN_USERNAME }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
