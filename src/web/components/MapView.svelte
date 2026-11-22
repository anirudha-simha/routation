<script lang="ts">
  import * as maplibregl from "maplibre-gl";
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

  const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

  let map = $state<maplibregl.Map | undefined>(undefined);

  function fitAllPins() {
    if (!map) return;
    const allPins = [
      ...(routeStore.home ? [routeStore.home] : []),
      ...routeStore.stops,
    ];
    if (allPins.length === 0) return;

    if (allPins.length === 1) {
      map.flyTo({
        center: [allPins[0].lng, allPins[0].lat],
        zoom: 12,
        essential: true,
      });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    for (const pin of allPins) {
      bounds.extend([pin.lng, pin.lat]);
    }
    map.fitBounds(bounds, {
      padding: 64,
      maxZoom: 14,
      duration: 600,
      essential: true,
    });
  }

  // Re-frame the map whenever Home or the Stops list changes
  watch([() => routeStore.home, () => routeStore.stops], () => {
    fitAllPins();
  });
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

  <!-- Home Base Marker (updates live whenever routeStore.home changes) -->
  {#if routeStore.home}
    {@const home = routeStore.home}
    <Marker lnglat={[home.lng, home.lat]}>
      {#snippet content()}
        <div
          class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-600 text-xs font-bold text-white shadow-md cursor-pointer"
          title={`Home: ${home.fullAddress}`}
        >
          🏠
        </div>
      {/snippet}
      <Popup>
        <div class="text-slate-900 text-xs">
          <p class="font-semibold">Home Base</p>
          <p>{home.fullAddress}</p>
        </div>
      </Popup>
    </Marker>
  {/if}

  <!-- Stop Markers 1..N (updates live as stops are added, removed, or reordered by the solver) -->
  {#each routeStore.stops as stop, i (`${stop.id}-${i}`)}
    <Marker lnglat={[stop.lng, stop.lat]}>
      {#snippet content()}
        <div
          class="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-xs font-bold text-white shadow-md cursor-pointer"
          title={`Stop #${i + 1}: ${stop.fullAddress}`}
        >
          {i + 1}
        </div>
      {/snippet}
      <Popup>
        <div class="text-slate-900 text-xs">
          <p class="font-semibold">Stop #{i + 1}: {stop.name}</p>
          <p>{stop.fullAddress}</p>
        </div>
      </Popup>
    </Marker>
  {/each}

  <!-- Render road polyline when the active solver returned real GeoJSON geometry -->
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
