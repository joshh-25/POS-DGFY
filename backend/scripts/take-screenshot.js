import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    console.log('🚀 Starting local Playwright screenshot script...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const targetUrl = 'http://localhost:5173';
    console.log(`🔗 Navigating to ${targetUrl}...`);

    try {
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
        console.log('✅ Page loaded.');

        // Wait a bit for React to render
        await page.waitForTimeout(2000);

        const screenshotPath = path.join(__dirname, '../screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`📸 Screenshot saved to ${screenshotPath}`);

    } catch (err) {
        console.error('❌ Failed to take screenshot:', err.message);
    } finally {
        await browser.close();
    }
}

run();
