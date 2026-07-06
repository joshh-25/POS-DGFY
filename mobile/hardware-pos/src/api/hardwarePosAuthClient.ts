export interface HardwarePosAuthSession {
    dgfyToken: string | null;
    token: string;
    refreshToken?: string | null;
    tenantId: string;
    companyName: string;
    userId: number;
    email: string;
    username: string;
    companyToken: string;
    roleCode: string;
    permissions: string[];
    isMasterAdmin: boolean;
}

export interface HardwarePosLoginInput {
    baseUrl: string;
    email: string;
    password: string;
    terminalId?: string;
    preferredTenantId?: string | null;
    companyToken?: string | null;
}

interface ApiEnvelope<T> {
    success: boolean;
    data?: T;
    message?: string;
}

interface LegacyLoginPayload {
    user_id?: number;
    username?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    permissions?: unknown;
    is_master_admin?: boolean;
    token?: string | null;
    refreshToken?: string | null;
    expiresIn?: number;
    company?: {
        token?: string | null;
        name?: string | null;
        id?: string | null;
    } | null;
}

const DEFAULT_COMPANY_TOKEN = 'token-spacebar-8ddb3350';

const joinUrl = (baseUrl: string, path: string): string => (
    `${String(baseUrl).replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
);

const normalizeApiBase = (input: string): string => {
    const trimmed = String(input || '').trim();
    if (!trimmed) {
        return '';
    }

    return trimmed.endsWith('/api/v1')
        ? trimmed
        : `${trimmed.replace(/\/+$/, '')}/api/v1`;
};

const normalizePermissions = (permissions: unknown): string[] => (
    Array.isArray(permissions)
        ? permissions.map((entry) => String(entry))
        : []
);

export class HardwarePosAuthClient {
    async login(input: HardwarePosLoginInput): Promise<HardwarePosAuthSession> {
        const baseUrl = normalizeApiBase(input.baseUrl);
        const companyToken = String(input.companyToken || DEFAULT_COMPANY_TOKEN).trim();

        const loginResponse = await fetch(joinUrl(baseUrl, '/auth/login'), {
            method: 'POST',
            credentials: 'omit',
            headers: {
                'Content-Type': 'application/json',
                'x-company-token': companyToken
            },
            body: JSON.stringify({
                email: String(input.email || '').trim(),
                password: input.password
            })
        });

        const loginPayload = await loginResponse.json() as ApiEnvelope<LegacyLoginPayload>;
        const tenantToken = String(loginPayload.data?.token || '').trim();

        if (!loginResponse.ok || loginPayload.success !== true || !tenantToken) {
            throw new Error(loginPayload.message || 'Invalid email or password.');
        }

        return {
            dgfyToken: null,
            token: tenantToken,
            refreshToken: loginPayload.data?.refreshToken ? String(loginPayload.data.refreshToken) : null,
            tenantId: String(loginPayload.data?.company?.id || input.preferredTenantId || 'legacy-pos').trim() || 'legacy-pos',
            companyName: String(loginPayload.data?.company?.name || 'DGFY POS').trim() || 'DGFY POS',
            userId: Number(loginPayload.data?.user_id ?? 0),
            email: String(loginPayload.data?.email ?? input.email),
            username: String(
                loginPayload.data?.username
                ?? loginPayload.data?.name
                ?? loginPayload.data?.email
                ?? input.email
            ),
            companyToken: String(loginPayload.data?.company?.token || companyToken),
            roleCode: String(loginPayload.data?.role ?? 'cashier'),
            permissions: normalizePermissions(loginPayload.data?.permissions),
            isMasterAdmin: Boolean(loginPayload.data?.is_master_admin)
        };
    }
}
