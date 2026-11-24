<script lang="ts">
  import type { SolverEngineId } from "../../core";
  import { routeStore } from "../state.svelte";

  const SOLVER_OPTIONS: {
    id: SolverEngineId;
    title: string;
    hint: string;
    implemented: boolean;
  }[] = [
    {
      id: "osrm-trip",
      title: "OSRM Optimize",
      hint: "Reorders your stops for the fastest road tour via FOSSGIS OSRM /trip, then orients or cuts the loop at Home.",
      implemented: true,
    },
    {
      id: "osrm-route",
      title: "Keep My Order",
      hint: "Preserves your exact drag-and-drop stop sequence while fetching real road geometry and turn-by-turn leg ETAs via FOSSGIS /route.",
      implemented: true,
    },
    {
      id: "no-solver",
      title: "Straight Line",
      hint: "Offline mode (0 API calls): keeps your current stop order, estimates crow-flies distances, and connects pins directly.",
      implemented: true,
    },
    {
      id: "ts-local",
      title: "Local Solver",
      hint: "Upcoming: Held-Karp exact DP (≤ 15 stops) + 2-Opt/Or-Opt local search directly in your browser.",
      implemented: false,
    },
  ];

  let activeMeta = $derived(
    SOLVER_OPTIONS.find((s) => s.id === routeStore.solverEngine) ??
      SOLVER_OPTIONS[0]
  );
</script>

<div class="flex flex-col gap-2">
  <div class="grid grid-cols-2 gap-1.5">
    {#each SOLVER_OPTIONS as option (option.id)}
      <button
        type="button"
        disabled={!option.implemented}
        onclick={() => {
          if (option.implemented) routeStore.solverEngine = option.id;
        }}
        title={option.implemented ? option.hint : "Coming soon"}
        class="flex items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-left transition {!option.implemented
          ? 'border-slate-800/60 bg-slate-900/30 text-slate-500 opacity-60 cursor-not-allowed'
          : routeStore.solverEngine === option.id
            ? 'border-blue-500 bg-blue-600/20 text-white cursor-pointer'
            : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200 cursor-pointer'}"
      >
        <span class="text-xs font-semibold truncate">{option.title}</span>
        {#if !option.implemented}
          <span
            class="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-400"
          >
            Soon
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <p class="text-[11px] leading-relaxed text-slate-400">
    {activeMeta.hint}
  </p>
</div>
