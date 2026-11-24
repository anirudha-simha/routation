<script lang="ts">
  import { Combobox } from "bits-ui";
  import { resource } from "runed";
  import {
    createGeoLocation,
    formatMiles,
    type GeoLocation,
    haversineMeters,
    type LatLng,
    photonGeoCoder,
  } from "../../core";

  interface Props {
    placeholder?: string;
    bias?: LatLng;
    onSelect: (loc: GeoLocation) => void;
  }

  let {
    placeholder = "Search address, place, or lat, lng...",
    bias,
    onSelect,
  }: Props = $props();

  let selectedId = $state("");
  let inputText = $state("");
  let open = $state(false);
  let resetKey = $state(0);

  let trimmedQuery = $derived(inputText.trim());

  const search = resource(
    () => ({ query: trimmedQuery, bias }),
    async ({ query, bias: b }, _prev, { signal }) =>
      query.length >= 3 ? photonGeoCoder.lookup(query, b, signal) : [],
    { debounce: 300, initialValue: [] as GeoLocation[] }
  );

  function clearInput() {
    inputText = "";
    selectedId = "";
    search.mutate([]);
    open = false;
    resetKey += 1;
  }

  function handlePick(id: string | undefined) {
    if (!id) return;
    const picked = search.current.find((s) => s.id === id);
    if (!picked) return;

    onSelect(picked);
    clearInput();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    const coords = photonGeoCoder.parseCoordinateInput(trimmedQuery);
    if (!coords) return;

    // Instant 0ms Enter submission on raw "lat, lng" without picking stale suggestions from an earlier text search
    e.preventDefault();
    const first = search.current[0];
    const resolved =
      !search.loading && first && haversineMeters(coords, first) < 250
        ? first
        : createGeoLocation(coords);
    onSelect(resolved);
    clearInput();
  }

  let showEmptyState = $derived(
    open &&
      trimmedQuery.length >= 3 &&
      !search.loading &&
      search.current.length === 0
  );
</script>

{#key resetKey}
  <Combobox.Root
    type="single"
    bind:value={selectedId}
    bind:open
    onValueChange={handlePick}
  >
    <div class="relative">
      <Combobox.Input
        {placeholder}
        oninput={(e) => {
          inputText = e.currentTarget.value;
          open = true;
        }}
        onkeydown={handleKeydown}
        class="ui-input"
      />
      {#if search.loading}
        <span
          class="pointer-events-none absolute right-2.5 top-2.5 text-[11px] text-slate-400"
        >
          Searching...
        </span>
      {/if}
    </div>

    {#if search.current.length > 0 || showEmptyState}
      <Combobox.Content
        class="z-50 mt-1 max-h-60 w-[var(--bits-combobox-anchor-width)] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl"
      >
        {#if showEmptyState}
          <div class="px-2.5 py-2 text-xs text-slate-400">
            No places found for <span class="text-slate-200">"{trimmedQuery}"</span>. Try a street address or <span class="font-mono">lat, lng</span>.
          </div>
        {:else}
          {#each search.current as option (option.id)}
            {@const hasDistinctName = Boolean(
              option.name && option.name !== option.fullAddress
            )}
            <Combobox.Item
              value={option.id}
              label={hasDistinctName
                ? `${option.name} — ${option.fullAddress}`
                : option.fullAddress}
              class="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs text-slate-200 hover:bg-blue-600/20 data-[highlighted]:bg-blue-600/30"
            >
              <div class="min-w-0 flex-1">
                {#if hasDistinctName}
                  <div class="truncate font-semibold text-slate-100">
                    {option.name}
                  </div>
                  <div class="truncate text-[11px] text-slate-400">
                    {option.fullAddress}
                  </div>
                {:else}
                  <div class="truncate text-slate-100">{option.fullAddress}</div>
                {/if}
              </div>

              <span class="shrink-0 font-mono text-[10px] text-slate-400">
                {#if bias}
                  {formatMiles(haversineMeters(bias, option))} mi
                {:else}
                  {option.lat.toFixed(2)}, {option.lng.toFixed(2)}
                {/if}
              </span>
            </Combobox.Item>
          {/each}
        {/if}
      </Combobox.Content>
    {/if}
  </Combobox.Root>
{/key}
