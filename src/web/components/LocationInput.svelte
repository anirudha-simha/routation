<script lang="ts">
  import { flip } from "svelte/animate";
  import {
    dragHandle,
    dragHandleZone,
    type DndEvent,
  } from "svelte-dnd-action";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import Home from "@lucide/svelte/icons/home";
  import MapPin from "@lucide/svelte/icons/map-pin";
  import X from "@lucide/svelte/icons/x";
  import { type GeoLocation } from "../../core";
  import { routeStore } from "../state.svelte";
  import LocationSearchBox from "./LocationSearchBox.svelte";

  const FLIP_DURATION_MS = 180;

  interface Props {
    values: GeoLocation[];
    single?: boolean;
    placeholder?: string;
  }

  let {
    values = $bindable([]),
    single = false,
    placeholder = "Search address, place, or lat, lng...",
  }: Props = $props();

  let dragItems = $derived(values);

  function addGeoLocation(loc: GeoLocation) {
    const entry: GeoLocation = { ...loc, id: crypto.randomUUID() };
    values = single ? [entry] : [...values, entry];
    routeStore.selectLocation(entry.id);
  }

  function removeLocation(id: string) {
    if (routeStore.selectedLocationId === id) {
      routeStore.selectLocation(null);
    }
    values = values.filter((v) => v.id !== id);
  }

  function handleDndConsider(e: CustomEvent<DndEvent<GeoLocation>>) {
    dragItems = e.detail.items;
  }

  function handleDndFinalize(e: CustomEvent<DndEvent<GeoLocation>>) {
    dragItems = e.detail.items;
    if (
      e.detail.items.length !== values.length ||
      e.detail.items.some((item, idx) => item.id !== values[idx]?.id)
    ) {
      values = e.detail.items;
    }
  }
</script>

{#snippet rowActions(loc: GeoLocation, isSelected: boolean)}
  {@const hasDistinctName = Boolean(loc.name && loc.name !== loc.fullAddress)}
  <button
    type="button"
    onclick={() => routeStore.selectLocation(loc.id)}
    class="min-w-0 flex-1 flex items-center justify-between gap-1.5 text-left cursor-pointer group"
    title={`${loc.name}${hasDistinctName ? ` — ${loc.fullAddress}` : ""} (click to fly to pin)`}
  >
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium group-hover:text-blue-300 transition-colors">
        {loc.name || loc.fullAddress}
      </div>
      {#if hasDistinctName}
        <div class="truncate text-[10px] text-slate-400">
          {loc.fullAddress}
        </div>
      {/if}
    </div>
    <MapPin
      class="h-3 w-3 shrink-0 transition-opacity {isSelected
        ? 'text-blue-400 opacity-100'
        : 'text-slate-500 opacity-0 group-hover:opacity-100'}"
    />
  </button>

  <button
    type="button"
    onclick={() => removeLocation(loc.id)}
    class="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 cursor-pointer transition"
    title="Remove location"
    aria-label={`Remove ${loc.name || loc.fullAddress}`}
  >
    <X class="h-3.5 w-3.5" />
  </button>
{/snippet}

<div class="flex flex-col gap-2">
  <LocationSearchBox
    {placeholder}
    bias={single ? undefined : routeStore.home}
    onSelect={addGeoLocation}
  />

  {#if single && values.length > 0}
    {@const home = values[0]}
    {@const isSelected = routeStore.selectedLocationId === home.id}
    <div class="ui-home-row" data-selected={isSelected}>
      <span
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
      >
        <Home class="h-3 w-3" />
      </span>
      {@render rowActions(home, isSelected)}
    </div>
  {:else if !single && dragItems.length > 0}
    <ol
      class="flex flex-col gap-1.5"
      use:dragHandleZone={{
        items: dragItems,
        flipDurationMs: FLIP_DURATION_MS,
        dropTargetStyle: {},
      }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
    >
      {#each dragItems as loc, i (loc.id)}
        {@const isSelected = routeStore.selectedLocationId === loc.id}
        <li
          animate:flip={{ duration: FLIP_DURATION_MS }}
          class="ui-stop-row"
          data-selected={isSelected}
        >
          <button
            type="button"
            use:dragHandle
            aria-label={`Drag to reorder stop ${i + 1}`}
            title="Drag to reorder"
            class="shrink-0 touch-none cursor-grab active:cursor-grabbing rounded p-1 text-slate-500 hover:text-slate-300"
          >
            <GripVertical class="h-3.5 w-3.5" />
          </button>

          <span
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white"
          >
            {i + 1}
          </span>

          {@render rowActions(loc, isSelected)}
        </li>
      {/each}
    </ol>
  {/if}
</div>
