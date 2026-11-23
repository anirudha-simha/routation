<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { PaneGroup, Pane, PaneResizer, type PaneAPI } from "paneforge";
  import Sidebar from "./components/Sidebar.svelte";
  import MapView from "./components/MapView.svelte";

  const isDesktop = new MediaQuery("(min-width: 768px)");

  let firstPane = $state<PaneAPI | undefined>(undefined);
  let secondPane = $state<PaneAPI | undefined>(undefined);
  let isFirstCollapsed = $state(false);
  let isSecondCollapsed = $state(false);

  let isAnyCollapsed = $derived(isFirstCollapsed || isSecondCollapsed);

  function restoreSplit() {
    firstPane?.resize(isDesktop.current ? 32 : 42);
    secondPane?.resize(isDesktop.current ? 68 : 58);
  }
</script>

{#snippet mapArea()}
  <main class="h-full w-full relative min-h-0 min-w-0">
    <MapView />
  </main>
{/snippet}

{#snippet resizerLip()}
  <PaneResizer
    aria-label="Drag or click to resize panels"
    title={isAnyCollapsed ? "Click or drag to expand panel" : "Drag to resize"}
    ondblclick={restoreSplit}
    onclick={() => {
      if (isAnyCollapsed) restoreSplit();
    }}
    class="group shrink-0 flex items-center justify-center bg-slate-900 border-slate-800 hover:bg-slate-800 active:bg-blue-500/20 touch-none select-none transition-all {isDesktop.current
      ? `border-x cursor-col-resize ${isAnyCollapsed ? 'w-4 bg-slate-800/90 border-slate-700' : 'w-2.5'}`
      : `border-y cursor-row-resize ${isAnyCollapsed ? 'h-6 bg-slate-800/90 border-slate-700' : 'h-4'}`}"
  >
    <div
      class="rounded-full transition-colors {isAnyCollapsed
        ? 'bg-blue-400 group-hover:bg-blue-300'
        : 'bg-slate-600 group-hover:bg-blue-400'} {isDesktop.current
        ? 'h-10 w-1'
        : 'h-1.5 w-12'}"
    ></div>
  </PaneResizer>
{/snippet}

<div class="flex h-dvh w-screen overflow-hidden bg-slate-950">
  {#if isDesktop.current}
    <!-- Desktop: Left Sidebar (32%) | Right Map (68%) -->
    <PaneGroup
      direction="horizontal"
      autoSaveId="routation-desktop-split"
      class="h-full w-full"
    >
      <Pane
        bind:this={firstPane}
        defaultSize={32}
        minSize={18}
        maxSize={60}
        collapsible={true}
        collapsedSize={0}
        onCollapse={() => (isFirstCollapsed = true)}
        onExpand={() => (isFirstCollapsed = false)}
      >
        <Sidebar />
      </Pane>
      {@render resizerLip()}
      <Pane
        bind:this={secondPane}
        defaultSize={68}
        minSize={20}
        collapsible={true}
        collapsedSize={0}
        onCollapse={() => (isSecondCollapsed = true)}
        onExpand={() => (isSecondCollapsed = false)}
      >
        {@render mapArea()}
      </Pane>
    </PaneGroup>
  {:else}
    <!-- Mobile: Top Map (42%) | Bottom Drawer Sidebar (58%) -->
    <PaneGroup
      direction="vertical"
      autoSaveId="routation-mobile-split"
      class="h-full w-full"
    >
      <Pane
        bind:this={firstPane}
        defaultSize={42}
        minSize={15}
        collapsible={true}
        collapsedSize={0}
        onCollapse={() => (isFirstCollapsed = true)}
        onExpand={() => (isFirstCollapsed = false)}
      >
        {@render mapArea()}
      </Pane>
      {@render resizerLip()}
      <Pane
        bind:this={secondPane}
        defaultSize={58}
        minSize={15}
        collapsible={true}
        collapsedSize={0}
        onCollapse={() => (isSecondCollapsed = true)}
        onExpand={() => (isSecondCollapsed = false)}
      >
        <Sidebar />
      </Pane>
    </PaneGroup>
  {/if}
</div>
