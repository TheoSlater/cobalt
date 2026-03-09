import "dotenv/config";

const keepAliveURL = process.env.KEEP_ALIVE_URL?.trim();
const apiURL = process.env.API_URL?.trim();

const targetOrigin = keepAliveURL || apiURL;
if (!targetOrigin) {
    console.error("keep-alive: either KEEP_ALIVE_URL or API_URL must be set.");
    process.exit(1);
}

const baseURL = targetOrigin.replace(/\/+$/, "");
const healthEndpoint = `${baseURL}/health`;
const defaultIntervalSeconds = 600;
const frameIntervalSeconds = Math.max(
    parseInt(process.env.KEEP_ALIVE_INTERVAL_SECONDS, 10) || defaultIntervalSeconds,
    30
);
const intervalMs = frameIntervalSeconds * 1000;
const timeoutMs = Math.max(
    parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS, 10) || 10000,
    1000
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let shuttingDown = false;

const log = (message) => {
    console.log(`[keep-alive ${new Date().toISOString()}] ${message}`);
};

const ping = async () => {
    try {
        const response = await fetch(healthEndpoint, {
            method: "GET",
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
            log(`success ${response.status}`);
            return;
        }

        log(`warning ${response.status} ${response.statusText}`);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : String(error);
        log(`error ${message}`);
    }
};

const run = async () => {
    log(`pinging ${healthEndpoint} every ${frameIntervalSeconds}s`);

    while (!shuttingDown) {
        await ping();
        await delay(intervalMs);
    }
};

process.on("SIGINT", () => {
    shuttingDown = true;
    log("received SIGINT, shutting down");
});

run().catch((error) => {
    console.error("keep-alive: fatal error", error);
    process.exit(1);
});
