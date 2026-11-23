<script lang="ts">
  import { Combobox } from "bits-ui";
  import { resource } from "runed";
  import { GeoLocation, PhotonGeoCoder } from "../../core";

  const photon = new PhotonGeoCoder();

  interface Props {
    placeholder?: string;
    onSelect: (loc: GeoLocation) => void;
  }

  let {
    placeholder = "Search address, place, or lat, lng...",
    onSelect,
  }: Props = $props();

  let selectedId = $state("");
  let inputText = $state("");
  let open = $state(false);

  const search = resource(
    () => inputText.trim(),
    async (query) => (query.length >= 3 ? photon.lookup(query) : []),
    { debounce: 300, initialValue: [] as GeoLocation[] }
  );

  function handlePick(id: string | undefined) {
    if (!id) return;
    const picked = search.current.find((s) => s.id === id);
    if (!picked) return;

    onSelect(picked);
    inputText = "";
    search.mutate([]);
    open = false;
    queueMicrotask(() => {
      selectedId = "";
    });
  }
</script>

<Combobox.Root
  type="single"
  bind:value={selectedId}
  bind:open
  onValueChange={handlePick}
>
  <div class="relative">
    <Combobox.Input
      {placeholder}
      clearOnDeselect
      oninput={(e) => {
        inputText = e.currentTarget.value;
        open = true;
      }}
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
