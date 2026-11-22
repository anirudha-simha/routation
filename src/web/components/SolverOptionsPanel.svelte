<script lang="ts">
  import type {
    ByokProviderId,
    LocalMatrixSource,
    OsrmProfile,
    SolverEngineId,
  } from "../../core";

  interface Props {
    solverEngine: SolverEngineId;
    osrmProfile: OsrmProfile;
    localMatrixSource: LocalMatrixSource;
    byokProvider: ByokProviderId;
    apiKey: string;
  }

  let {
    solverEngine,
    osrmProfile = $bindable(),
    localMatrixSource = $bindable(),
    byokProvider = $bindable(),
    apiKey = $bindable(),
  }: Props = $props();
</script>

<section
  class="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex flex-col gap-3"
>
  <div class="flex items-center justify-between">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
      3. Solver Options
    </h2>
    <span class="text-[11px] font-mono text-slate-500">{solverEngine}</span>
  </div>

  {#if solverEngine === "no-solver"}
    <p class="text-[11px] text-slate-400">
      Connects your stops in their exact current order (1 → N) without reordering.
    </p>
  {:else if solverEngine === "osrm-trip"}
    <!-- OSRM Server Specific Options (FOSSGIS Car / Bike / Foot) -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-slate-300">Travel Profile</span>
        <div class="flex gap-1">
          {#each ["car", "bike", "foot"] as const as profile}
            <button
              type="button"
              onclick={() => (osrmProfile = profile)}
              class="rounded px-2.5 py-1 text-xs font-medium capitalize transition cursor-pointer {osrmProfile ===
              profile
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'}"
            >
              {profile}
            </button>
          {/each}
        </div>
      </div>
      <p class="text-[11px] text-slate-400">
        Uses FOSSGIS OSM routing (<span class="font-mono">routing.openstreetmap.de/routed-{osrmProfile}</span>).
      </p>
    </div>
  {:else if solverEngine === "ts-local"}
    <!-- Local TS Solver Specific Options -->
    <div>
      <label
        for="matrix-source-select"
        class="block text-xs font-medium text-slate-300 mb-1"
      >
        Distance / Duration Matrix Source
      </label>
      <select
        id="matrix-source-select"
        bind:value={localMatrixSource}
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
      >
        <option value="osrm-table">
          OSRM /table Road Network Durations (Asymmetric)
        </option>
        <option value="haversine-offline">
          Offline Haversine + 1.3× Winding Factor (0 API Calls)
        </option>
      </select>
      <p class="mt-1 text-[11px] text-slate-400">
        {localMatrixSource === "osrm-table"
          ? "Fetches the N×N road drive-time matrix once, then solves and reorders locally in 0ms."
          : "Computes straight-line sphere distances in memory without contacting any routing server."}
      </p>
    </div>
  {:else if solverEngine === "byok-api"}
    <!-- Key-Based (BYOK) Specific Options -->
    <div>
      <label
        for="byok-provider-select"
        class="block text-xs font-medium text-slate-300 mb-1"
      >
        Routing API Provider
      </label>
      <select
        id="byok-provider-select"
        bind:value={byokProvider}
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
      >
        <option value="openrouteservice">OpenRouteService API</option>
        <option value="google-routes">Google Routes API</option>
      </select>
    </div>

    <div>
      <label
        for="byok-key-input"
        class="block text-xs font-medium text-slate-300 mb-1"
      >
        API Key <span class="text-slate-500 font-normal">(local browser only)</span>
      </label>
      <input
        id="byok-key-input"
        type="password"
        bind:value={apiKey}
        placeholder="Paste your API key..."
        autocomplete="off"
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
      />
      <p class="mt-1 text-[11px] text-slate-400">
        Never sent to our repo or any proxy—requests go straight from your browser to the provider.
      </p>
    </div>
  {/if}
</section>
