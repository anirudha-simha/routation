<script lang="ts">
  import { flip } from "svelte/animate";
  import {
    dragHandle,
    dragHandleZone,
    type DndEvent,
  } from "svelte-dnd-action";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import Home from "@lucide/svelte/icons/home";
  import X from "@lucide/svelte/icons/x";
  import { Combobox } from "bits-ui";
  import { resource } from "runed";
  import { GeoLocation, PhotonGeoCoder } from "../../core";

  const photon = new PhotonGeoCoder();
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

  let selectedId = $state("");
  let inputText = $state("");
  let open = $state(false);

  // Local working copy of `values`: automatically re-syncs when `values` changes,
  // while letting `onconsider` override it locally during drag without touching `routeStore`.
  let dragItems = $derived(values);

  // Declarative debounced resource: watches `inputText`, waits 300ms, calls `photon.lookup()`,
  // tracks `search.loading`, and automatically cancels stale in-flight requests.
  const search = resource(
    () => inputText.trim(),
    async (query) => (query.length >= 3 ? photon.lookup(query) : []),
    { debounce: 300, initialValue: [] as GeoLocation[] },
  );

  function addGeoLocation(loc: GeoLocation) {
    // Assign a unique instance ID so duplicate stops never collide in `animate:flip` or dndzone
    const entry = new GeoLocation({
      ...loc,
      id: crypto.randomUUID(),
    });
    values = single ? [entry] : [...values, entry];
    inputText = "";
    search.mutate([]);
    open = false;
    queueMicrotask(() => {
      selectedId = "";
    });
  }

  function removeLocation(index: number) {
    values = values.filter((_, i) => i !== index);
  }

  function handleDndConsider(e: CustomEvent<DndEvent<GeoLocation>>) {
    dragItems = e.detail.items;
  }

  function handleDndFinalize(e: CustomEvent<DndEvent<GeoLocation>>) {
    dragItems = e.detail.items;
    const orderChanged = e.detail.items.some(
      (item, idx) => item.id !== values[idx]?.id,
    );
    if (orderChanged) {
      values = e.detail.items;
    }
  }
</script>

<div class="flex flex-col gap-2">
  <Combobox.Root
    type="single"
    bind:value={selectedId}
    bind:open
    onValueChange={(id) => {
      if (!id) return;
      const picked = search.current.find((s) => s.id === id);
      if (picked) {
        addGeoLocation(picked);
      }
    }}
  >
    <div class="relative">
      <Combobox.Input
        {placeholder}
        clearOnDeselect
        oninput={(e) => {
          inputText = e.currentTarget.value;
          open = true;
        }}
        class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
      />
      {#if search.loading}
        <span
          class="pointer-events-none absolute right-2.5 top-2.5 text-[11px] text-slate-400"
        >
          Searching...
        </span>
      {/if}
    </div>

    {#if search.current.length > 0}
      <Combobox.Content
        class="z-50 mt-1 max-h-52 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl"
      >
        {#each search.current as option (option.id)}
          <Combobox.Item
            value={option.id}
            label={option.fullAddress}
            class="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-slate-200 hover:bg-blue-600/20 data-[highlighted]:bg-blue-600/30"
          >
            <span class="truncate">{option.fullAddress}</span>
            <span class="ml-2 shrink-0 font-mono text-[10px] text-slate-400">
              {option.lat.toFixed(3)}, {option.lng.toFixed(3)}
            </span>
          </Combobox.Item>
        {/each}
      </Combobox.Content>
    {/if}
  </Combobox.Root>

  {#if single && values.length > 0}
    <!-- Single Home Base Row -->
    {@const home = values[0]}
    <div
      class="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-200"
    >
      <span
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
      >
        <Home class="h-3 w-3" />
      </span>
      <span
        class="min-w-0 flex-1 truncate font-medium"
        title={`${home.fullAddress} (${home.lat.toFixed(5)}, ${home.lng.toFixed(5)})`}
      >
        {home.fullAddress}
      </span>
      <button
        type="button"
        onclick={() => removeLocation(0)}
        class="shrink-0 rounded p-0.5 text-emerald-300/70 hover:bg-emerald-500/20 hover:text-white cursor-pointer transition"
        title="Clear Home location"
        aria-label="Clear Home location"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </div>
  {:else if !single && dragItems.length > 0}
    <!-- Reorderable Vertical Stop List -->
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
        <li
          animate:flip={{ duration: FLIP_DURATION_MS }}
          class="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1.5 text-xs text-slate-200 hover:border-slate-700 transition-colors"
        >
          <button
            type="button"
            use:dragHandle
            aria-label={`Drag to reorder stop ${i + 1}`}
            title="Drag to reorder"
            class="shrink-0 cursor-grab active:cursor-grabbing rounded p-0.5 text-slate-500 hover:text-slate-300"
          >
            <GripVertical class="h-3.5 w-3.5" />
          </button>

          <span
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white"
          >
            {i + 1}
          </span>

          <div class="min-w-0 flex-1">
            <div
              class="truncate font-medium text-slate-100"
              title={`${loc.fullAddress} (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})`}
            >
              {loc.fullAddress}
            </div>
          </div>

          <button
            type="button"
            onclick={() => removeLocation(i)}
            class="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 cursor-pointer transition"
            title="Remove stop"
            aria-label={`Remove ${loc.fullAddress}`}
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</div>
