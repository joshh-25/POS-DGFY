export const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

export const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const toSlug = (value) => String(value || '').trim().toLowerCase();
