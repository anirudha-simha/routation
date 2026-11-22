<script lang="ts">
  import type { BridgedNavLink } from "../../core";

  interface Props {
    links: BridgedNavLink[];
  }

  let { links }: Props = $props();
</script>

<section class="flex flex-col gap-2">
  <div class="flex items-center justify-between">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
      Google Maps Navigation Links ({links.length})
    </h2>
    <span class="text-[11px] text-slate-500">≤ 10 stops/link</span>
  </div>

  <div class="flex flex-col gap-2">
    {#each links as link (link.batchNumber)}
      <a
        href={link.googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="rounded-lg border border-slate-800 bg-slate-950 p-3 hover:border-blue-500/60 transition block"
      >
        <div class="flex items-center justify-between text-xs font-semibold text-blue-400">
          <span>{link.stopRangeLabel}</span>
          <span>{link.stopCount} stops ↗</span>
        </div>
        <div class="mt-1 text-xs text-slate-300 truncate">
          {link.fromName} → {link.toName}
        </div>
      </a>
    {/each}
  </div>
</section>
