<script lang="ts">
  import ExternalLink from "@lucide/svelte/icons/external-link";

  interface Props {
    links: string[];
  }

  let { links }: Props = $props();
</script>

<section
  class="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 flex flex-col gap-2.5"
>
  <div class="flex items-center justify-between">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">
      Google Maps Navigation {links.length > 1 ? `(${links.length} Parts)` : ""}
    </h2>
    {#if links.length > 1}
      <span class="text-[11px] text-amber-400">
        Bridged (9 stops max/link)
      </span>
    {/if}
  </div>

  {#if links.length > 1}
    <p class="text-[11px] text-slate-400 leading-relaxed">
      Google Maps supports up to 9 stops per link. Each part below starts where the previous part ended.
    </p>
  {/if}

  <div class="flex flex-col gap-2">
    {#each links as url, idx (url)}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition"
      >
        <span>
          {#if links.length === 1}
            Open Route in Google Maps
          {:else}
            Part {idx + 1} of {links.length} — Open in Google Maps
          {/if}
        </span>
        <ExternalLink class="h-3.5 w-3.5 shrink-0" />
      </a>
    {/each}
  </div>
</section>
