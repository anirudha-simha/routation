<script lang="ts">
  import { PaneGroup, Pane, PaneResizer } from "paneforge";
  import Sidebar from "./components/Sidebar.svelte";
  import MapView from "./components/MapView.svelte";
</script>

<div class="flex h-screen w-screen flex-col md:flex-row overflow-hidden">
  <PaneGroup
    direction="horizontal"
    autoSaveId="route-optimizer-split"
    class="h-full w-full"
  >
    <Pane defaultSize={30} minSize={20} maxSize={60}>
      <!-- Left Sidebar: 3-Row Config Flow + Optimize CTA + Results -->
      <Sidebar />
    </Pane>
    <!-- Draggable Divider Bar -->
    <PaneResizer
      class="w-1.5 bg-slate-800 hover:bg-blue-500 active:bg-blue-400 transition-colors cursor-col-resize"
    />
    <Pane defaultSize={70}>
      <!-- Main Interactive Map Area -->
      <main class="h-full w-full relative min-h-[360px]">
        <MapView />
      </main>
    </Pane>
  </PaneGroup>
</div>
