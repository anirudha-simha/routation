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

  let map = $state<Map | undefined>(undefined);

  // Unified list of all markers (Home + Stops 1..N)
  let allPins = $derived([
    ...(routeStore.home
      ? [
          {
            loc: routeStore.home,
            isHome: true,
            pinText: "🏠",
            badgeLabel: "Home",
          },
        ]
      : []),
    ...routeStore.stops.map((loc, i) => ({
      loc,
      isHome: false,
      pinText: String(i + 1),
      badgeLabel: `#${i + 1}`,
    })),
  ]);

  let selectedPin = $derived(
    allPins.find((p) => p.loc.id === routeStore.selectedLocationId)
  );

  function fitAllPins() {
    if (!map || allPins.length === 0) return;

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
    map.fitBounds(bounds, {
      padding: 64,
      maxZoom: 14,
      duration: 600,
      essential: true,
    });
  }

  // Re-frame all pins whenever Home or the Stops list changes
  watch([() => routeStore.home, () => routeStore.stops], () => {
    fitAllPins();
  });

  // Smoothly fly to a pin whenever it is selected from the sidebar or map
  watch(
    () => selectedPin?.loc,
    (loc) => {
      if (!map || !loc) return;
      map.flyTo({
        center: [loc.lng, loc.lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: 500,
        essential: true,
      });
    }
  );
</script>

<MapLibre
  bind:map
  onload={() => {
    map?.resize();
    fitAllPins();
  }}
  class="h-full w-full"
  style={OPENFREEMAP_STYLE}
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
          onclick={(e) => {
            e.stopPropagation();
            routeStore.selectLocation(isSelected ? null : pin.loc.id);
          }}
          class="flex items-center justify-center rounded-full border-2 text-xs font-bold text-white shadow-md cursor-pointer transition-transform {pin.isHome
            ? 'h-7 w-7 bg-emerald-600'
            : 'h-6 w-6 bg-blue-600'} {isSelected
            ? 'scale-125 border-amber-300 ring-2 ring-blue-400'
            : 'border-white hover:scale-110'}"
          title={`${pin.badgeLabel}: ${pin.loc.fullAddress}`}
        >
          {pin.pinText}
        </button>
      {/snippet}
    </Marker>
  {/each}

  <!-- Single shared Popup mounted only when a pin is actively selected -->
  {#if selectedPin}
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
