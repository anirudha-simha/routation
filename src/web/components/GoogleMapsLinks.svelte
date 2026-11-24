<script lang="ts">
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import type { BridgedNavLink } from "../../core";
  import { routeStore } from "../state.svelte";
  import CollapsibleSection from "./CollapsibleSection.svelte";

  interface Props {
    links: BridgedNavLink[];
  }

  let { links }: Props = $props();
  let isStale = $derived(routeStore.status === "stale");
</script>

<CollapsibleSection
  title={`Google Maps Navigation${links.length > 1 ? ` (${links.length} Parts)` : ""}`}
  badge={isStale
    ? "Out of date"
    : links.length > 1
      ? "Bridged (9 max/link)"
      : undefined}
  badgeClass="text-[11px] text-amber-400"
>
  {#if links.length > 1}
    <p class="text-[11px] text-slate-400 leading-relaxed">
      Google Maps supports up to 9 stops per link. Each part starts where the previous part ended.
    </p>
  {/if}

  <div class="flex flex-col gap-2 transition-opacity {isStale ? 'opacity-60' : ''}">
    {#each links as link (link.batchNumber)}
      <a
        href={link.googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition"
      >
        <div class="min-w-0 flex-1">
          <div>
            {#if links.length === 1}
              Open Route in Google Maps ({link.stopCount} stops)
            {:else}
              {link.stopRangeLabel}
            {/if}
          </div>
          {#if links.length > 1}
            <div class="truncate text-[11px] font-normal text-emerald-200/75">
              {link.fromName} → {link.toName}
            </div>
          {/if}
        </div>
        <ExternalLink class="h-3.5 w-3.5 shrink-0" />
      </a>
    {/each}
  </div>
</CollapsibleSection>
