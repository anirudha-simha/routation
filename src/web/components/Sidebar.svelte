<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import Share2 from "@lucide/svelte/icons/share-2";
  import type { RouteStatus } from "../../core";
  import { routeStore } from "../state.svelte";
  import CollapsibleSection from "./CollapsibleSection.svelte";
  import GoogleMapsLinks from "./GoogleMapsLinks.svelte";
  import ItineraryList from "./ItineraryList.svelte";
  import SolverOptionsPanel from "./SolverOptionsPanel.svelte";
  import SolverSelectorPanel from "./SolverSelectorPanel.svelte";
  import StopInputPanel from "./StopInputPanel.svelte";

  let solverPanelOpen = $state(false);
  let copiedShareLink = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function handleCopyShareLink() {
    const url = await routeStore.buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      copiedShareLink = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copiedShareLink = false;
      }, 2000);
    } catch {
      routeStore.syncUrlHashFallback(url);
      routeStore.statusMessage =
        "Share URL updated in your browser address bar.";
    }
  }

  let primaryButtonLabel = $derived.by(() => {
    const isManualOrder =
      routeStore.solverEngine === "osrm-route" ||
      routeStore.solverEngine === "no-solver";
    const status: RouteStatus = routeStore.status;
    if (status === "optimizing") {
      return isManualOrder ? "Calculating Route..." : "Optimizing Route...";
    }
    if (status === "stale") {
      return isManualOrder
        ? "Update Route (Keep Order)"
        : "Re-Optimize Route (Changes Pending)";
    }
    return isManualOrder ? "Calculate Route (Keep Order)" : "Optimize Route";
  });
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
    <div class="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onclick={handleCopyShareLink}
        title="Copy a zero-backend shareable #hash URL for this route (safe for mobile handoff; never sent to servers)"
        class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition {copiedShareLink
          ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
          : 'border-slate-700 bg-slate-800/80 text-slate-200 hover:border-blue-500/60 hover:text-blue-300'}"
      >
        {#if copiedShareLink}
          <Check class="h-3 w-3" />
          <span>Copied!</span>
        {:else}
          <Share2 class="h-3 w-3" />
          <span>Share</span>
        {/if}
      </button>

      <span
        class="hidden sm:inline-flex rounded-full px-2.5 py-1 text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      >
        Keyless
      </span>
    </div>
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

  <div class="flex flex-col gap-2">
    <button
      type="button"
      onclick={() => routeStore.optimize()}
      disabled={routeStore.status === "optimizing"}
      class="ui-btn-primary"
    >
      {primaryButtonLabel}
    </button>

    {#if routeStore.status === "stale" && routeStore.solverEngine === "osrm-trip"}
      <button
        type="button"
        onclick={() => routeStore.keepOrderAndRoute()}
        title="Keep your manual drag-and-drop stop sequence while updating road polylines, leg ETAs, and Google Maps links"
        class="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 hover:bg-slate-800 hover:text-white cursor-pointer transition"
      >
        Keep Current Order (Update Roads & ETAs)
      </button>
    {/if}
  </div>

  {#if routeStore.status === "stale"}
    <div
      class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300"
    >
      Stops or route settings changed since last optimization.
    </div>
  {/if}

  {#if routeStore.statusMessage}
    <div
      role="status"
      aria-live="polite"
      class="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300"
    >
      {routeStore.statusMessage}
    </div>
  {/if}

  {#if routeStore.errorMessage}
    <div
      role="alert"
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
