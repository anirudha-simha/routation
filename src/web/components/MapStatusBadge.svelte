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
      label: "Optimizing...",
      dotClass: "bg-blue-400 animate-pulse",
    },
    optimized: {
      label: "Optimized Route",
      dotClass: "bg-emerald-400",
    },
    stale: {
      label: "Route Out of Date",
      dotClass: "bg-amber-400",
    },
  };

  let currentMeta = $derived(STATUS_META[routeStore.status]);
</script>

<div
  class="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1 text-xs font-medium text-slate-200 shadow-lg backdrop-blur"
>
  <span class="h-2 w-2 rounded-full {currentMeta.dotClass}"></span>
  <span>{currentMeta.label}</span>
</div>
