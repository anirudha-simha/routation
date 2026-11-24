<script lang="ts">
  import { routeStore } from "../state.svelte";
</script>

{#if routeStore.solverEngine === "osrm-trip" || routeStore.solverEngine === "osrm-route"}
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
{/if}
