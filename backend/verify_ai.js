import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || __dirname;

async function runTest() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    try {
        console.log('🚀 Starting AI Verification Test...');

        // Log browser console
        page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));
        page.on('pageerror', err => console.error(`BROWSER ERROR: ${err.message}`));

        // 1. Navigate to Frontend
        await page.goto('http://localhost:5173/');
        console.log('✅ Navigated to frontend');
        await page.screenshot({ path: path.join(ARTIFACT_DIR, '0_login_page.png') });

        // 2. Login
        await page.fill('input[type="email"], input[name="email"]', 'admin@test.com');
        await page.fill('input[type="password"], input[name="password"]', 'Admin123!');
        await page.click('button[type="submit"]');
        console.log('✅ Logged in as admin');

        // Wait for dashboard
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, '1_dashboard.png') });

        // 3. Navigate to AI Chat
        await page.goto('http://localhost:5173/ai-chat');
        console.log('✅ Navigated to AI Chat');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, '2_ai_chat.png') });

        // Helper to send message and wait for response
        async function sendPrompt(prompt) {
            console.log(`💬 Sending prompt: "${prompt}"`);
            await page.fill('textarea', prompt);
            await page.click('button:has(svg.lucide-send), button:has-text("Send")');

            // Wait for AI to start thinking
            await page.waitForTimeout(1000);
            // Wait for AI to finish thinking (no more thinking indicator)
            await page.waitForSelector('span:has-text("Ready to help")', { timeout: 30000 });
            console.log('✨ AI finished thinking');
        }

        // --- TEST 1: Supplier Creation (Confirmation Required) ---
        await sendPrompt("Register a new supplier called 'Test Vendor ABC' with contact person 'John Tester' and email 'john@testvendor.com'");

        console.log('⏳ Waiting for confirmation dialog to appear...');
        await page.waitForTimeout(5000);

        // Inspect state
        const browserState = await page.evaluate(() => window.__PENDING_ACTION__);
        console.log(`🔍 BROWSER STATE (__PENDING_ACTION__): ${JSON.stringify(browserState, null, 2)}`);

        await page.screenshot({ path: path.join(ARTIFACT_DIR, '3_after_supplier_prompt.png') });

        // Check for confirmation dialog - try multiple selectors
        console.log('🔍 Looking for confirmation dialog...');
        const dialogSelectors = [
            '[role="dialog"]',
            '.fixed.inset-0', // Shadcn dialog wrapper
            'text="Confirm Action"',
            'button:has-text("Confirm")'
        ];

        let dialogFound = false;
        for (const selector of dialogSelectors) {
            if (await page.isVisible(selector)) {
                console.log(`✅ Dialog found using selector: ${selector}`);
                dialogFound = true;
                break;
            }
        }

        if (!dialogFound) {
            console.log('⚠️ Dialog not immediately visible, waiting and checking again...');
            await page.waitForTimeout(5000);
            await page.screenshot({ path: path.join(ARTIFACT_DIR, '4_debug_no_dialog.png') });
        }

        // Capture the state before clicking confirm
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_1_supplier_confirmation.png') });

        // Click confirm if exists
        const confirmButton = page.locator('button:has-text("Confirm")');
        if (await confirmButton.isVisible()) {
            await confirmButton.click();
            console.log('✅ Clicked Confirm');
            await page.waitForTimeout(5000);
            await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_1_supplier_result.png') });
        } else {
            console.log('❌ Confirm button not found');
        }

        // --- TEST 2: System Settings (Read-only) ---
        await sendPrompt("Show me the current system settings");
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_2_settings_read.png') });

        // --- TEST 3: Executive Summary ---
        await sendPrompt("Generate an executive summary of the inventory");
        await page.waitForTimeout(5000);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_3_executive_summary.png') });

        console.log('🎉 All steps attempted!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'error_screenshot.png') });
    } finally {
        await browser.close();
    }
}

runTest();
