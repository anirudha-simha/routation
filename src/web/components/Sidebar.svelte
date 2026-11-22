<script lang="ts">
    import {
        type ByokProviderId,
        type LocalMatrixSource,
        type OsrmProfile,
        type RouteStatus,
        type SolverEngineId,
        createDefaultContext,
        runRouteOptimizationPipeline,
    } from "../../core";
    import { routeStore } from "../state.svelte";

    import StopInputPanel from "../components/StopInputPanel.svelte";
    import SolverSelectorPanel from "../components/SolverSelectorPanel.svelte";
    import SolverOptionsPanel from "../components/SolverOptionsPanel.svelte";
    import GoogleMapsLinks from "../components/GoogleMapsLinks.svelte";
    import ItineraryList from "../components/ItineraryList.svelte";

    // Shared provider context so the 1.1s rate limiter & cache persist across button clicks
    const providerCtx = createDefaultContext();
    const COOLDOWN_MS = 1100;

    // Row 2 state: selected solver engine
    let solverEngine = $state<SolverEngineId>("no-solver");

    // Row 3 state: dynamic solver-specific options
    let osrmProfile = $state<OsrmProfile>("car");
    let localMatrixSource = $state<LocalMatrixSource>("osrm-table");
    let byokProvider = $state<ByokProviderId>("openrouteservice");
    let apiKey = $state("");

    // Execution status messages (lifecycle state is tracked by `routeStore.status` FSM)
    let statusMessage = $state<string | null>(null);
    let errorMessage = $state<string | null>(null);
    let isCoolingDown = $state(false);

    const BUTTON_LABELS: Record<RouteStatus, string> = {
        unoptimized: "Optimize Route",
        optimizing: "Optimizing Route...",
        optimized: "Optimize Route",
        stale: "Re-Optimize Route (Changes Pending)",
    };

    async function handleOptimize() {
        if (routeStore.status === "optimizing" || isCoolingDown) {
            return;
        }

        const home = routeStore.home;

        if (!home || routeStore.stops.length === 0) {
            errorMessage = "Please lock in a Home location and at least 1 stop.";
            return;
        }

        isCoolingDown = true;
        setTimeout(() => {
            isCoolingDown = false;
        }, COOLDOWN_MS);

        routeStore.startOptimizing();
        errorMessage = null;
        statusMessage = `Running ${solverEngine} solver...`;

        try {
            const res = await runRouteOptimizationPipeline(
                {
                    home,
                    stops: routeStore.stops,
                    config: {
                        mode: routeStore.mode,
                        solverEngine,
                        solverOptions: {
                            osrmProfile,
                            localMatrixSource,
                            byokProvider,
                            apiKey: apiKey.trim() || undefined,
                        },
                    },
                },
                providerCtx,
                (progress) => {
                    statusMessage = progress.message;
                },
            );
            routeStore.completeOptimizing(res);
            statusMessage = null;
        } catch (err) {
            routeStore.failOptimizing();
            errorMessage =
                err instanceof Error
                    ? err.message
                    : "Route optimization failed";
            statusMessage = null;
        }
    }
</script>

<aside
    class="h-full w-full bg-slate-900 flex flex-col overflow-y-auto p-4 gap-3.5"
>
    <header
        class="flex items-center justify-between border-b border-slate-800 pb-3"
    >
        <div>
            <h1 class="text-lg font-semibold text-white">Routation</h1>
            <p class="text-xs text-slate-400">
                Multi-Stop Route Optimizer • by <a
                    href="https://anirudhasimha.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-slate-300 hover:text-blue-400 underline decoration-slate-600 hover:decoration-blue-400 underline-offset-2 transition"
                    >Anirudha Simha</a
                >
            </p>
        </div>
        <span
            class="rounded-full px-2.5 py-1 text-xs font-medium border {solverEngine ===
            'byok-api'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}"
        >
            {solverEngine === "byok-api" ? "BYOK Mode" : "Keyless Mode"}
        </span>
    </header>

    <!-- Row 1: General Route Options (Home, Stops, Mode + Hint) -->
    <StopInputPanel />

    <!-- Row 2: Solver Engine Selector (OSRM / Local / BYOK + Hint) -->
    <SolverSelectorPanel bind:solverEngine />

    <!-- Row 3: Dynamic Solver-Specific Options -->
    <SolverOptionsPanel
        {solverEngine}
        bind:osrmProfile
        bind:localMatrixSource
        bind:byokProvider
        bind:apiKey
    />

    <button
        type="button"
        onclick={handleOptimize}
        disabled={routeStore.status === "optimizing" || isCoolingDown}
        class="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
    >
        {BUTTON_LABELS[routeStore.status]}
    </button>

    {#if routeStore.status === "stale"}
        <div
            class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300"
        >
            Stops or route settings changed since last optimization.
        </div>
    {/if}

    {#if statusMessage}
        <div
            class="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300"
        >
            {statusMessage}
        </div>
    {/if}

    {#if errorMessage}
        <div
            class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300"
        >
            {errorMessage}
        </div>
    {/if}

    {#if routeStore.result}
        {#if routeStore.result.googleMapsLinks.length > 0}
            <GoogleMapsLinks links={routeStore.result.googleMapsLinks} />
        {/if}
        <ItineraryList result={routeStore.result} />
    {/if}
</aside>
