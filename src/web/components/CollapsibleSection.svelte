<script lang="ts">
  import type { Snippet } from "svelte";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { Collapsible } from "bits-ui";

  interface Props {
    title: string;
    badge?: string;
    badgeClass?: string;
    open?: boolean;
    children: Snippet;
  }

  let {
    title,
    badge,
    badgeClass = "text-[11px] text-slate-500",
    open = $bindable(true),
    children,
  }: Props = $props();
</script>

<Collapsible.Root bind:open class="ui-card">
  <Collapsible.Trigger
    class="flex w-full items-center justify-between text-left cursor-pointer group"
  >
    <h2
      class="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors"
    >
      {title}
    </h2>
    <div class="flex items-center gap-2">
      {#if badge}
        <span class={badgeClass}>{badge}</span>
      {/if}
      <ChevronDown
        class="h-3.5 w-3.5 text-slate-400 transition-transform {open
          ? 'rotate-180'
          : ''}"
      />
    </div>
  </Collapsible.Trigger>

  <Collapsible.Content class="flex flex-col gap-3">
    {@render children()}
  </Collapsible.Content>
</Collapsible.Root>
