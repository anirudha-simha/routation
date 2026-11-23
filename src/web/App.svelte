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
    data-collapsed={isAnyCollapsed}
    ondblclick={restoreSplit}
    onclick={() => {
      if (isAnyCollapsed) restoreSplit();
    }}
    class="ui-resizer"
  >
    <div class="ui-resizer-pill"></div>
  </PaneResizer>
{/snippet}

<div class="flex h-dvh w-screen overflow-hidden bg-slate-950">
  {#if isDesktop.current}
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
