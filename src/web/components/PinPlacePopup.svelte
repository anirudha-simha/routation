<script lang="ts">
  import Accessibility from "@lucide/svelte/icons/accessibility";
  import Clock from "@lucide/svelte/icons/clock";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Globe from "@lucide/svelte/icons/globe";
  import MapPin from "@lucide/svelte/icons/map-pin";
  import Phone from "@lucide/svelte/icons/phone";
  import Utensils from "@lucide/svelte/icons/utensils";
  import { resource } from "runed";
  import { type GeoLocation, infoCardGenerator } from "../../core";

  interface Props {
    location: GeoLocation;
    badgeLabel: string;
    isHome?: boolean;
  }

  let { location, badgeLabel, isHome = false }: Props = $props();

  let showMapEmbed = $state(false);
  let imageError = $state(false);

  // Declaratively resolve the rich PlaceInfoCard whenever `location` changes
  const cardRes = resource(
    () => location.id,
    () => {
      imageError = false;
      showMapEmbed = false;
      return infoCardGenerator.generate(location);
    }
  );

  // Immediately show the synchronous base card for the *current* location while loading
  // so switching pins never flashes the previous pin's photo/details.
  let card = $derived(
    !cardRes.loading && cardRes.current
      ? cardRes.current
      : infoCardGenerator.getBaseCard(location)
  );
  let showSeparateAddress = $derived(
    Boolean(card.address && card.address !== card.title)
  );
</script>

<div class="w-68 max-w-[calc(100vw-3rem)] text-slate-900 text-xs flex flex-col gap-2 p-0.5">
  <!-- Header: Badge + Title + Category/Subtitle + Address -->
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
        {card.title}
      </p>

      {#if card.subtitle}
        <p class="text-[11px] font-medium text-blue-700 leading-snug mt-0.5">
          {card.subtitle}
        </p>
      {/if}

      {#if showSeparateAddress}
        <p class="text-[11px] text-slate-600 leading-snug break-words mt-0.5">
          {card.address}
        </p>
      {/if}

      <p class="mt-0.5 font-mono text-[10px] text-slate-400">
        {card.coordinates}
      </p>
    </div>
  </div>

  <!-- Subtle shimmer while Nominatim/Wikipedia details resolve -->
  {#if cardRes.loading}
    <div class="flex items-center gap-1.5 text-[11px] text-slate-400">
      <span class="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
      <span>Loading place details…</span>
    </div>
  {/if}

  <!-- Photo Thumbnail + Short Summary (from Wikipedia / OSM Nominatim Commons when available) -->
  {#if card.thumbnailUrl && !imageError}
    <div class="overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      <img
        src={card.thumbnailUrl}
        alt={card.title}
        loading="lazy"
        onerror={() => (imageError = true)}
        class="h-28 w-full object-cover"
      />
    </div>
  {/if}

  {#if card.summary}
    <p class="line-clamp-3 text-[11px] leading-relaxed text-slate-700 bg-slate-50 rounded-md p-2 border border-slate-200/80">
      {card.summary}
    </p>
  {/if}

  <!-- Local Business Metadata (from OpenStreetMap Nominatim extratags) -->
  {#if card.openingHours || card.websiteUrl || card.phone || card.cuisine || card.wheelchair}
    <div class="flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">
      {#if card.cuisine}
        <div class="flex items-center gap-1.5">
          <Utensils class="h-3 w-3 shrink-0 text-slate-500" />
          <span class="truncate">{card.cuisine}</span>
        </div>
      {/if}
      {#if card.openingHours}
        <div class="flex items-start gap-1.5">
          <Clock class="h-3 w-3 mt-0.5 shrink-0 text-slate-500" />
          <div class="flex flex-col gap-0.5 break-words">
            {#each card.openingHours.split(";").map((s) => s.trim()).filter(Boolean) as rule}
              <span>{rule}</span>
            {/each}
          </div>
        </div>
      {/if}
      {#if card.websiteUrl}
        <div class="flex items-center gap-1.5 min-w-0">
          <Globe class="h-3 w-3 shrink-0 text-slate-500" />
          <a
            href={card.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="truncate text-blue-600 hover:underline"
          >
            {card.websiteUrl}
          </a>
        </div>
      {/if}
      {#if card.phone}
        <div class="flex items-center gap-1.5">
          <Phone class="h-3 w-3 shrink-0 text-slate-500" />
          <span>{card.phone}</span>
        </div>
      {/if}
      {#if card.wheelchair}
        <div class="flex items-center gap-1.5">
          <Accessibility class="h-3 w-3 shrink-0 text-slate-500" />
          <span>{card.wheelchair}</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Optional on-demand Google Maps Embed Preview -->
  {#if showMapEmbed}
    <div
      class="relative h-36 w-full overflow-hidden rounded-md border border-slate-300 bg-slate-100"
    >
      <iframe
        title={`Google Maps preview for ${card.title}`}
        src={card.googleMapsEmbedUrl}
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        class="h-full w-full border-0"
      ></iframe>
    </div>
  {/if}

  <!-- Footer Actions -->
  <div class="flex items-center justify-between gap-1.5 pt-0.5">
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => (showMapEmbed = !showMapEmbed)}
        class="ui-btn-chip"
      >
        <MapPin class="h-3 w-3" />
        <span>{showMapEmbed ? "Hide Map" : "Embed Map"}</span>
      </button>

      {#if card.wikipediaUrl}
        <a
          href={card.wikipediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="ui-btn-chip"
        >
          <span>Wiki</span>
          <ExternalLink class="h-2.5 w-2.5 shrink-0" />
        </a>
      {/if}
    </div>

    <a
      href={card.googleMapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-500 transition"
    >
      <span>Google Maps</span>
      <ExternalLink class="h-3 w-3 shrink-0" />
    </a>
  </div>
</div>
