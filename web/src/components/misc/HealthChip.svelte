<script lang="ts">
    import { onMount } from "svelte";
    import { browser } from "$app/environment";
    import { t } from "$lib/i18n/translations";
    import { currentApiURL } from "$lib/api/api-url";
    import IconRefresh from "@tabler/icons-svelte/IconRefresh.svelte";

    type HealthStatus = "checking" | "online" | "offline";

    const HEALTH_INTERVAL_MS = 2 * 60 * 1000;
    const HEALTH_TIMEOUT_MS = 10_000;

    let status: HealthStatus = "checking";
    let message: string | null = null;
    let lastChecked: number | null = null;
    let refreshing = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const formatTimestamp = (value: number) => {
        return new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
        }).format(value);
    };

    const fetchHealth = async () => {
        if (!browser) {
            return;
        }

        refreshing = true;
        status = "checking";
        message = null;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

        try {
            const response: Response = await fetch(
                `${currentApiURL()}/health`,
                {
                    signal: controller.signal,
                    redirect: "manual",
                }
            );

            if (response.ok) {
                await response.json();

                status = "online";
                lastChecked = Date.now();
                message = null;
            } else {
                status = "offline";
                message = `${response.status} ${response.statusText || ""}`.trim();
            }
        } catch (error) {
            status = "offline";
            message = error instanceof Error ? error.message : String(error);
        } finally {
            clearTimeout(timeout);
            refreshing = false;
        }
    };

    onMount(() => {
        if (!browser) {
            return;
        }

        fetchHealth();
        intervalId = setInterval(fetchHealth, HEALTH_INTERVAL_MS);

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    });

    const handleManualRefresh = () => {
        if (refreshing) {
            return;
        }

        fetchHealth();
    };

</script>

<button
    class="health-chip"
    type="button"
    data-status={status}
    on:click={handleManualRefresh}
    disabled={refreshing}
    aria-live="polite"
>
    <span class="status-dot" aria-hidden="true"></span>
        <div class="status-text">
            <span class="label">
                {#if status === "online"}
                    {$t("healthChip.status.online")}
                {:else if status === "offline"}
                    {$t("healthChip.status.offline")}
                {:else}
                    {$t("healthChip.status.checking")}
                {/if}
            </span>
            <span class="hint">
                {#if status === "online"}
                    {#if lastChecked}
                        {$t("healthChip.lastChecked")} {formatTimestamp(lastChecked)}
                    {:else}
                        {$t("healthChip.status.checking")}
                    {/if}
                {:else if status === "offline"}
                    {message ?? $t("healthChip.retry")}
                {:else}
                    {$t("healthChip.retry")}
                {/if}
            </span>
        </div>
    <span class="spacer" aria-hidden="true"></span>
    <span class="refresh-icon" aria-hidden="true">
        <IconRefresh size="16" />
    </span>
</button>

<style>
    .health-chip {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid var(--button-stroke);
        background: var(--button-elevated);
        color: var(--secondary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: border-color 0.2s ease, background 0.2s ease;
    }

    .health-chip:disabled {
        cursor: progress;
    }

    .health-chip[data-status="online"] {
        border-color: var(--green);
    }

    .health-chip[data-status="offline"] {
        border-color: var(--red);
    }

    .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--gray);
        flex-shrink: 0;
    }

    .health-chip[data-status="online"] .status-dot {
        background: var(--green);
    }

    .health-chip[data-status="offline"] .status-dot {
        background: var(--red);
    }

    .status-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-width: 0;
    }

    .label {
        font-size: 13px;
        letter-spacing: 0.02em;
    }

    .hint {
        font-size: 11px;
        color: var(--gray);
        text-transform: lowercase;
    }

    .spacer {
        flex: 1;
    }

    .refresh-icon {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .refresh-icon :global(svg) {
        width: 16px;
        height: 16px;
        color: var(--secondary);
    }
</style>
