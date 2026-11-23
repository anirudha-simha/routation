<script lang="ts">
  import type { SolverEngineId } from "../../core";
  import { routeStore } from "../state.svelte";

  interface SolverOptionMeta {
    id: SolverEngineId;
    title: string;
    badge: string;
    hint: string;
  }

  const SOLVER_OPTIONS: SolverOptionMeta[] = [
    {
      id: "no-solver",
      title: "No Solver",
      badge: "As-Is Order • Instant",
      hint: "Keeps your current stop order as-is without reordering, and connects the pins directly on the map.",
    },
    {
      id: "osrm-trip",
      title: "OSRM Server",
      badge: "Simplest • Keyless",
      hint: "Delegates TSP solving and road-polyline generation to OSRM's /trip API in a single request, then rotates or cuts the loop at Home.",
    },
    {
      id: "ts-local",
      title: "Local Solver",
      badge: "In-Browser • Keyless",
      hint: "Runs Held-Karp exact DP (≤ 15 stops) + 2-Opt/Or-Opt local search directly in your browser using either OSRM /table road weights or offline Haversine distances.",
    },
    {
      id: "byok-api",
      title: "BYOK API",
      badge: "API Key",
      hint: "Bring your own commercial routing API key (stored only in your browser) for live traffic or provider-specific matrix optimization.",
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
        onclick={() => (routeStore.solverEngine = option.id)}
        class="rounded-lg border px-2.5 py-2 text-left transition cursor-pointer {routeStore.solverEngine ===
        option.id
          ? 'border-blue-500 bg-blue-600/20 text-white'
          : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
      >
        <div class="text-xs font-semibold">{option.title}</div>
      </button>
    {/each}
  </div>

  <p class="text-[11px] leading-relaxed text-slate-400">
    {activeMeta.hint}
  </p>
</div>
