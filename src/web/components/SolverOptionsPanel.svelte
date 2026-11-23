<script lang="ts">
  import type { ByokProviderId, LocalMatrixSource } from "../../core";
  import { routeStore } from "../state.svelte";

  interface Props {
    localMatrixSource: LocalMatrixSource;
    byokProvider: ByokProviderId;
    apiKey: string;
  }

  let {
    localMatrixSource = $bindable(),
    byokProvider = $bindable(),
    apiKey = $bindable(),
  }: Props = $props();
</script>

{#if routeStore.solverEngine === "osrm-trip"}
  <div class="flex flex-col gap-1.5 border-t border-slate-800/80 pt-2.5">
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium text-slate-300">Travel Profile</span>
      <div class="flex gap-1">
        {#each ["car", "bike", "foot"] as const as profile}
          <button
            type="button"
            onclick={() => (routeStore.osrmProfile = profile)}
            class="rounded px-2.5 py-1 text-xs font-medium capitalize transition cursor-pointer {routeStore.osrmProfile ===
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
      Uses FOSSGIS OSM routing (<span class="font-mono">routing.openstreetmap.de/routed-{routeStore.osrmProfile}</span>).
    </p>
  </div>
{:else if routeStore.solverEngine === "ts-local"}
  <div class="border-t border-slate-800/80 pt-2.5">
    <label
      for="matrix-source-select"
      class="block text-xs font-medium text-slate-300 mb-1"
    >
      Distance / Duration Matrix Source
    </label>
    <select
      id="matrix-source-select"
      bind:value={localMatrixSource}
      class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-base md:text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
    >
      <option value="osrm-table">
        OSRM /table Road Network Durations (Asymmetric)
      </option>
      <option value="haversine-offline">
        Offline Haversine + 1.3× Winding Factor (0 API Calls)
      </option>
    </select>
  </div>
{:else if routeStore.solverEngine === "byok-api"}
  <div class="flex flex-col gap-2.5 border-t border-slate-800/80 pt-2.5">
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
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-base md:text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
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
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-base md:text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
      />
    </div>
  </div>
{/if}
