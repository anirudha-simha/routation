<script lang="ts">
  import type { OptimizedRouteResult } from "../../core";

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

  let totalMiles = $derived(formatMiles(result.totalDistanceMeters));
  let totalDuration = $derived(formatDuration(result.totalDurationSeconds));

  // TODO (FE internals): Add drag-to-reorder handlers (Decision D6) that call `recomputeForOrder`
</script>

<section class="flex flex-col gap-2">
  <div class="flex items-center justify-between">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
      Ordered Itinerary ({result.orderedLegs.length} stops)
    </h2>
    {#if result.totalDistanceMeters > 0 || result.totalDurationSeconds > 0}
      <span class="text-xs font-medium text-emerald-400">
        {totalMiles} mi • {totalDuration}
      </span>
    {/if}
  </div>

  <ol class="flex flex-col">
    {#each result.orderedLegs as leg, i (`${i}-${leg.stop.id}`)}
      <!-- Edge connector between stop (i - 1) and stop (i) showing leg distance & duration -->
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

      <li
        class="rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-xs flex items-start gap-2.5"
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
          <div class="font-medium text-slate-100 truncate">
            {leg.stop.name}
          </div>
          <div class="text-slate-400 truncate">
            {leg.stop.fullAddress}
          </div>
        </div>
      </li>
    {/each}
  </ol>
</section>
