import express from "express";

const app = express();

const port = Number(process.env.PORT || 8080);
const ttlSeconds = Number(process.env.PO_TOKEN_TTL_SECONDS || 600);

let cached = null;
let refreshing = null;

const loadGenerator = async () => {
    const mod = await import("youtube-po-token-generator");
    return mod.generate || mod.default?.generate || mod.default || mod;
};

const refresh = async () => {
    if (refreshing) return refreshing;

    refreshing = (async () => {
        const generate = await loadGenerator();
        const { visitorData, poToken } = await generate();
        cached = {
            potoken: poToken,
            visitor_data: visitorData,
            updated: Date.now(),
        };
        return cached;
    })().finally(() => {
        refreshing = null;
    });

    return refreshing;
};

const needsRefresh = () => {
    if (!cached) return true;
    return Date.now() - cached.updated > ttlSeconds * 1000;
};

app.get("/token", async (_req, res) => {
    try {
        if (needsRefresh()) {
            await refresh();
        }
        res.json(cached);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.post("/update", async (_req, res) => {
    try {
        await refresh();
        res.json(cached);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`youtube session server listening on ${port}`);
});
