<script lang="ts">
  import MapPinPlus from "@lucide/svelte/icons/map-pin-plus";
  import {
    LngLatBounds,
    setWorkerUrl,
    type ErrorEvent as MapErrorEvent,
    type ExpressionSpecification,
    type Map,
    type MapMouseEvent,
    type StyleSpecification,
  } from "maplibre-gl";
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
  /**
   * Inline, zero-TileJSON OpenStreetMap raster style used automatically if an adblocker
   * (e.g. uBlock Origin filter rules blocking `tiles.openfreemap.org/planet`) or upstream
   * outage prevents OpenFreeMap vector metadata/tiles from loading.
   */
  const OSM_RASTER_FALLBACK_STYLE: StyleSpecification = {
    version: 8,
    sources: {
      "osm-raster": {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: "osm-raster-layer",
        type: "raster",
        source: "osm-raster",
      },
    ],
  };
  const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];

  const ACTIVE_LINE_GRADIENT: ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    "#10b981", // Start (Emerald)
    0.5,
    "#3b82f6", // Mid-route (Blue)
    1,
    "#a855f7", // Finish (Purple)
  ];

  const STALE_LINE_GRADIENT: ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    "#64748b",
    1,
    "#f59e0b",
  ];

  let map = $state<Map | undefined>(undefined);
  let containerEl = $state<HTMLDivElement | null>(null);
  let dropPinMode = $state(false);
  let usingFallbackBasemap = $state(false);
  let hasInitialFit = false;

  let activeMapStyle = $derived<string | StyleSpecification>(
    usingFallbackBasemap ? OSM_RASTER_FALLBACK_STYLE : OPENFREEMAP_STYLE
  );

  function ensureInitialFit() {
    if (hasInitialFit || !map) return;
    hasInitialFit = true;
    map.resize();
    fitAllPins();
  }

  function handleMapError(ev: MapErrorEvent) {
    if (usingFallbackBasemap) return;
    const err = ev.error as { url?: string; message?: string } | undefined;
    const sourceId = (ev as MapErrorEvent & { sourceId?: string }).sourceId;
    const details = `${err?.url ?? ""} ${err?.message ?? ""}`;
    if (
      details.includes("openfreemap.org") ||
      sourceId === "openmaptiles" ||
      !map?.isStyleLoaded()
    ) {
      usingFallbackBasemap = true;
    }
  }

  function handleMapClick(e: MapMouseEvent) {
    if (!dropPinMode) return;
    dropPinMode = false;
    void routeStore.addLocationFromCoords({
      lat: e.lngLat.lat,
      lng: e.lngLat.lng,
    });
  }

  function handleMapContextMenu(e: MapMouseEvent) {
    e.preventDefault();
    dropPinMode = false;
    void routeStore.addLocationFromCoords({
      lat: e.lngLat.lat,
      lng: e.lngLat.lng,
    });
  }

  let activeBridgeIds = $derived(
    routeStore.status === "optimized" && routeStore.result
      ? new Set(
          routeStore.result.googleMapsLinks
            .map((link) => link.bridgeStopId)
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

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && dropPinMode) dropPinMode = false;
  }}
/>

<div bind:this={containerEl} class="h-full w-full relative">
  <MapLibre
    bind:map
    cursor={dropPinMode ? "crosshair" : undefined}
    onclick={handleMapClick}
    oncontextmenu={handleMapContextMenu}
    onerror={handleMapError}
    onload={ensureInitialFit}
    onstyledata={() => {
      if (usingFallbackBasemap) ensureInitialFit();
    }}
    class="h-full w-full"
    style={activeMapStyle}
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
      <GeoJSONSource data={routeStore.result.routeGeoJson} lineMetrics={true}>
        <!-- Subtle dark casing so the directional gradient pops cleanly over light roads -->
        <LineLayer
          id="route-line-casing"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": "#0f172a",
            "line-width": 6.5,
            "line-opacity": routeStore.status === "stale" ? 0.45 : 0.75,
          }}
        />
        <!-- Directional line-gradient (Emerald start -> Blue mid -> Purple finish) -->
        <LineLayer
          id="route-line-gradient"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-width": 4.25,
            "line-opacity": routeStore.status === "stale" ? 0.7 : 0.95,
            "line-gradient":
              routeStore.status === "stale"
                ? STALE_LINE_GRADIENT
                : ACTIVE_LINE_GRADIENT,
          }}
        />
      </GeoJSONSource>
    {/if}
  </MapLibre>

  <MapStatusBadge />

  <button
    type="button"
    onclick={() => (dropPinMode = !dropPinMode)}
    disabled={routeStore.isDroppingPin}
    title={dropPinMode
      ? "Click anywhere on the map to add a stop (Esc to cancel)"
      : "Click to place a stop (or Home) directly on the map"}
    class="absolute top-12 left-3 z-10 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-lg backdrop-blur cursor-pointer transition {dropPinMode
      ? 'border-blue-400 bg-blue-600/95 text-white ring-2 ring-blue-400/40'
      : 'border-slate-700/80 bg-slate-900/90 text-slate-200 hover:border-slate-500 hover:text-white'}"
  >
    <MapPinPlus class="h-3.5 w-3.5" />
    <span>
      {#if routeStore.isDroppingPin}
        Adding pin...
      {:else if dropPinMode}
        Tap map • Cancel
      {:else}
        + Drop Pin
      {/if}
    </span>
  </button>
</div>
