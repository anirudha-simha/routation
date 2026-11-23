<script lang="ts">
  import MapPin from "@lucide/svelte/icons/map-pin";
  import type { OptimizedRouteResult } from "../../core";
  import { routeStore } from "../state.svelte";
  import CollapsibleSection from "./CollapsibleSection.svelte";

  interface Props {
    result: OptimizedRouteResult;
  }

  let { result }: Props = $props();

  const METERS_PER_MILE = 1609.344;

  function formatMiles(meters: number): string {
    return (meters / METERS_PER_MILE).toFixed(1);
  }

  function formatDuration(seconds: number): string {
    const mins = Math.round(seconds / 60);
    if (mins < 1 && seconds > 0) return "<1 min";
    if (mins < 60) return `~${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `~${hrs}h ${remMins}m` : `~${hrs}h`;
  }

  let summaryBadge = $derived(
    result.totalDistanceMeters > 0 || result.totalDurationSeconds > 0
      ? `${formatMiles(result.totalDistanceMeters)} mi • ${formatDuration(result.totalDurationSeconds)}`
      : undefined
  );
</script>

<CollapsibleSection
  title={`Ordered Itinerary (${result.orderedLegs.length} stops)`}
  badge={summaryBadge}
  badgeClass="text-xs font-medium text-emerald-400"
>
  <ol class="flex flex-col">
    {#each result.orderedLegs as leg, i (`${i}-${leg.stop.id}`)}
      {@const isSelected = routeStore.selectedLocationId === leg.stop.id}
      {#if i > 0}
        <li
          aria-label="Route leg details"
          class="flex items-center gap-2.5 pl-2.5 py-1 text-[11px] text-slate-400"
        >
          <div class="flex w-6 justify-center">
            <div class="h-4 w-px border-l border-dashed border-slate-700"></div>
          </div>
          {#if leg.legDistanceMeters > 0 || leg.legDurationSeconds > 0}
            <span
              class="font-medium text-emerald-400/90"
              title={`Cumulative: ${formatMiles(leg.cumulativeDistanceMeters)} mi • ${formatDuration(leg.cumulativeDurationSeconds)}`}
            >
              {formatMiles(leg.legDistanceMeters)} mi • {formatDuration(leg.legDurationSeconds)}
            </span>
          {/if}
        </li>
      {/if}

      <li>
        <button
          type="button"
          onclick={() => routeStore.selectLocation(leg.stop.id)}
          title="Click to fly to pin & open Google Maps preview"
          class="w-full rounded-lg border p-2.5 text-xs flex items-start gap-2.5 text-left cursor-pointer transition-colors group {isSelected
            ? 'border-blue-500 bg-blue-600/15 ring-1 ring-blue-500/40'
            : 'border-slate-800 bg-slate-950 hover:border-slate-700'}"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-semibold {leg.isHome
              ? 'bg-emerald-600 text-white'
              : leg.isBridgeWaypoint
                ? 'bg-amber-500 text-slate-950'
                : 'bg-blue-600 text-white'}"
          >
            {leg.isHome ? "H" : leg.sequenceNumber}
          </span>
          <div class="min-w-0 flex-1">
            <div
              class="font-medium text-slate-100 truncate group-hover:text-blue-300 transition-colors"
            >
              {leg.stop.name || leg.stop.fullAddress}
            </div>
            <div class="text-slate-400 truncate">
              {leg.stop.fullAddress}
            </div>
          </div>
          <MapPin
            class="mt-1 h-3.5 w-3.5 shrink-0 transition-opacity {isSelected
              ? 'text-blue-400 opacity-100'
              : 'text-slate-500 opacity-0 group-hover:opacity-100'}"
          />
        </button>
      </li>
    {/each}
  </ol>
</CollapsibleSection>
