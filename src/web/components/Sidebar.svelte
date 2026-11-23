<script lang="ts">
  import { routeStore } from "../state.svelte";
  import { BUTTON_LABELS } from "../ui-meta";
  import CollapsibleSection from "./CollapsibleSection.svelte";
  import GoogleMapsLinks from "./GoogleMapsLinks.svelte";
  import ItineraryList from "./ItineraryList.svelte";
  import SolverOptionsPanel from "./SolverOptionsPanel.svelte";
  import SolverSelectorPanel from "./SolverSelectorPanel.svelte";
  import StopInputPanel from "./StopInputPanel.svelte";

  let solverPanelOpen = $state(false);
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
      class="rounded-full px-2.5 py-1 text-xs font-medium border {routeStore.solverEngine ===
      'byok-api'
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}"
    >
      {routeStore.solverEngine === "byok-api" ? "BYOK Mode" : "Keyless Mode"}
    </span>
  </header>

  <StopInputPanel />

  <CollapsibleSection
    title="2. Solver Engine & Options"
    badge={routeStore.solverBadge}
    badgeClass="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-slate-300"
    bind:open={solverPanelOpen}
  >
    <SolverSelectorPanel />
    <SolverOptionsPanel />
  </CollapsibleSection>

  <button
    type="button"
    onclick={() => routeStore.optimize()}
    disabled={routeStore.status === "optimizing"}
    class="ui-btn-primary"
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

  {#if routeStore.statusMessage}
    <div
      class="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300"
    >
      {routeStore.statusMessage}
    </div>
  {/if}

  {#if routeStore.errorMessage}
    <div
      class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300"
    >
      {routeStore.errorMessage}
    </div>
  {/if}

  {#if routeStore.result}
    {#if routeStore.result.googleMapsLinks.length > 0}
      <GoogleMapsLinks links={routeStore.result.googleMapsLinks} />
    {/if}
    <ItineraryList result={routeStore.result} />
  {/if}
</aside>
