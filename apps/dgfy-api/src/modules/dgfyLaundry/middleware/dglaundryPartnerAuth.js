import crypto from 'crypto';
import fs from 'fs';
import { validateDglaundryMachineToken } from '../services/dgfyLaundryOidcProvider.js';

const readSecret = () => {
    if (process.env.DGLAUNDRY_PARTNER_TOKEN_FILE) {
        try { return fs.readFileSync(process.env.DGLAUNDRY_PARTNER_TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
    }
    return String(process.env.DGLAUNDRY_PARTNER_TOKEN || '').trim();
};

export const requireDglaundryPartner = async (req, res, next) => {
    const bearer = String(req.headers.authorization || '').trim();
    if (bearer.toLowerCase().startsWith('bearer ')) {
        const grant = await validateDglaundryMachineToken(bearer.replace(/^Bearer\s+/i, ''));
        if (grant) {
            req.partnerIdentity = 'dglaundry-machine';
            req.partnerScope = grant.scope || 'dglaundry';
            return next();
        }
        if (process.env.NODE_ENV === 'production') return res.status(401).json({ success: false, message: 'DGLaundry machine access token is invalid or expired.' });
    }
    const expected = readSecret();
    const supplied = String(req.headers['x-dglaundry-partner-token'] || '').trim();
    if (!expected || !supplied) return res.status(401).json({ success: false, message: 'DGLaundry partner authentication is required.' });
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
        return res.status(401).json({ success: false, message: 'Invalid DGLaundry partner authentication.' });
    }
    req.partnerIdentity = 'dglaundry';
    return next();
};
