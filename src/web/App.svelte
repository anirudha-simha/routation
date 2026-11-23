<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { PaneGroup, Pane, PaneResizer, type PaneAPI } from "paneforge";
  import Sidebar from "./components/Sidebar.svelte";
  import MapView from "./components/MapView.svelte";
  import { routeStore } from "./state.svelte";

  const isDesktop = new MediaQuery("(min-width: 768px)");

  let mapPane = $state<PaneAPI | undefined>(undefined);
  let drawerPane = $state<PaneAPI | undefined>(undefined);
  let isMapCollapsed = $state(false);
  let isDrawerCollapsed = $state(false);

  function restoreMobileSplit() {
    mapPane?.resize(42);
    drawerPane?.resize(58);
  }
</script>

<div class="flex h-dvh w-screen overflow-hidden bg-slate-950">
  {#if isDesktop.current}
    <!-- Desktop: Left Sidebar (32%, collapsible to 0%) | Right Map (68%) -->
    <PaneGroup
      direction="horizontal"
      autoSaveId="routation-desktop-split"
      class="h-full w-full"
    >
      <Pane
        defaultSize={32}
        minSize={18}
        maxSize={60}
        collapsible={true}
        collapsedSize={0}
      >
        <Sidebar />
      </Pane>
      <PaneResizer
        class="w-1.5 bg-slate-800 hover:bg-blue-500 active:bg-blue-400 transition-colors cursor-col-resize"
      />
      <Pane defaultSize={68}>
        <main class="h-full w-full relative min-h-0 min-w-0">
          <MapView />
        </main>
      </Pane>
    </PaneGroup>
  {:else}
    <!-- Mobile: Top Map | Draggable Bottom Sheet Drawer (both collapsible to 0% for full-screen view) -->
    <PaneGroup
      direction="vertical"
      autoSaveId="routation-mobile-split"
      class="h-full w-full"
    >
      <Pane
        bind:this={mapPane}
        defaultSize={42}
        minSize={15}
        collapsible={true}
        collapsedSize={0}
        onCollapse={() => (isMapCollapsed = true)}
        onExpand={() => (isMapCollapsed = false)}
      >
        <main class="h-full w-full relative min-h-0 min-w-0">
          <MapView />
        </main>
      </Pane>

      <!-- Drawer lip / grab bar: always stays visible at the top or bottom edge when a pane is collapsed -->
      <PaneResizer
        aria-label="Drag to resize map and route planner"
        ondblclick={restoreMobileSplit}
        class="h-7 shrink-0 bg-slate-900 border-y border-slate-800 hover:bg-slate-800 active:bg-blue-500/20 flex items-center justify-between px-3 cursor-row-resize touch-none select-none transition-colors"
      >
        <span class="text-[11px] font-medium text-slate-400">
          {#if isDrawerCollapsed}
            ▲ Pull up Route Planner ({routeStore.stops.length} stops)
          {:else if isMapCollapsed}
            ▼ Pull down Map
          {:else}
            Routation ({routeStore.stops.length} stops)
          {/if}
        </span>

        <div class="h-1.5 w-10 rounded-full bg-slate-600"></div>

        {#if isDrawerCollapsed || isMapCollapsed}
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              restoreMobileSplit();
            }}
            class="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-500 cursor-pointer"
          >
            Split View
          </button>
        {:else}
          <span class="text-[10px] text-slate-500">Drag ↕</span>
        {/if}
      </PaneResizer>

      <Pane
        bind:this={drawerPane}
        defaultSize={58}
        minSize={15}
        collapsible={true}
        collapsedSize={0}
        onCollapse={() => (isDrawerCollapsed = true)}
        onExpand={() => (isDrawerCollapsed = false)}
      >
        <Sidebar />
      </Pane>
    </PaneGroup>
  {/if}
</div>
