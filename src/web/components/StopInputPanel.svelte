<script lang="ts">
  import type { RouteMode } from "../../core";
  import { routeStore } from "../state.svelte";
  import CollapsibleSection from "./CollapsibleSection.svelte";
  import LocationInput from "./LocationInput.svelte";

  const MODE_OPTIONS: { value: RouteMode; label: string; hint: string }[] = [
    {
      value: "ROUND_TRIP_FASTEST",
      label: "Round-Trip: Fastest (Any Direction)",
      hint: "Starts and ends at Home using whichever loop direction the solver finds fastest overall.",
    },
    {
      value: "ROUND_TRIP_END_CLOSEST_TO_HOME",
      label: "Round-Trip: End Closest to Home (Inbound)",
      hint: "Starts and ends at Home. Drives out to your farthest stop first and sweeps progressively back toward Home.",
    },
    {
      value: "ROUND_TRIP_START_CLOSEST_TO_HOME",
      label: "Round-Trip: Start Closest to Home (Outbound)",
      hint: "Starts and ends at Home. Hits your nearest stop first and works outward before returning Home.",
    },
    {
      value: "OPEN_END_START_AT_HOME",
      label: "One-Way: Start at Home → Best Last Stop",
      hint: "One-way outbound sweep: departs from Home and finishes at whichever final stop is optimal (no return leg).",
    },
    {
      value: "OPEN_START_END_AT_HOME",
      label: "One-Way: Best First Stop → End at Home",
      hint: "One-way inbound sweep: starts at the best outer stop in the field and finishes at Home.",
    },
  ];

  let stopCountBadge = $derived(
    `${routeStore.stops.length} ${routeStore.stops.length === 1 ? "stop" : "stops"}`
  );
  let activeModeHint = $derived(
    MODE_OPTIONS.find((m) => m.value === routeStore.mode)?.hint ?? ""
  );
</script>

<CollapsibleSection title="1. Route Locations & Mode" badge={stopCountBadge}>
  <div>
    <span class="block text-xs font-medium text-slate-300 mb-1">
      Home Base <span class="text-slate-500 font-normal">(click row to inspect pin)</span>
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
      Stops to Visit <span class="text-slate-500 font-normal">(drag ⋮⋮ to reorder • click to fly to pin)</span>
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
    <select id="mode-select" bind:value={routeStore.mode} class="ui-input">
      {#each MODE_OPTIONS as opt (opt.value)}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
    <p class="mt-1.5 text-[11px] leading-relaxed text-slate-400">
      {activeModeHint}
    </p>
  </div>
</CollapsibleSection>
