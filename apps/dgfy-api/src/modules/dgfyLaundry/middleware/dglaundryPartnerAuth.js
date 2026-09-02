import crypto from 'crypto';
import fs from 'fs';

const readSecret = () => {
    if (process.env.DGLAUNDRY_PARTNER_TOKEN_FILE) {
        try { return fs.readFileSync(process.env.DGLAUNDRY_PARTNER_TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
    }
    return String(process.env.DGLAUNDRY_PARTNER_TOKEN || '').trim();
};

export const requireDglaundryPartner = (req, res, next) => {
    const expected = readSecret();
    const supplied = String(req.headers['x-dglaundry-partner-token'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || '').trim();
    if (!expected || !supplied) return res.status(401).json({ success: false, message: 'DGLaundry partner authentication is required.' });
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
        return res.status(401).json({ success: false, message: 'Invalid DGLaundry partner authentication.' });
    }
    req.partnerIdentity = 'dglaundry';
    return next();
};
