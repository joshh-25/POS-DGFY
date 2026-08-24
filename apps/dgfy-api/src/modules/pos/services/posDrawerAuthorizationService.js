import jwt from 'jsonwebtoken';

const TOKEN_TYPE = 'pos_drawer_authorization';
const ISSUER = 'skupervisor-pos';
const AUDIENCE = 'pos-drawer';
const EXPIRES_IN = '90s';
const TEST_SECRET = 'test_pos_drawer_authorization_secret_32_chars!';

const resolveSecret = () => {
    const configured = String(process.env.POS_DRAWER_AUTHORIZATION_SECRET || process.env.JWT_SECRET || '').trim();
    if (configured.length >= 32) return configured;
    if (process.env.NODE_ENV === 'test') return TEST_SECRET;
    throw new Error('JWT_SECRET or POS_DRAWER_AUTHORIZATION_SECRET must be configured with at least 32 characters');
};

export const issue = ({
    userId,
    shiftId,
    transactionId,
    terminalId,
    reason,
    idempotencyKey,
    authorizationMode
} = {}) => jwt.sign({
    token_type: TOKEN_TYPE,
    user_id: Number(userId),
    shift_id: Number(shiftId),
    transaction_id: transactionId == null ? null : Number(transactionId),
    terminal_id: terminalId || null,
    reason: String(reason || '').trim(),
    idempotency_key: String(idempotencyKey || '').trim(),
    authorization_mode: authorizationMode
}, resolveSecret(), {
    expiresIn: EXPIRES_IN,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: String(Number(userId))
});

export const verify = (token) => {
    const claims = jwt.verify(String(token || ''), resolveSecret(), {
        issuer: ISSUER,
        audience: AUDIENCE
    });
    if (claims?.token_type !== TOKEN_TYPE) {
        throw new Error('Invalid POS drawer authorization token');
    }
    return claims;
};

export default { issue, verify };
