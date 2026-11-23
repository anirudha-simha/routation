<script lang="ts">
  import { routeStore } from "../state.svelte";
  import { MODE_OPTIONS } from "../ui-meta";
  import CollapsibleSection from "./CollapsibleSection.svelte";
  import LocationInput from "./LocationInput.svelte";

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
