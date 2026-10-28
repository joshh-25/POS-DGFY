import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const EVICTION_EVENT = 'tenant_connector.lru_eviction';
const UNKNOWN_CALLER = 'unknown';
const MAX_CALLER_LABEL_LENGTH = 64;
const CALLER_LABEL_PATTERN = /^[a-z][a-z0-9_.-]*$/;
const ANSI_ESCAPE_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

const normalizeCallerLabel = (callerLabel) => {
    if (typeof callerLabel !== 'string'
        || callerLabel.length > MAX_CALLER_LABEL_LENGTH
        || !CALLER_LABEL_PATTERN.test(callerLabel)) {
        return UNKNOWN_CALLER;
    }
    return callerLabel;
};

const parseEvictionEvent = (line) => {
    if (typeof line !== 'string') return null;

    const plainLine = line.replace(ANSI_ESCAPE_SEQUENCE, '');
    const marker = plainLine.indexOf(' info: ');
    if (marker < 0) return null;

    let event;
    try {
        event = JSON.parse(plainLine.slice(marker + ' info: '.length).trim());
    } catch {
        return null;
    }

    if (event?.event !== EVICTION_EVENT
        || typeof event.timestamp !== 'string'
        || !Number.isFinite(Date.parse(event.timestamp))) {
        return null;
    }

    return {
        timestamp: new Date(event.timestamp).toISOString(),
        caller: normalizeCallerLabel(event.caller)
    };
};

export function createTenantEvictionAggregator() {
    const countsByCaller = new Map([[UNKNOWN_CALLER, 0]]);
    let totalEvictions = 0;
    let firstEventAt = null;
    let lastEventAt = null;

    return {
        addLine(line) {
            const event = parseEvictionEvent(line);
            if (!event) return;

            totalEvictions += 1;
            countsByCaller.set(event.caller, (countsByCaller.get(event.caller) ?? 0) + 1);
            if (firstEventAt === null || event.timestamp < firstEventAt) firstEventAt = event.timestamp;
            if (lastEventAt === null || event.timestamp > lastEventAt) lastEventAt = event.timestamp;
        },

        summary() {
            const callers = [...countsByCaller.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([caller, count]) => ({
                    caller,
                    count,
                    percent: totalEvictions === 0 ? 0 : Number(((count / totalEvictions) * 100).toFixed(1))
                }));

            return {
                event: 'tenant_connector.lru_eviction_summary',
                total_evictions: totalEvictions,
                first_event_at: firstEventAt,
                last_event_at: lastEventAt,
                callers
            };
        }
    };
}

async function main() {
    if (process.stdin.isTTY) {
        process.stderr.write('Pipe the API container log stream into this command.\n');
        process.exitCode = 2;
        return;
    }

    const aggregator = createTenantEvictionAggregator();
    for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
        aggregator.addLine(line);
    }
    process.stdout.write(`${JSON.stringify(aggregator.summary(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
