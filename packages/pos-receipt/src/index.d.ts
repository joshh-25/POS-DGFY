export type PaperWidth = '80mm' | '57mm';
export interface PosReceiptRenderInput { transaction: Record<string, unknown>; businessSettings?: Record<string, unknown>; receiptContract?: Record<string, unknown> | null; paperWidth?: PaperWidth; }
export function normalizePaperWidth(value: unknown): PaperWidth;
export function renderPosReceiptHtml(input?: Partial<PosReceiptRenderInput>): string;
export function renderThermalReceiptText(input?: Partial<PosReceiptRenderInput>): string;
