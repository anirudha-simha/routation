<script lang="ts">
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import MapPin from "@lucide/svelte/icons/map-pin";
  import { GeoLocation, GoogleMapsLinkBuilder } from "../../core";

  interface Props {
    location: GeoLocation;
    badgeLabel: string;
    isHome?: boolean;
  }

  let { location, badgeLabel, isHome = false }: Props = $props();

  let showEmbed = $state(true);

  let searchUrl = $derived(GoogleMapsLinkBuilder.buildPlaceSearchUrl(location));
  let embedUrl = $derived(GoogleMapsLinkBuilder.buildPlaceEmbedUrl(location));
  let displayTitle = $derived(location.name?.trim() || location.fullAddress);
  let showSeparateSubtitle = $derived(
    Boolean(location.name?.trim() && location.name.trim() !== location.fullAddress)
  );
</script>

<div class="w-64 text-slate-900 text-xs flex flex-col gap-2 p-0.5">
  <div class="flex items-start gap-2 pr-4">
    <span
      class="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white {isHome
        ? 'bg-emerald-600'
        : 'bg-blue-600'}"
    >
      {badgeLabel}
    </span>
    <div class="min-w-0 flex-1">
      <p class="font-semibold text-slate-900 leading-snug break-words">
        {displayTitle}
      </p>
      {#if showSeparateSubtitle}
        <p class="text-[11px] text-slate-600 leading-snug break-words mt-0.5">
          {location.fullAddress}
        </p>
      {/if}
      <p class="mt-0.5 font-mono text-[10px] text-slate-500">
        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
      </p>
    </div>
  </div>

  {#if showEmbed}
    <div
      class="relative h-36 w-full overflow-hidden rounded-md border border-slate-300 bg-slate-100"
    >
      <iframe
        title={`Google Maps preview for ${displayTitle}`}
        src={embedUrl}
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        class="h-full w-full border-0"
      ></iframe>
    </div>
  {/if}

  <div class="flex items-center justify-between gap-1.5 pt-0.5">
    <button
      type="button"
      onclick={() => (showEmbed = !showEmbed)}
      class="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200 cursor-pointer transition"
    >
      <MapPin class="h-3 w-3" />
      <span>{showEmbed ? "Hide Preview" : "Show Preview"}</span>
    </button>

    <a
      href={searchUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-500 transition"
    >
      <span>Google Maps</span>
      <ExternalLink class="h-3 w-3 shrink-0" />
    </a>
  </div>
</div>
