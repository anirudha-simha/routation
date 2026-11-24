<script lang="ts">
  import type { RouteStatus } from "../../core";
  import { routeStore } from "../state.svelte";

  const STATUS_META: Record<
    RouteStatus,
    { label: string; dotClass: string }
  > = {
    unoptimized: {
      label: "Draft Pins (Unoptimized)",
      dotClass: "bg-slate-400",
    },
    optimizing: {
      label: "Calculating...",
      dotClass: "bg-blue-400 animate-pulse",
    },
    optimized: {
      label: "Active Route",
      dotClass: "bg-emerald-400",
    },
    stale: {
      label: "Route Out of Date",
      dotClass: "bg-amber-400",
    },
  };

  let currentMeta = $derived(STATUS_META[routeStore.status]);
  let showDirectionKey = $derived(
    routeStore.status === "optimized" &&
      Boolean(routeStore.result?.routeGeoJson.features.length)
  );
</script>

<div
  class="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1 text-xs font-medium text-slate-200 shadow-lg backdrop-blur"
>
  <span class="h-2 w-2 rounded-full {currentMeta.dotClass}"></span>
  <span>{currentMeta.label}</span>
  {#if showDirectionKey}
    <span class="text-slate-600">•</span>
    <span
      class="inline-flex items-center gap-1.5 text-[10px] text-slate-300"
      title="Route color progresses from Emerald (Start) → Blue (Mid) → Purple (Finish)"
    >
      <span>Start</span>
      <span
        class="h-1.5 w-8 rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500"
      ></span>
      <span>End</span>
    </span>
  {/if}
</div>
