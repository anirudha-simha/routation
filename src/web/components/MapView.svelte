<script lang="ts">
  import { LngLatBounds, setWorkerUrl, type Map } from "maplibre-gl";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
  import { watch } from "runed";
  import {
    GeoJSONSource,
    LineLayer,
    MapLibre,
    Marker,
    Popup,
    NavigationControl,
  } from "svelte-maplibre-gl";
  import { routeStore } from "../state.svelte";
  import MapStatusBadge from "./MapStatusBadge.svelte";
  import PinPlacePopup from "./PinPlacePopup.svelte";

  setWorkerUrl(workerUrl);

  const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
  const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];

  let map = $state<Map | undefined>(undefined);
  let containerEl = $state<HTMLDivElement | null>(null);

  let activeBridgeIds = $derived(
    routeStore.status === "optimized" && routeStore.result
      ? new Set(
          routeStore.result.googleMapsLinks
            .map((l) => l.bridgeStopId)
            .filter((id): id is string => Boolean(id))
        )
      : new Set<string>()
  );

  // Unified list of all markers (Home + Stops 1..N)
  let allPins = $derived([
    ...(routeStore.home
      ? [
          {
            loc: routeStore.home,
            isHome: true,
            isBridge: false,
            pinText: "🏠",
            badgeLabel: "Home",
          },
        ]
      : []),
    ...routeStore.stops.map((loc, i) => ({
      loc,
      isHome: false,
      isBridge: activeBridgeIds.has(loc.id),
      pinText: String(i + 1),
      badgeLabel: `#${i + 1}`,
    })),
  ]);

  let selectedPin = $derived(
    allPins.find((p) => p.loc.id === routeStore.selectedLocationId)
  );

  // Keep WebGL canvas sized accurately whenever split-pane resizes or expands from 0%
  $effect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        map?.resize();
      }
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  function fitAllPins() {
    if (!map || !containerEl || allPins.length === 0) return;
    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;
    if (width < 40 || height < 40) return;

    if (allPins.length === 1) {
      map.flyTo({
        center: [allPins[0].loc.lng, allPins[0].loc.lat],
        zoom: 12,
        essential: true,
      });
      return;
    }

    const bounds = new LngLatBounds();
    for (const { loc } of allPins) {
      bounds.extend([loc.lng, loc.lat]);
    }

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    if (sw.lat === ne.lat && sw.lng === ne.lng) {
      map.flyTo({ center: [sw.lng, sw.lat], zoom: 14, essential: true });
      return;
    }

    const padding = Math.min(64, Math.floor(Math.min(width, height) * 0.2));
    map.fitBounds(bounds, {
      padding,
      maxZoom: 14,
      duration: 600,
      essential: true,
    });
  }

  // Re-frame all pins whenever Home or the Stops list changes
  watch([() => routeStore.home, () => routeStore.stops], () => {
    fitAllPins();
  });

  // Watch selectedLocationId (primitive string) so reordering stops never re-triggers flyTo on a selected pin
  watch(
    () => routeStore.selectedLocationId,
    (id) => {
      if (!map || !id) return;
      const pin = allPins.find((p) => p.loc.id === id);
      if (!pin) return;
      map.flyTo({
        center: [pin.loc.lng, pin.loc.lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: 500,
        essential: true,
      });
    }
  );
</script>

<div bind:this={containerEl} class="h-full w-full relative">
  <MapLibre
    bind:map
    onload={() => {
      map?.resize();
      fitAllPins();
    }}
    class="h-full w-full"
    style={OPENFREEMAP_STYLE}
    center={DEFAULT_CENTER}
    zoom={11}
    autoloadGlobalCss={false}
  >
    <NavigationControl position="top-right" />

    {#each allPins as pin (pin.loc.id)}
      {@const isSelected = routeStore.selectedLocationId === pin.loc.id}
      <Marker lnglat={[pin.loc.lng, pin.loc.lat]}>
        {#snippet content()}
          <button
            type="button"
            aria-expanded={isSelected}
            onclick={(e) => {
              e.stopPropagation();
              routeStore.selectLocation(isSelected ? null : pin.loc.id);
            }}
            class="flex items-center justify-center rounded-full border-2 text-xs font-bold shadow-md cursor-pointer transition-transform {pin.isHome
              ? 'h-7 w-7 bg-emerald-600 text-white'
              : pin.isBridge
                ? 'h-6 w-6 bg-amber-500 text-slate-950'
                : 'h-6 w-6 bg-blue-600 text-white'} {isSelected
              ? 'scale-125 border-amber-300 ring-2 ring-blue-400'
              : 'border-white hover:scale-110'}"
            title={`${pin.badgeLabel}: ${pin.loc.fullAddress}`}
          >
            {pin.pinText}
          </button>
        {/snippet}
      </Marker>
    {/each}

    <!-- Keyed Popup per pin so switching pins cleanly resets popup UI & aborts superseded fetches -->
    {#if selectedPin}
      {#key selectedPin.loc.id}
        <Popup
          lnglat={[selectedPin.loc.lng, selectedPin.loc.lat]}
          open={true}
          offset={16}
          maxWidth="300px"
          onclose={() => routeStore.selectLocation(null)}
        >
          <PinPlacePopup
            location={selectedPin.loc}
            badgeLabel={selectedPin.badgeLabel}
            isHome={selectedPin.isHome}
          />
        </Popup>
      {/key}
    {/if}

    {#if routeStore.result && routeStore.result.routeGeoJson.features.length > 0 && (routeStore.status === "optimized" || routeStore.status === "stale")}
      <GeoJSONSource data={routeStore.result.routeGeoJson}>
        <LineLayer
          paint={{
            "line-color":
              routeStore.status === "stale" ? "#8b5cf6" : "#3b82f6",
            "line-width": 4,
            "line-opacity": routeStore.status === "stale" ? 0.75 : 0.9,
          }}
        />
      </GeoJSONSource>
    {/if}
  </MapLibre>

  <MapStatusBadge />
</div>
