<script lang="ts">
  import type { RouteMode } from "../../core";
  import { routeStore } from "../state.svelte";
  import LocationInput from "./LocationInput.svelte";

  const MODE_HINTS: Record<RouteMode, string> = {
    ROUND_TRIP_FASTEST:
      "Starts and ends at Home using whichever loop direction the solver finds fastest overall.",
    ROUND_TRIP_END_CLOSEST_TO_HOME:
      "Starts and ends at Home. Drives out to your farthest stop first and sweeps progressively back toward Home.",
    ROUND_TRIP_START_CLOSEST_TO_HOME:
      "Starts and ends at Home. Hits your nearest stop first and works outward before returning Home.",
    OPEN_END_START_AT_HOME:
      "One-way outbound sweep: departs from Home and finishes at whichever final stop is optimal (no return leg).",
    OPEN_START_END_AT_HOME:
      "One-way inbound sweep: starts at the best outer stop in the field and finishes at Home.",
  };

  // TODO (FE internals): Add CSV file import (PapaParse) and persist `routeStore.homeLocations` to localStorage.
</script>

<section
  class="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex flex-col gap-3"
>
  <div class="flex items-center justify-between">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
      1. Route Locations & Mode
    </h2>
    <span class="text-[11px] text-slate-500">
      {routeStore.stops.length} {routeStore.stops.length === 1 ? "stop" : "stops"} added
    </span>
  </div>

  <div>
    <span class="block text-xs font-medium text-slate-300 mb-1">
      Home Base <span class="text-slate-500 font-normal">(1 location)</span>
    </span>
    <LocationInput
      single
      bind:values={routeStore.homeLocations}
      placeholder="Search Home address or lat, lng and hit Enter..."
    />
    <p class="mt-1 text-[11px] text-slate-400">
      Used as your start/end anchor and to geographically bias business searches.
    </p>
  </div>

  <div>
    <span class="block text-xs font-medium text-slate-300 mb-1">
      Stops to Visit <span class="text-slate-500 font-normal">(drag ⋮⋮ to reorder)</span>
    </span>
    <LocationInput
      bind:values={routeStore.stops}
      placeholder="Add a stop (business, address, or lat, lng)..."
    />
  </div>

  <div>
    <label
      for="mode-select"
      class="block text-xs font-medium text-slate-300 mb-1"
    >
      Trip Direction Mode
    </label>
    <select
      id="mode-select"
      bind:value={routeStore.mode}
      class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
    >
      <option value="ROUND_TRIP_FASTEST">
        Round-Trip: Fastest (Any Direction)
      </option>
      <option value="ROUND_TRIP_END_CLOSEST_TO_HOME">
        Round-Trip: End Closest to Home (Inbound)
      </option>
      <option value="ROUND_TRIP_START_CLOSEST_TO_HOME">
        Round-Trip: Start Closest to Home (Outbound)
      </option>
      <option value="OPEN_END_START_AT_HOME">
        One-Way: Start at Home → Best Last Stop
      </option>
      <option value="OPEN_START_END_AT_HOME">
        One-Way: Best First Stop → End at Home
      </option>
    </select>
    <p class="mt-1.5 text-[11px] leading-relaxed text-slate-400">
      {MODE_HINTS[routeStore.mode]}
    </p>
  </div>
</section>
