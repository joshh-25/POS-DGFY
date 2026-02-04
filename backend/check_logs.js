
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const logFile = path.resolve('logs/combined.log');

async function readLastLines(file, maxLines) {
    if (!fs.existsSync(file)) {
        console.log(`File not found: ${file}`);
        return;
    }

    const fileStream = fs.createReadStream(file);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const lines = [];
    for await (const line of rl) {
        // Determine if line is JSON or plain text
        try {
            const json = JSON.parse(line);
            // Filter for our interests: TenantHandler or ReceiveToken
            if (json.message && (json.message.includes('[TenantHandler]') || json.message.includes('[ReceiveToken]'))) {
                lines.push(json.timestamp + ' ' + json.message);
            }
        } catch (e) {
            // Plain text fallback
            if (line.includes('[TenantHandler]') || line.includes('[ReceiveToken]')) {
                lines.push(line);
            }
        }
    }

    // Show last N relevant lines
    console.log("--- RELEVANT LOGS ---");
    lines.slice(-20).forEach(l => console.log(l));
}

readLastLines(logFile, 100);
