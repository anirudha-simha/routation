<script lang="ts">
  import { routeStore } from "../state.svelte";
  import { STATUS_META } from "../ui-meta";

  let currentMeta = $derived(STATUS_META[routeStore.status]);
</script>

<div
  class="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/90 px-3 py-1 text-xs font-medium text-slate-200 shadow-lg backdrop-blur"
>
  <span class="h-2 w-2 rounded-full {currentMeta.dotClass}"></span>
  <span>{currentMeta.label}</span>
</div>
